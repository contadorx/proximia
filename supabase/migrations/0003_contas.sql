-- =====================================================================
-- Migration : 0003_contas.sql
-- Feature   : F3 — contas nomeadas
-- O que faz : cria as contas que merecem gestao individual e seus
--             contatos, com acesso herdado da carteira.
-- Aplicar   : depois de 0002_carteiras.sql.
--
-- Principio embutido no esquema: potencial e realizado sao colunas
-- distintas e o banco recusa potencial sem origem declarada. Nao existe
-- coluna de meta — estimativa que vira cobranca destroi a confianca no
-- registro, e o produto nao oferece esse caminho.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Contas
-- ---------------------------------------------------------------------
create table if not exists public.contas (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.orgs (id) on delete cascade,
  carteira_id            uuid not null references public.carteiras (id) on delete cascade,
  nome                   text not null,
  razao_social           text,
  documento              text,
  segmento               text,
  relacao                text not null default 'estrategica'
                           check (relacao in ('estrategica', 'contrato', 'pipeline', 'protecao')),
  criticidade            text not null default 'media'
                           check (criticidade in ('alta', 'media', 'baixa')),
  status                 text not null default 'ativa'
                           check (status in ('ativa', 'encerrada')),
  responsavel_id         uuid references auth.users (id) on delete set null,

  potencial_bruto        numeric(14, 2) check (potencial_bruto >= 0),
  potencial_origem       text,
  potencial_data         date,
  valor_capturado        numeric(14, 2) check (valor_capturado >= 0),
  capturado_confirmado_em date,

  dados_cadastrais       jsonb not null default '{}'::jsonb,
  observacoes            text,
  criado_em              timestamptz not null default now(),
  criado_por             uuid references auth.users (id),
  atualizado_em          timestamptz not null default now(),

  -- Estimativa sem origem e sem data nao entra. Quem registrar um
  -- potencial precisa dizer de onde ele veio e quando foi apurado.
  constraint potencial_declarado check (
    potencial_bruto is null
    or (potencial_origem is not null and potencial_data is not null)
  )
);

comment on table public.contas is
  'Contas com gestao individual. Volume de baixo valor unitario nao entra aqui: '
  'vira frente agregada na carteira.';
comment on column public.contas.relacao is
  'estrategica = conta grande sob acompanhamento; contrato = tem instrumento vigente; '
  'pipeline = em prospeccao; protecao = risco de perda, defesa de base.';
comment on column public.contas.potencial_bruto is
  'Teto estimado. Nunca somar com valor_capturado — sao naturezas diferentes.';

create index if not exists idx_contas_carteira on public.contas (carteira_id);
create index if not exists idx_contas_org on public.contas (org_id);
create index if not exists idx_contas_documento on public.contas (org_id, documento)
  where documento is not null;
create index if not exists idx_contas_nome on public.contas using gin (nome gin_trgm_ops);

drop trigger if exists trg_contas_atualizacao on public.contas;
create trigger trg_contas_atualizacao
  before update on public.contas
  for each row execute function public.marcar_atualizacao();

-- ---------------------------------------------------------------------
-- 2. Contatos
-- ---------------------------------------------------------------------
create table if not exists public.contatos (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  conta_id    uuid not null references public.contas (id) on delete cascade,
  nome        text not null,
  cargo       text,
  email       text,
  telefone    text,
  principal   boolean not null default false,
  observacoes text,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users (id)
);

comment on table public.contatos is
  'Contato profissional da conta. Guardar apenas o necessario para a relacao de trabalho: '
  'sem CPF, sem dado pessoal alem do que a operacao exige.';

create index if not exists idx_contatos_conta on public.contatos (conta_id);
create unique index if not exists idx_contatos_principal
  on public.contatos (conta_id) where principal;

-- ---------------------------------------------------------------------
-- 3. Acesso
-- ---------------------------------------------------------------------
-- A conta herda o alcance da carteira: quem enxerga a carteira enxerga
-- as contas dela.
create or replace function public.tem_acesso_conta(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.contas c
    where c.id = p_conta and public.tem_acesso_carteira(c.carteira_id)
  );
$$;

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.contas   enable row level security;
alter table public.contatos enable row level security;

-- contas -------------------------------------------------------------
drop policy if exists contas_le on public.contas;
create policy contas_le on public.contas
  for select to authenticated
  using (public.tem_acesso_carteira(carteira_id));

-- Ponto focal escreve dentro da carteira dele: e ele quem opera a conta.
-- Acompanhamento (leitura_ampla) fica de fora por desenho.
drop policy if exists contas_cria on public.contas;
create policy contas_cria on public.contas
  for insert to authenticated
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

drop policy if exists contas_atualiza on public.contas;
create policy contas_atualiza on public.contas
  for update to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id))
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

drop policy if exists contas_exclui on public.contas;
create policy contas_exclui on public.contas
  for delete to authenticated
  using (public.pode_gerir_carteiras(org_id));

-- contatos -----------------------------------------------------------
drop policy if exists contatos_le on public.contatos;
create policy contatos_le on public.contatos
  for select to authenticated
  using (public.tem_acesso_conta(conta_id));

drop policy if exists contatos_cria on public.contatos;
create policy contatos_cria on public.contatos
  for insert to authenticated
  with check (public.pode_escrever(org_id) and public.tem_acesso_conta(conta_id));

drop policy if exists contatos_atualiza on public.contatos;
create policy contatos_atualiza on public.contatos
  for update to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_conta(conta_id))
  with check (public.pode_escrever(org_id) and public.tem_acesso_conta(conta_id));

drop policy if exists contatos_exclui on public.contatos;
create policy contatos_exclui on public.contatos
  for delete to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_conta(conta_id));

-- ---------------------------------------------------------------------
-- 5. Permissoes
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.contas   to authenticated;
grant select, insert, update, delete on public.contatos to authenticated;
grant execute on function public.tem_acesso_conta(uuid) to authenticated;
