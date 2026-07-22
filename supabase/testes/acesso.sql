do $$
declare
  v_dono uuid; v_admin uuid; v_focal uuid; v_org public.orgs; v_cart uuid; v_lin record; v_qtd int;
begin
  select id into v_dono  from auth.users where email='gestor@exemplo.com';
  select id into v_admin from auth.users where email='analista@exemplo.com';
  select id into v_focal from auth.users where email='focal@exemplo.com';
  perform set_config('request.jwt.claims', json_build_object('sub',v_dono,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_org := public.criar_organizacao('Teste Acesso','teste-acesso');
  perform public.vincular_membro(v_org.id,'analista@exemplo.com','admin');
  perform public.vincular_membro(v_org.id,'focal@exemplo.com','ponto_focal');
  insert into public.carteiras (org_id,nome) values (v_org.id,'Norte') returning id into v_cart;
  insert into public.carteira_membros (org_id,carteira_id,user_id) values (v_org.id,v_cart,v_focal);
  raise notice '1. organização com dono, administrador e ponto focal';

  -- retrato do acesso
  select * into v_lin from public.acesso_pessoas where org_id=v_org.id and user_id=v_focal;
  raise notice '2. ponto focal enxerga % carteira(s); o dono enxerga %',
    v_lin.carteiras_visiveis,
    (select carteiras_visiveis from public.acesso_pessoas where org_id=v_org.id and user_id=v_dono);
  if v_lin.carteiras_visiveis <> 1 then raise exception 'FALHOU: alcance do ponto focal.'; end if;

  -- não posso mexer no meu próprio papel
  begin
    update public.memberships set papel='analista' where org_id=v_org.id and user_id=v_dono;
    raise exception 'FALHOU: alterou o próprio papel.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '3. barrado ao alterar o próprio papel';
  end;

  -- nem me desativar
  begin
    update public.memberships set ativo=false where org_id=v_org.id and user_id=v_dono;
    raise exception 'FALHOU: desativou o próprio acesso.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '4. barrado ao desativar o próprio acesso';
  end;

  -- nem me remover
  begin
    delete from public.memberships where org_id=v_org.id and user_id=v_dono;
    raise exception 'FALHOU: removeu o próprio acesso.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '5. barrado ao remover o próprio acesso';
  end;

  -- administrador não promove ninguém a dono
  perform set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  begin
    update public.memberships set papel='owner' where org_id=v_org.id and user_id=v_focal;
    raise exception 'FALHOU: administrador criou dono.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '6. administrador não promove a dono';
  end;

  -- administrador altera papel de outra pessoa, isso sim
  update public.memberships set papel='analista' where org_id=v_org.id and user_id=v_focal;
  select papel into v_lin.papel from public.memberships where org_id=v_org.id and user_id=v_focal;
  raise notice '7. administrador alterou o papel de outra pessoa para %', v_lin.papel;

  -- a organização não pode ficar sem dono
  perform set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  begin
    update public.memberships set papel='analista' where org_id=v_org.id and user_id=v_dono;
    raise exception 'FALHOU: deixou a organização sem dono.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '8. rebaixar o único dono é recusado';
  end;

  -- com dois donos, aí pode
  perform set_config('request.jwt.claims', json_build_object('sub',v_dono,'role','authenticated')::text, true);
  update public.memberships set papel='owner' where org_id=v_org.id and user_id=v_admin;
  perform set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  update public.memberships set papel='analista' where org_id=v_org.id and user_id=v_dono;
  select count(*) into v_qtd from public.memberships where org_id=v_org.id and papel='owner' and ativo;
  raise notice '9. com um segundo dono definido, o rebaixamento passa · donos ativos: %', v_qtd;
  if v_qtd <> 1 then raise exception 'FALHOU: contagem de donos.'; end if;

  -- ponto focal não gerencia acesso
  perform set_config('request.jwt.claims', json_build_object('sub',v_focal,'role','authenticated')::text, true);
  update public.memberships set papel='admin' where org_id=v_org.id and user_id=v_focal;
  get diagnostics v_qtd = row_count;
  raise notice '10. ponto focal alterou % vínculos (esperado 0)', v_qtd;
  if v_qtd <> 0 then raise exception 'FALHOU: ponto focal mexeu em acesso.'; end if;

  perform set_config('role','postgres', true);
  delete from public.orgs where id=v_org.id;
  raise notice 'TODOS OS TESTES DE ACESSO PASSARAM';
end $$;
