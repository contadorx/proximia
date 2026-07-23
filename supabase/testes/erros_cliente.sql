-- =====================================================================
-- Erros do navegador — teto, alcance e limpeza.
--
-- O que se prova aqui:
--   1. O teto por minuto existe e para de gravar quando estoura.
--   2. A aplicação não grava direto: só o serviço, pela função.
--   3. Só quem opera a plataforma lê — assinante não vê erro de ninguém,
--      nem o próprio.
--   4. Erro sem sessão (antes do login) é aceito, com org e usuário nulos.
--   5. A limpeza apaga o que passou do prazo e preserva o resto.
-- =====================================================================

do $$
declare
  v_op uuid; v_comum uuid;
  v_id uuid;
  v_n integer;
  v_erro text;
begin
  delete from public.erros_cliente;
  delete from public.plataforma_admins;

  select id into v_op    from auth.users where email = 'gestor@exemplo.com';
  select id into v_comum from auth.users where email = 'focal@exemplo.com';
  insert into public.plataforma_admins (user_id, nome) values (v_op, 'Operador');

  -- ------------------------------------- 4. erro sem sessão é aceito
  v_id := public.registrar_erro_cliente(
    'tela', 'TypeError', 'não foi possível ler a propriedade x', '/entrar', null, 'Firefox', null, null);
  if v_id is null then
    raise exception 'FALHOU: recusou erro sem sessão, que é o caso mais comum antes do login.';
  end if;
  raise notice '1. erro antes do login é aceito, com organização e usuário nulos';

  -- Mensagem vazia não vira linha.
  if public.registrar_erro_cliente('tela', 'Error', '   ', null, null, null, null, null) is not null then
    raise exception 'FALHOU: gravou relato sem mensagem.';
  end if;
  raise notice '2. relato sem mensagem é descartado';

  -- ------------------------------------------------ 1. o teto
  delete from public.erros_cliente;
  for i in 1..60 loop
    perform public.registrar_erro_cliente('tela', 'Error', 'erro ' || i, '/painel', null, null, null, null);
  end loop;

  select count(*) into v_n from public.erros_cliente;
  if v_n <> 60 then
    raise exception 'FALHOU: gravou % relatos antes do teto (esperava 60).', v_n;
  end if;

  if public.registrar_erro_cliente('tela', 'Error', 'passou do teto', null, null, null, null, null) is not null then
    raise exception 'FALHOU: gravou acima do teto por minuto.';
  end if;

  select count(*) into v_n from public.erros_cliente;
  if v_n <> 60 then
    raise exception 'FALHOU: a tabela passou de 60 no mesmo minuto (% linhas).', v_n;
  end if;
  raise notice '3. o teto por minuto segura uma página em laço de erro';

  -- --------------------------- 2. a aplicação não grava direto
  if has_function_privilege('authenticated', 'public.registrar_erro_cliente(text, text, text, text, text, text, uuid, uuid)', 'EXECUTE') then
    raise exception 'FALHOU: papel da aplicação pode gravar erro e contornar o teto.';
  end if;
  if has_function_privilege('anon', 'public.registrar_erro_cliente(text, text, text, text, text, text, uuid, uuid)', 'EXECUTE') then
    raise exception 'FALHOU: anônimo pode gravar erro direto no banco.';
  end if;
  raise notice '4. só o serviço grava — o teto não tem como ser contornado';

  -- ------------------------------------------------- 3. alcance
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_comum, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_n from public.erros_cliente;
  if v_n <> 0 then
    raise exception 'FALHOU: assinante enxergou % erro(s).', v_n;
  end if;
  raise notice '5. assinante não enxerga a tabela de erros';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_op, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.erros_cliente;
  if v_n <> 60 then
    raise exception 'FALHOU: operador viu % erro(s), esperava 60.', v_n;
  end if;
  raise notice '6. quem opera a plataforma enxerga tudo';

  -- ------------------------------------------------- 5. limpeza
  perform set_config('role', 'postgres', true);
  update public.erros_cliente set criado_em = now() - interval '40 days'
   where id in (select id from public.erros_cliente limit 20);

  select public.limpar_erros_antigos(30) into v_n;
  if v_n <> 20 then
    raise exception 'FALHOU: a limpeza apagou % (esperava 20).', v_n;
  end if;

  select count(*) into v_n from public.erros_cliente;
  if v_n <> 40 then
    raise exception 'FALHOU: sobraram % erros recentes (esperava 40).', v_n;
  end if;
  raise notice '7. a limpeza apaga o que passou de trinta dias e preserva o resto';

  delete from public.erros_cliente;
  alter table public.plataforma_admins disable trigger trg_proteger_ultimo_operador;
  delete from public.plataforma_admins;
  alter table public.plataforma_admins enable trigger trg_proteger_ultimo_operador;

  raise notice 'TODOS OS TESTES DE ERRO DO NAVEGADOR PASSARAM';
end $$;
