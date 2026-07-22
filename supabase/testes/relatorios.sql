do $$
declare
  v_o uuid; v_org public.orgs; v_c uuid; v_conta uuid; v_ct uuid; v_lin record; v_qtd int;
begin
  select id into v_o from auth.users where email='gestor@exemplo.com';
  perform set_config('request.jwt.claims', json_build_object('sub',v_o,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_org := public.criar_organizacao('Teste Relatorios','teste-rel');
  insert into public.carteiras (org_id,nome) values (v_org.id,'Norte') returning id into v_c;
  insert into public.contas (org_id,carteira_id,nome) values (v_org.id,v_c,'Alfa') returning id into v_conta;

  -- vencimentos: um no passado recente, um daqui a três meses, um encerrado
  insert into public.contratos (org_id,carteira_id,conta_id,numero,inicio,fim,valor_base,status)
    values (v_org.id,v_c,v_conta,'CT-1','2020-01-01',current_date - 40,50000,'vigente') returning id into v_ct;
  insert into public.contratos (org_id,carteira_id,conta_id,numero,inicio,fim,valor_base,renovacao_automatica)
    values (v_org.id,v_c,v_conta,'CT-2','2024-01-01',current_date + 90,80000,true);
  insert into public.contratos (org_id,carteira_id,conta_id,numero,inicio,fim,valor_base,status)
    values (v_org.id,v_c,v_conta,'CT-3','2019-01-01',current_date - 400,10000,'encerrado');

  select count(*) into v_qtd from public.vencimentos_mensais where org_id=v_org.id;
  raise notice '1. meses com vencimento no calendário: % (o encerrado e o antigo ficam fora)', v_qtd;
  if v_qtd <> 2 then raise exception 'FALHOU: selecao de vencimentos.'; end if;

  select * into v_lin from public.vencimentos_mensais
   where org_id=v_org.id and mes = date_trunc('month', current_date - 40)::date;
  raise notice '2. mês do vencido: % contrato(s), % já vencido(s), valor %',
    v_lin.contratos, v_lin.ja_vencidos, v_lin.valor_base;
  if v_lin.ja_vencidos <> 1 then raise exception 'FALHOU: contagem de vencidos.'; end if;

  -- esforço registrado
  insert into public.registros (org_id,carteira_id,entidade_tipo,entidade_id,tipo,corpo,ocorrido_em,autor_id) values
    (v_org.id,v_c,'carteira',v_c,'entrega','Dossiê entregue.',current_date - 5,v_o),
    (v_org.id,v_c,'carteira',v_c,'entrega','Relatório entregue.',current_date - 3,v_o),
    (v_org.id,v_c,'carteira',v_c,'reuniao','Alinhamento.',current_date - 2,v_o);

  select quantidade into v_qtd from public.esforco_mensal
   where org_id=v_org.id and tipo='entrega' and mes = date_trunc('month', current_date)::date;
  raise notice '3. entregas registradas no mês: %', v_qtd;
  if v_qtd <> 2 then raise exception 'FALHOU: contagem de esforco.'; end if;

  -- registro editado não conta duas vezes
  perform set_config('role','postgres', true);
  update public.registros set ativo=false where corpo='Dossiê entregue.';
  perform set_config('role','authenticated', true);
  select quantidade into v_qtd from public.esforco_mensal
   where org_id=v_org.id and tipo='entrega' and mes = date_trunc('month', current_date)::date;
  raise notice '4. após inativar uma versão: % entrega(s) — versão antiga não soma', v_qtd;
  if v_qtd <> 1 then raise exception 'FALHOU: versao inativa contada.'; end if;

  -- alertas abertos e resolvidos
  perform public.gerar_alertas(v_org.id);
  select coalesce(sum(abertos),0) into v_qtd from public.alertas_mensais where org_id=v_org.id;
  raise notice '5. alertas abertos no mês: %', v_qtd;
  if v_qtd < 1 then raise exception 'FALHOU: serie de alertas.'; end if;

  perform set_config('role','postgres', true);
  update public.contratos set status='encerrado' where id=v_ct;
  perform public.gerar_alertas(v_org.id);
  perform set_config('role','authenticated', true);
  select coalesce(sum(resolvidos),0) into v_qtd from public.alertas_mensais where org_id=v_org.id;
  raise notice '6. alertas resolvidos no mês: % — dá para ver se drena ou acumula', v_qtd;
  if v_qtd < 1 then raise exception 'FALHOU: resolvidos nao contados.'; end if;

  -- conversão por carteira
  insert into public.oportunidades (org_id,carteira_id,titulo,fase) values (v_org.id,v_c,'Em jogo','proposta');
  insert into public.oportunidades (org_id,carteira_id,titulo,fase) values (v_org.id,v_c,'Ganha','concluida');
  insert into public.oportunidades (org_id,carteira_id,titulo,fase,motivo_descarte)
    values (v_org.id,v_c,'Perdida','descartada','sem base');

  select * into v_lin from public.conversao_carteira where carteira_id=v_c;
  raise notice '7. conversão da carteira: % em andamento, % ganhas, % perdidas',
    v_lin.em_andamento, v_lin.ganhas, v_lin.perdidas;
  if v_lin.em_andamento <> 1 or v_lin.ganhas <> 1 or v_lin.perdidas <> 1 then
    raise exception 'FALHOU: conversao por carteira.';
  end if;

  perform set_config('role','postgres', true);
  delete from public.orgs where id=v_org.id;
  raise notice 'TODOS OS TESTES DE RELATÓRIO PASSARAM';
end $$;
