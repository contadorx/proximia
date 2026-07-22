-- =====================================================================
-- Migration : 0001_init_tenancy.sql
-- Feature   : F1 — acesso, organizacoes e papeis
-- O que faz : cria a base multi-tenant do produto — organizacoes, perfis
--             de usuario e vinculos (memberships) — mais as funcoes de
--             decisao de acesso e as politicas de RLS de todas elas.
-- Aplicar   : depois de 0000_extensoes.sql.
--
-- Principio: isolamento entre organizacoes e responsabilidade do banco.
-- Nenhuma tela pode ser a unica coisa entre um usuario e o dado de outro
-- assinante. Toda tabela nasce com RLS na mesma migration que a cria.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Papeis
-- ---------------------------------------------------------------------
-- owner          : dono da organizacao; unico que pode exclui-la
-- admin          : administra organizacao e vinculos
-- leitura_ampla  : ve tudo da organizacao, nao escreve nada (gestao)
-- analista       : opera todas as carteiras da organizacao
-- ponto_focal    : opera apenas as carteiras em que esta vinculado
do $$
begin
  create type public.papel_membro as enum
    ('owner', 'admin', 'leitura_ampla', 'analista', 'ponto_focal');
exception
  when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------------
-- 2. Perfis (espelho enxuto de auth.users, para exibir nome de pessoa)
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text,
  email       text,
  criado_em   timestamptz not null default now()
);

comment on table public.perfis is
  'Dado minimo de identificacao do usuario. Sem CPF: o produto nao precisa.';

create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.perfis (id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_criar_perfil on auth.users;
create trigger trg_criar_perfil
  after insert on auth.users
  for each row execute function public.criar_perfil();

-- ---------------------------------------------------------------------
-- 3. Organizacoes (o tenant)
-- ---------------------------------------------------------------------
create table if not exists public.orgs (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  slug        text not null unique,
  config      jsonb not null default '{}'::jsonb,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users (id)
);

comment on column public.orgs.config is
  'Configuracao da instancia: rotulos, tipos de contrato, naturezas de beneficio. '
  'Nada especifico de assinante entra no codigo — entra aqui.';

-- ---------------------------------------------------------------------
-- 4. Vinculos usuario <-> organizacao
-- ---------------------------------------------------------------------
create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  papel       public.papel_membro not null default 'analista',
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users (id),
  unique (org_id, user_id)
);

create index if not exists idx_memberships_user on public.memberships (user_id) where ativo;
create index if not exists idx_memberships_org  on public.memberships (org_id)  where ativo;

-- ---------------------------------------------------------------------
-- 5. Funcoes de decisao de acesso
-- ---------------------------------------------------------------------
-- SECURITY DEFINER de proposito: as politicas de memberships precisam
-- consultar memberships, e uma consulta comum ali entraria em recursao.
create or replace function public.e_membro(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.ativo
  );
$$;

create or replace function public.papel_na_org(p_org uuid)
returns public.papel_membro
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.papel from public.memberships m
  where m.org_id = p_org and m.user_id = auth.uid() and m.ativo
  limit 1;
$$;

create or replace function public.e_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.papel_na_org(p_org) in ('owner', 'admin');
$$;

-- Quem escreve dado de operacao. 'leitura_ampla' fica de fora por desenho:
-- e o perfil da gestao, que acompanha sem alterar.
create or replace function public.pode_escrever(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.papel_na_org(p_org) in ('owner', 'admin', 'analista', 'ponto_focal');
$$;

create or replace function public.orgs_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.org_id from public.memberships m
  where m.user_id = auth.uid() and m.ativo;
$$;

create or replace function public.compartilha_org(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.memberships eu
    join public.memberships outro on outro.org_id = eu.org_id
    where eu.user_id = auth.uid() and eu.ativo
      and outro.user_id = p_user and outro.ativo
  );
$$;

-- ---------------------------------------------------------------------
-- 6. Criacao de organizacao e de vinculos
-- ---------------------------------------------------------------------
-- A organizacao nao e criada por INSERT direto. Motivo: o criador ainda
-- nao e membro no instante do insert, entao a propria politica de leitura
-- o impediria de receber a linha de volta. A funcao cria a organizacao e o
-- vinculo de owner na mesma transacao — ou as duas coisas acontecem, ou
-- nenhuma.
create or replace function public.criar_organizacao(p_nome text, p_slug text)
returns public.orgs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org public.orgs;
begin
  if auth.uid() is null then
    raise exception 'Faca login para criar uma organizacao.';
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome da organizacao.';
  end if;

  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' then
    raise exception 'O identificador aceita apenas letras minusculas, numeros e hifen, com 3 a 50 caracteres.';
  end if;

  if exists (select 1 from public.orgs o where o.slug = p_slug) then
    raise exception 'Ja existe uma organizacao com o identificador %.', p_slug;
  end if;

  insert into public.orgs (nome, slug, criado_por)
  values (trim(p_nome), p_slug, auth.uid())
  returning * into v_org;

  insert into public.memberships (org_id, user_id, papel, criado_por)
  values (v_org.id, auth.uid(), 'owner', auth.uid());

  return v_org;
end;
$$;

-- Vincula uma pessoa ja cadastrada a uma organizacao. Restrito a admins
-- da propria organizacao — a checagem esta aqui dentro porque a funcao
-- roda com privilegio elevado.
create or replace function public.vincular_membro(
  p_org uuid,
  p_email text,
  p_papel public.papel_membro
)
returns public.memberships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_vinculo public.memberships;
begin
  if not public.e_admin(p_org) then
    raise exception 'Somente administradores da organizacao podem incluir pessoas.';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));

  if v_user is null then
    raise exception 'Nao ha cadastro para %. Peca que a pessoa crie o acesso e tente de novo.', p_email;
  end if;

  insert into public.memberships (org_id, user_id, papel, criado_por)
  values (p_org, v_user, p_papel, auth.uid())
  on conflict (org_id, user_id)
    do update set papel = excluded.papel, ativo = true
  returning * into v_vinculo;

  return v_vinculo;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------
alter table public.perfis      enable row level security;
alter table public.orgs        enable row level security;
alter table public.memberships enable row level security;

-- perfis -------------------------------------------------------------
drop policy if exists perfis_le on public.perfis;
create policy perfis_le on public.perfis
  for select to authenticated
  using (id = auth.uid() or public.compartilha_org(id));

drop policy if exists perfis_atualiza_proprio on public.perfis;
create policy perfis_atualiza_proprio on public.perfis
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- orgs ---------------------------------------------------------------
drop policy if exists orgs_le on public.orgs;
create policy orgs_le on public.orgs
  for select to authenticated
  using (public.e_membro(id));

-- Sem politica de INSERT: organizacao so nasce por criar_organizacao(),
-- que garante o vinculo de owner na mesma transacao.
drop policy if exists orgs_cria on public.orgs;

drop policy if exists orgs_atualiza on public.orgs;
create policy orgs_atualiza on public.orgs
  for update to authenticated
  using (public.e_admin(id))
  with check (public.e_admin(id));

drop policy if exists orgs_exclui on public.orgs;
create policy orgs_exclui on public.orgs
  for delete to authenticated
  using (public.papel_na_org(id) = 'owner');

-- memberships --------------------------------------------------------
drop policy if exists memberships_le on public.memberships;
create policy memberships_le on public.memberships
  for select to authenticated
  using (public.e_membro(org_id));

drop policy if exists memberships_cria on public.memberships;
create policy memberships_cria on public.memberships
  for insert to authenticated
  with check (public.e_admin(org_id));

drop policy if exists memberships_atualiza on public.memberships;
create policy memberships_atualiza on public.memberships
  for update to authenticated
  using (public.e_admin(org_id))
  with check (public.e_admin(org_id));

drop policy if exists memberships_exclui on public.memberships;
create policy memberships_exclui on public.memberships
  for delete to authenticated
  using (public.e_admin(org_id));

-- ---------------------------------------------------------------------
-- 8. Permissoes de tabela
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, update, delete          on public.orgs        to authenticated;
grant select, insert, update, delete  on public.memberships to authenticated;
grant select, update                  on public.perfis      to authenticated;

grant execute on function public.e_membro(uuid)        to authenticated;
grant execute on function public.papel_na_org(uuid)    to authenticated;
grant execute on function public.e_admin(uuid)         to authenticated;
grant execute on function public.pode_escrever(uuid)   to authenticated;
grant execute on function public.orgs_do_usuario()     to authenticated;
grant execute on function public.compartilha_org(uuid) to authenticated;
grant execute on function public.criar_organizacao(text, text) to authenticated;
grant execute on function public.vincular_membro(uuid, text, public.papel_membro) to authenticated;
