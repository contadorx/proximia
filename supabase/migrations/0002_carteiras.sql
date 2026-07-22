-- =====================================================================
-- Migration : 0002_carteiras.sql
-- Feature   : F2 — carteiras
-- O que faz : cria a carteira (a unidade de organizacao do trabalho: uma
--             regional, uma filial, um segmento) e o vinculo de pessoas a
--             carteiras, com as funcoes de acesso e a RLS de ambas.
-- Aplicar   : depois de 0001_init_tenancy.sql.
--
-- Regra de alcance desta feature:
--   owner, admin, analista  -> todas as carteiras da organizacao
--   leitura_ampla           -> todas, sem escrever
--   ponto_focal             -> apenas as carteiras em que estiver vinculado
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Carteiras
-- ---------------------------------------------------------------------
create table if not exists public.carteiras (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs (id) on delete cascade,
  nome              text not null,
  codigo            text,
  regiao            text,
  responsavel_id    uuid references auth.users (id) on delete set null,
  status            text not null default 'ativa'
                      check (status in ('ativa', 'pausada', 'encerrada')),
  score_maturidade  numeric(5, 2) check (score_maturidade between 0 and 100),
  score_ciclo       text,
  observacoes       text,
  criado_em         timestamptz not null default now(),
  criado_por        uuid references auth.users (id),
  atualizado_em     timestamptz not null default now()
);

comment on table public.carteiras is
  'Agrupamento de contas sob um responsavel. Cada assinante chama do seu jeito '
  '(regional, filial, praca, celula) — o rotulo fica em orgs.config.';
comment on column public.carteiras.score_maturidade is
  'Nota de 0 a 100 vinda de avaliacao externa. O questionario proprio entra em fase posterior.';

create unique index if not exists idx_carteiras_codigo
  on public.carteiras (org_id, lower(codigo)) where codigo is not null;
create index if not exists idx_carteiras_org on public.carteiras (org_id);

-- ---------------------------------------------------------------------
-- 2. Quem enxerga qual carteira
-- ---------------------------------------------------------------------
create table if not exists public.carteira_membros (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs (id) on delete cascade,
  carteira_id  uuid not null references public.carteiras (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  criado_em    timestamptz not null default now(),
  criado_por   uuid references auth.users (id),
  unique (carteira_id, user_id)
);

create index if not exists idx_carteira_membros_user on public.carteira_membros (user_id);

-- ---------------------------------------------------------------------
-- 3. Atualizacao automatica do carimbo de tempo
-- ---------------------------------------------------------------------
create or replace function public.marcar_atualizacao()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_carteiras_atualizacao on public.carteiras;
create trigger trg_carteiras_atualizacao
  before update on public.carteiras
  for each row execute function public.marcar_atualizacao();

-- ---------------------------------------------------------------------
-- 4. Funcoes de acesso
-- ---------------------------------------------------------------------
-- Vinculo direto pessoa <-> carteira. Consulta so carteira_membros de
-- proposito: usar carteiras aqui criaria dependencia circular com a
-- propria politica de leitura da tabela.
create or replace function public.e_membro_carteira(p_carteira uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.carteira_membros cm
    where cm.carteira_id = p_carteira and cm.user_id = auth.uid()
  );
$$;

-- Alcance completo sobre uma carteira ja existente. Usada a partir da F3
-- pelas tabelas que penduram na carteira (contas, contratos, frentes).
create or replace function public.tem_acesso_carteira(p_carteira uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.carteiras c
    join public.memberships m
      on m.org_id = c.org_id and m.user_id = auth.uid() and m.ativo
    where c.id = p_carteira
      and (
        m.papel <> 'ponto_focal'
        or exists (
          select 1 from public.carteira_membros cm
          where cm.carteira_id = c.id and cm.user_id = auth.uid()
        )
      )
  );
$$;

-- Quem cria, edita e arquiva carteira. O ponto focal opera dentro da
-- carteira, mas nao cria nem redefine a estrutura.
create or replace function public.pode_gerir_carteiras(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.papel_na_org(p_org) in ('owner', 'admin', 'analista');
$$;

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
alter table public.carteiras       enable row level security;
alter table public.carteira_membros enable row level security;

-- carteiras ----------------------------------------------------------
-- A condicao usa apenas colunas da propria linha e uma consulta a outra
-- tabela: isso mantem o INSERT ... RETURNING funcionando, o que nao
-- aconteceria se a politica precisasse reler a linha recem-inserida.
drop policy if exists carteiras_le on public.carteiras;
create policy carteiras_le on public.carteiras
  for select to authenticated
  using (
    public.e_membro(org_id)
    and (
      public.papel_na_org(org_id) <> 'ponto_focal'
      or public.e_membro_carteira(id)
    )
  );

drop policy if exists carteiras_cria on public.carteiras;
create policy carteiras_cria on public.carteiras
  for insert to authenticated
  with check (public.pode_gerir_carteiras(org_id));

drop policy if exists carteiras_atualiza on public.carteiras;
create policy carteiras_atualiza on public.carteiras
  for update to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));

drop policy if exists carteiras_exclui on public.carteiras;
create policy carteiras_exclui on public.carteiras
  for delete to authenticated
  using (public.e_admin(org_id));

-- carteira_membros ---------------------------------------------------
drop policy if exists carteira_membros_le on public.carteira_membros;
create policy carteira_membros_le on public.carteira_membros
  for select to authenticated
  using (
    public.e_membro(org_id)
    and (
      public.papel_na_org(org_id) <> 'ponto_focal'
      or user_id = auth.uid()
    )
  );

drop policy if exists carteira_membros_cria on public.carteira_membros;
create policy carteira_membros_cria on public.carteira_membros
  for insert to authenticated
  with check (public.pode_gerir_carteiras(org_id));

drop policy if exists carteira_membros_exclui on public.carteira_membros;
create policy carteira_membros_exclui on public.carteira_membros
  for delete to authenticated
  using (public.pode_gerir_carteiras(org_id));

-- ---------------------------------------------------------------------
-- 6. Permissoes
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.carteiras        to authenticated;
grant select, insert,         delete on public.carteira_membros to authenticated;

grant execute on function public.e_membro_carteira(uuid)   to authenticated;
grant execute on function public.tem_acesso_carteira(uuid) to authenticated;
grant execute on function public.pode_gerir_carteiras(uuid) to authenticated;
