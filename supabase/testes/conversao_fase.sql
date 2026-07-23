-- =====================================================================
-- Conversão por fase — a definição de "passou" e "fechou".
--
-- O que se prova aqui:
--   1. Passou pela fase é ter passagem registrada, mesmo já tendo saído.
--   2. Ganha conta em TODAS as fases por onde passou, não só na última.
--   3. Oportunidade viva fica em "em jogo" e fora do fechado.
--   4. Voltar para uma fase não conta duas vezes.
--   5. concluida e descartada não viram fase medida (seria 100% por
--      definição).
--   6. A view respeita a RLS: ponto focal e organização vizinha.
-- =====================================================================

do $$
declare
  v_org uuid; v_org2 uuid;
  v_dono uuid; v_focal uuid; v_vizinho uuid;
  v_cart uuid; v_cart2 uuid; v_cart_outra uuid;
  v_op uuid;
  v_reg record;
  v_n integer;
begin
  select id into v_dono     from auth.users where email = 'gestor@exemplo.com';
  select id into v_focal    from auth.users where email = 'focal@exemplo.com';
  select id into v_vizinho  from auth.users where email = 'analista@exemplo.com';

  insert into public.orgs (nome, slug) values ('Conversao SA', 'conversao-sa') returning id into v_org;
  insert into public.orgs (nome, slug) values ('Outra Conv',   'outra-conv')   returning id into v_org2;
  insert into public.memberships (org_id, user_id, papel) values (v_org, v_dono, 'owner');
  insert into public.memberships (org_id, user_id, papel) values (v_org, v_focal, 'ponto_focal');
  insert into public.memberships (org_id, user_id, papel) values (v_org2, v_vizinho, 'owner');

  insert into public.carteiras (org_id, nome) values (v_org, 'Norte')  returning id into v_cart;
  insert into public.carteiras (org_id, nome) values (v_org, 'Sul')    returning id into v_cart2;
  insert into public.carteiras (org_id, nome) values (v_org2, 'Deles') returning id into v_cart_outra;
  insert into public.carteira_membros (org_id, carteira_id, user_id) values (v_org, v_cart, v_focal);

  -- ---------------------------------------------------------- cenário
  -- Uma que percorre proposta → negociacao → concluida.
  insert into public.oportunidades (org_id, carteira_id, titulo, fase)
  values (v_org, v_cart, 'Ganha', 'proposta') returning id into v_op;
  update public.oportunidades set fase = 'negociacao' where id = v_op;
  update public.oportunidades set fase = 'concluida'  where id = v_op;

  -- Uma que morre na proposta.
  insert into public.oportunidades (org_id, carteira_id, titulo, fase)
  values (v_org, v_cart, 'Perdida', 'proposta') returning id into v_op;
  update public.oportunidades set fase = 'descartada', motivo_descarte = 'cliente adiou o projeto' where id = v_op;

  -- Uma que ainda está viva em negociacao.
  insert into public.oportunidades (org_id, carteira_id, titulo, fase)
  values (v_org, v_cart, 'Viva', 'proposta') returning id into v_op;
  update public.oportunidades set fase = 'negociacao' where id = v_op;

  -- Uma que volta de negociacao para proposta e depois ganha.
  insert into public.oportunidades (org_id, carteira_id, titulo, fase)
  values (v_org, v_cart2, 'Vai e volta', 'proposta') returning id into v_op;
  update public.oportunidades set fase = 'negociacao' where id = v_op;
  update public.oportunidades set fase = 'proposta'   where id = v_op;
  update public.oportunidades set fase = 'concluida'  where id = v_op;

  -- ------------------------------- 1 e 2. passou e terminou ganha
  select sum(fechadas) f, sum(ganhas) g, sum(perdidas) p, sum(em_jogo) j
    into v_reg
    from public.conversao_por_fase
   where org_id = v_org and fase = 'proposta';

  -- Passaram pela proposta: Ganha, Perdida, Viva e Vai-e-volta = 4.
  -- Fechadas: Ganha, Perdida e Vai-e-volta = 3 (2 ganhas, 1 perdida).
  if v_reg.f <> 3 or v_reg.g <> 2 or v_reg.p <> 1 then
    raise exception 'FALHOU proposta: fechadas=%, ganhas=%, perdidas=% (esperava 3/2/1).',
      v_reg.f, v_reg.g, v_reg.p;
  end if;
  raise notice '1. passou pela fase conta mesmo depois de sair dela';
  raise notice '2. a ganha conta em todas as fases por onde passou';

  -- ------------------------------------ 3. viva fica em "em jogo"
  if v_reg.j <> 1 then
    raise exception 'FALHOU: em jogo na proposta = % (esperava 1).', v_reg.j;
  end if;
  raise notice '3. oportunidade viva fica em jogo, fora do fechado';

  -- ---------------------------- 4. voltar não conta duas vezes
  select fechadas, ganhas into v_reg
    from public.conversao_por_fase
   where org_id = v_org and fase = 'proposta' and carteira_id = v_cart2;
  if v_reg.fechadas <> 1 or v_reg.ganhas <> 1 then
    raise exception 'FALHOU: quem voltou para a fase contou % vezes.', v_reg.fechadas;
  end if;
  raise notice '4. voltar para a mesma fase não infla o denominador';

  -- Negociação: Ganha, Viva e Vai-e-volta passaram; fecharam 2 (ambas ganhas).
  select sum(fechadas) f, sum(ganhas) g, sum(em_jogo) j into v_reg
    from public.conversao_por_fase where org_id = v_org and fase = 'negociacao';
  if v_reg.f <> 2 or v_reg.g <> 2 or v_reg.j <> 1 then
    raise exception 'FALHOU negociacao: fechadas=%, ganhas=%, em jogo=% (esperava 2/2/1).',
      v_reg.f, v_reg.g, v_reg.j;
  end if;
  raise notice '5. cada fase tem o próprio denominador';

  -- --------------------- 5. concluida e descartada não viram fase
  select count(*) into v_n from public.conversao_por_fase
   where org_id = v_org and fase in ('concluida', 'descartada');
  if v_n <> 0 then
    raise exception 'FALHOU: fase de encerramento entrou na medição.';
  end if;
  raise notice '6. concluida e descartada não são medidas — seria 100%% por definição';

  -- ------------------------------------------------ 6. alcance (RLS)
  insert into public.oportunidades (org_id, carteira_id, titulo, fase)
  values (v_org2, v_cart_outra, 'Da vizinha', 'proposta') returning id into v_op;
  update public.oportunidades set fase = 'concluida' where id = v_op;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_focal, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_n from public.conversao_por_fase where carteira_id = v_cart2;
  if v_n <> 0 then
    raise exception 'FALHOU: ponto focal viu carteira que não acompanha.';
  end if;

  select count(*) into v_n from public.conversao_por_fase where carteira_id = v_cart;
  if v_n = 0 then
    raise exception 'FALHOU: ponto focal não vê a carteira dele.';
  end if;
  raise notice '7. ponto focal só vê a conversão da carteira dele';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.conversao_por_fase where carteira_id = v_cart_outra;
  if v_n <> 0 then
    raise exception 'FALHOU: carteira de outra organização visível.';
  end if;
  raise notice '8. organização vizinha não aparece';

  perform set_config('role', 'postgres', true);
  delete from public.orgs where slug in ('conversao-sa', 'outra-conv');

  raise notice 'TODOS OS TESTES DA CONVERSÃO PASSARAM';
end $$;
