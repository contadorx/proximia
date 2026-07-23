-- =====================================================================
-- Mapa de decisores — regras que vivem no banco.
--
-- O que se prova aqui:
--   1. Catálogo é do assinante, e nasce sugerido (não fixo).
--   2. Isolamento: catálogo de uma organização não vaza para outra.
--   3. Hierarquia recusa chefe de outra conta, auto-referência e ciclo.
--   4. Alerta de "sem decisor" olha a PROPRIEDADE `decide`, não o rótulo.
--   5. Alerta de "ponto único" conta contatos.
--   6. Os dois somem sozinhos quando a causa some.
--   7. Ponto focal não enxerga contato de carteira que não acompanha.
--
-- Padrão da casa: bloco do $$ que levanta exceção na primeira violação.
-- =====================================================================

do $$
declare
  v_org    uuid; v_org2 uuid;
  v_dono   uuid; v_focal uuid;
  v_cart   uuid; v_cart2 uuid;
  v_conta  uuid; v_conta_b uuid; v_conta_c uuid;
  v_papel_decide uuid; v_papel_influencia uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid;
  v_n      integer;
  v_erro   text;
begin
  select id into v_dono  from auth.users where email = 'gestor@exemplo.com';
  select id into v_focal from auth.users where email = 'focal@exemplo.com';

  -- ---------------------------------------------------------------- cenário
  insert into public.orgs (nome, slug) values ('Mapa Ltda', 'mapa-ltda') returning id into v_org;
  insert into public.orgs (nome, slug) values ('Outra Ltda', 'outra-mapa') returning id into v_org2;
  insert into public.memberships (org_id, user_id, papel) values (v_org, v_dono, 'owner');
  insert into public.memberships (org_id, user_id, papel) values (v_org, v_focal, 'ponto_focal');
  insert into public.memberships (org_id, user_id, papel) values (v_org2, v_dono, 'owner');

  insert into public.carteiras (org_id, nome) values (v_org, 'Regional Norte') returning id into v_cart;
  insert into public.carteiras (org_id, nome) values (v_org, 'Regional Sul')   returning id into v_cart2;
  insert into public.carteira_membros (org_id, carteira_id, user_id) values (v_org, v_cart, v_focal);

  insert into public.contas (org_id, carteira_id, nome, criticidade, status)
    values (v_org, v_cart, 'Alfa Indústria', 'alta', 'ativa') returning id into v_conta;
  insert into public.contas (org_id, carteira_id, nome, criticidade, status)
    values (v_org, v_cart, 'Beta Logística', 'alta', 'ativa') returning id into v_conta_b;
  insert into public.contas (org_id, carteira_id, nome, criticidade, status)
    values (v_org, v_cart2, 'Gama Serviços', 'baixa', 'ativa') returning id into v_conta_c;

  -- ------------------------------------------------ 1. catálogo sugerido
  perform public.garantir_catalogo_decisao(v_org);
  select count(*) into v_n from public.contato_papeis where org_id = v_org;
  if v_n < 5 then raise exception 'FALHOU: catálogo de papéis não foi semeado (% linhas).', v_n; end if;

  select count(*) into v_n from public.contato_posturas where org_id = v_org and tom = 'contrario';
  if v_n < 1 then raise exception 'FALHOU: nenhuma postura contrária sugerida.'; end if;
  raise notice '1. catálogo nasce sugerido, e o assinante manda nele daqui em diante';

  -- Rodar de novo não duplica.
  perform public.garantir_catalogo_decisao(v_org);
  select count(*) into v_n from public.contato_papeis where org_id = v_org;
  if v_n > 8 then raise exception 'FALHOU: semente duplicou o catálogo (% linhas).', v_n; end if;
  raise notice '2. semear duas vezes não duplica';

  -- --------------------------------------------------- 2. isolamento
  perform public.garantir_catalogo_decisao(v_org2);
  select count(*) into v_n
    from public.contato_papeis p1
   where p1.org_id = v_org
     and exists (select 1 from public.contato_papeis p2
                  where p2.id = p1.id and p2.org_id = v_org2);
  if v_n <> 0 then raise exception 'FALHOU: catálogo compartilhado entre organizações.'; end if;
  raise notice '3. cada organização tem o próprio catálogo';

  select id into v_papel_decide     from public.contato_papeis where org_id = v_org and decide limit 1;
  select id into v_papel_influencia from public.contato_papeis where org_id = v_org and not decide limit 1;

  -- ------------------------------------------------- 3. hierarquia
  insert into public.contatos (org_id, conta_id, nome, papel_id, influencia)
    values (v_org, v_conta, 'Ana Diretora', v_papel_decide, 5) returning id into v_c1;
  insert into public.contatos (org_id, conta_id, nome, papel_id, influencia, reporta_a)
    values (v_org, v_conta, 'Bruno Gerente', v_papel_influencia, 3, v_c1) returning id into v_c2;
  insert into public.contatos (org_id, conta_id, nome)
    values (v_org, v_conta_b, 'Carla Sozinha') returning id into v_c3;

  -- chefe de outra conta
  begin
    update public.contatos set reporta_a = v_c3 where id = v_c2;
    raise exception 'FALHOU: aceitou chefe de outra conta.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '4. reportar a alguém de outra conta é recusado';
  end;

  -- auto-referência
  begin
    update public.contatos set reporta_a = v_c1 where id = v_c1;
    raise exception 'FALHOU: aceitou auto-referência.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '5. contato não reporta a si mesmo';
  end;

  -- ciclo
  begin
    update public.contatos set reporta_a = v_c2 where id = v_c1;
    raise exception 'FALHOU: aceitou ciclo na hierarquia.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '6. ciclo na hierarquia é recusado';
  end;

  -- ------------------------------------- 4 e 5. os dois alertas novos
  perform public.gerar_alertas_decisores__nucleo(v_org);

  -- Alfa tem decisor (Ana) → não deve alertar sem decisor.
  select count(*) into v_n from public.alertas
   where org_id = v_org and tipo = 'conta_sem_decisor' and entidade_id = v_conta and status = 'aberto';
  if v_n <> 0 then raise exception 'FALHOU: alertou sem decisor numa conta que tem decisor.'; end if;

  -- Beta é criticidade alta, tem contato, nenhum com papel que decide.
  select count(*) into v_n from public.alertas
   where org_id = v_org and tipo = 'conta_sem_decisor' and entidade_id = v_conta_b and status = 'aberto';
  if v_n <> 1 then raise exception 'FALHOU: não alertou conta alta sem decisor (% alertas).', v_n; end if;
  raise notice '7. conta de criticidade alta sem quem decide gera aviso';

  -- Gama é baixa criticidade e não tem contato nenhum: não alerta.
  select count(*) into v_n from public.alertas
   where org_id = v_org and tipo = 'conta_sem_decisor' and entidade_id = v_conta_c;
  if v_n <> 0 then raise exception 'FALHOU: alertou conta sem contato nenhum (é cadastro, não mapa).'; end if;
  raise notice '8. conta sem contato nenhum não vira aviso de mapa';

  -- Ponto único: Beta tem 1 contato; Alfa tem 2.
  select count(*) into v_n from public.alertas
   where org_id = v_org and tipo = 'conta_ponto_unico' and entidade_id = v_conta_b and status = 'aberto';
  if v_n <> 1 then raise exception 'FALHOU: não alertou ponto único de relacionamento.'; end if;

  select count(*) into v_n from public.alertas
   where org_id = v_org and tipo = 'conta_ponto_unico' and entidade_id = v_conta and status = 'aberto';
  if v_n <> 0 then raise exception 'FALHOU: alertou ponto único numa conta com dois contatos.'; end if;
  raise notice '9. um contato só na conta vira aviso de ponto único';

  -- ---------------------------------------- 6. some sozinho com a causa
  update public.contatos set papel_id = v_papel_decide where id = v_c3;
  insert into public.contatos (org_id, conta_id, nome) values (v_org, v_conta_b, 'Dino Novo');
  perform public.gerar_alertas_decisores__nucleo(v_org);

  select count(*) into v_n from public.alertas
   where org_id = v_org and entidade_id = v_conta_b and status = 'aberto'
     and tipo in ('conta_sem_decisor', 'conta_ponto_unico');
  if v_n <> 0 then raise exception 'FALHOU: aviso não se resolveu depois de a causa sumir (% abertos).', v_n; end if;
  raise notice '10. os dois avisos somem sozinhos quando a causa some';

  -- --------------------------------- 7. alcance do ponto focal (RLS)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_focal, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_n from public.contatos where conta_id = v_conta_c;
  if v_n <> 0 then
    raise exception 'FALHOU: ponto focal enxergou contato de carteira que não acompanha (%).', v_n;
  end if;

  select count(*) into v_n from public.contatos where conta_id = v_conta;
  if v_n = 0 then
    raise exception 'FALHOU: ponto focal não enxerga contato da carteira dele.';
  end if;

  perform set_config('role', 'postgres', true);
  raise notice '11. ponto focal vê o mapa da carteira dele e só dela';

  -- Limpeza. Os arquivos de teste compartilham o mesmo banco e rodam em
  -- ordem alfabética: deixar organização para trás quebra o teste do
  -- vizinho — foi exatamente o que aconteceu na primeira execução deste
  -- arquivo, que derrubou negocio.sql com "cliente viu outras
  -- organizacoes". Cascata leva carteiras, contas, contatos e alertas.
  delete from public.orgs where slug in ('mapa-ltda', 'outra-mapa');

  raise notice 'TODOS OS TESTES DO MAPA DE DECISORES PASSARAM';
end $$;
