-- =====================================================================
-- Plano de maturidade — a prioridade precisa ser conta, não opinião.
--
-- O que se prova aqui:
--   1. pontos_recuperaveis reflete peso da pergunta x peso da dimensão.
--   2. Pergunta com nota máxima sai da lista de lacunas.
--   3. Item de plano cria compromisso de verdade, com dono e prazo.
--   4. O plano guarda a nota de origem e detecta o movimento no ciclo
--      seguinte: melhorou, sem mudança, piorou.
--   5. Alcance: ponto focal e organização vizinha.
-- =====================================================================

do $$
declare
  v_org uuid; v_org2 uuid;
  v_dono uuid; v_focal uuid; v_vizinho uuid;
  v_cart uuid; v_cart_outra uuid;
  v_ciclo1 uuid; v_ciclo2 uuid;
  v_dim_forte uuid; v_dim_fraca uuid;
  v_p_forte uuid; v_p_fraca uuid; v_p_boa uuid;
  v_av1 uuid; v_av2 uuid;
  v_pessoa uuid; v_item uuid; v_comp uuid;
  v_r record; v_n integer; v_x numeric; v_y numeric;
begin
  select id into v_dono    from auth.users where email = 'gestor@exemplo.com';
  select id into v_focal   from auth.users where email = 'focal@exemplo.com';
  select id into v_vizinho from auth.users where email = 'analista@exemplo.com';

  insert into public.orgs (nome,slug) values ('Plano SA','plano-sa')     returning id into v_org;
  insert into public.orgs (nome,slug) values ('Vizinha Pl','vizinha-pl') returning id into v_org2;
  insert into public.memberships (org_id,user_id,papel) values (v_org, v_dono,'owner');
  insert into public.memberships (org_id,user_id,papel) values (v_org, v_focal,'ponto_focal');
  insert into public.memberships (org_id,user_id,papel) values (v_org2, v_vizinho,'owner');

  insert into public.carteiras (org_id,nome) values (v_org,'Norte')  returning id into v_cart;
  insert into public.carteiras (org_id,nome) values (v_org2,'Deles') returning id into v_cart_outra;
  insert into public.carteira_membros (org_id,carteira_id,user_id) values (v_org,v_cart,v_focal);

  -- Criar membership já cria a pessoa na equipe (gatilho): buscar em vez
  -- de inserir. Tentar criar de novo esbarra no vínculo único por
  -- organização — foi assim que este teste falhou na primeira escrita.
  select id into v_pessoa from public.equipe where org_id = v_org and user_id = v_focal;
  if v_pessoa is null then
    raise exception 'FALHOU: o vínculo de membership não criou a pessoa na equipe.';
  end if;

  insert into public.maturidade_ciclos (org_id,nome,referencia)
    values (v_org,'2026-1', current_date - 180) returning id into v_ciclo1;
  insert into public.maturidade_ciclos (org_id,nome,referencia)
    values (v_org,'2026-2', current_date) returning id into v_ciclo2;

  -- Duas dimensões com pesos diferentes, para a prioridade ter o que provar.
  insert into public.maturidade_dimensoes (org_id,nome,peso,ordem)
    values (v_org,'Pesada',3,1) returning id into v_dim_forte;
  insert into public.maturidade_dimensoes (org_id,nome,peso,ordem)
    values (v_org,'Leve',1,2) returning id into v_dim_fraca;

  insert into public.maturidade_perguntas (org_id,dimensao_id,texto,peso,ordem)
    values (v_org,v_dim_forte,'Pergunta pesada',3,1) returning id into v_p_forte;
  insert into public.maturidade_perguntas (org_id,dimensao_id,texto,peso,ordem)
    values (v_org,v_dim_fraca,'Pergunta leve',1,1) returning id into v_p_fraca;
  insert into public.maturidade_perguntas (org_id,dimensao_id,texto,peso,ordem)
    values (v_org,v_dim_fraca,'Pergunta já boa',1,2) returning id into v_p_boa;

  insert into public.maturidade_avaliacoes (org_id,carteira_id,ciclo_id)
    values (v_org,v_cart,v_ciclo1) returning id into v_av1;
  -- Mesma nota (1) nas duas primeiras: a diferença de prioridade tem que
  -- vir só do peso, não da nota.
  insert into public.maturidade_respostas (org_id,avaliacao_id,pergunta_id,nota)
    values (v_org,v_av1,v_p_forte,1), (v_org,v_av1,v_p_fraca,1), (v_org,v_av1,v_p_boa,4);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  -- ------------------------------------------- 1. a conta da prioridade
  select pontos_recuperaveis into v_x from public.maturidade_lacuna
   where avaliacao_id = v_av1 and pergunta_id = v_p_forte;
  select pontos_recuperaveis into v_y from public.maturidade_lacuna
   where avaliacao_id = v_av1 and pergunta_id = v_p_fraca;

  -- pesada: peso 3 x dim 3 = 9 · leve: peso 1 x dim 1 = 1 · nove vezes mais
  if v_x is null or v_y is null or round(v_x / v_y) <> 9 then
    raise exception 'FALHOU: prioridade não seguiu os pesos (pesada %, leve %).', v_x, v_y;
  end if;
  raise notice '1. com a MESMA nota, a pergunta de peso 9x devolve 9x mais pontos';

  -- ------------------------------- 2. pergunta no máximo sai da lista
  select count(*) into v_n from public.maturidade_lacuna
   where avaliacao_id = v_av1 and pergunta_id = v_p_boa;
  if v_n <> 0 then
    raise exception 'FALHOU: pergunta com nota 4 apareceu como lacuna.';
  end if;
  raise notice '2. pergunta já no máximo não é lacuna';

  -- --------------------------- 3. item de plano vira compromisso
  select public.criar_item_plano(
    v_av1, v_p_forte, 'Designar responsável dedicado de GC', v_pessoa,
    current_date + 30) into v_item;

  select * into v_r from public.maturidade_plano where id = v_item;
  if v_r.nota_origem <> 1 then
    raise exception 'FALHOU: não guardou a nota de origem (veio %).', v_r.nota_origem;
  end if;
  if v_r.compromisso_id is null then
    raise exception 'FALHOU: item de plano não criou compromisso.';
  end if;

  select * into v_r from public.compromissos where id = v_r.compromisso_id;
  if v_r.entidade_tipo <> 'carteira' or v_r.carteira_id <> v_cart then
    raise exception 'FALHOU: o compromisso não ficou na carteira.';
  end if;
  if v_r.dono_id is distinct from v_focal then
    raise exception 'FALHOU: o compromisso nasceu sem o dono informado.';
  end if;
  if v_r.origem <> 'maturidade' then
    raise exception 'FALHOU: o compromisso não guarda a origem.';
  end if;
  raise notice '3. o item vira compromisso na carteira, com dono, prazo e origem';

  -- ------------------------------------ 4. movimento entre ciclos
  select movimento into v_r from public.maturidade_plano_situacao where id = v_item;
  if v_r.movimento <> 'sem nova avaliação' then
    raise exception 'FALHOU: sem segundo ciclo, o movimento deveria ser desconhecido (veio %).',
      v_r.movimento;
  end if;
  raise notice '4. sem ciclo novo, o plano diz que ainda não há como comparar';

  perform set_config('role','postgres', true);
  insert into public.maturidade_avaliacoes (org_id,carteira_id,ciclo_id)
    values (v_org,v_cart,v_ciclo2) returning id into v_av2;
  insert into public.maturidade_respostas (org_id,avaliacao_id,pergunta_id,nota)
    values (v_org,v_av2,v_p_forte,3), (v_org,v_av2,v_p_fraca,1);
  perform set_config('role','authenticated', true);

  select movimento, nota_atual into v_r from public.maturidade_plano_situacao where id = v_item;
  if v_r.movimento <> 'melhorou' or v_r.nota_atual <> 3 then
    raise exception 'FALHOU: não detectou a melhora (movimento %, nota %).',
      v_r.movimento, v_r.nota_atual;
  end if;
  raise notice '5. no ciclo seguinte, o plano mostra que a nota subiu de 1 para 3';

  -- ------------------------------------------------ 5. alcance
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_vizinho,'role','authenticated')::text, true);
  select count(*) into v_n from public.maturidade_plano;
  if v_n <> 0 then
    raise exception 'FALHOU: organização vizinha viu o plano alheio.';
  end if;
  select count(*) into v_n from public.maturidade_lacuna;
  if v_n <> 0 then
    raise exception 'FALHOU: organização vizinha viu as lacunas alheias.';
  end if;
  raise notice '6. plano e lacunas não atravessam organização';

  perform set_config('role','postgres', true);
  delete from public.orgs where slug in ('plano-sa','vizinha-pl');
  raise notice 'TODOS OS TESTES DO PLANO DE MATURIDADE PASSARAM';
end $$;
