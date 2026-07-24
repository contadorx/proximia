-- =====================================================================
-- Cobertura por conta — a matriz que substitui o whitespace.
--
-- O que se prova aqui:
--   1. Conta sem iniciativa de um tipo aparece como lacuna.
--   2. Iniciativa DESCARTADA conta como tentativa, não como lacuna —
--      assunto encerrado não é espaço em branco.
--   3. Tipo desativado sai da matriz (não vira lacuna eterna).
--   4. Conta encerrada sai da matriz.
--   5. A cobertura por carteira é contagem, e bate com a matriz.
--   6. A RLS vale: ponto focal e organização vizinha.
-- =====================================================================

do $$
declare
  v_org uuid; v_org2 uuid;
  v_dono uuid; v_focal uuid; v_vizinho uuid;
  v_cart uuid; v_cart2 uuid; v_cart_outra uuid;
  v_c1 uuid; v_c2 uuid; v_encerrada uuid; v_conta_outra uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t_outra uuid;
  v_n integer; v_reg record;
begin
  select id into v_dono    from auth.users where email = 'gestor@exemplo.com';
  select id into v_focal   from auth.users where email = 'focal@exemplo.com';
  select id into v_vizinho from auth.users where email = 'analista@exemplo.com';

  insert into public.orgs (nome, slug) values ('Cobertura SA','cobertura-sa') returning id into v_org;
  insert into public.orgs (nome, slug) values ('Vizinha Cob','vizinha-cob')   returning id into v_org2;
  insert into public.memberships (org_id,user_id,papel) values (v_org, v_dono,'owner');
  insert into public.memberships (org_id,user_id,papel) values (v_org, v_focal,'ponto_focal');
  insert into public.memberships (org_id,user_id,papel) values (v_org2, v_vizinho,'owner');

  insert into public.carteiras (org_id,nome) values (v_org,'Norte') returning id into v_cart;
  insert into public.carteiras (org_id,nome) values (v_org,'Sul')   returning id into v_cart2;
  insert into public.carteiras (org_id,nome) values (v_org2,'Deles') returning id into v_cart_outra;
  insert into public.carteira_membros (org_id,carteira_id,user_id) values (v_org,v_cart,v_focal);

  -- Três tipos de iniciativa no catálogo do assinante, um deles desativado.
  insert into public.oportunidade_catalogo (org_id,nome) values (v_org,'Extensão de rede') returning id into v_t1;
  insert into public.oportunidade_catalogo (org_id,nome) values (v_org,'Água de reúso')    returning id into v_t2;
  insert into public.oportunidade_catalogo (org_id,nome,ativo) values (v_org,'Descontinuado',false) returning id into v_t3;
  insert into public.oportunidade_catalogo (org_id,nome) values (v_org2,'Coisa deles')     returning id into v_t_outra;

  insert into public.contas (org_id,carteira_id,nome) values (v_org,v_cart,'Alfa')  returning id into v_c1;
  insert into public.contas (org_id,carteira_id,nome) values (v_org,v_cart2,'Beta') returning id into v_c2;
  insert into public.contas (org_id,carteira_id,nome,status)
    values (v_org,v_cart,'Encerrada','encerrada') returning id into v_encerrada;
  insert into public.contas (org_id,carteira_id,nome) values (v_org2,v_cart_outra,'Deles') returning id into v_conta_outra;

  -- Alfa: uma iniciativa concluída de extensão, e uma descartada de reúso.
  insert into public.oportunidades (org_id,carteira_id,conta_id,catalogo_id,titulo,fase)
    values (v_org,v_cart,v_c1,v_t1,'Extensão Alfa','concluida');
  insert into public.oportunidades (org_id,carteira_id,conta_id,catalogo_id,titulo,fase,motivo_descarte)
    values (v_org,v_cart,v_c1,v_t2,'Reúso Alfa','descartada','cliente sem interesse');

  -- ------------------------------------------------ 1. lacuna aparece
  select * into v_reg from public.cobertura_conta
   where conta_id = v_c2 and catalogo_id = v_t1;
  if v_reg.iniciativas <> 0 then
    raise exception 'FALHOU: Beta deveria estar sem iniciativa de extensão.';
  end if;
  raise notice '1. conta sem iniciativa de um tipo aparece como lacuna';

  -- ---------------------------- 2. descartada conta como tentativa
  select * into v_reg from public.cobertura_conta
   where conta_id = v_c1 and catalogo_id = v_t2;
  if v_reg.iniciativas <> 1 or v_reg.descartadas <> 1 then
    raise exception 'FALHOU: descartada não contou como tentativa (% iniciativas).', v_reg.iniciativas;
  end if;
  raise notice '2. iniciativa descartada conta como tentativa — assunto encerrado não é espaço em branco';

  select * into v_reg from public.cobertura_conta
   where conta_id = v_c1 and catalogo_id = v_t1;
  if v_reg.ganhas <> 1 then
    raise exception 'FALHOU: não contou a iniciativa ganha.';
  end if;
  raise notice '3. ganha, perdida e em andamento aparecem separadas';

  -- ------------------------------------- 3. tipo desativado sai
  select count(*) into v_n from public.cobertura_conta where catalogo_id = v_t3;
  if v_n <> 0 then
    raise exception 'FALHOU: tipo desativado continuou gerando lacuna (% linhas).', v_n;
  end if;
  raise notice '4. tipo desativado sai da matriz — não vira lacuna eterna';

  -- ------------------------------------- 4. conta encerrada sai
  select count(*) into v_n from public.cobertura_conta where conta_id = v_encerrada;
  if v_n <> 0 then
    raise exception 'FALHOU: conta encerrada continuou na matriz.';
  end if;
  raise notice '5. conta encerrada sai da matriz';

  -- ------------------------------------- 5. o resumo bate com a matriz
  select * into v_reg from public.cobertura_carteira where carteira_id = v_cart;
  -- Alfa × 2 tipos ativos = 2 células, as duas com iniciativa.
  if v_reg.celulas <> 2 or v_reg.lacunas <> 0 then
    raise exception 'FALHOU: resumo do Norte com % células e % lacunas (esperava 2 e 0).',
      v_reg.celulas, v_reg.lacunas;
  end if;
  if v_reg.cobertura_pct is distinct from 100.0 then
    raise exception 'FALHOU: cobertura do Norte saiu % (esperava 100).', v_reg.cobertura_pct;
  end if;

  select * into v_reg from public.cobertura_carteira where carteira_id = v_cart2;
  -- Beta × 2 tipos = 2 células, nenhuma com iniciativa.
  if v_reg.lacunas <> 2 or v_reg.cobertura_pct is distinct from 0.0 then
    raise exception 'FALHOU: resumo do Sul com % lacunas e cobertura %.', v_reg.lacunas, v_reg.cobertura_pct;
  end if;
  raise notice '6. o resumo por carteira bate com a matriz';

  -- ------------------------------------------------ 6. alcance (RLS)
  insert into public.oportunidades (org_id,carteira_id,conta_id,catalogo_id,titulo,fase)
    values (v_org2,v_cart_outra,v_conta_outra,v_t_outra,'Deles','proposta');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_focal, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  select count(*) into v_n from public.cobertura_conta where carteira_id = v_cart2;
  if v_n <> 0 then
    raise exception 'FALHOU: ponto focal viu carteira que não acompanha.';
  end if;

  select count(*) into v_n from public.cobertura_conta where carteira_id = v_cart;
  if v_n = 0 then
    raise exception 'FALHOU: ponto focal não vê a carteira dele.';
  end if;
  raise notice '7. ponto focal só enxerga a cobertura da carteira dele';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role','authenticated')::text, true);
  select count(*) into v_n from public.cobertura_conta where carteira_id = v_cart_outra;
  if v_n <> 0 then
    raise exception 'FALHOU: organização vizinha apareceu na matriz.';
  end if;
  raise notice '8. organização vizinha não aparece';

  perform set_config('role','postgres', true);
  delete from public.orgs where slug in ('cobertura-sa','vizinha-cob');

  raise notice 'TODOS OS TESTES DE COBERTURA PASSARAM';
end $$;
