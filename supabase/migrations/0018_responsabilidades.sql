-- =====================================================================
-- Migration : 0018_responsabilidades.sql
-- Feature   : B24 — espinha de responsabilidade
-- Aplicar   : depois de 0017_portal.sql.
--
-- O produto já sabia quem *enxerga* uma carteira (carteira_membros, que
-- alimenta a RLS). Não sabia quem *responde* por ela — e são coisas
-- diferentes: alguém do corporativo pode acompanhar sem operar, e a
-- unidade pode ter mais de uma pessoa envolvida com papéis distintos.
--
-- Modelar isso com campos fixos ("responsável da unidade", "apoio
-- corporativo") faria o produto encarnar a estrutura de um assinante.
-- Então o papel é catálogo dele, como os tipos de frente e as dimensões
-- de maturidade: o produto só sabe que papéis existem, que um deles é o
-- primário e que uma carteira pode ter vários.
--
-- Com isso, alerta e compromisso passam a ter dono derivado por uma
-- cadeia — dono explícito, responsável da entidade, responsável primário
-- da carteira — e observadores, que são os demais responsáveis. Um
-- responde; os outros acompanham. Sem essa distinção, ou ninguém é dono
-- ou todo mundo é, que dá no mesmo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catálogo de papéis operacionais
-- ---------------------------------------------------------------------
create table if not exists public.papeis_operacionais (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  nome       text not null,
  descricao  text,
  primario   boolean not null default false,
  ordem      integer not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

comment on table public.papeis_operacionais is
  'Papéis de responsabilidade nomeados pelo assinante. O produto não traz '
  'nenhum: só sabe que existem e qual é o primário.';
comment on column public.papeis_operacionais.primario is
  'O papel que responde pela carteira quando não há dono mais específico. '
  'Apenas um por organização.';

create unique index if not exists idx_papel_nome
  on public.papeis_operacionais (org_id, lower(nome));
create unique index if not exists idx_papel_primario
  on public.papeis_operacionais (org_id) where primario;

-- ---------------------------------------------------------------------
-- 2. Responsabilidades
-- ---------------------------------------------------------------------
create table if not exists public.responsabilidades (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  carteira_id uuid not null references public.carteiras (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  papel_id    uuid not null references public.papeis_operacionais (id) on delete cascade,
  observacao  text,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users (id),
  unique (carteira_id, user_id, papel_id)
);

comment on table public.responsabilidades is
  'Quem responde pela carteira, e em que papel. Independente de quem tem '
  'acesso: responsabilidade e alcance são coisas diferentes.';

create index if not exists idx_responsabilidades_carteira on public.responsabilidades (carteira_id);
create index if not exists idx_responsabilidades_pessoa on public.responsabilidades (user_id);

-- ---------------------------------------------------------------------
-- 3. Alertas passam a ter dono e observadores
-- ---------------------------------------------------------------------
alter table public.alertas add column if not exists dono_id uuid references auth.users (id) on delete set null;
alter table public.alertas add column if not exists observadores uuid[] not null default '{}';

comment on column public.alertas.dono_id is
  'Quem responde por resolver. Derivado na geração, e reatribuível depois.';
comment on column public.alertas.observadores is
  'Demais responsáveis pela carteira. Veem o alerta na fila deles, marcado '
  'como acompanhamento.';

create index if not exists idx_alertas_dono on public.alertas (dono_id) where status = 'aberto';

-- ---------------------------------------------------------------------
-- 4. A cadeia de derivação
-- ---------------------------------------------------------------------
-- Responsável primário de uma carteira: o vínculo com o papel marcado
-- como primário; na falta dele, o responsável gravado na própria
-- carteira. Sempre devolve alguém, ou nulo se ninguém foi definido.
create or replace function public.responsavel_primario(p_carteira uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select r.user_id
       from public.responsabilidades r
       join public.papeis_operacionais p on p.id = r.papel_id
      where r.carteira_id = p_carteira and p.primario and p.ativo
      order by r.criado_em
      limit 1),
    (select c.responsavel_id from public.carteiras c where c.id = p_carteira)
  );
$$;

-- Dono de uma entidade: o responsável mais específico que existir.
create or replace function public.dono_da_entidade(
  p_tipo      text,
  p_entidade  uuid,
  p_carteira  uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_dono uuid;
begin
  if p_tipo = 'conta' then
    select responsavel_id into v_dono from public.contas where id = p_entidade;

  elsif p_tipo = 'contrato' then
    select ct.responsavel_id into v_dono
      from public.contratos c join public.contas ct on ct.id = c.conta_id
     where c.id = p_entidade;

  elsif p_tipo = 'frente' then
    select dono_id into v_dono from public.frentes where id = p_entidade;

  elsif p_tipo = 'oportunidade' then
    select responsavel_id into v_dono from public.oportunidades where id = p_entidade;
  end if;

  return coalesce(v_dono, public.responsavel_primario(p_carteira));
end;
$$;

-- Observadores: todos os responsáveis pela carteira, menos o dono.
create or replace function public.observadores_da_carteira(p_carteira uuid, p_dono uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct r.user_id), '{}')
    from public.responsabilidades r
   where r.carteira_id = p_carteira
     and (p_dono is null or r.user_id <> p_dono);
$$;

-- ---------------------------------------------------------------------
-- 5. A varredura de alertas passa a atribuir
-- ---------------------------------------------------------------------
-- Mesma lógica da 0014, com dois acréscimos: ao abrir um alerta, ele
-- nasce com dono e observadores; ao reabrir um que havia sido resolvido,
-- a atribuição é refeita — quem responde pode ter mudado no intervalo.
create or replace function public.atribuir_alertas(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atualizados integer;
begin
  update public.alertas a
     set dono_id = public.dono_da_entidade(a.entidade_tipo, a.entidade_id, a.carteira_id),
         observadores = public.observadores_da_carteira(
           a.carteira_id,
           public.dono_da_entidade(a.entidade_tipo, a.entidade_id, a.carteira_id))
   where a.org_id = p_org
     and a.status = 'aberto'
     and a.dono_id is distinct from
         public.dono_da_entidade(a.entidade_tipo, a.entidade_id, a.carteira_id);

  get diagnostics v_atualizados = row_count;
  return v_atualizados;
end;
$$;

-- Reatribuição manual, com o registro de que foi manual.
create or replace function public.reatribuir_alerta(p_alerta uuid, p_dono uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_cart uuid;
begin
  select org_id, carteira_id into v_org, v_cart from public.alertas where id = p_alerta;

  if v_org is null then
    raise exception 'Alerta não encontrado.';
  end if;
  if not (public.pode_escrever(v_org) and public.tem_acesso_carteira(v_cart)) then
    raise exception 'Seu perfil não permite reatribuir alertas desta carteira.';
  end if;

  update public.alertas
     set dono_id = p_dono,
         observadores = public.observadores_da_carteira(v_cart, p_dono)
   where id = p_alerta;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
alter table public.papeis_operacionais enable row level security;
alter table public.responsabilidades   enable row level security;

drop policy if exists papeis_le on public.papeis_operacionais;
create policy papeis_le on public.papeis_operacionais
  for select to authenticated using (public.e_membro(org_id));

drop policy if exists papeis_escreve on public.papeis_operacionais;
create policy papeis_escreve on public.papeis_operacionais
  for all to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));

-- Quem enxerga a carteira vê quem responde por ela: saber a quem
-- recorrer não é informação restrita.
drop policy if exists responsabilidades_le on public.responsabilidades;
create policy responsabilidades_le on public.responsabilidades
  for select to authenticated using (public.tem_acesso_carteira(carteira_id));

drop policy if exists responsabilidades_escreve on public.responsabilidades;
create policy responsabilidades_escreve on public.responsabilidades
  for all to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));

-- ---------------------------------------------------------------------
-- 7. Permissões
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.papeis_operacionais to authenticated;
grant select, insert, update, delete on public.responsabilidades   to authenticated;
grant execute on function public.responsavel_primario(uuid)             to authenticated;
grant execute on function public.dono_da_entidade(text, uuid, uuid)     to authenticated;
grant execute on function public.observadores_da_carteira(uuid, uuid)   to authenticated;
grant execute on function public.atribuir_alertas(uuid)                 to authenticated;
grant execute on function public.reatribuir_alerta(uuid, uuid)          to authenticated;
