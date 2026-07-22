do $$
declare
  v_o uuid; v_f uuid; v_org public.orgs; v_c1 uuid; v_c2 uuid; v_conta uuid; v_qtd int; v_lin record;
begin
  select id into v_o from auth.users where email='gestor@exemplo.com';
  select id into v_f from auth.users where email='focal@exemplo.com';
  perform set_config('request.jwt.claims', json_build_object('sub',v_o,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_org := public.criar_organizacao('Teste Busca','teste-busca');
  perform public.vincular_membro(v_org.id,'focal@exemplo.com','ponto_focal');
  insert into public.carteiras (org_id,nome,codigo) values (v_org.id,'Regional Norte','RN') returning id into v_c1;
  insert into public.carteiras (org_id,nome,codigo) values (v_org.id,'Regional Sul','RS') returning id into v_c2;
  insert into public.carteira_membros (org_id,carteira_id,user_id) values (v_org.id,v_c1,v_f);

  insert into public.contas (org_id,carteira_id,nome,razao_social,documento)
    values (v_org.id,v_c1,'Alfa Indústria','Alfa Indústria Ltda','11222333000181') returning id into v_conta;
  insert into public.contas (org_id,carteira_id,nome,documento)
    values (v_org.id,v_c2,'Beta Logística','22333444000181');
  insert into public.contratos (org_id,carteira_id,conta_id,numero,inicio,fim)
    values (v_org.id,v_c1,v_conta,'CT-2026-014','2024-01-01',current_date + 100);
  insert into public.frentes (org_id,carteira_id,titulo,status)
    values (v_org.id,v_c1,'Revisão cadastral do Norte','em_execucao');
  insert into public.oportunidades (org_id,carteira_id,titulo,fase)
    values (v_org.id,v_c1,'Ampliação do ponto sul','proposta');

  select count(*) into v_qtd from public.buscar('alfa');
  raise notice '1. buscar "alfa": % resultado(s)', v_qtd;
  if v_qtd < 1 then raise exception 'FALHOU: nao achou por nome.'; end if;

  select count(*) into v_qtd from public.buscar('INDÚSTRIA');
  raise notice '2. buscar em maiúsculas e com acento: % resultado(s)', v_qtd;
  if v_qtd < 1 then raise exception 'FALHOU: busca sensivel a caixa.'; end if;

  -- CNPJ com e sem máscara
  select count(*) into v_qtd from public.buscar('11.222.333/0001-81');
  raise notice '3. buscar CNPJ com máscara: % resultado(s)', v_qtd;
  if v_qtd < 1 then raise exception 'FALHOU: mascara do CNPJ.'; end if;

  select count(*) into v_qtd from public.buscar('11222333');
  raise notice '4. buscar só os dígitos: % resultado(s)', v_qtd;
  if v_qtd < 1 then raise exception 'FALHOU: digitos do CNPJ.'; end if;

  -- trecho no meio do texto
  select count(*) into v_qtd from public.buscar('cadastral');
  raise notice '5. buscar trecho no meio do título: % resultado(s)', v_qtd;
  if v_qtd < 1 then raise exception 'FALHOU: busca por trecho.'; end if;

  -- contrato pelo número e pela conta
  select count(*) into v_qtd from public.buscar('2026-014');
  raise notice '6. buscar pelo número do contrato: % resultado(s)', v_qtd;
  if v_qtd < 1 then raise exception 'FALHOU: numero do contrato.'; end if;

  -- tipos diferentes na mesma consulta
  select count(distinct tipo) into v_qtd from public.buscar('a');
  raise notice '7. um termo genérico devolve % tipos diferentes', v_qtd;
  if v_qtd < 3 then raise exception 'FALHOU: busca nao é unificada.'; end if;

  -- alcance: o ponto focal não descobre o que não pode ver
  perform set_config('request.jwt.claims', json_build_object('sub',v_f,'role','authenticated')::text, true);
  select count(*) into v_qtd from public.buscar('Beta');
  raise notice '8. ponto focal buscando conta de outra carteira: % resultado(s) — esperado 0', v_qtd;
  if v_qtd <> 0 then raise exception 'FALHOU: busca vazou registro de outra carteira.'; end if;

  select count(*) into v_qtd from public.buscar('Alfa');
  raise notice '9. e buscando na carteira dele: % resultado(s)', v_qtd;
  if v_qtd < 1 then raise exception 'FALHOU: nao achou o que pode ver.'; end if;

  perform set_config('role','postgres', true);
  delete from public.orgs where id=v_org.id;
  raise notice 'TODOS OS TESTES DE BUSCA PASSARAM';
end $$;
