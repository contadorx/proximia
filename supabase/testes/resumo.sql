do $$
declare
  v_a uuid; v_b uuid; v_c uuid; v_org public.orgs; v_cart uuid; v_conta uuid; v_ct uuid;
  v_qtd int; v_lin record;
begin
  select id into v_a from auth.users where email='gestor@exemplo.com';
  select id into v_b from auth.users where email='focal@exemplo.com';
  select id into v_c from auth.users where email='analista@exemplo.com';
  perform set_config('role','postgres', true);
  update public.perfis set nome='Ana' where id=v_a;
  update public.perfis set nome='Bruno' where id=v_b;
  update public.perfis set nome='Célia' where id=v_c;

  perform set_config('request.jwt.claims', json_build_object('sub',v_a,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  v_org := public.criar_organizacao('Teste Resumo','teste-resumo');
  perform public.vincular_membro(v_org.id,'focal@exemplo.com','analista');
  perform public.vincular_membro(v_org.id,'analista@exemplo.com','analista');
  insert into public.carteiras (org_id,nome) values (v_org.id,'Norte') returning id into v_cart;
  insert into public.contas (org_id,carteira_id,nome) values (v_org.id,v_cart,'Alfa') returning id into v_conta;
  insert into public.contratos (org_id,carteira_id,conta_id,numero,inicio,fim,status)
    values (v_org.id,v_cart,v_conta,'CT-1','2020-01-01',current_date - 20,'vigente') returning id into v_ct;

  perform public.gerar_alertas(v_org.id);
  perform set_config('role','postgres', true);
  -- Ana fica com o alerta alto; Bruno com um compromisso atrasado; Célia sem nada.
  update public.alertas set dono_id = v_a where org_id=v_org.id;
  insert into public.compromissos (org_id,carteira_id,entidade_tipo,entidade_id,titulo,vence_em,dono_id,criado_por)
    values (v_org.id,v_cart,'carteira',v_cart,'Ligar para a unidade',current_date - 3,v_b,v_a);

  select count(*) into v_qtd from public.resumo_do_dia(v_org.id);
  raise notice '1. pessoas com algo para agir hoje: % (Célia, sem nada, fica de fora)', v_qtd;
  if v_qtd <> 2 then raise exception 'FALHOU: selecao do resumo.'; end if;

  select * into v_lin from public.resumo_do_dia(v_org.id) where user_id = v_a;
  raise notice '2. Ana: % alerta(s) alto(s), % no total', v_lin.alertas_altos, v_lin.alertas_total;
  if v_lin.alertas_altos < 1 then raise exception 'FALHOU: alerta alto nao contado.'; end if;

  select * into v_lin from public.resumo_do_dia(v_org.id) where user_id = v_b;
  raise notice '3. Bruno: % compromisso(s) atrasado(s)', v_lin.compromissos_atrasados;
  if v_lin.compromissos_atrasados <> 1 then raise exception 'FALHOU: compromisso atrasado.'; end if;

  -- quem desliga o resumo some da lista
  insert into public.preferencias_aviso (org_id,user_id,resumo_diario) values (v_org.id,v_b,false);
  select count(*) into v_qtd from public.resumo_do_dia(v_org.id) where user_id = v_b;
  raise notice '4. Bruno desligou o resumo: aparece % vez(es)', v_qtd;
  if v_qtd <> 0 then raise exception 'FALHOU: ignorou a preferencia.'; end if;

  -- quem pede só severidade alta não recebe por compromisso atrasado
  update public.preferencias_aviso set resumo_diario=true, apenas_alta=true where user_id=v_b;
  select count(*) into v_qtd from public.resumo_do_dia(v_org.id) where user_id = v_b;
  raise notice '5. Bruno em "apenas alta", com só um atrasado: aparece % vez(es)', v_qtd;
  if v_qtd <> 0 then raise exception 'FALHOU: corte de severidade.'; end if;

  -- mas continua recebendo quando há alerta alto dele
  update public.alertas set dono_id = v_b where org_id=v_org.id and severidade='alta';
  select count(*) into v_qtd from public.resumo_do_dia(v_org.id) where user_id = v_b;
  raise notice '6. com um alerta alto na mão dele, volta a aparecer: % vez(es)', v_qtd;
  if v_qtd <> 1 then raise exception 'FALHOU: alta ignorada.'; end if;

  -- pessoa inativa não recebe
  perform set_config('role','postgres', true);
  update public.memberships set ativo=false where org_id=v_org.id and user_id=v_b;
  select count(*) into v_qtd from public.resumo_do_dia(v_org.id) where user_id = v_b;
  raise notice '7. acesso suspenso: aparece % vez(es)', v_qtd;
  if v_qtd <> 0 then raise exception 'FALHOU: suspenso recebeu.'; end if;

  -- ninguém edita a preferência de outra pessoa
  perform set_config('request.jwt.claims', json_build_object('sub',v_c,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  update public.preferencias_aviso set resumo_diario=false where user_id=v_a;
  get diagnostics v_qtd = row_count;
  raise notice '8. Célia alterou % preferências de outra pessoa (esperado 0)', v_qtd;
  if v_qtd <> 0 then raise exception 'FALHOU: mexeu na preferencia alheia.'; end if;

  perform set_config('role','postgres', true);
  delete from public.orgs where id=v_org.id;
  raise notice 'TODOS OS TESTES DO RESUMO PASSARAM';
end $$;
