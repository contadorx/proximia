do $$
declare
  v_o uuid; v_org public.orgs; v_c uuid; v_d uuid; v_p1 uuid; v_p2 uuid;
  v_ciclo uuid; v_aval uuid; v_score numeric; v_qtd int;
begin
  select id into v_o from auth.users where email='gestor@exemplo.com';
  perform set_config('request.jwt.claims', json_build_object('sub',v_o,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_org := public.criar_organizacao('Teste Import Mat','teste-imp-mat');
  insert into public.carteiras (org_id,nome) values (v_org.id,'Norte') returning id into v_c;
  insert into public.maturidade_dimensoes (org_id,nome,peso,ordem) values (v_org.id,'Processos',2,1) returning id into v_d;
  insert into public.maturidade_perguntas (org_id,dimensao_id,texto,peso,ordem)
    values (v_org.id,v_d,'Existe rotina definida?',1,1) returning id into v_p1;
  insert into public.maturidade_perguntas (org_id,dimensao_id,texto,peso,ordem)
    values (v_org.id,v_d,'A rotina é seguida?',1,2) returning id into v_p2;
  insert into public.maturidade_ciclos (org_id,nome,referencia) values (v_org.id,'2026-1',current_date) returning id into v_ciclo;

  -- é isto que a importação faz: cria a avaliação e grava as respostas
  insert into public.maturidade_avaliacoes (org_id,carteira_id,ciclo_id,criado_por)
    values (v_org.id,v_c,v_ciclo,v_o) returning id into v_aval;
  insert into public.maturidade_respostas (org_id,avaliacao_id,pergunta_id,nota,criado_por)
    values (v_org.id,v_aval,v_p1,4,v_o),(v_org.id,v_aval,v_p2,2,v_o);

  select score into v_score from public.maturidade_resultado where avaliacao_id=v_aval;
  raise notice '1. duas respostas (4 e 2) dão score de %', v_score;
  if v_score is null then raise exception 'FALHOU: score nao calculado.'; end if;

  -- reimportar a mesma linha atualiza, não duplica
  insert into public.maturidade_respostas (org_id,avaliacao_id,pergunta_id,nota,criado_por)
    values (v_org.id,v_aval,v_p1,1,v_o)
    on conflict (avaliacao_id,pergunta_id) do update set nota = excluded.nota;
  select count(*) into v_qtd from public.maturidade_respostas where avaliacao_id=v_aval;
  select score into v_score from public.maturidade_resultado where avaliacao_id=v_aval;
  raise notice '2. reimportando a mesma pergunta: % respostas, score agora %', v_qtd, v_score;
  if v_qtd <> 2 then raise exception 'FALHOU: duplicou resposta.'; end if;

  -- nota fora da escala é recusada pelo banco
  begin
    insert into public.maturidade_respostas (org_id,avaliacao_id,pergunta_id,nota,criado_por)
      values (v_org.id,v_aval,v_p2,7,v_o) on conflict (avaliacao_id,pergunta_id) do update set nota = 7;
    raise exception 'FALHOU: aceitou nota fora da escala.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '3. nota fora de 0 a 4 recusada pelo banco';
  end;

  -- a mesma carteira no mesmo ciclo não gera duas avaliações
  begin
    insert into public.maturidade_avaliacoes (org_id,carteira_id,ciclo_id,criado_por)
      values (v_org.id,v_c,v_ciclo,v_o);
    raise exception 'FALHOU: duas avaliações no mesmo ciclo.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '4. uma avaliação por carteira e ciclo';
  end;

  perform set_config('role','postgres', true);
  delete from public.orgs where id=v_org.id;
  raise notice 'TODOS OS TESTES DA CARGA DE MATURIDADE PASSARAM';
end $$;
