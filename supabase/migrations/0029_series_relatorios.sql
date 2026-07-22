-- =====================================================================
-- Migration : 0029_series_relatorios.sql
-- Feature   : B35 — central de relatórios
-- Aplicar   : depois de 0028_financeiro.sql.
--
-- Três séries que o banco já tinha condição de responder e ninguém
-- perguntava, porque não havia tela:
--
--   1. Alertas abertos contra resolvidos por mês. Diz se a operação está
--      drenando ou acumulando — uma coisa é ter vinte alertas abertos
--      tendo resolvido trinta no mês; outra é ter vinte tendo resolvido
--      dois.
--   2. Esforço registrado por mês e por tipo. É a prova de trabalho da
--      equipe, e vinha sendo guardada sem nunca ser somada.
--   3. Vencimentos por mês daqui para frente. O dado sempre esteve em
--      contratos.fim; faltava olhar como calendário em vez de lista.
--
-- Agrupamento pesado fica no banco de propósito: puxar mil registros para
-- somar no servidor da aplicação é desperdício que aparece no primeiro
-- assinante grande.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Alertas abertos e resolvidos por mês
-- ---------------------------------------------------------------------
drop view if exists public.alertas_mensais;

create view public.alertas_mensais
with (security_invoker = on)
as
select
  org_id,
  carteira_id,
  mes,
  sum(abertos)    as abertos,
  sum(resolvidos) as resolvidos
from (
  select org_id, carteira_id,
         date_trunc('month', criado_em)::date as mes,
         count(*) as abertos, 0 as resolvidos
    from public.alertas
   group by org_id, carteira_id, date_trunc('month', criado_em)

  union all

  select org_id, carteira_id,
         date_trunc('month', resolvido_em)::date,
         0, count(*)
    from public.alertas
   where resolvido_em is not null
   group by org_id, carteira_id, date_trunc('month', resolvido_em)
) fontes
group by org_id, carteira_id, mes;

grant select on public.alertas_mensais to authenticated;

-- ---------------------------------------------------------------------
-- 2. Esforço registrado por mês
-- ---------------------------------------------------------------------
-- Só registros ativos: a versão anterior de um registro editado não é
-- trabalho a mais, é o mesmo trabalho contado duas vezes.
drop view if exists public.esforco_mensal;

create view public.esforco_mensal
with (security_invoker = on)
as
select
  org_id,
  carteira_id,
  date_trunc('month', ocorrido_em)::date as mes,
  tipo,
  count(*)                               as quantidade,
  count(distinct autor_id)               as pessoas
from public.registros
where ativo
group by org_id, carteira_id, date_trunc('month', ocorrido_em), tipo;

grant select on public.esforco_mensal to authenticated;

-- ---------------------------------------------------------------------
-- 3. Vencimentos por mês
-- ---------------------------------------------------------------------
-- Inclui o passado recente de propósito: contrato vencido e não tratado
-- continua sendo decisão pendente, e sumir do calendário é como se
-- resolve por esquecimento.
drop view if exists public.vencimentos_mensais;

create view public.vencimentos_mensais
with (security_invoker = on)
as
select
  c.org_id,
  c.carteira_id,
  date_trunc('month', c.fim)::date as mes,
  count(*)                         as contratos,
  sum(c.valor_base)                as valor_base,
  count(*) filter (where c.fim < current_date)          as ja_vencidos,
  count(*) filter (where c.renovacao_automatica)        as com_renovacao_automatica
from public.contratos c
where c.status <> 'encerrado'
  and c.fim is not null
  and c.fim >= (date_trunc('month', current_date) - interval '6 months')::date
group by c.org_id, c.carteira_id, date_trunc('month', c.fim);

grant select on public.vencimentos_mensais to authenticated;

-- ---------------------------------------------------------------------
-- 4. Conversão por carteira
-- ---------------------------------------------------------------------
drop view if exists public.conversao_carteira;

create view public.conversao_carteira
with (security_invoker = on)
as
select
  o.org_id,
  o.carteira_id,
  count(*)                                                   as total,
  count(*) filter (where o.fase not in ('concluida', 'descartada')) as em_andamento,
  count(*) filter (where o.fase = 'concluida')               as ganhas,
  count(*) filter (where o.fase = 'descartada')              as perdidas,
  sum(o.investimento) filter (where o.fase = 'concluida')    as investimento_ganho,
  sum(o.investimento) filter (where o.fase not in ('concluida', 'descartada')) as investimento_em_jogo
from public.oportunidades o
group by o.org_id, o.carteira_id;

grant select on public.conversao_carteira to authenticated;
