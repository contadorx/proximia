-- =====================================================================
-- Migration : 0032_negocio.sql
-- Feature   : B42 — camada de negócio
-- Aplicar   : depois de 0031_classificacao_governanca.sql.
--
-- Até aqui o produto sabia servir uma organização. Não sabia que existe
-- alguém que **opera o produto** e tem várias organizações como clientes.
-- São dois níveis diferentes, e misturá-los é o erro que faz um SaaS
-- precisar de planilha paralela para saber quem paga o quê.
--
-- O nível novo:
--   · quem opera a plataforma (a Produtize) e enxerga todos os assinantes;
--   · planos, com valor e limites;
--   · o estado da assinatura de cada organização;
--   · um painel com receita recorrente, uso real e vencimentos.
--
-- Uma decisão que define o desenho: **suspender bloqueia a escrita, não a
-- leitura.** Os Termos prometem que o assinante possa extrair os dados no
-- encerramento; suspensão que apaga a tela transformaria uma cobrança em
-- atraso em perda de acesso ao próprio histórico. Ele para de registrar,
-- continua consultando e exportando.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Quem opera a plataforma
-- ---------------------------------------------------------------------
create table if not exists public.plataforma_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  nome       text,
  criado_em  timestamptz not null default now()
);

comment on table public.plataforma_admins is
  'Quem opera o produto — não confundir com o dono de uma organização, '
  'que administra apenas a própria.';

create or replace function public.e_admin_plataforma()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.plataforma_admins a where a.user_id = auth.uid());
$$;

-- Primeiro administrador: enquanto não houver nenhum, quem estiver
-- autenticado pode se registrar. Depois disso, só outro administrador
-- promove. Sem essa porta, a instalação nasce sem dono do produto.
create or replace function public.promover_admin_plataforma(p_email text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_qtd  integer;
begin
  select count(*) into v_qtd from public.plataforma_admins;

  if v_qtd > 0 and not public.e_admin_plataforma() then
    raise exception 'Apenas quem já opera a plataforma pode promover outra pessoa.';
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Não há acesso criado com esse e-mail. Peça para a pessoa se cadastrar antes.';
  end if;

  insert into public.plataforma_admins (user_id, nome)
  values (v_user, (select nome from public.perfis where id = v_user))
  on conflict (user_id) do nothing;

  return p_email;
end;
$$;

alter table public.plataforma_admins enable row level security;

drop policy if exists plataforma_le on public.plataforma_admins;
create policy plataforma_le on public.plataforma_admins
  for select to authenticated using (public.e_admin_plataforma());

grant select on public.plataforma_admins to authenticated;
grant execute on function public.e_admin_plataforma()          to authenticated;
grant execute on function public.promover_admin_plataforma(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Planos
-- ---------------------------------------------------------------------
create table if not exists public.planos (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null unique,
  descricao         text,
  valor_mensal      numeric(12, 2) not null default 0 check (valor_mensal >= 0),
  limite_carteiras  integer check (limite_carteiras > 0),
  limite_pessoas    integer check (limite_pessoas > 0),
  ordem             integer not null default 0,
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now()
);

comment on column public.planos.limite_carteiras is
  'Em branco significa sem limite. Limite existe para dimensionar preço, '
  'não para punir uso — por isso ele avisa, e não trava.';

insert into public.planos (nome, descricao, valor_mensal, limite_carteiras, limite_pessoas, ordem)
values
  ('Piloto',    'Uma operação, para provar o método antes de escalar.', 0,    3,    5, 1),
  ('Operação',  'Rede de unidades com coordenação central.',            0,   25,   40, 2),
  ('Rede',      'Operação nacional, sem limite de carteiras.',          0, null, null, 3)
on conflict (nome) do nothing;

alter table public.planos enable row level security;

drop policy if exists planos_le on public.planos;
create policy planos_le on public.planos
  for select to authenticated using (true);

drop policy if exists planos_escreve on public.planos;
create policy planos_escreve on public.planos
  for all to authenticated
  using (public.e_admin_plataforma())
  with check (public.e_admin_plataforma());

grant select, insert, update, delete on public.planos to authenticated;

-- ---------------------------------------------------------------------
-- 3. A assinatura de cada organização
-- ---------------------------------------------------------------------
alter table public.orgs add column if not exists plano_id uuid references public.planos (id);
alter table public.orgs add column if not exists assinatura_status text not null default 'avaliacao'
  check (assinatura_status in ('avaliacao', 'ativa', 'suspensa', 'encerrada'));
alter table public.orgs add column if not exists ciclo text not null default 'mensal'
  check (ciclo in ('mensal', 'trimestral', 'anual'));
alter table public.orgs add column if not exists valor_mensal numeric(12, 2) not null default 0;
alter table public.orgs add column if not exists avaliacao_ate date;
alter table public.orgs add column if not exists proximo_vencimento date;
alter table public.orgs add column if not exists conta_teste boolean not null default false;
alter table public.orgs add column if not exists observacao_interna text;
alter table public.orgs add column if not exists encerrada_em date;

comment on column public.orgs.conta_teste is
  'Fora das métricas de negócio. Sem isso, a conta de demonstração do '
  'próprio time infla a receita e o número deixa de servir para decidir.';

create index if not exists idx_orgs_status on public.orgs (assinatura_status) where not conta_teste;

-- Suspender bloqueia escrita, não leitura. O assinante para de registrar,
-- continua consultando e exportando — que é o que os Termos prometem.
--
-- A trava vai numa função só, aplicada às três portas de escrita. Colocá-la
-- apenas em pode_escrever deixaria passar tudo o que é guardado por
-- pode_gerir_carteiras — e foi exatamente o que o teste pegou: a conta
-- suspensa continuava criando carteiras.
create or replace function public.assinatura_permite_escrita(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select o.assinatura_status in ('avaliacao', 'ativa') from public.orgs o where o.id = p_org),
    false);
$$;

create or replace function public.pode_escrever(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.papel_na_org(p_org) in ('owner', 'admin', 'analista', 'ponto_focal')
     and public.assinatura_permite_escrita(p_org);
$$;

create or replace function public.pode_gerir_carteiras(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.papel_na_org(p_org) in ('owner', 'admin', 'analista')
     and public.assinatura_permite_escrita(p_org);
$$;

-- e_admin continua guardando administração de acesso, e também para na
-- suspensão: mexer em quem entra é escrita como qualquer outra.
create or replace function public.e_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.papel_na_org(p_org) in ('owner', 'admin')
     and public.assinatura_permite_escrita(p_org);
$$;

grant execute on function public.assinatura_permite_escrita(uuid) to authenticated;

-- Quem opera a plataforma enxerga todos os assinantes. Só a ficha —
-- carteiras, contas e histórico continuam fora do alcance: administrar a
-- assinatura não é motivo para ler a operação de ninguém.
drop policy if exists orgs_plataforma_le on public.orgs;
create policy orgs_plataforma_le on public.orgs
  for select to authenticated using (public.e_admin_plataforma());

drop policy if exists orgs_plataforma_escreve on public.orgs;
create policy orgs_plataforma_escreve on public.orgs
  for update to authenticated
  using (public.e_admin_plataforma())
  with check (public.e_admin_plataforma());

-- ---------------------------------------------------------------------
-- 4. Criar assinante
-- ---------------------------------------------------------------------
-- Cria a organização e o convite do dono numa operação só. O convite é o
-- mesmo mecanismo do produto: a pessoa aceita e vira dona da instância
-- dela, sem que ninguém da plataforma precise entrar lá dentro.
create or replace function public.criar_assinante(
  p_nome       text,
  p_slug       text,
  p_email_dono text,
  p_plano      uuid default null,
  p_teste      boolean default false,
  p_dias_avaliacao integer default 30
)
returns table (org_id uuid, token_convite text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid;
  v_token text;
  v_valor numeric;
begin
  if not public.e_admin_plataforma() then
    raise exception 'Apenas quem opera a plataforma pode criar assinantes.';
  end if;
  if p_email_dono is null or position('@' in p_email_dono) = 0 then
    raise exception 'Informe o e-mail de quem vai administrar a organização.';
  end if;

  select valor_mensal into v_valor from public.planos where id = p_plano;

  insert into public.orgs (
    nome, slug, criado_por, plano_id, valor_mensal, conta_teste,
    assinatura_status, avaliacao_ate)
  values (
    trim(p_nome), lower(trim(p_slug)), auth.uid(), p_plano, coalesce(v_valor, 0), p_teste,
    'avaliacao', (current_date + p_dias_avaliacao))
  returning id into v_org;

  insert into public.convites (org_id, email, papel, criado_por)
  values (v_org, lower(trim(p_email_dono)), 'owner', auth.uid())
  returning token into v_token;

  return query select v_org, v_token;
end;
$$;

create or replace function public.atualizar_assinatura(
  p_org        uuid,
  p_status     text,
  p_plano      uuid,
  p_valor      numeric,
  p_ciclo      text,
  p_vencimento date,
  p_avaliacao  date,
  p_teste      boolean,
  p_observacao text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.e_admin_plataforma() then
    raise exception 'Apenas quem opera a plataforma pode alterar assinaturas.';
  end if;

  update public.orgs set
    assinatura_status  = coalesce(p_status, assinatura_status),
    plano_id           = p_plano,
    valor_mensal       = coalesce(p_valor, valor_mensal),
    ciclo              = coalesce(p_ciclo, ciclo),
    proximo_vencimento = p_vencimento,
    avaliacao_ate      = p_avaliacao,
    conta_teste        = coalesce(p_teste, conta_teste),
    observacao_interna = p_observacao,
    encerrada_em       = case when p_status = 'encerrada' then current_date else null end
  where id = p_org;
end;
$$;

grant execute on function public.criar_assinante(text, text, text, uuid, boolean, integer) to authenticated;
grant execute on function public.atualizar_assinatura(uuid, text, uuid, numeric, text, date, date, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. O painel do negócio
-- ---------------------------------------------------------------------
-- Devolve tudo numa consulta só. Conta de teste fica fora de toda métrica
-- e aparece à parte na lista: incluí-la faria a receita mentir.
create or replace function public.painel_negocio()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  if not public.e_admin_plataforma() then
    raise exception 'Sem acesso ao painel do negócio.';
  end if;

  select jsonb_build_object(
    'receita_recorrente', coalesce((
      select sum(valor_mensal) from public.orgs
       where assinatura_status = 'ativa' and not conta_teste), 0),

    'receita_em_avaliacao', coalesce((
      select sum(valor_mensal) from public.orgs
       where assinatura_status = 'avaliacao' and not conta_teste), 0),

    'assinantes', jsonb_build_object(
      'total',     (select count(*) from public.orgs where not conta_teste),
      'ativa',     (select count(*) from public.orgs where assinatura_status = 'ativa'     and not conta_teste),
      'avaliacao', (select count(*) from public.orgs where assinatura_status = 'avaliacao' and not conta_teste),
      'suspensa',  (select count(*) from public.orgs where assinatura_status = 'suspensa'  and not conta_teste),
      'encerrada', (select count(*) from public.orgs where assinatura_status = 'encerrada' and not conta_teste),
      'teste',     (select count(*) from public.orgs where conta_teste)
    ),

    'novos_30d', (select count(*) from public.orgs
                   where criado_em >= now() - interval '30 days' and not conta_teste),

    'avaliacoes_vencendo', (select count(*) from public.orgs
                             where assinatura_status = 'avaliacao' and not conta_teste
                               and avaliacao_ate is not null
                               and avaliacao_ate <= current_date + 7),

    'serie', coalesce((
      select jsonb_agg(jsonb_build_object('mes', m, 'novos', n) order by m)
        from (select to_char(date_trunc('month', criado_em), 'YYYY-MM') as m, count(*) as n
                from public.orgs
               where criado_em >= date_trunc('month', now()) - interval '5 months'
                 and not conta_teste
               group by 1) t), '[]'::jsonb),

    'lista', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'nome', o.nome,
        'slug', o.slug,
        'status', o.assinatura_status,
        'plano', p.nome,
        'plano_id', o.plano_id,
        'valor_mensal', o.valor_mensal,
        'ciclo', o.ciclo,
        'avaliacao_ate', o.avaliacao_ate,
        'proximo_vencimento', o.proximo_vencimento,
        'conta_teste', o.conta_teste,
        'observacao_interna', o.observacao_interna,
        'criado_em', o.criado_em,
        -- Uso real: assinante que não usa é churn que ainda não avisou.
        'carteiras', (select count(*) from public.carteiras c where c.org_id = o.id),
        'pessoas',   (select count(*) from public.memberships m where m.org_id = o.id and m.ativo),
        'ultimo_registro', (select max(r.criado_em) from public.registros r where r.org_id = o.id)
      ) order by o.conta_teste, o.criado_em desc)
      from public.orgs o
      left join public.planos p on p.id = o.plano_id), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

grant execute on function public.painel_negocio() to authenticated;
