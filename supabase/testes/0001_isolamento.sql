-- =====================================================================
-- Teste  : 0001_isolamento.sql
-- Para   : provar que a RLS separa organizacoes de verdade.
-- Onde   : editor SQL do Supabase, depois de aplicar 0001_init_tenancy.
-- Aviso  : NAO e migration. Cria dado de teste e apaga tudo no fim.
--
-- Antes de rodar, crie dois usuarios pelo proprio aplicativo (tela de
-- cadastro) e troque os dois e-mails abaixo pelos que voce criou.
-- =====================================================================

do $$
declare
  v_email_a text := 'usuario-a@exemplo.com';   -- <= troque
  v_email_b text := 'usuario-b@exemplo.com';   -- <= troque
  v_user_a  uuid;
  v_user_b  uuid;
  v_org_a   uuid;
  v_org_b   uuid;
  v_visiveis int;
begin
  select id into v_user_a from auth.users where email = v_email_a;
  select id into v_user_b from auth.users where email = v_email_b;

  if v_user_a is null or v_user_b is null then
    raise exception 'Crie os dois usuarios pelo aplicativo antes de rodar o teste.';
  end if;

  -- Duas organizacoes, uma para cada usuario ------------------------
  insert into public.orgs (nome, slug, criado_por)
  values ('Organizacao de teste A', 'teste-a-' || substr(gen_random_uuid()::text, 1, 8), v_user_a)
  returning id into v_org_a;

  insert into public.orgs (nome, slug, criado_por)
  values ('Organizacao de teste B', 'teste-b-' || substr(gen_random_uuid()::text, 1, 8), v_user_b)
  returning id into v_org_b;

  -- Fora do aplicativo nao ha sessao, entao o vinculo de owner que a
  -- funcao criar_organizacao() faria vai na mao.
  insert into public.memberships (org_id, user_id, papel)
  values (v_org_a, v_user_a, 'owner'), (v_org_b, v_user_b, 'owner')
  on conflict (org_id, user_id) do nothing;

  -- Simula a sessao do usuario A ------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);

  select count(*) into v_visiveis from public.orgs;
  raise notice 'Usuario A enxerga % organizacao(oes). Esperado: 1', v_visiveis;
  if v_visiveis <> 1 then
    raise exception 'FALHOU: usuario A deveria enxergar apenas a propria organizacao.';
  end if;

  select count(*) into v_visiveis from public.orgs where id = v_org_b;
  if v_visiveis <> 0 then
    raise exception 'FALHOU: usuario A enxergou a organizacao de B.';
  end if;

  select count(*) into v_visiveis from public.memberships where org_id = v_org_b;
  if v_visiveis <> 0 then
    raise exception 'FALHOU: usuario A enxergou os vinculos de B.';
  end if;

  -- Simula a sessao do usuario B ------------------------------------
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);

  select count(*) into v_visiveis from public.orgs where id = v_org_a;
  if v_visiveis <> 0 then
    raise exception 'FALHOU: usuario B enxergou a organizacao de A.';
  end if;

  raise notice 'PASSOU: cada usuario enxerga apenas a propria organizacao.';

  -- Limpeza ---------------------------------------------------------
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
  delete from public.orgs where id in (v_org_a, v_org_b);
  raise notice 'Dados de teste removidos.';
end
$$;
