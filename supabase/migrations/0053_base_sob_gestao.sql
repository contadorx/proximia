-- =====================================================================
-- Migration : 0053_base_sob_gestao.sql
-- Aplicar   : depois de 0052_receita_atual.sql.
--
-- O QUE ESTA MIGRATION RECONHECE
--
-- Gestão de grandes clientes não é só capturar valor novo: é também
-- manter o que já existe. Um contrato que vence sem renegociação, um
-- cliente que migra para poço, um desconto que ninguém defendeu — tudo
-- isso é perda, e perda não aparecia em lugar nenhum do produto porque
-- o número que se perde nunca esteve lá.
--
-- Com receita_atual (0052), ele existe por conta. Falta agregá-lo: sem
-- isso, o comparativo entre unidades responde "quem capturou mais" e não
-- responde "quem cuida de quanto".
--
-- O QUE ENTRA NO RESUMO POR CARTEIRA
--
--   base_sob_gestao ......... soma de receita_atual das contas ativas
--   base_protecao ........... a parte dela em contas de relação proteção
--   contas_com_receita ...... quantas têm o número informado
--   base_referencia ......... a data mais recente entre elas
--
-- A COBERTURA É PARTE DO NÚMERO, NÃO ENFEITE
--
-- Somar receita de 3 contas em 20 e apresentar como "base da unidade"
-- seria mentira por omissão. Por isso `contas_com_receita` anda junto:
-- quem lê vê a soma e vê sobre quantas contas ela foi feita.
--
-- O QUE ESTA MIGRATION NÃO FAZ, DE PROPÓSITO
--
-- Não calcula razão entre capturado e base. A conta é fácil e viraria
-- placar — e placar por unidade é meta com outro nome, que é justamente
-- o que este produto recusa. Os dois números aparecem lado a lado e a
-- comparação é de quem lê, não do sistema.
--
-- E não soma base com potencial nem com capturado, em lugar nenhum: são
-- três naturezas distintas.
-- =====================================================================

-- `create or replace` não aceita coluna nova no meio da lista — só no
-- fim. Como a base sob gestão pertence ao lado das contas, e não
-- pendurada no final, a view é recriada. Nada depende dela no banco
-- (conferido em pg_depend); quem lê é a aplicação, por nome de coluna.
drop view if exists public.carteira_resumo;

create view public.carteira_resumo
with (security_invoker = on)
as
select
  c.id                                  as carteira_id,
  c.org_id,
  c.nome,
  c.codigo,
  c.regiao,
  c.status,
  c.responsavel_id,
  c.score_maturidade,
  c.score_ciclo,

  coalesce(ct.total, 0)                 as contas_total,
  coalesce(ct.protecao, 0)              as contas_protecao,
  coalesce(ct.potencial, 0)             as contas_potencial,
  coalesce(ct.potencial_protecao, 0)    as contas_potencial_protecao,
  coalesce(ct.capturado, 0)             as contas_capturado,

  -- Base sob gestão: o que os clientes desta carteira já pagam.
  coalesce(ct.base, 0)                  as base_sob_gestao,
  coalesce(ct.base_protecao, 0)         as base_protecao,
  coalesce(ct.com_receita, 0)           as contas_com_receita,
  ct.base_referencia,

  coalesce(fr.abertas, 0)               as frentes_abertas,
  coalesce(fr.casos, 0)                 as frentes_casos,
  coalesce(fr.potencial, 0)             as frentes_potencial,
  coalesce(fr.potencial_protecao, 0)    as frentes_potencial_protecao,
  coalesce(fr.capturado, 0)             as frentes_capturado,

  coalesce(co.total, 0)                 as contratos_total,
  coalesce(co.vencidos, 0)              as contratos_vencidos,
  coalesce(co.janela, 0)                as contratos_janela,

  coalesce(op.abertas, 0)               as oportunidades_abertas,
  coalesce(op.investimento, 0)          as oportunidades_investimento,
  coalesce(op.resultado_mensal, 0)      as oportunidades_resultado,

  coalesce(cp.abertos, 0)               as compromissos_abertos,
  coalesce(cp.atrasados, 0)             as compromissos_atrasados,

  greatest(c.atualizado_em, coalesce(rg.ultimo, c.criado_em)) as ultima_movimentacao,
  rg.ultimo                             as ultimo_registro

from public.carteiras c

left join lateral (
  select
    count(*)                                                          as total,
    count(*) filter (where x.relacao = 'protecao')                    as protecao,
    sum(x.potencial_bruto) filter (where x.relacao <> 'protecao')     as potencial,
    sum(x.potencial_bruto) filter (where x.relacao = 'protecao')      as potencial_protecao,
    sum(x.valor_capturado)                                            as capturado,
    sum(x.receita_atual)                                              as base,
    sum(x.receita_atual) filter (where x.relacao = 'protecao')        as base_protecao,
    count(*) filter (where x.receita_atual is not null)               as com_receita,
    max(x.receita_data)                                               as base_referencia
  from public.contas x
  where x.carteira_id = c.id and x.status = 'ativa'
) ct on true

left join lateral (
  select
    count(*) filter (where x.status in ('identificada','em_analise','em_execucao')) as abertas,
    sum(x.qtd_casos) filter (where x.status in ('identificada','em_analise','em_execucao')) as casos,
    sum(x.potencial_bruto) filter (
      where x.status in ('identificada','em_analise','em_execucao')
        and x.natureza = 'captura') as potencial,
    sum(x.potencial_bruto) filter (
      where x.status in ('identificada','em_analise','em_execucao')
        and x.natureza = 'protecao') as potencial_protecao,
    sum(x.valor_capturado) as capturado
  from public.frentes x
  where x.carteira_id = c.id
) fr on true

left join lateral (
  select
    count(*) as total,
    count(*) filter (where x.fim is not null and x.fim < current_date) as vencidos,
    count(*) filter (
      where x.janela_renegociacao is not null
        and current_date >= x.janela_renegociacao
        and (x.fim is null or x.fim >= current_date)) as janela
  from public.contratos x
  where x.carteira_id = c.id and x.status <> 'encerrado'
) co on true

left join lateral (
  select
    count(*) filter (where x.fase not in ('concluida','descartada')) as abertas,
    sum(x.investimento) filter (where x.fase not in ('concluida','descartada')) as investimento,
    sum(x.resultado_mensal) filter (where x.fase not in ('concluida','descartada')) as resultado_mensal
  from public.oportunidades x
  where x.carteira_id = c.id
) op on true

left join lateral (
  select
    count(*) filter (where x.status = 'aberto') as abertos,
    count(*) filter (where x.status = 'aberto' and x.vence_em < current_date) as atrasados
  from public.compromissos x
  where x.carteira_id = c.id
) cp on true

left join lateral (
  select max(x.ocorrido_em) as ultimo
  from public.registros x
  where x.carteira_id = c.id and x.ativo
) rg on true;

grant select on public.carteira_resumo to authenticated;

comment on view public.carteira_resumo is
  'Resumo por carteira. base_sob_gestao é o que os clientes já pagam — não soma com potencial '
  'nem com capturado, e vem acompanhada de contas_com_receita porque soma sem cobertura é '
  'mentira por omissão.';


do $$
declare r record;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='carteira_resumo'
       and column_name in ('base_sob_gestao','base_protecao','contas_com_receita','base_referencia')
     having count(*) = 4) then
    raise exception 'As colunas de base sob gestão não entraram no resumo';
  end if;

  raise notice 'Base sob gestão disponível no resumo por carteira.';
end $$;
