-- =====================================================================
-- Migration : 0023_pipeline.sql
-- Feature   : B30 — pipeline de conversão
-- Aplicar   : depois de 0022_capturas.sql.
--
-- O produto já tinha fases em oportunidade e mostrava há quantos dias
-- cada uma estava parada. Faltava dizer se aquele número é muito: sem
-- prazo esperado, "75 dias em viabilidade" é dado, não sinal.
--
-- Uma decisão de fronteira, que vale registrar. As fases continuam sendo
-- do produto — identificação, viabilidade, proposta, negociação,
-- aprovada, implantação, concluída, descartada —, porque essa é a forma
-- de um funil de conversão em qualquer setor. O que passa a ser do
-- assinante é o **nome** de cada uma, o **ritmo** esperado e quais
-- estão em uso. Assim o vocabulário acompanha a operação sem que a
-- lógica de conversão vire configuração frouxa, em que cada cliente
-- inventa um significado diferente para "ganhou".
--
-- E o motivo da perda, que hoje é texto livre obrigatório, ganha
-- catálogo: "por que perdemos" só vira aprendizado quando dá para
-- agrupar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Configuração das fases
-- ---------------------------------------------------------------------
create table if not exists public.oportunidade_fases (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id) on delete cascade,
  fase                text not null check (fase in ('identificacao', 'viabilidade', 'proposta',
                                                    'negociacao', 'aprovada', 'implantacao',
                                                    'concluida', 'descartada')),
  rotulo              text not null,
  prazo_esperado_dias integer check (prazo_esperado_dias > 0 and prazo_esperado_dias <= 730),
  ordem               integer not null default 0,
  ativa               boolean not null default true,
  unique (org_id, fase)
);

comment on column public.oportunidade_fases.prazo_esperado_dias is
  'Quanto tempo é razoável ficar aqui. Em branco, a fase não gera alerta '
  'de parada — útil para implantação, que depende de obra e não de ritmo '
  'comercial.';

-- Cria a régua padrão de uma organização, uma vez. Os prazos iniciais são
-- ponto de partida, não recomendação: cada operação ajusta os seus.
create or replace function public.garantir_fases(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_criadas integer;
begin
  insert into public.oportunidade_fases (org_id, fase, rotulo, prazo_esperado_dias, ordem)
  values
    (p_org, 'identificacao', 'Identificação', 30,   1),
    (p_org, 'viabilidade',   'Viabilidade',   45,   2),
    (p_org, 'proposta',      'Proposta',      30,   3),
    (p_org, 'negociacao',    'Negociação',    45,   4),
    (p_org, 'aprovada',      'Aprovada',      30,   5),
    (p_org, 'implantacao',   'Implantação',   null, 6),
    (p_org, 'concluida',     'Concluída',     null, 7),
    (p_org, 'descartada',    'Descartada',    null, 8)
  on conflict (org_id, fase) do nothing;

  get diagnostics v_criadas = row_count;
  return v_criadas;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Motivos de perda
-- ---------------------------------------------------------------------
create table if not exists public.motivos_descarte (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.orgs (id) on delete cascade,
  nome      text not null,
  descricao text,
  ordem     integer not null default 0,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create unique index if not exists idx_motivo_nome
  on public.motivos_descarte (org_id, lower(nome));

alter table public.oportunidades
  add column if not exists motivo_id uuid references public.motivos_descarte (id) on delete set null;

comment on column public.oportunidades.motivo_id is
  'Motivo classificado. O texto livre em motivo_descarte continua valendo '
  'como detalhe — a classificação serve para agrupar, o texto para lembrar.';

-- ---------------------------------------------------------------------
-- 3. Leitura de conversão
-- ---------------------------------------------------------------------
-- Tempo em cada fase e o que aconteceu depois. Só considera oportunidade
-- que saiu do funil: enquanto está em andamento, não deu nem ganho nem
-- perda, e contar como perda é o erro clássico de taxa de conversão.
drop view if exists public.oportunidade_conversao;

create view public.oportunidade_conversao
with (security_invoker = on)
as
select
  o.org_id,
  o.carteira_id,
  o.fase,
  o.motivo_id,
  o.id                                            as oportunidade_id,
  o.titulo,
  o.investimento,
  o.resultado_mensal,
  (current_date - o.fase_desde)                   as dias_na_fase,
  f.prazo_esperado_dias,
  case
    when f.prazo_esperado_dias is null then false
    else (current_date - o.fase_desde) > f.prazo_esperado_dias
  end                                             as atrasada,
  o.fase in ('concluida', 'descartada')           as encerrada,
  o.fase = 'concluida'                            as ganha
from public.oportunidades o
left join public.oportunidade_fases f
       on f.org_id = o.org_id and f.fase = o.fase;

comment on view public.oportunidade_conversao is
  'Uma linha por oportunidade, com tempo na fase, prazo esperado e '
  'desfecho. Respeita a RLS da tabela de origem.';

grant select on public.oportunidade_conversao to authenticated;

-- ---------------------------------------------------------------------
-- 4. O alerta de parada passa a usar o prazo da fase
-- ---------------------------------------------------------------------
-- Antes: 60 dias para todas as fases, cravado no código. Agora: o prazo
-- que a organização definiu; sem prazo definido, cai no parâmetro geral,
-- e fase sem prazo nenhum não gera alerta.
create or replace function public.gerar_alertas(
  p_org                uuid,
  p_dias_carteira      integer default 30,
  p_dias_frente        integer default 45,
  p_dias_oportunidade  integer default 60
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_abertos_antes integer;
  v_abertos_depois integer;
begin
  select count(*) into v_abertos_antes
    from public.alertas where org_id = p_org and status = 'aberto';

  insert into public.alertas (org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, chave)
  select
    c.org_id, c.carteira_id, 'contrato_vencido', 'alta', 'contrato', c.id,
    'Contrato vencido: ' || coalesce(c.numero, 'sem número'),
    'Venceu em ' || to_char(c.fim, 'DD/MM/YYYY') ||
      case when c.renovacao_automatica then ' e renova sozinho.' else ' e não tem renovação automática.' end,
    'contrato_vencido:' || c.id
  from public.contratos c
  where c.org_id = p_org and c.status = 'vigente' and c.fim < current_date
  on conflict (org_id, chave) do update
    set status = case when public.alertas.status = 'resolvido' then 'aberto' else public.alertas.status end,
        detalhe = excluded.detalhe;

  insert into public.alertas (org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, chave)
  select
    c.org_id, c.carteira_id, 'contrato_janela', 'atencao', 'contrato', c.id,
    'Janela aberta: ' || coalesce(c.numero, 'sem número'),
    'A conversa deveria ter começado em ' || to_char(c.janela_renegociacao, 'DD/MM/YYYY') ||
      '. O contrato vence em ' || to_char(c.fim, 'DD/MM/YYYY') || '.',
    'contrato_janela:' || c.id
  from public.contratos c
  where c.org_id = p_org and c.status <> 'encerrado'
    and c.fim >= current_date and c.janela_renegociacao <= current_date
  on conflict (org_id, chave) do update
    set status = case when public.alertas.status = 'resolvido' then 'aberto' else public.alertas.status end,
        detalhe = excluded.detalhe;

  insert into public.alertas (org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, chave)
  select
    k.org_id, k.carteira_id, 'compromisso_atrasado', 'alta', k.entidade_tipo, k.entidade_id,
    'Compromisso atrasado: ' || k.titulo,
    'Venceu em ' || to_char(k.vence_em, 'DD/MM/YYYY') || ' e continua em aberto.',
    'compromisso:' || k.id
  from public.compromissos k
  where k.org_id = p_org and k.status = 'aberto' and k.vence_em < current_date
  on conflict (org_id, chave) do update
    set status = case when public.alertas.status = 'resolvido' then 'aberto' else public.alertas.status end,
        detalhe = excluded.detalhe;

  insert into public.alertas (org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, chave)
  select
    r.org_id, r.carteira_id, 'carteira_parada', 'atencao', 'carteira', r.carteira_id,
    'Sem movimento: ' || r.nome,
    'Nada registrado há ' || (current_date - r.ultima_movimentacao::date) || ' dias.',
    'carteira_parada:' || r.carteira_id
  from public.carteira_resumo r
  where r.org_id = p_org and r.status = 'ativa'
    and (current_date - r.ultima_movimentacao::date) >= p_dias_carteira
  on conflict (org_id, chave) do update
    set status = case when public.alertas.status = 'resolvido' then 'aberto' else public.alertas.status end,
        detalhe = excluded.detalhe;

  insert into public.alertas (org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, chave)
  select
    f.org_id, f.carteira_id, 'frente_parada', 'atencao', 'frente', f.id,
    'Frente parada: ' || f.titulo,
    'Sem atualização há ' || (current_date - f.atualizado_em::date) || ' dias.',
    'frente_parada:' || f.id
  from public.frentes f
  where f.org_id = p_org
    and f.status in ('em_analise', 'em_execucao')
    and (current_date - f.atualizado_em::date) >= p_dias_frente
  on conflict (org_id, chave) do update
    set status = case when public.alertas.status = 'resolvido' then 'aberto' else public.alertas.status end,
        detalhe = excluded.detalhe;

  -- Aqui está a mudança: o limite é o da fase, quando a organização
  -- definiu um. Fase com prazo em branco não gera alerta de parada.
  insert into public.alertas (org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, chave)
  select
    o.org_id, o.carteira_id, 'oportunidade_parada', 'atencao', 'oportunidade', o.id,
    'Parada em ' || coalesce(f.rotulo, o.fase) || ': ' || o.titulo,
    'Na mesma fase há ' || (current_date - o.fase_desde) || ' dias' ||
      case
        when f.prazo_esperado_dias is not null
          then ', e o esperado é ' || f.prazo_esperado_dias || '.'
        else '.'
      end,
    'oportunidade_parada:' || o.id
  from public.oportunidades o
  left join public.oportunidade_fases f on f.org_id = o.org_id and f.fase = o.fase
  where o.org_id = p_org
    and o.fase not in ('concluida', 'descartada')
    and (
      (f.prazo_esperado_dias is not null and (current_date - o.fase_desde) > f.prazo_esperado_dias)
      or (f.id is null and (current_date - o.fase_desde) >= p_dias_oportunidade)
    )
  on conflict (org_id, chave) do update
    set status = case when public.alertas.status = 'resolvido' then 'aberto' else public.alertas.status end,
        detalhe = excluded.detalhe;

  insert into public.alertas (org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, chave)
  select
    f.org_id, f.carteira_id, 'potencial_sem_captura', 'informativa', 'frente', f.id,
    'Em execução sem captura: ' || f.titulo,
    'Potencial estimado registrado e nada confirmado até agora.',
    'sem_captura:' || f.id
  from public.frentes f
  where f.org_id = p_org
    and f.status = 'em_execucao'
    and f.potencial_bruto is not null and f.potencial_bruto > 0
    and coalesce(f.valor_capturado, 0) = 0
    and (current_date - f.criado_em::date) >= p_dias_frente
  on conflict (org_id, chave) do update
    set status = case when public.alertas.status = 'resolvido' then 'aberto' else public.alertas.status end,
        detalhe = excluded.detalhe;

  update public.alertas a
     set status = 'resolvido', resolvido_em = now()
   where a.org_id = p_org
     and a.status = 'aberto'
     and not exists (
       select 1 from public.contratos c
        where a.chave = 'contrato_vencido:' || c.id
          and c.status = 'vigente' and c.fim < current_date)
     and not exists (
       select 1 from public.contratos c
        where a.chave = 'contrato_janela:' || c.id
          and c.status <> 'encerrado' and c.fim >= current_date
          and c.janela_renegociacao <= current_date)
     and not exists (
       select 1 from public.compromissos k
        where a.chave = 'compromisso:' || k.id
          and k.status = 'aberto' and k.vence_em < current_date)
     and not exists (
       select 1 from public.carteira_resumo r
        where a.chave = 'carteira_parada:' || r.carteira_id
          and (current_date - r.ultima_movimentacao::date) >= p_dias_carteira)
     and not exists (
       select 1 from public.frentes f
        where a.chave = 'frente_parada:' || f.id
          and f.status in ('em_analise', 'em_execucao')
          and (current_date - f.atualizado_em::date) >= p_dias_frente)
     and not exists (
       select 1 from public.oportunidades o
        left join public.oportunidade_fases ff on ff.org_id = o.org_id and ff.fase = o.fase
        where a.chave = 'oportunidade_parada:' || o.id
          and o.fase not in ('concluida', 'descartada')
          and (
            (ff.prazo_esperado_dias is not null and (current_date - o.fase_desde) > ff.prazo_esperado_dias)
            or (ff.id is null and (current_date - o.fase_desde) >= p_dias_oportunidade)
          ))
     and not exists (
       select 1 from public.frentes f
        where a.chave = 'sem_captura:' || f.id
          and f.status = 'em_execucao'
          and f.potencial_bruto > 0 and coalesce(f.valor_capturado, 0) = 0);

  select count(*) into v_abertos_depois
    from public.alertas where org_id = p_org and status = 'aberto';

  return v_abertos_depois - v_abertos_antes;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
alter table public.oportunidade_fases enable row level security;
alter table public.motivos_descarte   enable row level security;

drop policy if exists fases_le on public.oportunidade_fases;
create policy fases_le on public.oportunidade_fases
  for select to authenticated using (public.e_membro(org_id));

drop policy if exists fases_escreve on public.oportunidade_fases;
create policy fases_escreve on public.oportunidade_fases
  for all to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));

drop policy if exists motivos_le on public.motivos_descarte;
create policy motivos_le on public.motivos_descarte
  for select to authenticated using (public.e_membro(org_id));

drop policy if exists motivos_escreve on public.motivos_descarte;
create policy motivos_escreve on public.motivos_descarte
  for all to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));

grant select, insert, update, delete on public.oportunidade_fases to authenticated;
grant select, insert, update, delete on public.motivos_descarte   to authenticated;
grant execute on function public.garantir_fases(uuid) to authenticated;
