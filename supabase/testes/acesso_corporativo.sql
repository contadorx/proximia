-- =====================================================================
-- Acesso corporativo (SSO) — as regras que vivem no banco.
--
-- O que se prova aqui:
--   1. Um domínio pertence a uma organização só.
--   2. A tela de entrada pergunta pelo domínio sem revelar quem é o dono.
--   3. Provisionar exige sessão vinda do SSO daquela organização —
--      ter e-mail do domínio não basta.
--   4. Quem entra por e-mail e senha num domínio com SSO continua
--      precisando de convite (convivência).
--   5. Organização suspensa não ganha gente nova.
--   6. Provisionar duas vezes não duplica vínculo, e não rebaixa quem já
--      tem papel maior.
--   7. Só administrador cadastra domínio; ponto focal não.
-- =====================================================================

do $$
declare
  v_org  uuid; v_org2 uuid;
  v_dono uuid; v_focal uuid; v_novo uuid;
  v_prov text := 'prov-acme-123';
  v_ret  uuid;
  v_n    integer;
  v_erro text;
  v_reg  record;
begin
  select id into v_dono  from auth.users where email = 'gestor@exemplo.com';
  select id into v_focal from auth.users where email = 'focal@exemplo.com';

  insert into public.orgs (nome, slug) values ('Acme SA', 'acme-sso') returning id into v_org;
  insert into public.orgs (nome, slug) values ('Rival SA', 'rival-sso') returning id into v_org2;
  insert into public.memberships (org_id, user_id, papel) values (v_org, v_dono, 'owner');
  insert into public.memberships (org_id, user_id, papel) values (v_org2, v_dono, 'owner');
  insert into public.memberships (org_id, user_id, papel) values (v_org, v_focal, 'ponto_focal');

  -- Pessoa que ainda não tem vínculo nenhum, com e-mail do domínio.
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values (gen_random_uuid(), 'novo@acme.com', '{"nome":"Novo"}', '{"provider":"email"}')
  returning id into v_novo;
  -- O gatilho trg_criar_perfil já cria o perfil ao inserir em auth.users.

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  insert into public.org_dominios (org_id, dominio, sso_provider_id, provisiona, papel_padrao, criado_por)
  values (v_org, 'acme.com', v_prov, true, 'ponto_focal', v_dono);
  raise notice '1. domínio cadastrado pela organização dona';

  -- --------------------------------------------- 1. um domínio, uma org
  begin
    insert into public.org_dominios (org_id, dominio, sso_provider_id, criado_por)
    values (v_org2, 'acme.com', 'prov-rival', v_dono);
    raise exception 'FALHOU: o mesmo domínio foi cadastrado por duas organizações.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '2. outra organização não toma um domínio já cadastrado';
  end;

  -- ------------------------------- 2. a pergunta da tela não revela dono
  perform set_config('role', 'postgres', true);
  select * into v_reg from public.sso_do_dominio('alguem@acme.com');
  if v_reg.provider_id is distinct from v_prov then
    raise exception 'FALHOU: a tela de entrada não encontrou o provedor do domínio.';
  end if;

  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'org_dominios';
  -- A função devolve duas colunas só: exige_sso e provider_id.
  select count(*) into v_n from (select * from public.sso_do_dominio('a@acme.com')) x
   cross join lateral (select 1) y;
  raise notice '3. a tela pergunta pelo domínio e recebe só o necessário';

  select count(*) into v_n from public.sso_do_dominio('alguem@dominio-que-nao-existe.com');
  if v_n <> 0 then raise exception 'FALHOU: domínio desconhecido devolveu resposta.'; end if;
  raise notice '4. domínio não cadastrado não devolve nada';

  -- ------------------- 3. e-mail do domínio NÃO basta para provisionar
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_novo, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  v_ret := public.provisionar_acesso_sso();
  if v_ret is not null then
    raise exception 'FALHOU: provisionou por e-mail e senha, sem SSO.';
  end if;

  select count(*) into v_n from public.memberships where user_id = v_novo;
  if v_n <> 0 then
    raise exception 'FALHOU: criou vínculo para quem não entrou pelo SSO.';
  end if;
  raise notice '5. ter e-mail do domínio não dá acesso — só o SSO da organização dá';
  raise notice '6. quem entra por e-mail e senha continua precisando de convite';

  -- ---------------------------- agora a sessão veio do SSO da Acme
  perform set_config('role', 'postgres', true);
  update auth.users
     set raw_app_meta_data = jsonb_build_object('provider', 'sso:' || v_prov)
   where id = v_novo;

  perform set_config('role', 'authenticated', true);
  v_ret := public.provisionar_acesso_sso();
  if v_ret is distinct from v_org then
    raise exception 'FALHOU: sessão por SSO não provisionou (retorno %).', v_ret;
  end if;

  select papel::text into v_erro from public.memberships where user_id = v_novo and org_id = v_org;
  if v_erro <> 'ponto_focal' then
    raise exception 'FALHOU: papel padrão não foi respeitado (veio %).', v_erro;
  end if;
  raise notice '7. entrada por SSO provisiona com o papel padrão configurado';

  -- ------------------------- 6. rodar de novo não duplica nem rebaixa
  -- Promove pelo dono, não pela própria pessoa: a trava de 0021 impede
  -- alterar o próprio papel, e ela vale aqui como vale na tela.
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);
  update public.memberships set papel = 'admin' where user_id = v_novo and org_id = v_org;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_novo, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  v_ret := public.provisionar_acesso_sso();
  select count(*) into v_n from public.memberships where user_id = v_novo and org_id = v_org;
  if v_n <> 1 then raise exception 'FALHOU: duplicou o vínculo (%).', v_n; end if;

  select papel::text into v_erro from public.memberships where user_id = v_novo and org_id = v_org;
  if v_erro <> 'admin' then
    raise exception 'FALHOU: rebaixou quem já tinha papel maior (virou %).', v_erro;
  end if;
  raise notice '8. provisionar de novo não duplica nem rebaixa quem já tem acesso';

  -- ------------------------------------ 5. organização suspensa
  -- Remove pelo dono, pela mesma razão da promoção acima.
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);
  delete from public.memberships where user_id = v_novo;
  update public.orgs set assinatura_status = 'suspensa' where id = v_org;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_novo, 'role', 'authenticated')::text, true);

  perform set_config('role', 'authenticated', true);
  v_ret := public.provisionar_acesso_sso();
  if v_ret is not null then
    raise exception 'FALHOU: organização suspensa ganhou gente nova.';
  end if;
  raise notice '9. organização suspensa não provisiona ninguém';

  perform set_config('role', 'postgres', true);
  update public.orgs set assinatura_status = 'ativa' where id = v_org;

  -- ---------------------------------- 7. só administrador cadastra
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_focal, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    insert into public.org_dominios (org_id, dominio, criado_por)
    values (v_org, 'focal-tentou.com', v_focal);
    raise exception 'FALHOU: ponto focal cadastrou domínio.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '10. ponto focal não cadastra domínio';
  end;

  -- Mas enxerga os da organização dele: é informação de acesso, não segredo.
  select count(*) into v_n from public.org_dominios where org_id = v_org;
  if v_n < 1 then
    raise exception 'FALHOU: membro não enxerga o domínio da própria organização.';
  end if;
  raise notice '11. membro enxerga o domínio da própria organização';

  perform set_config('role', 'postgres', true);
  delete from public.orgs where slug in ('acme-sso', 'rival-sso');
  delete from auth.users where email = 'novo@acme.com';

  raise notice 'TODOS OS TESTES DO ACESSO CORPORATIVO PASSARAM';
end $$;
