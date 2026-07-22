-- =====================================================================
-- Teste  : 0002_anexos_auditoria_portal.sql
-- Para   : provar que as garantias das F20, F21 e F22 estao no banco, e
--          nao na tela.
-- Onde   : editor SQL do Supabase, depois de aplicar ate 0017_portal.
-- Aviso  : NAO e migration. Cria dado de teste e apaga tudo no fim.
--
-- Antes de rodar, crie dois usuarios pelo proprio aplicativo (tela de
-- cadastro) e troque os dois e-mails abaixo pelos que voce criou.
--
-- O que este teste tenta fazer de errado, de proposito:
--   . anexar arquivo e link na mesma linha;
--   . escrever direto na trilha de auditoria;
--   . registrar acesso numa organizacao alheia;
--   . abrir portal revogado, expirado e inexistente;
--   . ler, de uma organizacao, o que pertence a outra.
-- Se qualquer uma dessas passar, o teste levanta excecao.
-- =====================================================================

do $$
declare
  v_email_a text := 'usuario-a@exemplo.com';   -- <= troque
  v_email_b text := 'usuario-b@exemplo.com';   -- <= troque
  v_user_a  uuid;
  v_user_b  uuid;
  v_org_a   uuid;
  v_org_b   uuid;
  v_cart    uuid;
  v_conta   uuid;
  v_frente  uuid;
  v_portal  uuid;
  v_token   text;
  v_tk_val  text;
  v_n       int;
  v_campos  text[];
  v_json    jsonb;
  v_erro    boolean;
begin
  select id into v_user_a from auth.users where email = v_email_a;
  select id into v_user_b from auth.users where email = v_email_b;

  if v_user_a is null or v_user_b is null then
    raise exception 'Crie os dois usuarios pelo aplicativo antes de rodar o teste.';
  end if;

  -- ------------------------------------------------------------------
  -- Cenario
  -- ------------------------------------------------------------------
  insert into public.orgs (nome, slug, criado_por)
  values ('Teste A', 'teste-anex-a-' || substr(gen_random_uuid()::text, 1, 8), v_user_a)
  returning id into v_org_a;

  insert into public.orgs (nome, slug, criado_por)
  values ('Teste B', 'teste-anex-b-' || substr(gen_random_uuid()::text, 1, 8), v_user_b)
  returning id into v_org_b;

  insert into public.memberships (org_id, user_id, papel)
  values (v_org_a, v_user_a, 'owner'), (v_org_b, v_user_b, 'owner')
  on conflict (org_id, user_id) do nothing;

  insert into public.carteiras (org_id, nome, criado_por)
  values (v_org_a, 'Carteira de teste', v_user_a)
  returning id into v_cart;

  insert into public.contas (org_id, carteira_id, nome, criado_por)
  values (v_org_a, v_cart, 'Conta de teste', v_user_a)
  returning id into v_conta;

  insert into public.frentes (org_id, carteira_id, titulo, status, qtd_casos,
                              potencial_bruto, potencial_origem, potencial_data, criado_por)
  values (v_org_a, v_cart, 'Frente de teste', 'em_execucao', 10,
          150000, 'apuracao de teste', current_date, v_user_a)
  returning id into v_frente;

  -- ==================================================================
  -- F20 — Anexos
  -- ==================================================================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);

  insert into public.anexos (org_id, carteira_id, entidade_tipo, entidade_id, nome, url, criado_por)
  values (v_org_a, v_cart, 'conta', v_conta, 'Contrato assinado', 'https://exemplo/doc', v_user_a);

  -- Arquivo e link na mesma linha: tem que quebrar.
  v_erro := false;
  begin
    insert into public.anexos (org_id, carteira_id, entidade_tipo, entidade_id, nome,
                               caminho, url, criado_por)
    values (v_org_a, v_cart, 'conta', v_conta, 'Ambiguo',
            v_org_a || '/conta/x/y.pdf', 'https://exemplo/doc2', v_user_a);
  exception when others then v_erro := true;
  end;
  if not v_erro then
    raise exception 'FALHOU: o banco aceitou anexo com arquivo e link ao mesmo tempo.';
  end if;

  -- Nem arquivo nem link: tambem tem que quebrar.
  v_erro := false;
  begin
    insert into public.anexos (org_id, carteira_id, entidade_tipo, entidade_id, nome, criado_por)
    values (v_org_a, v_cart, 'conta', v_conta, 'Vazio', v_user_a);
  exception when others then v_erro := true;
  end;
  if not v_erro then
    raise exception 'FALHOU: o banco aceitou anexo sem arquivo e sem link.';
  end if;

  -- Autor forjado: a politica exige criado_por = auth.uid().
  v_erro := false;
  begin
    insert into public.anexos (org_id, carteira_id, entidade_tipo, entidade_id, nome, url, criado_por)
    values (v_org_a, v_cart, 'conta', v_conta, 'Em nome de outro', 'https://exemplo/x', v_user_b);
  exception when others then v_erro := true;
  end;
  if not v_erro then
    raise exception 'FALHOU: alguem anexou em nome de outra pessoa.';
  end if;

  -- Leitura do caminho do arquivo pela politica do Storage.
  if public.org_do_arquivo(v_org_a || '/conta/abc/arquivo.pdf') <> v_org_a then
    raise exception 'FALHOU: org_do_arquivo nao leu a organizacao do caminho.';
  end if;
  if public.org_do_arquivo('caminho/torto/sem/uuid.pdf') is not null then
    raise exception 'FALHOU: caminho fora do padrao deveria devolver null.';
  end if;

  raise notice 'PASSOU F20: anexo e arquivo ou link, com autor conferido, e o caminho define o alcance.';

  -- ==================================================================
  -- F21 — Registro de acesso
  -- ==================================================================
  -- A criacao da conta ja deveria estar na trilha.
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from public.auditoria
   where org_id = v_org_a and entidade_tipo = 'contas' and acao = 'criou';
  if v_n = 0 then
    raise exception 'FALHOU: criar conta nao entrou na trilha.';
  end if;

  -- Alteracao registra quais campos foram tocados.
  update public.contas set nome = 'Conta renomeada' where id = v_conta;
  select campos into v_campos from public.auditoria
   where org_id = v_org_a and entidade_id = v_conta and acao = 'alterou'
   order by criado_em desc limit 1;
  if v_campos is null or not ('nome' = any(v_campos)) then
    raise exception 'FALHOU: a trilha nao registrou que o nome mudou.';
  end if;

  -- Gravacao que nao muda nada nao vira linha.
  select count(*) into v_n from public.auditoria where org_id = v_org_a and acao = 'alterou';
  update public.contas set nome = 'Conta renomeada' where id = v_conta;
  select count(*) - v_n into v_n from public.auditoria where org_id = v_org_a and acao = 'alterou';
  if v_n <> 0 then
    raise exception 'FALHOU: gravacao sem mudanca gerou linha na trilha.';
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);

  -- Escrever direto na trilha: nao existe grant para isso.
  v_erro := false;
  begin
    insert into public.auditoria (org_id, acao, entidade_tipo, resumo)
    values (v_org_a, 'criou', 'contas', 'linha plantada');
  exception when others then v_erro := true;
  end;
  if not v_erro then
    raise exception 'FALHOU: foi possivel escrever direto na trilha.';
  end if;

  -- Apagar linha da trilha: idem.
  v_erro := false;
  begin
    delete from public.auditoria where org_id = v_org_a;
  exception when others then v_erro := true;
  end;
  if not v_erro then
    raise exception 'FALHOU: foi possivel apagar linha da trilha.';
  end if;

  -- Registrar acesso em organizacao alheia.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
  v_erro := false;
  begin
    perform public.registrar_acesso(v_org_a, 'leu', 'extrato', v_cart, 'bisbilhotando');
  exception when others then v_erro := true;
  end;
  if not v_erro then
    raise exception 'FALHOU: B registrou acesso na organizacao de A.';
  end if;

  -- B e dono da propria organizacao e mesmo assim nao le a trilha de A.
  select count(*) into v_n from public.auditoria where org_id = v_org_a;
  if v_n <> 0 then
    raise exception 'FALHOU: B enxergou % linha(s) da trilha de A.', v_n;
  end if;

  raise notice 'PASSOU F21: a trilha registra o que muda, ignora o que nao muda, e nao aceita escrita nem exclusao.';

  -- ==================================================================
  -- F22 — Portal
  -- ==================================================================
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);

  insert into public.portais (org_id, carteira_id, titulo, criado_por)
  values (v_org_a, v_cart, 'Acompanhamento de teste', v_user_a)
  returning id, token into v_portal, v_token;

  -- Visitante anonimo: sem sessao nenhuma.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', null, true);

  v_json := public.portal_dados(v_token);
  if not (v_json ->> 'valido')::boolean then
    raise exception 'FALHOU: link valido nao abriu — %', v_json ->> 'motivo';
  end if;

  -- Padrao: potencial nao sai.
  if v_json -> 'potencial' <> 'null'::jsonb then
    raise exception 'FALHOU: potencial vazou com a chave desligada.';
  end if;
  if jsonb_array_length(v_json -> 'frentes') <> 1 then
    raise exception 'FALHOU: a frente em aberto nao apareceu no portal.';
  end if;
  if (v_json -> 'frentes' -> 0 -> 'potencial') <> 'null'::jsonb then
    raise exception 'FALHOU: potencial da frente vazou com a chave desligada.';
  end if;

  -- Token inexistente.
  if (public.portal_dados('token-que-nao-existe') ->> 'valido')::boolean then
    raise exception 'FALHOU: token inexistente abriu o portal.';
  end if;

  -- Nenhuma tabela e legivel pelo anonimo.
  v_erro := false;
  begin
    select count(*) into v_n from public.carteiras;
    if v_n > 0 then v_erro := false; else v_erro := true; end if;
  exception when others then v_erro := true;
  end;
  if not v_erro then
    raise exception 'FALHOU: visitante anonimo leu a tabela de carteiras.';
  end if;

  -- A visita deixa rastro.
  perform public.portal_visita(v_token, 'teste-automatizado');
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from public.portal_acessos where portal_id = v_portal;
  if v_n <> 1 then
    raise exception 'FALHOU: a abertura do portal nao foi registrada.';
  end if;
  select count(*) into v_n from public.auditoria
   where org_id = v_org_a and acao = 'abriu_portal' and origem = 'portal';
  if v_n <> 1 then
    raise exception 'FALHOU: a abertura do portal nao entrou na trilha.';
  end if;

  -- Com a chave ligada, os valores saem.
  update public.portais set mostrar_valores = true where id = v_portal;
  perform set_config('role', 'anon', true);
  v_json := public.portal_dados(v_token);
  if (v_json ->> 'potencial')::numeric <> 150000 then
    raise exception 'FALHOU: com a chave ligada o potencial deveria aparecer.';
  end if;

  -- Revogado nao abre.
  perform set_config('role', 'postgres', true);
  update public.portais set status = 'revogado' where id = v_portal;
  perform set_config('role', 'anon', true);
  if (public.portal_dados(v_token) ->> 'valido')::boolean then
    raise exception 'FALHOU: link revogado continuou abrindo.';
  end if;

  -- Expirado nao abre.
  perform set_config('role', 'postgres', true);
  insert into public.portais (org_id, carteira_id, expira_em, criado_por)
  values (v_org_a, v_cart, now() - interval '1 day', v_user_a)
  returning token into v_tk_val;
  perform set_config('role', 'anon', true);
  if (public.portal_dados(v_tk_val) ->> 'valido')::boolean then
    raise exception 'FALHOU: link expirado continuou abrindo.';
  end if;

  -- Visita em link morto nao vira registro.
  perform public.portal_visita(v_tk_val, 'teste-automatizado');
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from public.portal_acessos where org_id = v_org_a;
  if v_n <> 1 then
    raise exception 'FALHOU: link expirado registrou visita.';
  end if;

  -- B nao lista os portais de A.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.portais where org_id = v_org_a;
  if v_n <> 0 then
    raise exception 'FALHOU: B enxergou os portais de A.';
  end if;

  raise notice 'PASSOU F22: o link expira, revoga, esconde valores por padrao e registra cada abertura.';

  -- ------------------------------------------------------------------
  -- Limpeza
  -- ------------------------------------------------------------------
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
  delete from public.orgs where id in (v_org_a, v_org_b);
  raise notice 'Dados de teste removidos.';
  raise notice 'TUDO PASSOU.';
end
$$;
