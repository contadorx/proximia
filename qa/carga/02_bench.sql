-- =====================================================================
-- Benchmark das consultas de tela, com RLS ATIVA.
--
-- Método (e por que ele importa):
--
--   · Tudo dentro de UMA transação explícita. `set local role` fora de
--     transação não sobrevive à instrução seguinte no psql — medir assim
--     mediria o superusuário, que ignora RLS, e o número sairia bonito e
--     falso. Esta versão mede o caminho real do produto.
--   · A medida é o "Execution Time" do EXPLAIN ANALYZE: conta a execução
--     completa no banco, inclusive materializar as linhas, e não só o
--     count() — que o planejador pode encurtar.
--   · 5 passadas por consulta; reporta-se mediana e pior caso. A primeira
--     paga cache frio e sozinha exageraria.
--   · Fora da conta: rede, serialização do PostgREST e renderização do
--     Next. O que se mede aqui é o piso — o banco.
-- =====================================================================

set client_min_messages to notice;

create temporary table medicoes (
  tela text, consulta text, mediana_ms numeric, pior_ms numeric,
  linhas bigint, teto int, papel text
);

-- A tabela de medições é do superusuário; quem mede é o papel do
-- produto. Sem este grant, o benchmark morre na primeira gravação.
grant all on medicoes to authenticated;

create or replace function pg_temp.medir(
  p_tela text, p_consulta text, p_sql text, p_teto int default null, p_papel text default 'dono'
) returns void language plpgsql as $$
declare
  plano json; tempos numeric[] := '{}'; linhas bigint; i int;
begin
  for i in 1..5 loop
    execute 'explain (analyze, format json) ' || p_sql into plano;
    tempos := tempos || round((plano->0->>'Execution Time')::numeric, 2);
    linhas := (plano->0->'Plan'->>'Actual Rows')::bigint;
  end loop;

  insert into medicoes values (
    p_tela, p_consulta,
    (select percentile_cont(0.5) within group (order by t) from unnest(tempos) t),
    (select max(t) from unnest(tempos) t),
    linhas, p_teto, p_papel
  );
end $$;

begin;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-9900-000000000002')::text, true);

-- Prova de que a RLS está de pé nesta sessão: o dono da org 01 não pode
-- enxergar conta de outra organização. Se isto falhar, o benchmark é
-- inválido e a transação aborta.
do $$
declare fora bigint;
begin
  select count(*) into fora from contas
  where org_id <> '00000000-0000-4000-a000-000000000001';
  if fora <> 0 then
    raise exception 'RLS não está ativa (% linhas de fora visíveis) — benchmark inválido', fora;
  end if;
  raise notice 'RLS ativa: nenhuma linha de outra organização visível.';
end $$;

select pg_temp.medir('Contas (lista)', 'contas · order nome · limit 300', $q$
  select id, org_id, carteira_id, nome, razao_social, documento, segmento, relacao,
         criticidade, status, potencial_bruto, valor_capturado
  from contas where org_id = '00000000-0000-4000-a000-000000000001'
  order by nome limit 300
$q$, 300);

select pg_temp.medir('Contas (busca por nome)', 'contas · ilike · limit 300', $q$
  select id, nome from contas
  where org_id = '00000000-0000-4000-a000-000000000001'
    and (nome ilike '%0500%' or razao_social ilike '%0500%')
  order by nome limit 300
$q$, 300);

select pg_temp.medir('Contratos', 'contratos · order fim · limit 300', $q$
  select id, org_id, carteira_id, conta_id, numero, inicio, fim, status, valor_base,
         janela_renegociacao
  from contratos where org_id = '00000000-0000-4000-a000-000000000001'
  order by fim desc nulls last limit 300
$q$, 300);

select pg_temp.medir('Frentes', 'frentes · limit 300', $q$
  select id, org_id, carteira_id, titulo, status, natureza, potencial_bruto, valor_capturado
  from frentes where org_id = '00000000-0000-4000-a000-000000000001' limit 300
$q$, 300);

select pg_temp.medir('Oportunidades', 'oportunidades · limit 300', $q$
  select id, org_id, carteira_id, conta_id, titulo, fase, fase_desde, investimento,
         retorno_mensal, custo_mensal
  from oportunidades where org_id = '00000000-0000-4000-a000-000000000001' limit 300
$q$, 300);

select pg_temp.medir('Pendências (compromissos)', 'compromissos · order vence_em · limit 300', $q$
  select id, carteira_id, entidade_tipo, entidade_id, titulo, vence_em, dono_id, status, origem
  from compromissos where org_id = '00000000-0000-4000-a000-000000000001'
  order by vence_em limit 300
$q$, 300);

select pg_temp.medir('Pendências (avisos)', 'alertas · order criado_em · limit 200', $q$
  select id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe,
         status, criado_em, dono_id
  from alertas where org_id = '00000000-0000-4000-a000-000000000001' and status = 'aberto'
  order by criado_em desc limit 200
$q$, 200);

select pg_temp.medir('Histórico (global)', 'registros · order ocorrido_em · limit 200', $q$
  select id, carteira_id, entidade_tipo, entidade_id, tipo, titulo, corpo, ocorrido_em, autor_id
  from registros where org_id = '00000000-0000-4000-a000-000000000001' and ativo
  order by ocorrido_em desc, criado_em desc limit 200
$q$, 200);

select pg_temp.medir('Ficha da conta (histórico)', 'registros da entidade · limit 100', $q$
  select id, tipo, titulo, corpo, ocorrido_em, autor_id
  from registros
  where entidade_tipo = 'conta' and entidade_id = '00000000-0000-4000-c001-000000000001'
    and ativo
  order by ocorrido_em desc limit 100
$q$, 100);

select pg_temp.medir('Painel (captura mensal)', 'view captura_mensal', $q$
  select mes, origem, valor from captura_mensal
  where org_id = '00000000-0000-4000-a000-000000000001'
$q$);

select pg_temp.medir('Comparativo', 'view carteira_resumo · limit 200', $q$
  select * from carteira_resumo
  where org_id = '00000000-0000-4000-a000-000000000001' limit 200
$q$, 200);

select pg_temp.medir('Relatórios (conversão)', 'view conversao_carteira', $q$
  select * from conversao_carteira where org_id = '00000000-0000-4000-a000-000000000001'
$q$);

select pg_temp.medir('Relatórios (esforço)', 'view esforco_mensal', $q$
  select * from esforco_mensal where org_id = '00000000-0000-4000-a000-000000000001'
$q$);

select pg_temp.medir('Relatórios (vencimentos)', 'view vencimentos_mensais', $q$
  select * from vencimentos_mensais where org_id = '00000000-0000-4000-a000-000000000001'
$q$);

select pg_temp.medir('Relatórios (alertas por mês)', 'view alertas_mensais', $q$
  select * from alertas_mensais where org_id = '00000000-0000-4000-a000-000000000001'
$q$);

select pg_temp.medir('Pipeline (tempo por etapa)', 'view tempo_por_etapa · limit 500', $q$
  select * from tempo_por_etapa
  where org_id = '00000000-0000-4000-a000-000000000001' limit 500
$q$, 500);

select pg_temp.medir('Financeiro', 'view oportunidade_financeiro · limit 500', $q$
  select * from oportunidade_financeiro
  where org_id = '00000000-0000-4000-a000-000000000001' limit 500
$q$, 500);

select pg_temp.medir('Busca (API /api/buscar)', 'rpc buscar · termo de texto', $q$
  select * from buscar('Conta 05', 6)
$q$);

select pg_temp.medir('Busca (API, por CNPJ)', 'rpc buscar · documento', $q$
  select * from buscar('11000001000500', 6)
$q$);

select pg_temp.medir('Exportar contas (CSV)', 'contas · limit 5000', $q$
  select * from contas where org_id = '00000000-0000-4000-a000-000000000001' limit 5000
$q$, 5000);

select pg_temp.medir('Exportar registros (CSV)', 'registros · limit 5000', $q$
  select * from registros where org_id = '00000000-0000-4000-a000-000000000001' limit 5000
$q$, 5000);

select pg_temp.medir('Exportar capturas (CSV)', 'capturas · limit 5000', $q$
  select * from capturas where org_id = '00000000-0000-4000-a000-000000000001' limit 5000
$q$, 5000);

select pg_temp.medir('Maturidade', 'view maturidade_resultado', $q$
  select * from maturidade_resultado where org_id = '00000000-0000-4000-a000-000000000001'
$q$);

select pg_temp.medir('Acesso (pessoas)', 'view acesso_pessoas · limit 300', $q$
  select * from acesso_pessoas
  where org_id = '00000000-0000-4000-a000-000000000001' limit 300
$q$, 300);

commit;

-- --------------------------------------------------------------- ponto focal
-- O mesmo produto visto por quem enxerga uma carteira só: a RLS trabalha
-- mais, porque precisa provar o vínculo linha a linha.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-9900-000000000003')::text, true);

select pg_temp.medir('Contas — ponto focal', 'contas · alcance por carteira', $q$
  select id, nome, carteira_id from contas
  where org_id = '00000000-0000-4000-a000-000000000001'
  order by nome limit 300
$q$, 300, 'focal');

select pg_temp.medir('Histórico — ponto focal', 'registros · alcance por carteira', $q$
  select id, titulo, ocorrido_em from registros
  where org_id = '00000000-0000-4000-a000-000000000001' and ativo
  order by ocorrido_em desc limit 200
$q$, 200, 'focal');

select pg_temp.medir('Exportar contas — ponto focal', 'contas · limit 5000', $q$
  select * from contas where org_id = '00000000-0000-4000-a000-000000000001' limit 5000
$q$, 5000, 'focal');

select pg_temp.medir('Busca — ponto focal', 'rpc buscar', $q$
  select * from buscar('Conta 05', 6)
$q$, null, 'focal');

commit;

select rpad(tela, 30) || ' | ' || lpad(mediana_ms::text, 9) || ' ms | pior ' ||
       lpad(pior_ms::text, 9) || ' ms | ' || lpad(linhas::text, 5) || ' linhas' ||
       case when teto is not null and linhas >= teto then '  <<< CORTADO NO TETO' else '' end
from medicoes order by mediana_ms desc;
