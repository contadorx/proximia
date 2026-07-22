do $$
declare
  v_owner uuid; v_focal uuid; v_org public.orgs; v_cart uuid; v_conta uuid; v_f uuid;
  v_cap uuid; v_valor numeric; v_qtd int; v_mes numeric;
begin
  select id into v_owner from auth.users where email='gestor@exemplo.com';
  select id into v_focal from auth.users where email='focal@exemplo.com';
  perform set_config('request.jwt.claims', json_build_object('sub',v_owner,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_org := public.criar_organizacao('Teste Capturas','teste-capturas');
  perform public.vincular_membro(v_org.id,'focal@exemplo.com','ponto_focal');
  insert into public.carteiras (org_id,nome) values (v_org.id,'Norte') returning id into v_cart;
  insert into public.contas (org_id,carteira_id,nome) values (v_org.id,v_cart,'Alfa') returning id into v_conta;
  insert into public.frentes (org_id,carteira_id,titulo,status) values (v_org.id,v_cart,'Revisão','em_execucao') returning id into v_f;

  -- captura é evento, não campo
  insert into public.capturas (org_id,carteira_id,entidade_tipo,entidade_id,valor,confirmado_em,comprovacao,autor_id)
    values (v_org.id,v_cart,'conta',v_conta,50000,current_date - 40,'fatura 123',v_owner) returning id into v_cap;
  insert into public.capturas (org_id,carteira_id,entidade_tipo,entidade_id,valor,confirmado_em,autor_id)
    values (v_org.id,v_cart,'conta',v_conta,30000,current_date - 5,v_owner);

  select valor_capturado into v_valor from public.contas where id=v_conta;
  raise notice '1. dois lançamentos somam % no campo da conta', v_valor;
  if v_valor <> 80000 then raise exception 'FALHOU: soma dos eventos.'; end if;

  -- estorno corrige sem apagar
  insert into public.capturas (org_id,carteira_id,entidade_tipo,entidade_id,valor,tipo,confirmado_em,comprovacao,autor_id)
    values (v_org.id,v_cart,'conta',v_conta,30000,'estorno',current_date,'lançamento em duplicidade',v_owner);
  select valor_capturado into v_valor from public.contas where id=v_conta;
  select count(*) into v_qtd from public.capturas where entidade_id=v_conta;
  raise notice '2. estorno derruba para % e a trilha mantém % lançamentos', v_valor, v_qtd;
  if v_valor <> 50000 or v_qtd <> 3 then raise exception 'FALHOU: estorno.'; end if;

  -- valor não pode ser reescrito
  begin
    update public.capturas set valor = 999 where id = v_cap;
    if (select valor from public.capturas where id=v_cap) = 999 then
      raise exception 'FALHOU: valor de captura foi reescrito.';
    end if;
    raise notice '3. UPDATE não altera lançamento (sem política de escrita)';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '3. UPDATE recusado: lançamento não se reescreve';
  end;

  -- valor tem que ser positivo
  begin
    insert into public.capturas (org_id,carteira_id,entidade_tipo,entidade_id,valor,confirmado_em,autor_id)
      values (v_org.id,v_cart,'conta',v_conta,0,current_date,v_owner);
    raise exception 'FALHOU: aceitou valor zero.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '4. valor zero ou negativo recusado';
  end;

  -- a série mensal lê os eventos
  select coalesce(sum(valor),0) into v_mes from public.captura_mensal
   where org_id=v_org.id and mes = date_trunc('month', current_date)::date;
  raise notice '5. mês corrente na série: % (30.000 menos o estorno de 30.000)', v_mes;
  if v_mes <> 0 then raise exception 'FALHOU: serie nao considerou o estorno.'; end if;

  -- frente também
  insert into public.capturas (org_id,carteira_id,entidade_tipo,entidade_id,valor,confirmado_em,autor_id)
    values (v_org.id,v_cart,'frente',v_f,12000,current_date - 10,v_owner);
  select valor_capturado into v_valor from public.frentes where id=v_f;
  raise notice '6. frente com captura própria: %', v_valor;
  if v_valor <> 12000 then raise exception 'FALHOU: captura em frente.'; end if;

  -- exclusão da entidade limpa os lançamentos
  delete from public.frentes where id=v_f;
  select count(*) into v_qtd from public.capturas where entidade_id=v_f;
  raise notice '7. frente excluída deixou % lançamentos órfãos (esperado 0)', v_qtd;
  if v_qtd <> 0 then raise exception 'FALHOU: lancamento orfao.'; end if;

  -- alcance
  perform set_config('request.jwt.claims', json_build_object('sub',v_focal,'role','authenticated')::text, true);
  select count(*) into v_qtd from public.capturas;
  raise notice '8. ponto focal sem vínculo vê % lançamentos (esperado 0)', v_qtd;
  if v_qtd <> 0 then raise exception 'FALHOU: vazou captura.'; end if;

  perform set_config('role','postgres', true);
  delete from public.orgs where id=v_org.id;
  raise notice 'TODOS OS TESTES DE CAPTURA PASSARAM';
end $$;
