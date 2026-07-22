-- =====================================================================
-- Migration : 0008_panorama.sql
-- Feature   : F8 — painel multi-carteira
-- O que faz : cria a visao consolidada por carteira, com os numeros que
--             a coordenacao precisa ver de uma vez: contas, frentes,
--             contratos, compromissos e ultima movimentacao.
-- Aplicar   : depois de 0007_compromissos.sql.
--
-- A visao usa security_invoker: ela roda com as permissoes de quem
-- consulta, e nao com as do dono. Sem isso, uma visao seria uma porta
-- lateral para fora da RLS — o ponto focal veria numeros de carteiras
-- que nao pode abrir.
-- =====================================================================

drop view if exists public.carteira_resumo;

create view public.carteira_resumo
with (security_invoker = on)
as
select
  c.id                as carteira_id,
  c.org_id,
  c.nome,
  c.codigo,
  c.regiao,
  c.status,
  c.responsavel_id,
  c.score_maturidade,
  c.score_ciclo,

  -- contas
  coalesce(ct.total, 0)                 as contas_total,
  coalesce(ct.protecao, 0)              as contas_protecao,
  coalesce(ct.potencial, 0)             as contas_potencial,
  coalesce(ct.capturado, 0)             as contas_capturado,

  -- frentes
  coalesce(fr.abertas, 0)               as frentes_abertas,
  coalesce(fr.casos, 0)                 as frentes_casos,
  coalesce(fr.potencial, 0)             as frentes_potencial,
  coalesce(fr.capturado, 0)             as frentes_capturado,

  -- contratos
  coalesce(co.total, 0)                 as contratos_total,
  coalesce(co.vencidos, 0)              as contratos_vencidos,
  coalesce(co.janela, 0)                as contratos_janela,

  -- compromissos
  coalesce(cp.abertos, 0)               as compromissos_abertos,
  coalesce(cp.atrasados, 0)             as compromissos_atrasados,

  greatest(
    c.atualizado_em,
    coalesce(rg.ultimo, c.criado_em)
  )                                     as ultima_movimentacao,
  rg.ultimo                             as ultimo_registro

from public.carteiras c

left join lateral (
  select
    count(*)                                              as total,
    count(*) filter (where relacao = 'protecao')          as protecao,
    sum(potencial_bruto)                                  as potencial,
    sum(valor_capturado)                                  as capturado
  from public.contas x
  where x.carteira_id = c.id and x.status = 'ativa'
) ct on true

left join lateral (
  select
    count(*) filter (where status in ('identificada', 'em_analise', 'em_execucao')) as abertas,
    sum(qtd_casos) filter (where status in ('identificada', 'em_analise', 'em_execucao')) as casos,
    sum(potencial_bruto) filter (where status in ('identificada', 'em_analise', 'em_execucao')) as potencial,
    sum(valor_capturado)                                                              as capturado
  from public.frentes x
  where x.carteira_id = c.id
) fr on true

left join lateral (
  select
    count(*) filter (where status <> 'encerrado')                                   as total,
    count(*) filter (where status = 'vigente' and fim < current_date)               as vencidos,
    count(*) filter (where status <> 'encerrado'
                       and fim >= current_date
                       and janela_renegociacao <= current_date)                     as janela
  from public.contratos x
  where x.carteira_id = c.id
) co on true

left join lateral (
  select
    count(*) filter (where status = 'aberto')                                       as abertos,
    count(*) filter (where status = 'aberto' and vence_em < current_date)           as atrasados
  from public.compromissos x
  where x.carteira_id = c.id
) cp on true

left join lateral (
  select max(criado_em) as ultimo
  from public.registros x
  where x.carteira_id = c.id and x.ativo
) rg on true;

comment on view public.carteira_resumo is
  'Consolidacao por carteira para o panorama. Respeita a RLS de cada tabela '
  'de origem: quem so acessa uma carteira so vê os numeros dela.';

grant select on public.carteira_resumo to authenticated;
