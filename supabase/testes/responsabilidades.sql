do $$
declare
  v_owner uuid; v_unidade uuid; v_corp uuid; v_org public.orgs;
  v_cart uuid; v_conta uuid; v_ct uuid; v_f uuid;
  v_p_unidade uuid; v_p_corp uuid;
  v_dono uuid; v_obs uuid[]; v_qtd int; v_n int;
begin
  select id into v_owner   from auth.users where email='gestor@exemplo.com';
  select id into v_unidade from auth.users where email='focal@exemplo.com';
  select id into v_corp    from auth.users where email='analista@exemplo.com';
  perform set_config('request.jwt.claims', json_build_object('sub',v_owner,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_org := public.criar_organizacao('Teste Resp','teste-resp');
  perform public.vincular_membro(v_org.id,'focal@exemplo.com','ponto_focal');
  perform public.vincular_membro(v_org.id,'analista@exemplo.com','analista');
  insert into public.carteiras (org_id,nome,codigo) values (v_org.id,'Norte','N1') returning id into v_cart;
  insert into public.carteira_membros (org_id,carteira_id,user_id) values (v_org.id,v_cart,v_unidade);
  insert into public.contas (org_id,carteira_id,nome) values (v_org.id,v_cart,'Alfa') returning id into v_conta;
  insert into public.contratos (org_id,carteira_id,conta_id,numero,inicio,fim,status)
    values (v_org.id,v_cart,v_conta,'CT-1','2020-01-01',current_date - 30,'vigente') returning id into v_ct;
  insert into public.frentes (org_id,carteira_id,titulo,status) values (v_org.id,v_cart,'Revisão','em_analise') returning id into v_f;

  -- catálogo do assinante: nomes dele, não do produto
  insert into public.papeis_operacionais (org_id,nome,primario,ordem)
    values (v_org.id,'Responsável na unidade',true,1) returning id into v_p_unidade;
  insert into public.papeis_operacionais (org_id,nome,primario,ordem)
    values (v_org.id,'Apoio corporativo',false,2) returning id into v_p_corp;
  raise notice '1. catálogo criado: "Responsável na unidade" (primário) e "Apoio corporativo"';

  -- dois papéis primários é erro
  begin
    insert into public.papeis_operacionais (org_id,nome,primario) values (v_org.id,'Outro primário',true);
    raise exception 'FALHOU: aceitou dois papéis primários.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '2. só um papel primário por organização';
  end;

  insert into public.responsabilidades (org_id,carteira_id,user_id,papel_id)
    values (v_org.id,v_cart,v_unidade,v_p_unidade),(v_org.id,v_cart,v_corp,v_p_corp);
  raise notice '3. duas pessoas respondem pela carteira, em papéis diferentes';

  -- cadeia de derivação
  v_dono := public.responsavel_primario(v_cart);
  raise notice '4. responsável primário da carteira resolvido: %', (v_dono = v_unidade);
  if v_dono <> v_unidade then raise exception 'FALHOU: primário errado.'; end if;

  v_dono := public.dono_da_entidade('frente', v_f, v_cart);
  raise notice '5. frente sem dono próprio herda o primário: %', (v_dono = v_unidade);
  if v_dono <> v_unidade then raise exception 'FALHOU: heranca da frente.'; end if;

  perform set_config('role','postgres', true);
  update public.frentes set dono_id = v_corp where id = v_f;
  v_dono := public.dono_da_entidade('frente', v_f, v_cart);
  raise notice '6. com dono próprio, a frente para de herdar: %', (v_dono = v_corp);
  if v_dono <> v_corp then raise exception 'FALHOU: dono especifico ignorado.'; end if;

  update public.contas set responsavel_id = v_corp where id = v_conta;
  v_dono := public.dono_da_entidade('contrato', v_ct, v_cart);
  raise notice '7. contrato herda o responsável da conta: %', (v_dono = v_corp);
  if v_dono <> v_corp then raise exception 'FALHOU: heranca do contrato.'; end if;

  -- observadores
  v_obs := public.observadores_da_carteira(v_cart, v_corp);
  raise notice '8. com % como dono, sobra(m) % observador(es)', 'apoio corporativo', array_length(v_obs,1);
  if not (v_unidade = any(v_obs)) then raise exception 'FALHOU: observador faltando.'; end if;
  if v_corp = any(v_obs) then raise exception 'FALHOU: dono virou observador de si mesmo.'; end if;

  -- alertas nascem e são atribuídos
  perform public.gerar_alertas(v_org.id);
  select count(*) into v_qtd from public.alertas where org_id=v_org.id and status='aberto';
  v_n := public.atribuir_alertas(v_org.id);
  raise notice '9. % alertas abertos · % receberam dono na atribuição', v_qtd, v_n;

  select count(*) into v_qtd from public.alertas where org_id=v_org.id and status='aberto' and dono_id is null;
  raise notice '10. alertas sem dono depois da atribuição: % (esperado 0)', v_qtd;
  if v_qtd <> 0 then raise exception 'FALHOU: alerta orfao.'; end if;

  select dono_id into v_dono from public.alertas
   where org_id=v_org.id and tipo='contrato_vencido' and entidade_id=v_ct;
  raise notice '11. alerta do contrato vencido foi para o responsável da conta: %', (v_dono = v_corp);
  if v_dono <> v_corp then raise exception 'FALHOU: dono do alerta de contrato.'; end if;

  select observadores into v_obs from public.alertas
   where org_id=v_org.id and tipo='contrato_vencido' and entidade_id=v_ct;
  raise notice '12. e a pessoa da unidade entrou como observadora: %', (v_unidade = any(v_obs));
  if not (v_unidade = any(v_obs)) then raise exception 'FALHOU: observador do alerta.'; end if;

  -- reatribuição manual
  perform set_config('request.jwt.claims', json_build_object('sub',v_owner,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  perform public.reatribuir_alerta(
    (select id from public.alertas where org_id=v_org.id and tipo='contrato_vencido' limit 1), v_unidade);
  select dono_id, observadores into v_dono, v_obs from public.alertas
   where org_id=v_org.id and tipo='contrato_vencido' limit 1;
  raise notice '13. reatribuído para a unidade · dono correto: % · observadores refeitos: %',
    (v_dono = v_unidade), (v_corp = any(v_obs));
  if v_dono <> v_unidade or not (v_corp = any(v_obs)) then raise exception 'FALHOU: reatribuicao.'; end if;

  -- ponto focal não mexe no catálogo
  perform set_config('request.jwt.claims', json_build_object('sub',v_unidade,'role','authenticated')::text, true);
  begin
    insert into public.papeis_operacionais (org_id,nome) values (v_org.id,'Criado pelo focal');
    raise exception 'FALHOU: ponto focal editou o catálogo.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '14. ponto focal não redefine papéis, mas enxerga quem responde';
  end;
  select count(*) into v_qtd from public.responsabilidades;
  if v_qtd <> 2 then raise exception 'FALHOU: ponto focal nao ve as responsabilidades.'; end if;

  perform set_config('role','postgres', true);
  delete from public.orgs where id=v_org.id;
  raise notice 'TODOS OS TESTES DE RESPONSABILIDADE PASSARAM';
end $$;
