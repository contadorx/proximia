-- =====================================================================
-- Migration : 0004_contratos.sql
-- Feature   : F4 — contratos e clausulas monitoradas
-- O que faz : registra o instrumento contratual de cada conta, com
--             vigencia, condicoes concedidas e clausulas que geram
--             acompanhamento.
-- Aplicar   : depois de 0003_contas.sql.
--
-- A janela de renegociacao e coluna gerada: data de fim menos o aviso
-- previo. Fica no banco de proposito — e a informacao que o produto
-- existe para nao deixar passar, entao nao pode depender de a tela
-- lembrar de calcular.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Contratos
-- ---------------------------------------------------------------------
create table if not exists public.contratos (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs (id) on delete cascade,
  carteira_id           uuid not null references public.carteiras (id) on delete cascade,
  conta_id              uuid not null references public.contas (id) on delete cascade,

  numero                text,
  tipo                  text,
  modalidade            text,
  natureza_beneficio    text,

  inicio                date,
  fim                   date,
  renovacao_automatica  boolean not null default false,
  aviso_previa_dias     integer not null default 0 check (aviso_previa_dias between 0 and 730),

  valor_base            numeric(14, 2) check (valor_base >= 0),
  periodicidade         text check (periodicidade in ('mensal', 'trimestral', 'anual', 'unico')),

  status                text not null default 'vigente'
                          check (status in ('vigente', 'em_renegociacao', 'encerrado')),
  link_documento        text,
  observacoes           text,

  -- fim menos o aviso previo: o dia em que a conversa precisa comecar.
  janela_renegociacao   date generated always as (fim - aviso_previa_dias) stored,

  criado_em             timestamptz not null default now(),
  criado_por            uuid references auth.users (id),
  atualizado_em         timestamptz not null default now(),

  constraint vigencia_coerente check (inicio is null or fim is null or fim >= inicio)
);

comment on column public.contratos.natureza_beneficio is
  'O que foi concedido e com que fundamento (desconto comercial, condicao tecnica, '
  'tarifa especial, isencao). Campo livre: cada assinante usa o proprio vocabulario.';
comment on column public.contratos.janela_renegociacao is
  'Calculada pelo banco. Contrato sem aviso previo tem janela igual a data de fim.';
comment on column public.contratos.status is
  'Situacao declarada. "Vencido" nao e status: e consequencia da data de fim ter passado '
  'com o contrato ainda vigente — e o sistema mostra isso sozinho.';

create index if not exists idx_contratos_conta on public.contratos (conta_id);
create index if not exists idx_contratos_carteira on public.contratos (carteira_id);
create index if not exists idx_contratos_janela on public.contratos (org_id, janela_renegociacao)
  where status <> 'encerrado';

drop trigger if exists trg_contratos_atualizacao on public.contratos;
create trigger trg_contratos_atualizacao
  before update on public.contratos
  for each row execute function public.marcar_atualizacao();

-- ---------------------------------------------------------------------
-- 2. Clausulas
-- ---------------------------------------------------------------------
create table if not exists public.contrato_clausulas (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs (id) on delete cascade,
  contrato_id       uuid not null references public.contratos (id) on delete cascade,
  tipo              text not null default 'outra'
                      check (tipo in ('compromisso_volume', 'fidelidade', 'reajuste',
                                      'condicionante', 'rescisao', 'outra')),
  descricao         text not null,
  parametros        jsonb not null default '{}'::jsonb,
  monitorada        boolean not null default false,
  antecedencia_dias integer not null default 30 check (antecedencia_dias between 0 and 730),
  data_referencia   date,
  criado_em         timestamptz not null default now(),
  criado_por        uuid references auth.users (id),

  -- Clausula monitorada sem data nao gera acompanhamento nenhum.
  constraint monitorada_tem_data check (not monitorada or data_referencia is not null)
);

comment on table public.contrato_clausulas is
  'Condicoes do contrato que precisam de acompanhamento: compromisso de volume, '
  'fidelidade, reajuste, condicionante de investimento, rescisao.';

create index if not exists idx_clausulas_contrato on public.contrato_clausulas (contrato_id);
create index if not exists idx_clausulas_monitoradas
  on public.contrato_clausulas (org_id, data_referencia) where monitorada;

-- ---------------------------------------------------------------------
-- 3. Acesso
-- ---------------------------------------------------------------------
create or replace function public.tem_acesso_contrato(p_contrato uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.contratos c
    where c.id = p_contrato and public.tem_acesso_carteira(c.carteira_id)
  );
$$;

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.contratos          enable row level security;
alter table public.contrato_clausulas enable row level security;

-- contratos ----------------------------------------------------------
drop policy if exists contratos_le on public.contratos;
create policy contratos_le on public.contratos
  for select to authenticated
  using (public.tem_acesso_carteira(carteira_id));

drop policy if exists contratos_cria on public.contratos;
create policy contratos_cria on public.contratos
  for insert to authenticated
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

drop policy if exists contratos_atualiza on public.contratos;
create policy contratos_atualiza on public.contratos
  for update to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id))
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

drop policy if exists contratos_exclui on public.contratos;
create policy contratos_exclui on public.contratos
  for delete to authenticated
  using (public.pode_gerir_carteiras(org_id));

-- clausulas ----------------------------------------------------------
drop policy if exists clausulas_le on public.contrato_clausulas;
create policy clausulas_le on public.contrato_clausulas
  for select to authenticated
  using (public.tem_acesso_contrato(contrato_id));

drop policy if exists clausulas_cria on public.contrato_clausulas;
create policy clausulas_cria on public.contrato_clausulas
  for insert to authenticated
  with check (public.pode_escrever(org_id) and public.tem_acesso_contrato(contrato_id));

drop policy if exists clausulas_atualiza on public.contrato_clausulas;
create policy clausulas_atualiza on public.contrato_clausulas
  for update to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_contrato(contrato_id))
  with check (public.pode_escrever(org_id) and public.tem_acesso_contrato(contrato_id));

drop policy if exists clausulas_exclui on public.contrato_clausulas;
create policy clausulas_exclui on public.contrato_clausulas
  for delete to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_contrato(contrato_id));

-- ---------------------------------------------------------------------
-- 5. Permissoes
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.contratos          to authenticated;
grant select, insert, update, delete on public.contrato_clausulas to authenticated;
grant execute on function public.tem_acesso_contrato(uuid) to authenticated;
