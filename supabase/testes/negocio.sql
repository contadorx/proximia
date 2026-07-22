do $$
declare
  v_op uuid; v_cli uuid; v_outro uuid; v_org uuid; v_token text;
  v_plano uuid; v_j jsonb; v_qtd int; v_cart uuid; v_pode boolean;
begin
  select id into v_op    from auth.users where email='gestor@exemplo.com';
  select id into v_cli   from auth.users where email='focal@exemplo.com';
  select id into v_outro from auth.users where email='analista@exemplo.com';

  -- ============ 1. bootstrap do operador ============
  perform set_config('request.jwt.claims', json_build_object('sub',v_op,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  perform public.promover_admin_plataforma('gestor@exemplo.com');
  raise notice '1. primeiro administrador da plataforma criado sem ninguém autorizar (bootstrap)';

  -- segunda pessoa não consegue se promover sozinha
  perform set_config('request.jwt.claims', json_build_object('sub',v_outro,'role','authenticated')::text, true);
  begin
    perform public.promover_admin_plataforma('analista@exemplo.com');
    raise exception 'FALHOU: qualquer um virou operador.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '2. com um operador existente, ninguém mais se autopromove';
  end;

  -- ============ 2. criar assinante ============
  perform set_config('request.jwt.claims', json_build_object('sub',v_op,'role','authenticated')::text, true);
  select id into v_plano from public.planos where nome='Operação';
  select org_id, token_convite into v_org, v_token
    from public.criar_assinante('Operação da Sureya','sureya','focal@exemplo.com',v_plano,false,30);
  raise notice '3. assinante criado com convite de dono (token de % caracteres)', length(v_token);

  raise notice '4. nasce em % com prazo até %',
    (select assinatura_status from public.orgs where id=v_org),
    (select avaliacao_ate from public.orgs where id=v_org);

  -- quem não opera a plataforma não cria assinante
  perform set_config('request.jwt.claims', json_build_object('sub',v_outro,'role','authenticated')::text, true);
  begin
    perform public.criar_assinante('Pirata','pirata','x@y.com',null,false,30);
    raise exception 'FALHOU: cliente criou assinante.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '5. cliente comum não cria assinante';
  end;

  -- ============ 3. o dono aceita e opera ============
  perform set_config('request.jwt.claims', json_build_object('sub',v_cli,'role','authenticated')::text, true);
  perform public.aceitar_convite(v_token);
  raise notice '6. a pessoa convidada virou dona da própria instância';

  insert into public.carteiras (org_id,nome) values (v_org,'Limeira') returning id into v_cart;
  raise notice '7. e já consegue registrar: carteira criada em avaliação';

  -- ============ 4. suspensão bloqueia escrita, não leitura ============
  perform set_config('request.jwt.claims', json_build_object('sub',v_op,'role','authenticated')::text, true);
  perform public.atualizar_assinatura(v_org,'suspensa',v_plano,890,'mensal',current_date+30,null,false,'inadimplente 15 dias');
  perform set_config('request.jwt.claims', json_build_object('sub',v_cli,'role','authenticated')::text, true);

  select public.pode_escrever(v_org) into v_pode;
  raise notice '8. com a conta suspensa, pode escrever? %', v_pode;
  if v_pode then raise exception 'FALHOU: suspensa continuou escrevendo.'; end if;

  begin
    insert into public.carteiras (org_id,nome) values (v_org,'Nova');
    raise exception 'FALHOU: gravou com a conta suspensa.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '9. o banco recusa a gravação';
  end;

  select count(*) into v_qtd from public.carteiras where org_id=v_org;
  raise notice '10. mas continua lendo o que é dela: % carteira(s) visíveis', v_qtd;
  if v_qtd <> 1 then raise exception 'FALHOU: suspensao apagou a leitura.'; end if;

  -- reativar devolve a escrita
  perform set_config('request.jwt.claims', json_build_object('sub',v_op,'role','authenticated')::text, true);
  perform public.atualizar_assinatura(v_org,'ativa',v_plano,890,'mensal',current_date+30,null,false,null);
  perform set_config('request.jwt.claims', json_build_object('sub',v_cli,'role','authenticated')::text, true);
  select public.pode_escrever(v_org) into v_pode;
  raise notice '11. reativada: pode escrever? %', v_pode;
  if not v_pode then raise exception 'FALHOU: reativacao nao devolveu a escrita.'; end if;

  -- ============ 5. painel do negócio ============
  perform set_config('request.jwt.claims', json_build_object('sub',v_op,'role','authenticated')::text, true);
  v_j := public.painel_negocio();
  raise notice '12. receita recorrente: % · assinantes ativos: %',
    v_j->>'receita_recorrente', v_j->'assinantes'->>'ativa';
  if (v_j->>'receita_recorrente')::numeric <> 890 then raise exception 'FALHOU: receita.'; end if;

  raise notice '13. a lista traz uso real: % carteira(s) e % pessoa(s)',
    v_j->'lista'->0->>'carteiras', v_j->'lista'->0->>'pessoas';

  -- conta de teste some das métricas
  perform public.criar_assinante('Demonstração','demo','analista@exemplo.com',v_plano,true,30);
  perform public.atualizar_assinatura(
    (select id from public.orgs where slug='demo'),'ativa',v_plano,5000,'mensal',null,null,true,null);
  v_j := public.painel_negocio();
  raise notice '14. com uma conta de teste de 5.000, a receita segue em % — teste fica fora',
    v_j->>'receita_recorrente';
  if (v_j->>'receita_recorrente')::numeric <> 890 then raise exception 'FALHOU: conta de teste inflou a receita.'; end if;

  -- cliente não vê o painel
  perform set_config('request.jwt.claims', json_build_object('sub',v_cli,'role','authenticated')::text, true);
  begin
    perform public.painel_negocio();
    raise exception 'FALHOU: cliente viu o painel do negócio.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '15. cliente não enxerga o painel do negócio';
  end;

  -- e não enxerga outras organizações
  select count(*) into v_qtd from public.orgs;
  raise notice '16. cliente enxerga % organização (a dele)', v_qtd;
  if v_qtd <> 1 then raise exception 'FALHOU: cliente viu outras organizacoes.'; end if;

  perform set_config('role','postgres', true);
  delete from public.orgs where slug in ('sureya','demo');
  delete from public.plataforma_admins;
  raise notice 'TODOS OS TESTES DE NEGÓCIO PASSARAM';
end $$;
