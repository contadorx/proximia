-- =====================================================================
-- Migration : 0048_cobertura_por_conta.sql
-- Aplicar   : depois de 0047_enriquecimento_cnpj.sql.
--
-- =====================================================================
-- POR QUE ISTO EXISTE, DEPOIS DE EU TER RECUSADO "WHITESPACE"
-- =====================================================================
--
-- A recusa anterior tinha um motivo específico: whitespace de manual é
-- uma matriz de CONTAS × PRODUTOS, e catálogo de produtos é o caminho
-- mais curto para o produto deixar de ser agnóstico de setor. Continuo
-- achando que catálogo de SKU não entra aqui.
--
-- O que mudou é a leitura do que já existe. `oportunidade_catalogo` é um
-- catálogo do assinante desde a migration 0010 — os TIPOS DE INICIATIVA
-- que aquela operação reconhece ("extensão de rede", "água de reúso",
-- "revisão cadastral"). E `oportunidades` já tem `conta_id` e
-- `catalogo_id`.
--
-- Ou seja: a matriz que interessa já é possível sem inventar nada —
--
--     contas × tipos de iniciativa
--
-- E ela responde a mesma pergunta do whitespace, com uma vantagem: o
-- vocabulário é do cliente, não do produto. Onde o concorrente pergunta
-- "quais SKUs esta conta ainda não comprou", aqui se pergunta "quais
-- iniciativas que a nossa operação sabe fazer nunca foram tentadas nesta
-- conta". A segunda é a pergunta que a coordenação realmente faz.
--
-- Por isso o nome não é whitespace: é COBERTURA. Whitespace mede espaço
-- vazio numa grade de produtos; cobertura mede o que a operação já
-- alcançou e o que não alcançou ainda.
--
-- =====================================================================
-- AS TRÊS TRAVAS PARA ISTO NÃO VIRAR NÚMERO FALSO
-- =====================================================================
--
-- 1. A cobertura conta OCORRÊNCIA, nunca valor. Somar "potencial não
--    explorado" multiplicando lacunas por um ticket médio produziria uma
--    cifra grande e inventada — exatamente o tipo de número que o
--    produto recusa. A lacuna é uma pergunta a fazer, não receita a
--    projetar.
--
-- 2. Lacuna não é oportunidade. A tela diz "nunca houve iniciativa deste
--    tipo nesta conta" — e não "há dinheiro aqui". Pode não haver: a
--    conta pode não ter o perfil, ou já ter recusado.
--
-- 3. Descartada conta como tentativa. Se a operação já tentou e perdeu,
--    aquilo não é espaço em branco; é assunto encerrado, e insistir sem
--    saber disso é como o vendedor queima relacionamento.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. A matriz
-- ---------------------------------------------------------------------
-- Uma linha por conta e tipo de iniciativa, com o que já aconteceu.
-- security_invoker faz a RLS de contas e oportunidades valer aqui.

create or replace view public.cobertura_conta
with (security_invoker = on)
as
select
  c.org_id,
  c.carteira_id,
  c.id                                  as conta_id,
  c.nome                                as conta,
  c.criticidade,
  cat.id                                as catalogo_id,
  cat.nome                              as tipo,

  count(o.id)                                                        as iniciativas,
  count(o.id) filter (where o.fase = 'concluida')                    as ganhas,
  count(o.id) filter (where o.fase = 'descartada')                   as descartadas,
  count(o.id) filter (where o.fase not in ('concluida', 'descartada')) as em_andamento,

  max(o.criado_em)                                                   as ultima_em

from public.contas c
cross join public.oportunidade_catalogo cat
left join public.oportunidades o
       on o.conta_id = c.id
      and o.catalogo_id = cat.id
where c.org_id = cat.org_id
  and c.status = 'ativa'
  and cat.ativo
group by c.org_id, c.carteira_id, c.id, c.nome, c.criticidade, cat.id, cat.nome;

grant select on public.cobertura_conta to authenticated;

comment on view public.cobertura_conta is
  'Contas × tipos de iniciativa: o que já foi tentado em cada conta e o que nunca foi. '
  'Conta ocorrência, nunca valor — lacuna é pergunta a fazer, não receita a projetar. '
  'Iniciativa descartada conta como tentativa: assunto encerrado não é espaço em branco.';


-- ---------------------------------------------------------------------
-- 2. O resumo por carteira
-- ---------------------------------------------------------------------
-- Para a coordenação olhar dezenas de unidades sem abrir conta por conta.

create or replace view public.cobertura_carteira
with (security_invoker = on)
as
select
  org_id,
  carteira_id,
  count(distinct conta_id)                                    as contas,
  count(distinct catalogo_id)                                 as tipos,
  count(*)                                                    as celulas,
  count(*) filter (where iniciativas > 0)                     as celulas_com_iniciativa,
  count(*) filter (where iniciativas = 0)                     as lacunas,
  round(
    count(*) filter (where iniciativas > 0) * 100.0 / nullif(count(*), 0),
    1
  )                                                           as cobertura_pct
from public.cobertura_conta
group by org_id, carteira_id;

grant select on public.cobertura_carteira to authenticated;


-- ---------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.cobertura_conta') is null
     or to_regclass('public.cobertura_carteira') is null then
    raise exception 'As views de cobertura não foram criadas';
  end if;

  if not exists (
    select 1 from pg_class c
     where c.oid = 'public.cobertura_conta'::regclass
       and array_to_string(c.reloptions, ',') like '%security_invoker=%'
  ) then
    raise exception 'A view de cobertura leria por cima da RLS';
  end if;

  raise notice 'Cobertura por conta: matriz e resumo por carteira no lugar.';
end $$;
