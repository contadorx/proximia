do $$
declare
  v_owner uuid; v_unidade uuid; v_corp uuid; v_org public.orgs;
  v_cart uuid; v_conta uuid; v_op uuid; v_pb uuid; v_t1 uuid; v_t2 uuid; v_p uuid;
  v_qtd int; v_dono uuid; v_venc date;
begin
  select id into v_owner   from auth.users where email='gestor@exemplo.com';
  select id into v_unidade from auth.users where email='focal@exemplo.com';
  select id into v_corp    from auth.users where email='analista@exemplo.com';
  perform set_config('request.jwt.claims', json_build_object('sub',v_owner,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_org := public.criar_organizacao('Teste Playbook','teste-playbook');
  perform public.vincular_membro(v_org.id,'focal@exemplo.com','ponto_focal');
  perform public.vincular_membro(v_org.id,'analista@exemplo.com','analista');
  insert into public.carteiras (org_id,nome) values (v_org.id,'Norte') returning id into v_cart;
  insert into public.contas (org_id,carteira_id,nome) values (v_org.id,v_cart,'Alfa') returning id into v_conta;
  insert into public.papeis_operacionais (org_id,nome,primario) values (v_org.id,'Responsável na unidade',true) returning id into v_p;
  insert into public.responsabilidades (org_id,carteira_id,user_id,papel_id) values (v_org.id,v_cart,v_unidade,v_p);

  -- playbook da etapa "proposta"
  insert into public.playbooks (org_id,nome,fase,criado_por)
    values (v_org.id,'Ao entrar em proposta','proposta',v_owner) returning id into v_pb;
  insert into public.playbook_tarefas (org_id,playbook_id,titulo,dias_apos,dono_regra,ordem)
    values (v_org.id,v_pb,'Enviar proposta formal',2,'responsavel_entidade',1) returning id into v_t1;
  insert into public.playbook_tarefas (org_id,playbook_id,titulo,dias_apos,dono_regra,ordem)
    values (v_org.id,v_pb,'Confirmar recebimento com o cliente',7,'responsavel_carteira',2) returning id into v_t2;
  raise notice '1. playbook criado para a etapa "proposta", com 2 tarefas';

  -- dois playbooks ativos na mesma etapa é erro
  begin
    insert into public.playbooks (org_id,nome,fase) values (v_org.id,'Outro','proposta');
    raise exception 'FALHOU: aceitou dois playbooks ativos na mesma etapa.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '2. só um playbook ativo por etapa';
  end;

  -- criar oportunidade não dispara (o gatilho é a mudança de etapa)
  insert into public.oportunidades (org_id,carteira_id,conta_id,titulo,fase,responsavel_id)
    values (v_org.id,v_cart,v_conta,'Expansão','identificacao',v_corp) returning id into v_op;
  select count(*) into v_qtd from public.compromissos where entidade_id=v_op;
  raise notice '3. ao criar a oportunidade: % compromissos (esperado 0)', v_qtd;
  if v_qtd <> 0 then raise exception 'FALHOU: disparou na criacao.'; end if;

  -- avançar para proposta dispara
  update public.oportunidades set fase='proposta' where id=v_op;
  select count(*) into v_qtd from public.compromissos where entidade_id=v_op and origem='playbook';
  raise notice '4. ao entrar em proposta: % compromissos criados', v_qtd;
  if v_qtd <> 2 then raise exception 'FALHOU: playbook nao disparou.'; end if;

  -- dono por regra
  select dono_id, vence_em into v_dono, v_venc from public.compromissos where origem_id=v_t1;
  raise notice '5. tarefa 1 foi para o responsável da oportunidade (%) e vence em %', (v_dono=v_corp), v_venc;
  if v_dono <> v_corp then raise exception 'FALHOU: regra responsavel_entidade.'; end if;
  if v_venc <> current_date + 2 then raise exception 'FALHOU: prazo da tarefa.'; end if;

  select dono_id into v_dono from public.compromissos where origem_id=v_t2;
  raise notice '6. tarefa 2 foi para quem responde pela carteira: %', (v_dono=v_unidade);
  if v_dono <> v_unidade then raise exception 'FALHOU: regra responsavel_carteira.'; end if;

  -- voltar e avançar de novo não duplica enquanto estiver aberto
  update public.oportunidades set fase='viabilidade' where id=v_op;
  update public.oportunidades set fase='proposta' where id=v_op;
  select count(*) into v_qtd from public.compromissos where entidade_id=v_op and origem='playbook';
  raise notice '7. voltando e avançando de novo: % compromissos (não duplicou)', v_qtd;
  if v_qtd <> 2 then raise exception 'FALHOU: duplicou fila.'; end if;

  -- concluída a tarefa, uma nova passagem recria
  update public.compromissos set status='concluido' where origem_id=v_t1;
  update public.oportunidades set fase='negociacao' where id=v_op;
  update public.oportunidades set fase='proposta' where id=v_op;
  select count(*) into v_qtd from public.compromissos where entidade_id=v_op and origem_id=v_t1;
  raise notice '8. com a tarefa concluída, nova passagem recria: % lançamentos da tarefa 1', v_qtd;
  if v_qtd <> 2 then raise exception 'FALHOU: nao recriou apos conclusao.'; end if;

  -- playbook desligado não dispara
  update public.playbooks set ativo=false where id=v_pb;
  update public.oportunidades set fase='aprovada' where id=v_op;
  update public.oportunidades set fase='proposta' where id=v_op;
  select count(*) into v_qtd from public.compromissos where entidade_id=v_op and origem_id=v_t2;
  raise notice '9. playbook desligado: tarefa 2 segue com % lançamento(s)', v_qtd;
  if v_qtd <> 1 then raise exception 'FALHOU: disparou desligado.'; end if;

  -- ponto focal não edita playbook
  perform set_config('request.jwt.claims', json_build_object('sub',v_unidade,'role','authenticated')::text, true);
  begin
    insert into public.playbooks (org_id,nome,fase) values (v_org.id,'Do focal','negociacao');
    raise exception 'FALHOU: ponto focal criou playbook.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '10. ponto focal não desenha cadência, mas recebe os compromissos';
  end;

  perform set_config('role','postgres', true);
  delete from public.orgs where id=v_org.id;
  raise notice 'TODOS OS TESTES DE PLAYBOOK PASSARAM';
end $$;
