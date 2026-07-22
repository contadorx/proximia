do $$
declare
  v_owner uuid; v_org public.orgs; v_cart uuid; v_conta uuid;
  v_o1 uuid; v_o2 uuid; v_o3 uuid; v_m uuid;
  v_n int; v_lin record; v_qtd int;
begin
  select id into v_owner from auth.users where email='gestor@exemplo.com';
  perform set_config('request.jwt.claims', json_build_object('sub',v_owner,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_org := public.criar_organizacao('Teste Pipeline','teste-pipeline');
  insert into public.carteiras (org_id,nome) values (v_org.id,'Norte') returning id into v_cart;
  insert into public.contas (org_id,carteira_id,nome) values (v_org.id,v_cart,'Alfa') returning id into v_conta;

  v_n := public.garantir_fases(v_org.id);
  raise notice '1. régua de fases criada com % etapas', v_n;
  if v_n <> 8 then raise exception 'FALHOU: numero de fases.'; end if;

  v_n := public.garantir_fases(v_org.id);
  raise notice '2. rodar de novo cria % (não duplica)', v_n;
  if v_n <> 0 then raise exception 'FALHOU: duplicou fases.'; end if;

  -- oportunidade dentro do prazo da fase
  insert into public.oportunidades (org_id,carteira_id,conta_id,titulo,fase,fase_desde)
    values (v_org.id,v_cart,v_conta,'No prazo','viabilidade',current_date - 10) returning id into v_o1;
  -- oportunidade além do prazo da fase (viabilidade = 45 dias)
  insert into public.oportunidades (org_id,carteira_id,conta_id,titulo,fase,fase_desde)
    values (v_org.id,v_cart,v_conta,'Atrasada','viabilidade',current_date - 60) returning id into v_o2;
  -- fase sem prazo definido (implantação) muito parada
  insert into public.oportunidades (org_id,carteira_id,conta_id,titulo,fase,fase_desde)
    values (v_org.id,v_cart,v_conta,'Implantando','implantacao',current_date - 200) returning id into v_o3;

  select * into v_lin from public.oportunidade_conversao where oportunidade_id = v_o1;
  raise notice '3. "No prazo": % dias, esperado % · atrasada=%', v_lin.dias_na_fase, v_lin.prazo_esperado_dias, v_lin.atrasada;
  if v_lin.atrasada then raise exception 'FALHOU: marcou atrasada dentro do prazo.'; end if;

  select * into v_lin from public.oportunidade_conversao where oportunidade_id = v_o2;
  raise notice '4. "Atrasada": % dias, esperado % · atrasada=%', v_lin.dias_na_fase, v_lin.prazo_esperado_dias, v_lin.atrasada;
  if not v_lin.atrasada then raise exception 'FALHOU: nao marcou atrasada.'; end if;

  select * into v_lin from public.oportunidade_conversao where oportunidade_id = v_o3;
  raise notice '5. "Implantando": % dias em fase sem prazo · atrasada=%', v_lin.dias_na_fase, v_lin.atrasada;
  if v_lin.atrasada then raise exception 'FALHOU: fase sem prazo virou atraso.'; end if;

  -- o alerta usa o prazo da fase
  perform public.gerar_alertas(v_org.id);
  select count(*) into v_qtd from public.alertas
   where org_id=v_org.id and tipo='oportunidade_parada' and status='aberto';
  raise notice '6. alertas de oportunidade parada: % (só a que passou do prazo da fase)', v_qtd;
  if v_qtd <> 1 then raise exception 'FALHOU: alerta por fase.'; end if;

  select detalhe into v_lin.titulo from public.alertas
   where org_id=v_org.id and tipo='oportunidade_parada' and entidade_id=v_o2;
  raise notice '7. detalhe do alerta: %', v_lin.titulo;

  -- catálogo de motivos
  insert into public.motivos_descarte (org_id,nome,ordem)
    values (v_org.id,'Preço acima do aceitável',1) returning id into v_m;
  insert into public.motivos_descarte (org_id,nome,ordem)
    values (v_org.id,'Cliente optou por solução própria',2);
  update public.oportunidades
     set fase='descartada', motivo_id=v_m, motivo_descarte='Comparou com fornecedor local.'
   where id=v_o1;
  select count(*) into v_qtd from public.oportunidade_conversao
   where org_id=v_org.id and encerrada and not ganha;
  raise notice '8. encerradas sem ganho: %', v_qtd;

  -- taxa de conversão só conta o que saiu do funil
  update public.oportunidades set fase='concluida' where id=v_o3;
  select count(*) filter (where ganha), count(*) filter (where encerrada)
    into v_n, v_qtd from public.oportunidade_conversao where org_id=v_org.id;
  raise notice '9. ganhas % de % encerradas — a que segue em andamento não conta como perda', v_n, v_qtd;
  if v_qtd <> 2 then raise exception 'FALHOU: em andamento entrou na conta.'; end if;

  perform set_config('role','postgres', true);
  delete from public.orgs where id=v_org.id;
  raise notice 'TODOS OS TESTES DE PIPELINE PASSARAM';
end $$;
