-- =====================================================================
-- Porta de entrada — as regras que vivem no banco.
--
-- O que se prova aqui:
--   1. A chave aparece uma vez e não fica guardada em texto claro.
--   2. Chave inválida, revogada ou de outra organização não autentica.
--   3. A organização vem SEMPRE do banco, nunca de quem chama.
--   4. Assinatura suspensa recusa entrada de dados (e só a entrada).
--   5. Limite de vazão por chave é aplicado.
--   6. Só administrador cria e revoga.
--   7. O registro de chamadas respeita o alcance da organização.
--   8. A aplicação não pode chamar autenticar_chave_api (varredura).
-- =====================================================================

do $$
declare
  v_org   uuid; v_org2 uuid;
  v_dono  uuid; v_focal uuid;
  v_chave text; v_chave2 text; v_chave_id uuid;
  v_prefixo text; v_resumo text;
  v_reg   record;
  v_n     integer;
  v_erro  text;
begin
  select id into v_dono  from auth.users where email = 'gestor@exemplo.com';
  select id into v_focal from auth.users where email = 'focal@exemplo.com';

  insert into public.orgs (nome, slug) values ('Porta Ltda', 'porta-ltda') returning id into v_org;
  insert into public.orgs (nome, slug) values ('Porta Dois', 'porta-dois') returning id into v_org2;
  insert into public.memberships (org_id, user_id, papel) values (v_org, v_dono, 'owner');
  insert into public.memberships (org_id, user_id, papel) values (v_org, v_focal, 'ponto_focal');
  insert into public.memberships (org_id, user_id, papel) values (v_org2, v_dono, 'owner');

  -- Sessão do dono, que é quem cria chave.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);

  -- ------------------------------------------- 1. a chave aparece uma vez
  select c.chave, c.id, c.prefixo into v_chave, v_chave_id, v_prefixo
    from public.criar_chave_api(v_org, 'Motor de cálculo', 60) c;

  if v_chave is null or length(v_chave) < 40 then
    raise exception 'FALHOU: chave não foi gerada.';
  end if;

  select resumo into v_resumo from public.chaves_api where id = v_chave_id;
  if v_resumo = v_chave then
    raise exception 'FALHOU: a chave está guardada em texto claro.';
  end if;
  if v_resumo <> encode(digest(v_chave, 'sha256'), 'hex') then
    raise exception 'FALHOU: o resumo guardado não corresponde à chave.';
  end if;
  raise notice '1. chave criada; no banco só existe o resumo sha256';

  -- Nenhuma coluna guarda o segredo inteiro.
  select count(*) into v_n from public.chaves_api where id = v_chave_id and prefixo = v_chave;
  if v_n <> 0 then raise exception 'FALHOU: prefixo é a chave inteira.'; end if;
  raise notice '2. o prefixo identifica sem revelar';

  -- --------------------------------------- 3. a organização vem do banco
  perform set_config('role', 'postgres', true);
  select * into v_reg from public.autenticar_chave_api(v_chave);
  if v_reg.org_id <> v_org then
    raise exception 'FALHOU: a chave autenticou na organização errada.';
  end if;
  raise notice '3. autenticar devolve a organização da chave — ninguém a informa';

  -- ------------------------------------------- 2. chave inválida recusa
  begin
    perform public.autenticar_chave_api(v_prefixo || '_invento_o_resto');
    raise exception 'FALHOU: aceitou chave com resumo errado.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '4. chave com segredo errado é recusada';
  end;

  begin
    perform public.autenticar_chave_api('pxm_naoexiste_qualquercoisa');
    raise exception 'FALHOU: aceitou chave inexistente.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '5. chave inexistente é recusada com a mesma mensagem';
  end;

  -- ------------------------------------------------------ chave revogada
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);
  select c.chave into v_chave2 from public.criar_chave_api(v_org, 'Temporária', 60) c;
  perform public.revogar_chave_api(
    (select id from public.chaves_api where org_id = v_org and nome = 'Temporária'));

  perform set_config('role', 'postgres', true);
  begin
    perform public.autenticar_chave_api(v_chave2);
    raise exception 'FALHOU: chave revogada continuou entrando.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '6. chave revogada não entra mais';
  end;

  -- ------------------------------------------- 4. assinatura suspensa
  update public.orgs set assinatura_status = 'suspensa' where id = v_org;
  begin
    perform public.autenticar_chave_api(v_chave);
    raise exception 'FALHOU: recebeu dados de organização suspensa.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '7. assinatura suspensa recusa entrada de dados';
  end;
  update public.orgs set assinatura_status = 'ativa' where id = v_org;

  -- ------------------------------------------------ 5. limite de vazão
  update public.chaves_api set limite_por_minuto = 2 where id = v_chave_id;
  perform public.registrar_chamada_api(v_chave_id, 'contas', 'gravar', 1, 1, 0, '[]'::jsonb, 'ok');
  perform public.registrar_chamada_api(v_chave_id, 'contas', 'gravar', 1, 1, 0, '[]'::jsonb, 'ok');

  begin
    perform public.autenticar_chave_api(v_chave);
    raise exception 'FALHOU: passou do limite de vazão.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '8. limite de chamadas por minuto é aplicado';
  end;
  update public.chaves_api set limite_por_minuto = 60 where id = v_chave_id;

  -- ------------------------------------ 6. só administrador cria/revoga
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_focal, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.criar_chave_api(v_org, 'Chave do focal', 60);
    raise exception 'FALHOU: ponto focal criou chave de API.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '9. ponto focal não cria chave';
  end;

  begin
    perform public.revogar_chave_api(v_chave_id);
    raise exception 'FALHOU: ponto focal revogou chave.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '10. ponto focal não revoga chave';
  end;

  -- Nem enxerga a chave: a política de leitura é de administrador.
  select count(*) into v_n from public.chaves_api where org_id = v_org;
  if v_n <> 0 then
    raise exception 'FALHOU: ponto focal enxergou chaves da organização (%).', v_n;
  end if;
  raise notice '11. ponto focal não enxerga as chaves';

  -- ------------------------------------ 7. registro respeita a organização
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);

  select count(*) into v_n from public.chamadas_api where org_id = v_org2;
  if v_n <> 0 then
    raise exception 'FALHOU: chamada de outra organização visível (%).', v_n;
  end if;

  select count(*) into v_n from public.chamadas_api where org_id = v_org;
  if v_n < 2 then
    raise exception 'FALHOU: as chamadas registradas sumiram (%).', v_n;
  end if;
  raise notice '12. o registro de chamadas fica na organização dele';

  -- ---------------------------- 8. a aplicação não varre chaves
  perform set_config('role', 'postgres', true);
  if has_function_privilege('authenticated', 'public.autenticar_chave_api(text)', 'EXECUTE') then
    raise exception 'FALHOU: papel da aplicação pode chamar autenticar_chave_api.';
  end if;
  if has_function_privilege('anon', 'public.autenticar_chave_api(text)', 'EXECUTE') then
    raise exception 'FALHOU: anônimo pode chamar autenticar_chave_api.';
  end if;
  raise notice '13. autenticar chave é do serviço — sem varredura pela aplicação';

  -- Limpeza: os arquivos de teste compartilham o banco.
  delete from public.orgs where slug in ('porta-ltda', 'porta-dois');

  raise notice 'TODOS OS TESTES DA PORTA DE ENTRADA PASSARAM';
end $$;
