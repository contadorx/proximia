-- =====================================================================
-- Enriquecimento por CNPJ — as regras que vivem no banco.
--
-- O que se prova aqui:
--   1. Nasce desligado. Com o interruptor desligado, não aplica nada.
--   2. NUNCA sobrescreve o que a pessoa escreveu — preenche só vazio.
--   3. Quem não pode escrever na conta não aplica.
--   4. A procedência fica registrada na conta.
--   5. O registro de consultas respeita o alcance da organização.
-- =====================================================================

do $$
declare
  v_org uuid; v_org2 uuid;
  v_dono uuid; v_focal uuid; v_vizinho uuid;
  v_cart uuid; v_conta uuid; v_conta_cheia uuid;
  v_n integer;
  v_txt text;
  v_erro text;
begin
  select id into v_dono     from auth.users where email = 'gestor@exemplo.com';
  select id into v_focal    from auth.users where email = 'focal@exemplo.com';
  select id into v_vizinho  from auth.users where email = 'analista@exemplo.com';

  insert into public.orgs (nome, slug) values ('Enriquece SA', 'enriquece-sa') returning id into v_org;
  insert into public.orgs (nome, slug) values ('Vizinha CNPJ', 'vizinha-cnpj') returning id into v_org2;
  insert into public.memberships (org_id, user_id, papel) values (v_org, v_dono, 'owner');
  insert into public.memberships (org_id, user_id, papel) values (v_org2, v_vizinho, 'owner');

  insert into public.carteiras (org_id, nome) values (v_org, 'Norte') returning id into v_cart;

  -- Uma conta vazia e uma já preenchida à mão.
  insert into public.contas (org_id, carteira_id, nome, documento)
    values (v_org, v_cart, 'Vazia', '11222333000181') returning id into v_conta;
  insert into public.contas (org_id, carteira_id, nome, documento, razao_social, segmento)
    values (v_org, v_cart, 'Preenchida', '11222333000181',
            'RAZÃO QUE A EQUIPE CONFERIU', 'Segmento da operação') returning id into v_conta_cheia;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- ------------------------------------------------ 1. nasce desligado
  if (select enriquecimento_cnpj from public.orgs where id = v_org) then
    raise exception 'FALHOU: o enriquecimento nasceu ligado.';
  end if;

  begin
    perform public.aplicar_dados_receita(v_conta, 'ALFA LTDA', 'Indústria');
    raise exception 'FALHOU: aplicou com o interruptor desligado.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '1. desligado por padrão, e desligado recusa aplicar';
  end;

  -- Liga.
  perform set_config('role', 'postgres', true);
  update public.orgs set enriquecimento_cnpj = true where id = v_org;
  perform set_config('role', 'authenticated', true);

  -- ---------------------------------- 2. preenche vazio, não sobrescreve
  select public.aplicar_dados_receita(v_conta, 'ALFA INDUSTRIA LTDA', 'Fabricação') into v_n;
  if v_n <> 2 then
    raise exception 'FALHOU: preencheu % campo(s) na conta vazia (esperava 2).', v_n;
  end if;

  select razao_social into v_txt from public.contas where id = v_conta;
  if v_txt <> 'ALFA INDUSTRIA LTDA' then
    raise exception 'FALHOU: não preencheu a razão social vazia.';
  end if;
  raise notice '2. campo vazio é preenchido';

  select public.aplicar_dados_receita(v_conta_cheia, 'OUTRA RAZÃO QUALQUER', 'Outro segmento') into v_n;
  if v_n <> 0 then
    raise exception 'FALHOU: relatou % campo(s) preenchido(s) numa conta cheia.', v_n;
  end if;

  select razao_social into v_txt from public.contas where id = v_conta_cheia;
  if v_txt <> 'RAZÃO QUE A EQUIPE CONFERIU' then
    raise exception 'FALHOU: sobrescreveu o que a equipe tinha escrito (virou %).', v_txt;
  end if;

  select segmento into v_txt from public.contas where id = v_conta_cheia;
  if v_txt <> 'Segmento da operação' then
    raise exception 'FALHOU: sobrescreveu o segmento da operação.';
  end if;
  raise notice '3. o que a pessoa escreveu NUNCA é sobrescrito';

  -- ------------------------------------------ 4. procedência registrada
  select dados_receita_origem into v_txt from public.contas where id = v_conta;
  if v_txt is null then
    raise exception 'FALHOU: não registrou de onde vieram os dados.';
  end if;
  if (select dados_receita_em from public.contas where id = v_conta) is null then
    raise exception 'FALHOU: não registrou quando a consulta aconteceu.';
  end if;
  raise notice '4. a conta guarda de onde e quando os dados vieram';

  -- --------------------------------- 3. quem não escreve, não aplica
  insert into public.memberships (org_id, user_id, papel) values (v_org, v_focal, 'ponto_focal');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_focal, 'role', 'authenticated')::text, true);

  begin
    perform public.aplicar_dados_receita(v_conta, 'TENTATIVA', 'Tentativa');
    raise exception 'FALHOU: ponto focal sem acesso à carteira aplicou dados.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '5. quem não tem acesso à carteira não aplica nada';
  end;

  -- --------------------------------- 5. alcance do registro de consultas
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);
  perform public.registrar_consulta_cnpj(v_org, v_conta, '11222333000181', 'ok', null, 2);

  select count(*) into v_n from public.consultas_cnpj where org_id = v_org;
  if v_n < 1 then raise exception 'FALHOU: a consulta não foi registrada.'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_vizinho, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.consultas_cnpj;
  if v_n <> 0 then
    raise exception 'FALHOU: organização vizinha enxergou % consulta(s).', v_n;
  end if;
  raise notice '6. o registro de consultas fica na organização que consultou';

  begin
    perform public.registrar_consulta_cnpj(v_org, v_conta, '11222333000181', 'ok');
    raise exception 'FALHOU: forasteiro registrou consulta em organização alheia.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '7. forasteiro não registra consulta na organização de outro';
  end;

  perform set_config('role', 'postgres', true);
  delete from public.orgs where slug in ('enriquece-sa', 'vizinha-cnpj');

  raise notice 'TODOS OS TESTES DE ENRIQUECIMENTO PASSARAM';
end $$;
