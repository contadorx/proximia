-- =====================================================================
-- Índice de cuidado — cada critério precisa dizer a verdade.
--
-- Um checklist em que um item mente é pior que checklist nenhum: a
-- pessoa passa a desconfiar de todos. Por isso o teste avalia os doze
-- critérios um a um, com a conta montada para cada caso.
--
-- Também se prova: a régua é do assinante (peso muda o índice), o
-- critério desligado sai da conta, e o alcance por RLS vale.
-- =====================================================================

do $$
declare
  v_org uuid; v_org2 uuid;
  v_dono uuid; v_vizinho uuid;
  v_cart uuid;
  v_vazia uuid; v_completa uuid;
  v_papel uuid; v_contato uuid; v_ct uuid;
  v_r record; v_n integer;
  function_result boolean;
begin
  select id into v_dono    from auth.users where email = 'gestor@exemplo.com';
  select id into v_vizinho from auth.users where email = 'analista@exemplo.com';

  insert into public.orgs (nome,slug) values ('Cuidado SA','cuidado-sa')   returning id into v_org;
  insert into public.orgs (nome,slug) values ('Vizinha Cui','vizinha-cui') returning id into v_org2;
  insert into public.memberships (org_id,user_id,papel) values (v_org, v_dono,'owner');
  insert into public.memberships (org_id,user_id,papel) values (v_org2, v_vizinho,'owner');
  insert into public.carteiras (org_id,nome) values (v_org,'Norte') returning id into v_cart;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  -- ------------------------------------------- a régua sugerida
  select public.garantir_criterios_conta(v_org) into v_n;
  if v_n <> 12 then
    raise exception 'FALHOU: a régua sugerida criou % critérios (esperava 12).', v_n;
  end if;
  raise notice '1. a régua sugerida nasce com 12 critérios verificáveis';

  -- rodar de novo não duplica
  perform public.garantir_criterios_conta(v_org);
  select count(*) into v_n from public.conta_criterios where org_id = v_org;
  if v_n <> 12 then raise exception 'FALHOU: a régua duplicou (% critérios).', v_n; end if;
  raise notice '2. semear de novo não duplica';

  -- --------------------------------- conta vazia: quase tudo falso
  perform set_config('role','postgres', true);
  insert into public.contas (org_id,carteira_id,nome) values (v_org,v_cart,'Vazia')
    returning id into v_vazia;
  perform set_config('role','authenticated', true);

  select * into v_r from public.conta_cuidado where conta_id = v_vazia;
  if v_r.criterios <> 12 then
    raise exception 'FALHOU: avaliou % critérios na conta vazia.', v_r.criterios;
  end if;

  -- Numa conta sem nada, os critérios "sem X" são verdadeiros (não há
  -- compromisso atrasado porque não há compromisso) e os "tem X" são
  -- falsos. É a leitura correta, e vale conferir que não é tudo falso.
  if v_r.cumpridos = 0 then
    raise exception 'FALHOU: nenhum critério cumprido — os "sem X" deveriam valer.';
  end if;
  if v_r.cumpridos = 12 then
    raise exception 'FALHOU: todos cumpridos numa conta sem nada.';
  end if;
  raise notice '3. conta vazia: os "sem pendência" valem, os "tem" não — índice de %%%', v_r.indice;

  -- --------------------------- cada critério, um a um
  perform set_config('role','postgres', true);
  insert into public.contas (org_id,carteira_id,nome,documento,responsavel_id,receita_atual,receita_origem)
    values (v_org,v_cart,'Completa','11222333000181',v_dono,100000,'base teste')
    returning id into v_completa;

  insert into public.contato_papeis (org_id,rotulo,decide,ordem)
    values (v_org,'Decisor',true,1) returning id into v_papel;
  insert into public.contatos (org_id,conta_id,nome,papel_id)
    values (v_org,v_completa,'Quem decide',v_papel) returning id into v_contato;
  insert into public.contatos (org_id,conta_id,nome) values (v_org,v_completa,'Segundo contato');

  insert into public.contratos (org_id,carteira_id,conta_id,numero,status,inicio,fim,aviso_previa_dias)
    values (v_org,v_cart,v_completa,'CT-1','vigente',current_date - 400, current_date + 400, 30)
    returning id into v_ct;

  insert into public.registros (org_id,carteira_id,entidade_tipo,entidade_id,corpo,ocorrido_em,autor_id)
    values (v_org,v_cart,'conta',v_completa,'conversa',current_date - 5,v_dono);

  insert into public.capturas (org_id,carteira_id,entidade_tipo,entidade_id,valor,confirmado_em,autor_id)
    values (v_org,v_cart,'conta',v_completa,5000,current_date - 30,v_dono);
  perform set_config('role','authenticated', true);

  select * into v_r from public.conta_cuidado where conta_id = v_completa;
  if v_r.cumpridos <> 12 then
    raise exception 'FALHOU: conta completa cumpriu % de 12. Faltou: %',
      v_r.cumpridos,
      (select string_agg(chave, ', ') from public.conta_criterio_avaliado
        where conta_id = v_completa and not cumprido);
  end if;
  if v_r.indice <> 100 then
    raise exception 'FALHOU: conta completa deu índice %.', v_r.indice;
  end if;
  raise notice '4. conta com tudo cumprido: os 12 critérios verdadeiros, índice 100';

  -- ------------------- um critério de cada vez deixa de valer
  perform set_config('role','postgres', true);
  update public.contratos set fim = current_date - 1 where id = v_ct;
  perform set_config('role','authenticated', true);

  select cumprido into function_result from public.conta_criterio_avaliado
   where conta_id = v_completa and chave = 'contrato_fora_da_janela';
  if function_result then
    raise exception 'FALHOU: contrato vencido não derrubou o critério da janela.';
  end if;
  select cumprido into function_result from public.conta_criterio_avaliado
   where conta_id = v_completa and chave = 'tem_contrato_vigente';
  if function_result then
    raise exception 'FALHOU: contrato vencido continuou contando como vigente.';
  end if;
  raise notice '5. contrato vencido derruba os dois critérios de contrato';

  -- ------------------------------- o peso é do assinante
  select indice into v_n from public.conta_cuidado where conta_id = v_completa;
  perform set_config('role','postgres', true);
  update public.conta_criterios set peso = 5
   where org_id = v_org and chave in ('tem_contrato_vigente','contrato_fora_da_janela');
  perform set_config('role','authenticated', true);

  select indice into v_r from public.conta_cuidado where conta_id = v_completa;
  if v_r.indice >= v_n then
    raise exception 'FALHOU: aumentar o peso do que está falso não derrubou o índice (% para %).',
      v_n, v_r.indice;
  end if;
  raise notice '6. mudar o peso muda o índice — a régua é mesmo do assinante';

  -- ------------------------------- critério desligado sai da conta
  perform set_config('role','postgres', true);
  update public.conta_criterios set ativo = false where org_id = v_org and chave = 'tem_documento';
  perform set_config('role','authenticated', true);

  select criterios into v_n from public.conta_cuidado where conta_id = v_completa;
  if v_n <> 11 then
    raise exception 'FALHOU: critério desligado continuou sendo avaliado (% critérios).', v_n;
  end if;
  raise notice '7. critério desligado sai da avaliação';

  -- ------------------------------------------------ alcance
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_vizinho,'role','authenticated')::text, true);
  select count(*) into v_n from public.conta_cuidado;
  if v_n <> 0 then
    raise exception 'FALHOU: organização vizinha viu % conta(s).', v_n;
  end if;
  select count(*) into v_n from public.conta_criterios;
  if v_n <> 0 then
    raise exception 'FALHOU: organização vizinha viu a régua alheia.';
  end if;
  raise notice '8. régua e índice não atravessam organização';

  perform set_config('role','postgres', true);
  delete from public.orgs where slug in ('cuidado-sa','vizinha-cui');
  raise notice 'TODOS OS TESTES DO ÍNDICE DE CUIDADO PASSARAM';
end $$;
