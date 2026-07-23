-- =====================================================================
-- Defasagem de registro — a conta e o alcance.
--
-- O que se prova aqui:
--   1. A mediana é a distância real entre ocorrido_em e criado_em.
--   2. Registro com data futura não vira "defasagem negativa": sai da
--      mediana e é contado à parte.
--   3. Registro substituído (versão antiga) não entra.
--   4. Fora da janela de doze meses não entra.
--   5. A view respeita a RLS: ponto focal só vê a carteira dele, e
--      organização nenhuma enxerga a outra.
-- =====================================================================

do $$
declare
  v_org uuid; v_org2 uuid;
  v_dono uuid; v_focal uuid; v_vizinho uuid;
  v_cart uuid; v_cart2 uuid; v_cart_outra uuid;
  v_conta uuid; v_conta2 uuid; v_conta_outra uuid;
  v_reg record;
  v_n integer;
begin
  select id into v_dono  from auth.users where email = 'gestor@exemplo.com';
  select id into v_focal from auth.users where email = 'focal@exemplo.com';
  -- A organização vizinha precisa de dono PRÓPRIO: se o mesmo usuário for
  -- dono das duas, ele enxerga as duas por direito e o teste de
  -- isolamento não prova nada.
  select id into v_vizinho from auth.users where email = 'analista@exemplo.com';

  insert into public.orgs (nome, slug) values ('Defasagem SA', 'defasagem-sa') returning id into v_org;
  insert into public.orgs (nome, slug) values ('Vizinha SA', 'vizinha-def')  returning id into v_org2;
  insert into public.memberships (org_id, user_id, papel) values (v_org, v_dono, 'owner');
  insert into public.memberships (org_id, user_id, papel) values (v_org, v_focal, 'ponto_focal');
  insert into public.memberships (org_id, user_id, papel) values (v_org2, v_vizinho, 'owner');

  insert into public.carteiras (org_id, nome) values (v_org, 'Com atraso')   returning id into v_cart;
  insert into public.carteiras (org_id, nome) values (v_org, 'Em dia')       returning id into v_cart2;
  insert into public.carteiras (org_id, nome) values (v_org2, 'Da vizinha')  returning id into v_cart_outra;
  insert into public.carteira_membros (org_id, carteira_id, user_id) values (v_org, v_cart, v_focal);

  insert into public.contas (org_id, carteira_id, nome) values (v_org, v_cart, 'Conta A')  returning id into v_conta;
  insert into public.contas (org_id, carteira_id, nome) values (v_org, v_cart2, 'Conta B') returning id into v_conta2;
  insert into public.contas (org_id, carteira_id, nome) values (v_org2, v_cart_outra, 'Conta V') returning id into v_conta_outra;

  -- ------------------------------------------------ 1. a conta da mediana
  -- Cinco registros na carteira "Com atraso": 0, 2, 4, 6 e 8 dias.
  -- A mediana é 4.
  -- criado_em às 14h de hoje: horário comercial em qualquer fuso do país,
  -- longe da virada do dia. Meia-noite cravada faria a conversão de fuso
  -- jogar a data para o dia anterior e deslocar toda a medição em um dia
  -- — foi assim que a primeira versão deste teste passou pelo motivo
  -- errado.
  insert into public.registros (org_id, carteira_id, entidade_tipo, entidade_id, corpo, ocorrido_em, autor_id, criado_em)
  select v_org, v_cart, 'conta', v_conta, 'nota', (current_date - d)::date, v_dono,
         (current_date::timestamp + interval '14 hours') at time zone 'America/Sao_Paulo'
  from unnest(array[0, 2, 4, 6, 8]) d;

  select * into v_reg from public.defasagem_registro where carteira_id = v_cart;
  if v_reg.dias_mediana is distinct from 4 then
    raise exception 'FALHOU: mediana esperada 4, veio %.', v_reg.dias_mediana;
  end if;
  if v_reg.registros <> 5 then
    raise exception 'FALHOU: contou % registros, esperava 5.', v_reg.registros;
  end if;
  raise notice '1. a mediana é a distância real entre acontecer e digitar (4 dias)';

  if v_reg.no_mesmo_dia <> 1 or v_reg.acima_de_uma_semana <> 1 then
    raise exception 'FALHOU: faixas erradas (mesmo dia=%, acima de 7=%).',
      v_reg.no_mesmo_dia, v_reg.acima_de_uma_semana;
  end if;
  raise notice '2. as faixas separam mesmo dia, até uma semana e acima disso';

  -- ------------------------------------- 2. registro com data futura
  insert into public.registros (org_id, carteira_id, entidade_tipo, entidade_id, corpo, ocorrido_em, autor_id)
  values (v_org, v_cart, 'conta', v_conta, 'agendado', current_date + 10, v_dono);

  select * into v_reg from public.defasagem_registro where carteira_id = v_cart;
  if v_reg.registros_antecipados <> 1 then
    raise exception 'FALHOU: não contou o registro antecipado.';
  end if;
  if v_reg.dias_mediana is distinct from 4 then
    raise exception 'FALHOU: o antecipado entrou na mediana (virou %).', v_reg.dias_mediana;
  end if;
  raise notice '3. registro de data futura é planejamento: conta à parte e fica fora da mediana';

  -- ------------------------------------- 3. versão substituída não entra
  update public.registros set ativo = false
   where carteira_id = v_cart and corpo = 'agendado';

  select * into v_reg from public.defasagem_registro where carteira_id = v_cart;
  if v_reg.registros_antecipados <> 0 then
    raise exception 'FALHOU: registro inativo continuou contando.';
  end if;
  raise notice '4. versão substituída não entra na medição';

  -- ------------------------------------- 4. fora da janela não entra
  insert into public.registros (org_id, carteira_id, entidade_tipo, entidade_id, corpo, ocorrido_em, autor_id)
  values (v_org, v_cart, 'conta', v_conta, 'antigo', current_date - 400, v_dono);

  select * into v_reg from public.defasagem_registro where carteira_id = v_cart;
  if v_reg.registros <> 5 then
    raise exception 'FALHOU: registro de mais de 12 meses entrou (% registros).', v_reg.registros;
  end if;
  raise notice '5. fora da janela de doze meses não entra';

  -- Carteira em dia, para a leitura por carteira ter contraste.
  insert into public.registros (org_id, carteira_id, entidade_tipo, entidade_id, corpo, ocorrido_em, autor_id)
  select v_org, v_cart2, 'conta', v_conta2, 'nota', current_date, v_dono
  from generate_series(1, 4);

  -- Registro da organização vizinha, que não pode aparecer.
  insert into public.registros (org_id, carteira_id, entidade_tipo, entidade_id, corpo, ocorrido_em, autor_id)
  values (v_org2, v_cart_outra, 'conta', v_conta_outra, 'nota', current_date - 3, v_vizinho);

  -- ------------------------------------------------ 5. alcance (RLS)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_focal, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_n from public.defasagem_registro;
  if v_n <> 1 then
    raise exception 'FALHOU: ponto focal viu % carteiras na defasagem, esperava 1.', v_n;
  end if;

  select count(*) into v_n from public.defasagem_registro where carteira_id = v_cart2;
  if v_n <> 0 then
    raise exception 'FALHOU: ponto focal viu carteira que não acompanha.';
  end if;
  raise notice '6. ponto focal só enxerga a defasagem da carteira dele';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);

  select count(*) into v_n from public.defasagem_registro;
  if v_n <> 2 then
    raise exception 'FALHOU: dono viu % carteiras, esperava as 2 da organização dele.', v_n;
  end if;
  raise notice '7. o dono enxerga as carteiras da organização dele, e só elas';

  -- E a organização vizinha não aparece para ninguém de fora dela.
  select count(*) into v_n from public.defasagem_registro where carteira_id = v_cart_outra;
  if v_n <> 0 then
    raise exception 'FALHOU: carteira de outra organização visível na defasagem.';
  end if;
  raise notice '8. carteira de outra organização não aparece';

  perform set_config('role', 'postgres', true);
  delete from public.orgs where slug in ('defasagem-sa', 'vizinha-def');

  raise notice 'TODOS OS TESTES DA DEFASAGEM PASSARAM';
end $$;
