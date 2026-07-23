-- =====================================================================
-- SUSPENSÃO EM TODAS AS PORTAS — org-19 (suspensa), admin legítimo dela.
--
-- Os Termos prometem: a conta suspensa consulta e exporta, mas não
-- registra nada novo. Este teste tranca cada porta de escrita como o
-- próprio admin da organização suspensa e confirma a recusa; a última
-- linha é a contraprova de que a LEITURA continua.
--
-- Método (aprendido na marra nesta rodada): o resultado é impresso por
-- RAISE NOTICE dentro da transação, não gravado em tabela — porque o
-- rollback do fim, necessário para não sujar a base, apagaria também as
-- gravações de resultado. E o id da org é conferido antes: a primeira
-- tentativa deu falso "ACEITO" por usar o id de outra organização
-- (g=13, ativa) no lugar da suspensa (g=19). Id conferido e efeito real
-- são inseparáveis.
-- =====================================================================

set client_min_messages to notice;

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-9000-000000000056')::text, true);

do $$
declare conta_id uuid; v int; res text; status text;
begin
  select assinatura_status into status from public.orgs
  where id = '00000000-0000-4000-a000-000000000019';
  if status <> 'suspensa' then
    raise exception 'Cenário inválido: a org de teste está % (esperado suspensa)', status;
  end if;
  raise notice 'Org de teste: status=% · permite_escrita=%',
    status, public.assinatura_permite_escrita('00000000-0000-4000-a000-000000000019');

  select id into conta_id from public.contas
  where org_id = '00000000-0000-4000-a000-000000000019' limit 1;

  begin
    insert into public.contas(org_id, carteira_id, nome)
    values ('00000000-0000-4000-a000-000000000019', '00000000-0000-4000-b019-000000000001', 'x');
    res := 'ACEITO (!!!)';
  exception when others then res := 'recusado ' || sqlstate; end;
  raise notice 'contas INSERT        : %', res;

  begin
    insert into public.registros(org_id, carteira_id, entidade_tipo, entidade_id, corpo, autor_id)
    values ('00000000-0000-4000-a000-000000000019', '00000000-0000-4000-b019-000000000001',
            'conta', conta_id, 'x', '00000000-0000-4000-9000-000000000056');
    res := 'ACEITO (!!!)';
  exception when others then res := 'recusado ' || sqlstate; end;
  raise notice 'registros INSERT     : %', res;

  begin
    insert into public.capturas(org_id, carteira_id, entidade_tipo, entidade_id, valor, autor_id, origem)
    values ('00000000-0000-4000-a000-000000000019', '00000000-0000-4000-b019-000000000001',
            'conta', conta_id, 1000, '00000000-0000-4000-9000-000000000056', 'registro');
    res := 'ACEITO (!!!)';
  exception when others then res := 'recusado ' || sqlstate; end;
  raise notice 'capturas INSERT      : %', res;

  begin
    insert into public.compromissos(org_id, carteira_id, entidade_tipo, entidade_id, titulo, vence_em)
    values ('00000000-0000-4000-a000-000000000019', '00000000-0000-4000-b019-000000000001',
            'conta', conta_id, 'x', current_date);
    res := 'ACEITO (!!!)';
  exception when others then res := 'recusado ' || sqlstate; end;
  raise notice 'compromissos INSERT  : %', res;

  begin
    update public.contas set observacoes = 'x'
    where org_id = '00000000-0000-4000-a000-000000000019';
    get diagnostics v = row_count;
    res := v || ' linhas afetadas';
  exception when others then res := 'recusado ' || sqlstate; end;
  raise notice 'contas UPDATE        : %', res;

  begin
    perform public.gerar_compromissos_pendentes('00000000-0000-4000-a000-000000000019');
    res := 'ACEITO (!!!)';
  exception when others then res := 'recusado: ' || left(sqlerrm, 45); end;
  raise notice 'rpc gerar_compromiss : %', res;

  select count(*) into v from public.contas
  where org_id = '00000000-0000-4000-a000-000000000019';
  raise notice 'LEITURA (contraprova): % contas visíveis — deve continuar lendo', v;
end $$;

rollback;
