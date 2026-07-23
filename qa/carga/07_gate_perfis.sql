-- =====================================================================
-- GATE DE PARTICIPAÇÃO — os quatro perfis, pelo caminho real.
--
-- POR QUE ESTE ARQUIVO EXISTE, SEPARADO DA BATERIA:
--
-- A bateria (04_ataque_rls.sql) roda via psql como `postgres`. O gate
-- introduzido em 0035 usa `session_user` para distinguir tráfego da API
-- de conexão direta ao banco — e conexão direta (migrations,
-- provisionamento, psql do operador) é liberada de propósito. Resultado:
-- rodando a bateria como postgres, os itens de RPC cross-org aparecem
-- como se ainda vazassem, porque o arnês não é o caminho real.
--
-- No Supabase, TODO tráfego da API chega no banco pelo papel
-- `authenticator`, que então assume anon / authenticated / service_role
-- conforme o JWT. Este arquivo exige essa conexão e testa os quatro
-- perfis. É o teste que vale para a decisão de segurança.
--
-- COMO RODAR:
--
--   1. Uma vez, criar o papel de borda (o Supabase real já o tem):
--        create role authenticator login password 'trocar' noinherit;
--        grant anon, authenticated, service_role to authenticator;
--
--   2. Conectar COMO ele e rodar este arquivo:
--        psql "postgres://authenticator:trocar@HOST:5432/BANCO" \
--          -f qa/carga/07_gate_perfis.sql
--
-- Espera-se: anônimo e forasteiro recusados; dono e serviço passando.
-- =====================================================================

\set ORG1 '00000000-0000-4000-a000-000000000001'

do $$
begin
  if session_user <> 'authenticator' then
    raise exception
      'Este teste precisa da conexão de borda. Conecte como `authenticator` — rodando como % o gate libera por ser conexão direta, e o teste não prova nada.',
      session_user;
  end if;
end $$;

-- ------------------------------------------------------------ anônimo
begin;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

do $$
declare res text;
begin
  begin
    perform public.gerar_alertas('00000000-0000-4000-a000-000000000001');
    res := 'PASSOU (!!!)';
  exception when others then res := 'recusado — ' || left(sqlerrm, 40); end;
  raise notice '1. anônimo · gerar_alertas    : %', res;

  begin
    perform public.tirar_foto('00000000-0000-4000-a000-000000000001', null);
    res := 'PASSOU (!!!)';
  exception when others then res := 'recusado — ' || left(sqlerrm, 40); end;
  raise notice '2. anônimo · tirar_foto       : %', res;

  begin
    perform public.vincular_membro('00000000-0000-4000-a000-000000000001',
                                   'atacante@exemplo.com', 'admin');
    res := 'PASSOU (!!!) — comprometimento total';
  exception when others then res := 'recusado — ' || left(sqlerrm, 40); end;
  raise notice '3. anônimo · vincular_membro  : %', res;
end $$;
rollback;

-- -------------------------------------------- autenticado de outra org
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('role', 'authenticated',
                    'sub', '00000000-0000-4000-9900-000000000001')::text, true);

do $$
declare res text;
begin
  begin
    perform public.gerar_alertas('00000000-0000-4000-a000-000000000001');
    res := 'PASSOU (!!!)';
  exception when others then res := 'recusado — ' || left(sqlerrm, 40); end;
  raise notice '4. forasteiro · gerar_alertas : %', res;

  begin
    perform public.vincular_membro('00000000-0000-4000-a000-000000000001',
                                   'atacante@exemplo.com', 'admin');
    res := 'PASSOU (!!!)';
  exception when others then res := 'recusado — ' || left(sqlerrm, 40); end;
  raise notice '5. forasteiro · vincular      : %', res;
end $$;
rollback;

-- --------------------------------------------- dono, na própria casa
-- Contraprova: a correção não pode quebrar o botão "Varrer agora", que
-- sempre passa a organização do próprio usuário.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('role', 'authenticated',
                    'sub', '00000000-0000-4000-9900-000000000002')::text, true);

do $$
declare n int;
begin
  select public.gerar_alertas('00000000-0000-4000-a000-000000000001') into n;
  raise notice '6. dono · própria org         : funcionou (% alertas)', n;
exception when others then
  raise exception 'REGRESSÃO: o dono não consegue varrer a própria organização — %', sqlerrm;
end $$;
commit;

-- ------------------------------------------------------- serviço/cron
begin;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

do $$
declare n int;
begin
  select public.gerar_alertas('00000000-0000-4000-a000-000000000001') into n;
  raise notice '7. serviço · atravessa orgs   : funcionou (% alertas)', n;
exception when others then
  raise exception 'REGRESSÃO: a rotina diária não roda mais — %', sqlerrm;
end $$;
commit;

do $$
begin
  raise notice '--- Esperado: 1 a 5 recusados · 6 e 7 funcionando.';
end $$;
