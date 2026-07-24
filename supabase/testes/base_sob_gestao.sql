-- =====================================================================
-- Base sob gestão — o número que a manutenção da carteira defende.
--
-- O que se prova aqui:
--   1. A base soma a receita atual das contas ATIVAS da carteira.
--   2. Conta encerrada não entra.
--   3. A parte em contas de proteção é separada.
--   4. A cobertura é contada: quantas contas têm o número informado.
--   5. Base NÃO se mistura com potencial nem com capturado.
--   6. A RLS vale: ponto focal e organização vizinha.
-- =====================================================================

do $$
declare
  v_org uuid; v_org2 uuid;
  v_dono uuid; v_focal uuid; v_vizinho uuid;
  v_cart uuid; v_cart2 uuid; v_cart_outra uuid;
  v_r record; v_n integer;
begin
  select id into v_dono    from auth.users where email = 'gestor@exemplo.com';
  select id into v_focal   from auth.users where email = 'focal@exemplo.com';
  select id into v_vizinho from auth.users where email = 'analista@exemplo.com';

  insert into public.orgs (nome, slug) values ('Base SA','base-sa')   returning id into v_org;
  insert into public.orgs (nome, slug) values ('Outra Base','outra-base') returning id into v_org2;
  insert into public.memberships (org_id,user_id,papel) values (v_org, v_dono,'owner');
  insert into public.memberships (org_id,user_id,papel) values (v_org, v_focal,'ponto_focal');
  insert into public.memberships (org_id,user_id,papel) values (v_org2, v_vizinho,'owner');

  insert into public.carteiras (org_id,nome) values (v_org,'Norte')  returning id into v_cart;
  insert into public.carteiras (org_id,nome) values (v_org,'Sul')    returning id into v_cart2;
  insert into public.carteiras (org_id,nome) values (v_org2,'Deles') returning id into v_cart_outra;
  insert into public.carteira_membros (org_id,carteira_id,user_id) values (v_org,v_cart,v_focal);

  -- Norte: três contas ativas, duas com receita; uma encerrada com receita
  -- alta (não pode entrar); uma delas é de proteção.
  insert into public.contas (org_id,carteira_id,nome,receita_atual,receita_origem,receita_data,relacao)
    values (v_org,v_cart,'Alfa',  100000,'base 03/2026','2026-04-01','estrategica');
  insert into public.contas (org_id,carteira_id,nome,receita_atual,receita_origem,receita_data,relacao)
    values (v_org,v_cart,'Beta',   40000,'base 03/2026','2026-04-01','protecao');
  insert into public.contas (org_id,carteira_id,nome,potencial_bruto,potencial_origem,potencial_data)
    values (v_org,v_cart,'Sem receita', 25000,'estudo','2026-01-10');
  insert into public.contas (org_id,carteira_id,nome,receita_atual,receita_origem,status)
    values (v_org,v_cart,'Encerrada', 999999,'base 03/2026','encerrada');

  -- ---------------------------------------------- 1, 2, 3 e 4
  select * into v_r from public.carteira_resumo where carteira_id = v_cart;

  if v_r.base_sob_gestao is distinct from 140000 then
    raise exception 'FALHOU: base saiu % (esperava 140000 = 100k + 40k).', v_r.base_sob_gestao;
  end if;
  raise notice '1. a base soma a receita das contas ativas';
  raise notice '2. conta encerrada (R$ 999.999) ficou de fora';

  if v_r.base_protecao is distinct from 40000 then
    raise exception 'FALHOU: base em proteção saiu % (esperava 40000).', v_r.base_protecao;
  end if;
  raise notice '3. a parte em contas de proteção é separada';

  if v_r.contas_com_receita <> 2 then
    raise exception 'FALHOU: cobertura saiu % (esperava 2 de 3 ativas).', v_r.contas_com_receita;
  end if;
  raise notice '4. a cobertura diz sobre quantas contas a soma foi feita';

  -- ------------------------------------ 5. não se mistura
  if v_r.contas_potencial is distinct from 25000 then
    raise exception 'FALHOU: a receita contaminou o potencial (% em vez de 25000).',
      v_r.contas_potencial;
  end if;
  if coalesce(v_r.contas_capturado,0) <> 0 then
    raise exception 'FALHOU: a receita contaminou o capturado (%).', v_r.contas_capturado;
  end if;
  raise notice '5. base, potencial e capturado seguem em colunas distintas';

  -- carteira sem receita informada devolve zero, não nulo
  select * into v_r from public.carteira_resumo where carteira_id = v_cart2;
  if v_r.base_sob_gestao is distinct from 0 then
    raise exception 'FALHOU: carteira sem receita devolveu % (esperava 0).', v_r.base_sob_gestao;
  end if;
  raise notice '6. carteira sem receita informada devolve zero';

  -- ------------------------------------------------ 6. alcance
  insert into public.contas (org_id,carteira_id,nome,receita_atual,receita_origem)
    values (v_org2,v_cart_outra,'Deles', 500000,'base deles');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_focal,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  select count(*) into v_n from public.carteira_resumo where carteira_id = v_cart2;
  if v_n <> 0 then raise exception 'FALHOU: ponto focal viu carteira que não acompanha.'; end if;
  select count(*) into v_n from public.carteira_resumo where carteira_id = v_cart;
  if v_n = 0 then raise exception 'FALHOU: ponto focal não vê a carteira dele.'; end if;
  raise notice '7. ponto focal só enxerga a base da carteira dele';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono,'role','authenticated')::text, true);
  select count(*) into v_n from public.carteira_resumo where carteira_id = v_cart_outra;
  if v_n <> 0 then raise exception 'FALHOU: base de outra organização visível.'; end if;
  raise notice '8. base de organização vizinha não aparece';

  perform set_config('role','postgres', true);
  delete from public.orgs where slug in ('base-sa','outra-base');

  raise notice 'TODOS OS TESTES DE BASE SOB GESTÃO PASSARAM';
end $$;
