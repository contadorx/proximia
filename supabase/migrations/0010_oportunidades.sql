-- =====================================================================
-- Migration : 0010_oportunidades.sql
-- Feature   : F12 — oportunidades (fase 2)
-- O que faz : cadastra iniciativas que exigem investimento antes de gerar
--             receita, com retorno esperado, payback e retorno sobre o
--             investimento calculados pelo proprio banco.
-- Aplicar   : depois de 0009_importacoes.sql.
--
-- Vocabulario de proposito generico: "oportunidade" cobre projeto,
-- expansao, novo servico, implantacao de equipamento — qualquer coisa
-- que peca capital antes do retorno. Nenhum termo de setor entra aqui.
--
-- Payback e retorno saem de colunas geradas: conta que a tela faz e conta
-- que cada pessoa refaz diferente. No banco, a conta e uma so.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catalogo de tipos (configuravel por organizacao)
-- ---------------------------------------------------------------------
create table if not exists public.oportunidade_catalogo (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  nome       text not null,
  descricao  text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create unique index if not exists idx_oport_catalogo_nome
  on public.oportunidade_catalogo (org_id, lower(nome));

-- ---------------------------------------------------------------------
-- 2. Oportunidades
-- ---------------------------------------------------------------------
create table if not exists public.oportunidades (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs (id) on delete cascade,
  carteira_id           uuid not null references public.carteiras (id) on delete cascade,
  conta_id              uuid references public.contas (id) on delete set null,
  catalogo_id           uuid references public.oportunidade_catalogo (id) on delete set null,

  titulo                text not null,
  descricao             text,

  fase                  text not null default 'identificacao'
                          check (fase in ('identificacao', 'viabilidade', 'proposta',
                                          'negociacao', 'aprovada', 'implantacao',
                                          'concluida', 'descartada')),
  fase_desde            date not null default current_date,
  motivo_descarte       text,

  responsavel_id        uuid references auth.users (id) on delete set null,
  proxima_etapa         text,
  prazo                 date,

  -- Estimativa ---------------------------------------------------------
  investimento          numeric(14, 2) check (investimento >= 0),
  retorno_mensal        numeric(14, 2) check (retorno_mensal >= 0),
  custo_mensal          numeric(14, 2) not null default 0 check (custo_mensal >= 0),
  horizonte_meses       integer not null default 60 check (horizonte_meses between 1 and 600),
  estimativa_origem     text,
  estimativa_data       date,

  -- Realizado ----------------------------------------------------------
  investimento_realizado numeric(14, 2) check (investimento_realizado >= 0),
  retorno_confirmado     numeric(14, 2) check (retorno_confirmado >= 0),
  confirmado_em          date,

  links                 jsonb not null default '[]'::jsonb,
  observacoes           text,

  criado_em             timestamptz not null default now(),
  criado_por            uuid references auth.users (id),
  atualizado_em         timestamptz not null default now(),

  -- Contas do banco ----------------------------------------------------
  -- Resultado mensal esperado: o que entra menos o que passa a custar.
  resultado_mensal      numeric(14, 2)
                          generated always as (coalesce(retorno_mensal, 0) - custo_mensal) stored,

  -- Tempo para o investimento se pagar, em meses.
  payback_meses         numeric(10, 2)
                          generated always as (
                            case
                              when investimento is null or investimento = 0 then null
                              when coalesce(retorno_mensal, 0) - custo_mensal <= 0 then null
                              else round(investimento / (coalesce(retorno_mensal, 0) - custo_mensal), 2)
                            end
                          ) stored,

  -- Retorno sobre o investimento no horizonte declarado, em porcentagem.
  retorno_percentual    numeric(12, 2)
                          generated always as (
                            case
                              when investimento is null or investimento = 0 then null
                              else round(
                                (((coalesce(retorno_mensal, 0) - custo_mensal) * horizonte_meses)
                                  - investimento) / investimento * 100, 2)
                            end
                          ) stored,

  -- Mesma disciplina do resto do produto: numero estimado entra com
  -- procedencia e data. Sem isso, projecao vira boato com casas decimais.
  constraint estimativa_declarada check (
    (investimento is null and retorno_mensal is null)
    or (estimativa_origem is not null and estimativa_data is not null)
  ),

  constraint oportunidade_descarte check (
    fase <> 'descartada' or motivo_descarte is not null
  )
);

comment on table public.oportunidades is
  'Iniciativas que exigem investimento antes de gerar receita. Termo generico '
  'de proposito: cada assinante nomeia os tipos no proprio catalogo.';
comment on column public.oportunidades.payback_meses is
  'Investimento dividido pelo resultado mensal. Nulo quando nao ha investimento '
  'ou quando o resultado mensal nao e positivo — nesse caso nao existe payback.';
comment on column public.oportunidades.horizonte_meses is
  'Janela de analise do retorno. Padrao de 60 meses; cada organizacao ajusta.';

create index if not exists idx_oportunidades_carteira on public.oportunidades (carteira_id);
create index if not exists idx_oportunidades_conta on public.oportunidades (conta_id);
create index if not exists idx_oportunidades_fase on public.oportunidades (org_id, fase);

drop trigger if exists trg_oportunidades_atualizacao on public.oportunidades;
create trigger trg_oportunidades_atualizacao
  before update on public.oportunidades
  for each row execute function public.marcar_atualizacao();

-- A data de entrada na fase e o que permite medir quanto tempo a
-- oportunidade esta parada. Ela se ajusta sozinha na mudanca de fase.
create or replace function public.marcar_mudanca_fase()
returns trigger
language plpgsql
as $$
begin
  if new.fase is distinct from old.fase then
    new.fase_desde := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_oportunidade_fase on public.oportunidades;
create trigger trg_oportunidade_fase
  before update on public.oportunidades
  for each row execute function public.marcar_mudanca_fase();

-- ---------------------------------------------------------------------
-- 3. Historico e compromissos passam a aceitar oportunidade
-- ---------------------------------------------------------------------
alter table public.registros drop constraint if exists registros_entidade_tipo_check;
alter table public.registros add constraint registros_entidade_tipo_check
  check (entidade_tipo in ('carteira', 'conta', 'contrato', 'frente', 'oportunidade'));

alter table public.compromissos drop constraint if exists compromissos_entidade_tipo_check;
alter table public.compromissos add constraint compromissos_entidade_tipo_check
  check (entidade_tipo in ('carteira', 'conta', 'contrato', 'frente', 'oportunidade'));

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.oportunidade_catalogo enable row level security;
alter table public.oportunidades         enable row level security;

drop policy if exists oport_catalogo_le on public.oportunidade_catalogo;
create policy oport_catalogo_le on public.oportunidade_catalogo
  for select to authenticated using (public.e_membro(org_id));

drop policy if exists oport_catalogo_cria on public.oportunidade_catalogo;
create policy oport_catalogo_cria on public.oportunidade_catalogo
  for insert to authenticated with check (public.pode_gerir_carteiras(org_id));

drop policy if exists oport_catalogo_atualiza on public.oportunidade_catalogo;
create policy oport_catalogo_atualiza on public.oportunidade_catalogo
  for update to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));

drop policy if exists oport_catalogo_exclui on public.oportunidade_catalogo;
create policy oport_catalogo_exclui on public.oportunidade_catalogo
  for delete to authenticated using (public.e_admin(org_id));

drop policy if exists oportunidades_le on public.oportunidades;
create policy oportunidades_le on public.oportunidades
  for select to authenticated
  using (public.tem_acesso_carteira(carteira_id));

drop policy if exists oportunidades_cria on public.oportunidades;
create policy oportunidades_cria on public.oportunidades
  for insert to authenticated
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

drop policy if exists oportunidades_atualiza on public.oportunidades;
create policy oportunidades_atualiza on public.oportunidades
  for update to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id))
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

drop policy if exists oportunidades_exclui on public.oportunidades;
create policy oportunidades_exclui on public.oportunidades
  for delete to authenticated
  using (public.pode_gerir_carteiras(org_id));

-- ---------------------------------------------------------------------
-- 5. Permissoes
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.oportunidade_catalogo to authenticated;
grant select, insert, update, delete on public.oportunidades         to authenticated;
