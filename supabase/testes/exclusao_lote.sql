-- =====================================================================
-- Exclusão em lote de contas — a operação mais perigosa do produto.
--
-- O que se prova aqui:
--   1. Apaga o que pode ser apagado.
--   2. NÃO apaga conta com captura confirmada — e diz quais foram.
--   3. Não apaga fora do alcance de quem chamou.
--   4. Tem teto por chamada.
--   5. Lista vazia não quebra.
-- =====================================================================

do $$
declare
  v_org uuid; v_org2 uuid;
  v_dono uuid; v_focal uuid; v_vizinho uuid;
  v_cart uuid; v_cart2 uuid; v_cart_outra uuid;
  v_a uuid; v_b uuid; v_com_captura uuid; v_fora uuid; v_outra uuid;
  v_r record; v_n integer; v_erro text;
begin
  select id into v_dono    from auth.users where email = 'gestor@exemplo.com';
  select id into v_focal   from auth.users where email = 'focal@exemplo.com';
  select id into v_vizinho from auth.users where email = 'analista@exemplo.com';

  insert into public.orgs (nome,slug) values ('Lote SA','lote-sa')     returning id into v_org;
  insert into public.orgs (nome,slug) values ('Outra Lote','outra-lote') returning id into v_org2;
  insert into public.memberships (org_id,user_id,papel) values (v_org, v_dono,'owner');
  insert into public.memberships (org_id,user_id,papel) values (v_org, v_focal,'ponto_focal');
  insert into public.memberships (org_id,user_id,papel) values (v_org2, v_vizinho,'owner');

  insert into public.carteiras (org_id,nome) values (v_org,'Norte')  returning id into v_cart;
  insert into public.carteiras (org_id,nome) values (v_org,'Sul')    returning id into v_cart2;
  insert into public.carteiras (org_id,nome) values (v_org2,'Deles') returning id into v_cart_outra;
  insert into public.carteira_membros (org_id,carteira_id,user_id) values (v_org,v_cart,v_focal);

  insert into public.contas (org_id,carteira_id,nome) values (v_org,v_cart,'Alfa')         returning id into v_a;
  insert into public.contas (org_id,carteira_id,nome) values (v_org,v_cart,'Beta')         returning id into v_b;
  insert into public.contas (org_id,carteira_id,nome) values (v_org,v_cart,'Com captura')  returning id into v_com_captura;
  insert into public.contas (org_id,carteira_id,nome) values (v_org,v_cart2,'Fora do alcance') returning id into v_fora;
  insert into public.contas (org_id,carteira_id,nome) values (v_org2,v_cart_outra,'Da vizinha')  returning id into v_outra;

  insert into public.capturas (org_id,carteira_id,entidade_tipo,entidade_id,valor,confirmado_em,autor_id)
    values (v_org,v_cart,'conta',v_com_captura,15000,current_date,v_dono);

  -- ------------------------------------ 1 e 2, como ponto focal
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_focal,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  select * into v_r from public.excluir_contas_em_lote(
    array[v_a, v_b, v_com_captura, v_fora, v_outra]);

  if v_r.apagadas <> 2 then
    raise exception 'FALHOU: apagou % (esperava 2 — Alfa e Beta).', v_r.apagadas;
  end if;
  raise notice '1. apaga o que pode ser apagado';

  if v_r.recusadas_captura <> 1 then
    raise exception 'FALHOU: não protegeu a conta com captura (% recusas).', v_r.recusadas_captura;
  end if;
  if not ('Com captura' = any(v_r.nomes_recusados)) then
    raise exception 'FALHOU: não devolveu o nome da conta protegida.';
  end if;
  raise notice '2. conta com captura confirmada é preservada, e o nome volta na resposta';

  -- ------------------------------------------------ 3. alcance
  if v_r.recusadas_acesso <> 2 then
    raise exception 'FALHOU: recusou % por acesso (esperava 2 — outra carteira e outra org).',
      v_r.recusadas_acesso;
  end if;
  -- A contagem precisa rodar com privilégio: como ponto focal, a RLS
  -- esconde as contas fora do alcance dele, e "não vejo" seria lido como
  -- "foi apagada". O teste erraria pelo motivo errado.
  perform set_config('role','postgres', true);
  select count(*) into v_n from public.contas where id in (v_fora, v_outra);
  if v_n <> 2 then
    raise exception 'FALHOU: apagou conta fora do alcance (sobraram %).', v_n;
  end if;
  perform set_config('role','authenticated', true);
  raise notice '3. não apaga fora do alcance — nem outra carteira, nem outra organização';

  -- ------------------------------------------------ 4. teto
  begin
    perform public.excluir_contas_em_lote(
      (select array_agg(gen_random_uuid()) from generate_series(1, 501)));
    raise exception 'FALHOU: aceitou lote acima do teto.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '4. teto de 500 por chamada é aplicado';
  end;

  -- ------------------------------------------------ 5. lista vazia
  select * into v_r from public.excluir_contas_em_lote('{}'::uuid[]);
  if v_r.apagadas <> 0 then raise exception 'FALHOU: lista vazia apagou algo.'; end if;
  raise notice '5. lista vazia não quebra e não apaga nada';

  perform set_config('role','postgres', true);
  delete from public.orgs where slug in ('lote-sa','outra-lote');
  raise notice 'TODOS OS TESTES DE EXCLUSÃO EM LOTE PASSARAM';
end $$;
