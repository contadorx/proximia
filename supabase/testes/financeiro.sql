do $$
declare
  v_owner uuid; v_org public.orgs; v_cart uuid; v_conta uuid; v_op uuid; v_ruim uuid;
  v_lin record; v_qtd int; v_vpl numeric; v_esperado numeric;
begin
  select id into v_owner from auth.users where email='gestor@exemplo.com';
  perform set_config('request.jwt.claims', json_build_object('sub',v_owner,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_org := public.criar_organizacao('Teste Financeiro','teste-fin');
  insert into public.carteiras (org_id,nome) values (v_org.id,'Norte') returning id into v_cart;
  insert into public.contas (org_id,carteira_id,nome) values (v_org.id,v_cart,'Alfa') returning id into v_conta;

  -- 600k investidos, 30k líquidos por mês, 60 meses
  insert into public.oportunidades
    (org_id,carteira_id,conta_id,titulo,investimento,retorno_mensal,custo_mensal,horizonte_meses,estimativa_origem,estimativa_data)
  values (v_org.id,v_cart,v_conta,'Boa',600000,40000,10000,60,'estudo',current_date) returning id into v_op;

  -- projeto que não se paga: 200k para render 2k líquidos por mês
  insert into public.oportunidades
    (org_id,carteira_id,conta_id,titulo,investimento,retorno_mensal,custo_mensal,horizonte_meses,estimativa_origem,estimativa_data)
  values (v_org.id,v_cart,v_conta,'Ruim',200000,5000,3000,60,'estudo',current_date) returning id into v_ruim;

  -- taxa padrão de 12% ao ano
  select * into v_lin from public.oportunidade_financeiro where oportunidade_id = v_op;
  raise notice '1. taxa anual %, mensal % (12%% ao ano = ~0,949%% ao mês)',
    v_lin.taxa_anual, round(v_lin.taxa_mes * 100, 3);
  if round(v_lin.taxa_mes, 5) <> 0.00949 then raise exception 'FALHOU: conversao de taxa.'; end if;

  -- confere o VPL contra a fórmula, calculada à parte
  v_esperado := round(30000 * (1 - power(1 + v_lin.taxa_mes, -60)) / v_lin.taxa_mes - 600000, 2);
  raise notice '2. VPL = % (esperado %)', v_lin.vpl, v_esperado;
  if v_lin.vpl <> v_esperado then raise exception 'FALHOU: VPL.'; end if;
  if v_lin.vpl <= 0 then raise exception 'FALHOU: projeto bom deu VPL negativo.'; end if;

  raise notice '3. payback simples % meses · descontado % meses (o descontado é sempre maior)',
    v_lin.payback_simples, v_lin.payback_descontado;
  if v_lin.payback_descontado <= v_lin.payback_simples then
    raise exception 'FALHOU: payback descontado menor que o simples.';
  end if;

  raise notice '4. TIR de %%% ao ano, contra taxa exigida de %%%',
    v_lin.tir_anual_pct, round(v_lin.taxa_anual * 100, 1);
  if v_lin.tir_anual_pct <= v_lin.taxa_anual * 100 then
    raise exception 'FALHOU: VPL positivo exige TIR acima da taxa.';
  end if;

  raise notice '5. índice de lucratividade % (acima de 1 devolve mais do que custa)', v_lin.indice_lucratividade;
  if v_lin.indice_lucratividade <= 1 then raise exception 'FALHOU: indice incoerente com VPL positivo.'; end if;

  raise notice '6. custo total no horizonte % · retorno bruto %',
    v_lin.custo_total_horizonte, v_lin.retorno_bruto_horizonte;
  if v_lin.custo_total_horizonte <> 1200000 then raise exception 'FALHOU: custo total.'; end if;

  -- o projeto ruim
  select * into v_lin from public.oportunidade_financeiro where oportunidade_id = v_ruim;
  raise notice '7. projeto ruim: VPL % · payback descontado % meses · paga no horizonte de 60? % · TIR %',
    v_lin.vpl, coalesce(v_lin.payback_descontado::text,'não tem'), v_lin.paga_no_horizonte,
    coalesce(v_lin.tir_anual_pct::text,'não tem');
  if v_lin.paga_no_horizonte then raise exception 'FALHOU: payback fora do horizonte marcado como dentro.'; end if;
  if v_lin.vpl >= 0 then raise exception 'FALHOU: projeto ruim com VPL positivo.'; end if;

  -- taxa da organização muda tudo
  insert into public.parametros_financeiros (org_id, taxa_desconto_anual, atualizado_por)
    values (v_org.id, 0.30, v_owner);
  select vpl into v_vpl from public.oportunidade_financeiro where oportunidade_id = v_op;
  raise notice '8. com taxa de 30%% ao ano, o VPL do projeto bom cai para %', v_vpl;
  if v_vpl >= v_esperado then raise exception 'FALHOU: taxa maior deveria reduzir o VPL.'; end if;

  -- fluxo que não cobre: nem TIR nem payback
  perform set_config('role','postgres', true);
  update public.oportunidades set retorno_mensal = 10000, custo_mensal = 10000 where id = v_op;
  select * into v_lin from public.oportunidade_financeiro where oportunidade_id = v_op;
  raise notice '9. resultado mensal zero: payback %, TIR %',
    coalesce(v_lin.payback_descontado::text,'não tem'), coalesce(v_lin.tir_anual_pct::text,'não tem');
  if v_lin.payback_descontado is not null or v_lin.tir_anual_pct is not null then
    raise exception 'FALHOU: inventou numero para fluxo nulo.';
  end if;

  -- histórico de etapas
  perform set_config('request.jwt.claims', json_build_object('sub',v_owner,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  select count(*) into v_qtd from public.oportunidade_etapas where oportunidade_id=v_op;
  raise notice '10. ao criar, o histórico já tem % passagem', v_qtd;
  if v_qtd <> 1 then raise exception 'FALHOU: passagem inicial.'; end if;

  update public.oportunidades set fase='proposta' where id=v_op;
  update public.oportunidades set fase='negociacao' where id=v_op;
  select count(*) into v_qtd from public.oportunidade_etapas where oportunidade_id=v_op;
  raise notice '11. após duas mudanças: % passagens registradas', v_qtd;
  if v_qtd <> 3 then raise exception 'FALHOU: registro de etapas.'; end if;

  select count(*) into v_qtd from public.oportunidade_etapas where oportunidade_id=v_op and saiu_em is null;
  raise notice '12. passagens em aberto: % (só a etapa atual)', v_qtd;
  if v_qtd <> 1 then raise exception 'FALHOU: passagem anterior nao foi fechada.'; end if;

  -- foto mensal
  perform set_config('role','postgres', true);
  v_qtd := public.tirar_foto(v_org.id);
  raise notice '13. foto do mês tirada para % carteira(s)', v_qtd;
  v_qtd := public.tirar_foto(v_org.id);
  select count(*) into v_qtd from public.fotos_carteira where org_id=v_org.id;
  raise notice '14. tirando de novo no mesmo mês: % foto(s) — atualiza, não duplica', v_qtd;
  if v_qtd <> 1 then raise exception 'FALHOU: duplicou foto.'; end if;

  delete from public.orgs where id=v_org.id;
  raise notice 'TODOS OS TESTES FINANCEIROS E DE HISTÓRICO PASSARAM';
end $$;
