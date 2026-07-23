-- =====================================================================
-- Conferência: valores possivelmente gravados ×100 (defeito corrigido no B43)
--
-- NÃO é migration. Rode no editor SQL para LISTAR suspeitos — nada aqui
-- altera dado. Corrigir é decisão de gente, com o dono do número ao lado.
--
-- Contexto: até o B42, todo valor digitado com a máscara de R$ entrava
-- multiplicado por cem (o servidor lia "1234.56" como "123456"). Valores
-- vindos de importação CSV entraram certos. Ou seja: a mesma tabela pode
-- ter as duas escalas misturadas, e nenhuma regra automática distingue
-- com segurança um 150.000 legítimo de um 1.500,00 inflado.
--
-- O que este script faz:
--   1. Mostra a distribuição de ordem de grandeza por tabela — um degrau
--      anormal em ×100 salta aos olhos.
--   2. Lista os lançamentos e estimativas com autor e data, dos maiores
--      para os menores, para conferência humana.
--
-- Como corrigir o que for confirmado:
--   · capturas: registre um ESTORNO do valor inflado e uma captura nova
--     com o valor certo — é o caminho que preserva o rastro. Exclusão é
--     exceção de administração.
--   · potencial/contratos/oportunidades: edite pela tela — o formulário
--     agora grava certo.
-- =====================================================================

-- 1. Ordem de grandeza por tabela ------------------------------------
with fontes as (
  select 'capturas' as tabela, valor from public.capturas
  union all
  select 'contas.potencial', potencial_bruto from public.contas where potencial_bruto is not null
  union all
  select 'frentes.potencial', potencial_bruto from public.frentes where potencial_bruto is not null
  union all
  select 'contratos.valor_base', valor_base from public.contratos where valor_base is not null
  union all
  select 'oportunidades.investimento', investimento from public.oportunidades where investimento is not null
  union all
  select 'oportunidades.retorno_mensal', retorno_mensal from public.oportunidades where retorno_mensal is not null
)
select
  tabela,
  count(*)                                   as linhas,
  min(valor)                                 as menor,
  percentile_cont(0.5) within group (order by valor) as mediana,
  max(valor)                                 as maior,
  count(*) filter (where valor >= 1000000)   as acima_de_1mi,
  count(*) filter (where valor >= 100000000) as acima_de_100mi
from fontes
group by tabela
order by tabela;

-- 2. Capturas para conferência, com autor e data ---------------------
-- origem = 'registro' é o que passou pelo formulário (o caminho com o
-- defeito); 'legado' veio do campo antigo e não passou pela máscara.
select
  c.criado_em::date  as registrado_em,
  c.origem,
  c.entidade_tipo,
  c.valor,
  c.confirmado_em,
  c.descricao,
  p.nome             as autor
from public.capturas c
left join public.perfis p on p.id = c.autor_id
order by c.valor desc
limit 200;

-- 3. Estimativas de potencial para conferência -----------------------
select 'conta' as onde, nome, potencial_bruto as valor, potencial_origem, potencial_data
  from public.contas where potencial_bruto is not null
union all
select 'frente', titulo, potencial_bruto, potencial_origem, potencial_data
  from public.frentes where potencial_bruto is not null
order by valor desc
limit 200;

-- 4. Oportunidades para conferência ----------------------------------
select titulo, investimento, retorno_mensal, custo_mensal,
       investimento_realizado, retorno_confirmado, estimativa_origem, estimativa_data
  from public.oportunidades
 where investimento is not null or retorno_mensal is not null
 order by coalesce(investimento, 0) desc
 limit 200;
