do $$
declare
  v_o uuid; v_f uuid; v_org public.orgs; v_c uuid; v_conta uuid; v_ct uuid;
  v_g1 uuid; v_g2 uuid; v_lin record; v_qtd int; v_n int;
begin
  select id into v_o from auth.users where email='gestor@exemplo.com';
  select id into v_f from auth.users where email='focal@exemplo.com';
  perform set_config('request.jwt.claims', json_build_object('sub',v_o,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_org := public.criar_organizacao('Teste B41','teste-b41');
  perform public.vincular_membro(v_org.id,'focal@exemplo.com','ponto_focal');
  insert into public.carteiras (org_id,nome) values (v_org.id,'Norte') returning id into v_c;
  insert into public.carteira_membros (org_id,carteira_id,user_id) values (v_org.id,v_c,v_f);
  insert into public.contas (org_id,carteira_id,nome) values (v_org.id,v_c,'Alfa') returning id into v_conta;

  -- ============ 1. classificações ============
  insert into public.classificacoes (org_id,grupo,valor,ordem)
    values (v_org.id,'Ramo','Indústria',1) returning id into v_g1;
  insert into public.classificacoes (org_id,grupo,valor,ordem)
    values (v_org.id,'Natureza','Poder público',1) returning id into v_g2;
  insert into public.classificacoes (org_id,grupo,valor) values (v_org.id,'Ramo','Condomínio');
  raise notice '1. catálogo com % grupos e % valores',
    (select count(distinct grupo) from public.classificacoes where org_id=v_org.id),
    (select count(*) from public.classificacoes where org_id=v_org.id);

  -- mesmo grupo e valor não repete
  begin
    insert into public.classificacoes (org_id,grupo,valor) values (v_org.id,'ramo','indústria');
    raise exception 'FALHOU: aceitou classificação repetida.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '2. classificação repetida recusada, sem depender de caixa';
  end;

  insert into public.conta_classificacoes (org_id,conta_id,classificacao_id)
    values (v_org.id,v_conta,v_g1),(v_org.id,v_conta,v_g2);
  raise notice '3. conta classificada em % dimensões ao mesmo tempo',
    (select count(*) from public.conta_classificacoes where conta_id=v_conta);

  -- ============ 2. natureza ============
  insert into public.frentes (org_id,carteira_id,titulo,status,natureza,potencial_bruto,potencial_origem,potencial_data)
    values (v_org.id,v_c,'Revisão cadastral','em_execucao','captura',400000,'estudo',current_date);
  insert into public.frentes (org_id,carteira_id,titulo,status,natureza,potencial_bruto,potencial_origem,potencial_data)
    values (v_org.id,v_c,'Defesa de contratos com desconto','em_execucao','protecao',900000,'estudo',current_date);

  select * into v_lin from public.carteira_resumo where carteira_id=v_c;
  raise notice '4. potencial de captura % · de proteção % — separados',
    v_lin.frentes_potencial, v_lin.frentes_potencial_protecao;
  if v_lin.frentes_potencial <> 400000 then raise exception 'FALHOU: protecao entrou na captura.'; end if;
  if v_lin.frentes_potencial_protecao <> 900000 then raise exception 'FALHOU: protecao nao contada.'; end if;

  -- ============ 3. prioridade ============
  perform set_config('role','postgres', true);
  update public.frentes set prioridade = 1 where titulo='Revisão cadastral';
  perform set_config('role','authenticated', true);
  select prioridade into v_n from public.frentes where titulo='Revisão cadastral';
  raise notice '5. prioridade gravada: % (1 é o que se ataca primeiro)', v_n;

  begin
    perform set_config('role','postgres', true);
    update public.frentes set prioridade = 9 where titulo='Revisão cadastral';
    raise exception 'FALHOU: aceitou prioridade fora da escala.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '6. prioridade fora de 1 a 5 recusada';
  end;
  perform set_config('role','authenticated', true);

  -- ============ 4. marcos de renovação ============
  insert into public.contratos (org_id,carteira_id,conta_id,numero,inicio,fim,aviso_previa_dias)
    values (v_org.id,v_c,v_conta,'CT-1','2024-01-01',current_date + 100,90) returning id into v_ct;

  v_n := public.gerar_alertas_marcos(v_org.id);
  select count(*) into v_qtd from public.alertas
   where org_id=v_org.id and chave like 'contrato_marco:%';
  raise notice '7. faltando 100 dias: % marco(s) disparado(s) — só o de 180', v_qtd;
  if v_qtd <> 1 then raise exception 'FALHOU: marcos errados.'; end if;

  perform set_config('role','postgres', true);
  update public.contratos set fim = current_date + 55 where id=v_ct;
  perform set_config('role','authenticated', true);
  perform public.gerar_alertas_marcos(v_org.id);
  select count(*) into v_qtd from public.alertas
   where org_id=v_org.id and chave like 'contrato_marco:%';
  raise notice '8. faltando 55 dias: % marcos acumulados (180, 90 e 60)', v_qtd;
  if v_qtd <> 3 then raise exception 'FALHOU: marcos nao acumularam.'; end if;

  -- rodar de novo não duplica
  perform public.gerar_alertas_marcos(v_org.id);
  select count(*) into v_qtd from public.alertas where org_id=v_org.id and chave like 'contrato_marco:%';
  raise notice '9. nova varredura: % marcos (não duplicou)', v_qtd;
  if v_qtd <> 3 then raise exception 'FALHOU: duplicou marco.'; end if;

  -- status novo é aceito
  perform set_config('role','postgres', true);
  update public.contratos set status='em_renovacao' where id=v_ct;
  perform set_config('role','authenticated', true);
  raise notice '10. status "em renovação" aceito pelo contrato';

  -- ============ 5. interruptor de anexo ============
  insert into public.anexos (org_id,carteira_id,entidade_tipo,entidade_id,nome,caminho,criado_por)
    values (v_org.id,v_c,'conta',v_conta,'estudo.pdf', v_org.id || '/conta/x-estudo.pdf', v_o);
  raise notice '11. com anexos permitidos, o registro entra';

  perform set_config('role','postgres', true);
  update public.orgs set permite_anexos=false where id=v_org.id;
  perform set_config('role','authenticated', true);
  begin
    insert into public.anexos (org_id,carteira_id,entidade_tipo,entidade_id,nome,caminho,criado_por)
      values (v_org.id,v_c,'conta',v_conta,'outro.pdf', v_org.id || '/conta/y-outro.pdf', v_o);
    raise exception 'FALHOU: gravou anexo com a política desligada.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '12. com anexo zero ligado, o banco recusa — não só a tela';
  end;

  select count(*) into v_qtd from public.anexos where org_id=v_org.id;
  raise notice '13. o que já estava guardado continua acessível: % anexo(s)', v_qtd;
  if v_qtd <> 1 then raise exception 'FALHOU: apagou anexo existente.'; end if;

  perform set_config('role','postgres', true);
  delete from public.orgs where id=v_org.id;
  raise notice 'TODOS OS TESTES DO B41 PASSARAM';
end $$;
