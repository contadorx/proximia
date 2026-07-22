do $$
declare
  v_a uuid; v_b uuid; v_org public.orgs; v_qtd int;
begin
  select id into v_a from auth.users where email='gestor@exemplo.com';
  select id into v_b from auth.users where email='focal@exemplo.com';
  perform set_config('request.jwt.claims', json_build_object('sub',v_a,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_org := public.criar_organizacao('Teste Export','teste-export');
  perform public.vincular_membro(v_org.id,'focal@exemplo.com','ponto_focal');

  insert into public.exportacoes (org_id,recurso,formato,linhas,autor_id)
    values (v_org.id,'contas','csv',42,v_a);
  raise notice '1. exportação registrada';

  -- ninguém registra em nome de outro
  begin
    insert into public.exportacoes (org_id,recurso,formato,linhas,autor_id)
      values (v_org.id,'contas','csv',1,v_b);
    raise exception 'FALHOU: registrou em nome de outra pessoa.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '2. registrar exportação em nome de outro é recusado';
  end;

  -- ponto focal não lê a trilha de exportações
  perform set_config('request.jwt.claims', json_build_object('sub',v_b,'role','authenticated')::text, true);
  select count(*) into v_qtd from public.exportacoes;
  raise notice '3. ponto focal vê % registros da trilha (esperado 0)', v_qtd;
  if v_qtd <> 0 then raise exception 'FALHOU: trilha exposta.'; end if;

  -- mas registra a própria
  insert into public.exportacoes (org_id,recurso,formato,linhas,autor_id)
    values (v_org.id,'carteiras','csv',3,v_b);
  raise notice '4. ponto focal registra a própria exportação';

  perform set_config('request.jwt.claims', json_build_object('sub',v_a,'role','authenticated')::text, true);
  select count(*) into v_qtd from public.exportacoes;
  raise notice '5. administrador vê % registros', v_qtd;
  if v_qtd <> 2 then raise exception 'FALHOU: leitura da trilha.'; end if;

  perform set_config('role','postgres', true);
  delete from public.orgs where id=v_org.id;
  raise notice 'TODOS OS TESTES DE EXPORTAÇÃO PASSARAM';
end $$;
