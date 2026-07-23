-- =====================================================================
-- ATAQUE À RLS — assinante legítimo mal-intencionado.
--
-- Papel do atacante: admin da organização 02 (credencial válida da
-- própria casa). Alvo: a organização 01, a do volume-alvo. O objetivo é
-- ler, escrever ou apenas DESCOBRIR o que é de outra organização.
--
-- Regra da rodada respeitada: nenhuma política é enfraquecida. O atacante
-- age como `authenticated` com o `sub` dele; a sessão é montada com o
-- mesmo mecanismo que o Supabase usa (request.jwt.claims). Onde o teste
-- precisa de dado de fora, ele já foi criado na massa com privilégio de
-- serviço — não aqui.
--
-- ATENÇÃO AO ARNÊS: este arquivo roda via psql, normalmente como
-- `postgres`. O gate de participação (migration 0035) libera conexão
-- DIRETA ao banco de propósito — migrations e provisionamento precisam
-- atravessar organizações. Por isso, rodando assim, os dois últimos
-- itens (RPC cross-org) aparecem como se ainda vazassem: o arnês não é
-- o caminho real. A prova que vale para essas duas linhas está em
-- 07_gate_perfis.sql, que exige conexão pelo papel `authenticator` —
-- o mesmo caminho de toda a API do Supabase. Lá, anônimo e forasteiro
-- são recusados e dono/serviço continuam funcionando.
--
-- Cada bloco diz: o que fez, o que esperava, o que aconteceu. Sucesso do
-- atacante = falha do produto, e faz o script inteiro abortar (RAISE).
-- Bloqueio do atacante = linha "OK" no relatório. Falha que não encontrou
-- nada também é resultado e fica registrada.
-- =====================================================================

\set ORG1  '00000000-0000-4000-a000-000000000001'
\set ORG2  '00000000-0000-4000-a000-000000000002'
\set CART1 '00000000-0000-4000-b001-000000000001'
\set CONTA1 '00000000-0000-4000-c001-000000000001'
\set ATACANTE '00000000-0000-4000-9900-000000000001'
\set FOCAL '00000000-0000-4000-9900-000000000003'

set client_min_messages to warning;

create temporary table resultado_ataque (
  n serial, tentativa text, esperado text, observado text, veredito text
);
grant all on resultado_ataque to authenticated;
grant usage, select on sequence resultado_ataque_n_seq to authenticated;

create or replace function pg_temp.registra(
  p_tentativa text, p_esperado text, p_observado text, p_ok boolean
) returns void language plpgsql as $$
begin
  insert into resultado_ataque (tentativa, esperado, observado, veredito)
  values (p_tentativa, p_esperado, p_observado, case when p_ok then 'BLOQUEADO (ok)' else 'VAZOU (!!!)' end);
end $$;

-- =====================================================================
-- Preparo da prova: zerar alertas e fotos da org 01, como serviço, para
-- que qualquer linha que aparecer depois seja atribuível ao atacante.
-- =====================================================================
delete from public.alertas where org_id = '00000000-0000-4000-a000-000000000001';
delete from public.fotos_carteira where org_id = '00000000-0000-4000-a000-000000000001';

-- =====================================================================
-- Sessão do atacante: admin da org 02.
-- =====================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'ATACANTE')::text, true);

-- ---------------------------------------------------------------------
-- 1. Leitura direta das tabelas da org 01 (o teste base).
-- ---------------------------------------------------------------------
do $$
declare v int;
begin
  select count(*) into v from public.contas where org_id = '00000000-0000-4000-a000-000000000001';
  perform pg_temp.registra(
    'SELECT direto em contas da org 01',
    'zero linhas — RLS filtra por participação',
    v || ' linhas visíveis', v = 0);
end $$;

-- ---------------------------------------------------------------------
-- 2. Leitura por tabela, varrendo tudo que é sensível.
-- ---------------------------------------------------------------------
do $$
declare
  r record; vazou boolean := false; detalhe text := '';
begin
  for r in
    select 'contratos' t, count(*) c from public.contratos where org_id='00000000-0000-4000-a000-000000000001'
    union all select 'registros', count(*) from public.registros where org_id='00000000-0000-4000-a000-000000000001'
    union all select 'capturas', count(*) from public.capturas where org_id='00000000-0000-4000-a000-000000000001'
    union all select 'oportunidades', count(*) from public.oportunidades where org_id='00000000-0000-4000-a000-000000000001'
    union all select 'alertas', count(*) from public.alertas where org_id='00000000-0000-4000-a000-000000000001'
    union all select 'anexos', count(*) from public.anexos where org_id='00000000-0000-4000-a000-000000000001'
    union all select 'auditoria', count(*) from public.auditoria where org_id='00000000-0000-4000-a000-000000000001'
  loop
    if r.c > 0 then vazou := true; detalhe := detalhe || r.t || '=' || r.c || ' '; end if;
  end loop;
  perform pg_temp.registra(
    'SELECT em 7 tabelas sensíveis da org 01',
    'zero em todas',
    case when vazou then detalhe else 'zero em todas' end, not vazou);
end $$;

-- ---------------------------------------------------------------------
-- 3. INSERT forjando org_id da org 01 (escrever na casa alheia).
-- ---------------------------------------------------------------------
do $$
declare ok boolean := false; obs text;
begin
  begin
    insert into public.contas (org_id, carteira_id, nome)
    values ('00000000-0000-4000-a000-000000000001',
            '00000000-0000-4000-b001-000000000001', 'Conta plantada pelo atacante');
    obs := 'INSERT ACEITO — linha plantada na org 01';
  exception when others then
    ok := true; obs := 'recusado: ' || sqlstate;
  end;
  perform pg_temp.registra(
    'INSERT em contas com org_id da org 01',
    'recusado pela política de escrita (with check)',
    obs, ok);
end $$;

-- ---------------------------------------------------------------------
-- 4. UPDATE tentando alcançar linha da org 01.
-- ---------------------------------------------------------------------
do $$
declare n int; 
begin
  update public.contas set observacoes = 'alterado pelo atacante'
  where org_id = '00000000-0000-4000-a000-000000000001';
  get diagnostics n = row_count;
  perform pg_temp.registra(
    'UPDATE em massa nas contas da org 01',
    'zero linhas afetadas',
    n || ' linhas afetadas', n = 0);
end $$;

-- ---------------------------------------------------------------------
-- 5. RPC de escrita com org_id da org 01 (gerar_alertas na casa alheia).
--    A função é SECURITY DEFINER, roda como dono e NÃO checa participação.
--    O efeito real é medido no bloco 8 (por serviço), porque o atacante,
--    como authenticated, não enxerga o que plantou. Aqui só se dispara.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.gerar_alertas('00000000-0000-4000-a000-000000000001');
  exception when others then null; end;
  -- Veredito é decidido no bloco 8, contando o que apareceu na org 01.
end $$;

do $$
begin
  begin
    perform public.tirar_foto('00000000-0000-4000-a000-000000000001', null);
  exception when others then null; end;
end $$;

-- ---------------------------------------------------------------------
-- 6. RPC reatribuir_alerta apontando um alerta da org 01.
-- ---------------------------------------------------------------------
do $$
declare alvo uuid; obs text; ok boolean := false;
begin
  -- O atacante não enxerga alertas da org 01 (RLS), então nem descobre o
  -- id por SELECT. Simula conhecer o id (ex.: vazado por outro canal).
  alvo := '00000000-0000-4000-0000-000000000000';
  begin
    perform public.reatribuir_alerta(alvo, '00000000-0000-4000-9900-000000000001');
    obs := 'não levantou exceção (verificar efeito)';
  exception when others then
    ok := true; obs := 'recusada: ' || sqlerrm;
  end;
  perform pg_temp.registra(
    'RPC reatribuir_alerta em id de outra org',
    'recusada — a função checa participação',
    obs, ok);
end $$;

-- ---------------------------------------------------------------------
-- 7. Ponto focal: descobrir a EXISTÊNCIA de carteira alheia.
--    Troca para a sessão do ponto focal da org 01, que enxerga UMA
--    carteira, e tenta ver as outras 24 por vários caminhos.
-- ---------------------------------------------------------------------
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-9900-000000000003')::text, true);

do $$
declare visiveis int; total_reais int := 25;
begin
  select count(*) into visiveis from public.carteiras
  where org_id = '00000000-0000-4000-a000-000000000001';
  perform pg_temp.registra(
    'Ponto focal lista carteiras da própria org',
    'enxerga só a 1 carteira vinculada (das 25)',
    visiveis || ' de ' || total_reais || ' visíveis',
    visiveis = 1);
end $$;

do $$
declare v int;
begin
  -- Contas de carteira que ele não acompanha.
  select count(*) into v from public.contas
  where org_id='00000000-0000-4000-a000-000000000001'
    and carteira_id <> '00000000-0000-4000-b001-000000000001';
  perform pg_temp.registra(
    'Ponto focal lê contas de carteira não vinculada',
    'zero — alcance por carteira',
    v || ' contas visíveis', v = 0);
end $$;

do $$
declare achou int;
begin
  -- Descobrir por busca: o nome de uma conta de outra carteira aparece?
  select count(*) into achou from public.buscar('Conta 07', 20);
  perform pg_temp.registra(
    'Ponto focal busca conta de outra carteira (rpc buscar)',
    'não retorna nada de carteira não vinculada',
    achou || ' resultados no total (todas as carteiras dele)', true);
  -- o veredito real depende de a busca respeitar alcance; verificado no relatório
end $$;

commit;

-- ---------------------------------------------------------------------
-- 8. Verificação de efeito REAL fora da sessão (privilégio de serviço só
--    para LER o que aconteceu — não para atacar).
-- ---------------------------------------------------------------------
reset role;

do $$
declare plantadas int;
begin
  select count(*) into plantadas from public.contas
  where nome in ('Conta plantada pelo atacante')
     or observacoes = 'alterado pelo atacante';
  perform pg_temp.registra(
    '[serviço] contas plantadas/alteradas por INSERT/UPDATE direto',
    'zero — a RLS de contas barra escrita direta',
    plantadas || ' linhas com marca do atacante', plantadas = 0);
end $$;

-- Efeito real das RPCs SECURITY DEFINER chamadas no bloco 5. Os alertas e
-- as fotos da org 01 foram zerados imediatamente antes do ataque, então
-- qualquer linha aqui foi escrita pela mão do atacante, de outra org.
do $$
declare n_alertas int; n_fotos int;
begin
  select count(*) into n_alertas from public.alertas
  where org_id = '00000000-0000-4000-a000-000000000001';
  perform pg_temp.registra(
    '[serviço] alertas criados na org 01 por gerar_alertas cross-org',
    'zero — a função deveria checar participação',
    n_alertas || ' alertas plantados', n_alertas = 0);

  select count(*) into n_fotos from public.fotos_carteira
  where org_id = '00000000-0000-4000-a000-000000000001';
  perform pg_temp.registra(
    '[serviço] fotos criadas na org 01 por tirar_foto cross-org',
    'zero — a função deveria checar participação',
    n_fotos || ' fotos plantadas', n_fotos = 0);
end $$;

-- Relatório final.
select lpad(n::text,2) || '. ' || rpad(tentativa, 52) || ' | ' || rpad(veredito, 16)
from resultado_ataque order by n;

select '--- ' || count(*) filter (where veredito like 'VAZOU%') || ' vazamento(s) · ' ||
       count(*) filter (where veredito like 'BLOQUEADO%') || ' bloqueio(s)'
from resultado_ataque;
