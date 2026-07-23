-- =====================================================================
-- Alcance das funções — o estado que não pode regredir.
--
-- Em Postgres, toda função nasce executável por PUBLIC. Sem este teste,
-- a próxima função criada reabre o buraco em silêncio e ninguém percebe
-- até a próxima auditoria.
--
-- O que se prova aqui:
--   1. Nenhuma função nossa é executável por PUBLIC.
--   2. O anônimo alcança só as quatro portas públicas por desenho.
--   3. As guardas de política continuam acessíveis (sem isso, toda
--      consulta do produto quebraria).
--   4. As funções de serviço não são alcançáveis pela aplicação.
--   5. As funções que devolvem gente ou nota conferem acesso antes.
-- =====================================================================

do $$
declare
  v_lista text;
  v_n     integer;
  v_org   uuid; v_org2 uuid;
  v_dono  uuid; v_forasteiro uuid;
  v_cart  uuid; v_cart2 uuid;
  v_ret   uuid;
begin
  -- ------------------------------------------- 1. nada aberto a PUBLIC
  select string_agg(p.proname, ', '), count(*) into v_lista, v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and (p.proacl is null
          or exists (select 1 from aclexplode(p.proacl) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE'));

  if v_n > 0 then
    raise exception 'FALHOU: % função(ões) executável(is) por PUBLIC: %', v_n, left(v_lista, 200);
  end if;
  raise notice '1. nenhuma função do produto é executável por PUBLIC';

  -- --------------------------------- 2. o anônimo só nas portas públicas
  select string_agg(p.proname, ', ') into v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.proname not in ('ver_portal', 'ver_convite', 'aceitar_convite', 'sso_do_dominio');

  if v_lista is not null then
    raise exception 'FALHOU: o anônimo alcança %', v_lista;
  end if;
  raise notice '2. o anônimo só alcança portal, convite e domínio de SSO';

  -- ------------------------------------- 3. as guardas continuam de pé
  if not has_function_privilege('authenticated', 'public.e_membro(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.tem_acesso_carteira(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.pode_escrever(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.papel_na_org(uuid)', 'EXECUTE') then
    raise exception 'FALHOU: uma guarda de política perdeu o grant — nada funcionaria.';
  end if;
  raise notice '3. as guardas usadas nas políticas continuam acessíveis';

  -- --------------------------- 4. o que é do serviço não é da aplicação
  if has_function_privilege('authenticated', 'public.registrar_ping(boolean, int, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.autenticar_chave_api(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.carteiras_para_enviar(date)', 'EXECUTE') then
    raise exception 'FALHOU: a aplicação alcança função que é só do serviço.';
  end if;
  raise notice '4. rotina de serviço não é alcançável pela aplicação';

  -- ------------------- 5. quem devolve gente ou nota confere acesso
  select id into v_dono       from auth.users where email = 'gestor@exemplo.com';
  select id into v_forasteiro from auth.users where email = 'analista@exemplo.com';

  insert into public.orgs (nome, slug) values ('Alcance SA', 'alcance-sa') returning id into v_org;
  insert into public.orgs (nome, slug) values ('Fora SA', 'fora-sa')       returning id into v_org2;
  insert into public.memberships (org_id, user_id, papel) values (v_org, v_dono, 'owner');
  insert into public.memberships (org_id, user_id, papel) values (v_org2, v_forasteiro, 'owner');

  insert into public.carteiras (org_id, nome, responsavel_id)
    values (v_org, 'Norte', v_dono) returning id into v_cart;
  insert into public.carteiras (org_id, nome, responsavel_id)
    values (v_org2, 'Deles', v_forasteiro) returning id into v_cart2;

  -- O dono enxerga o responsável da própria carteira.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  v_ret := public.responsavel_primario(v_cart);
  if v_ret is distinct from v_dono then
    raise exception 'FALHOU: o dono não resolve o responsável da própria carteira.';
  end if;

  -- E não enxerga o da carteira alheia.
  v_ret := public.responsavel_primario(v_cart2);
  if v_ret is not null then
    raise exception 'FALHOU: devolveu o responsável de carteira de outra organização.';
  end if;
  raise notice '5. responsavel_primario devolve nulo para carteira de fora';

  if array_length(public.observadores_da_carteira(v_cart2, null), 1) is not null then
    raise exception 'FALHOU: devolveu observadores de carteira de fora.';
  end if;
  raise notice '6. observadores_da_carteira não entrega gente de outra organização';

  v_ret := public.dono_da_entidade('carteira', v_cart2, v_cart2);
  if v_ret is not null then
    raise exception 'FALHOU: dono_da_entidade entregou gente de fora.';
  end if;
  raise notice '7. dono_da_entidade confere acesso antes de responder';

  -- ------------------------- o serviço continua funcionando sem sessão
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  v_ret := public.responsavel_primario(v_cart);
  if v_ret is distinct from v_dono then
    raise exception 'FALHOU: sem sessão (cron), a resolução de responsável parou de funcionar.';
  end if;
  raise notice '8. sem sessão de usuário, o serviço continua resolvendo — a varredura depende disso';

  delete from public.orgs where slug in ('alcance-sa', 'fora-sa');

  raise notice 'TODOS OS TESTES DE ALCANCE PASSARAM';
end $$;
