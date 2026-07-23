do $$
declare
  v_owner uuid; v_focal uuid; v_org public.orgs; v_c1 uuid; v_c2 uuid;
  v_conta1 uuid; v_conta2 uuid; v_f1 uuid; v_f2 uuid;
  v_total numeric; v_sem numeric; v_qtd int;
begin
  -- Este arquivo foi reescrito quando a captura virou evento (0022):
  -- o valor confirmado entra por public.capturas, e valor_capturado nas
  -- entidades e apenas a soma mantida por gatilho. As seis verificacoes
  -- sao as mesmas de antes; mudou o caminho de escrita.
  select id into v_owner from auth.users where email='gestor@exemplo.com';
  select id into v_focal from auth.users where email='focal@exemplo.com';
  perform set_config('request.jwt.claims', json_build_object('sub',v_owner,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_org := public.criar_organizacao('Teste Captura','teste-captura');
  perform public.vincular_membro(v_org.id,'focal@exemplo.com','ponto_focal');
  insert into public.carteiras (org_id,nome) values (v_org.id,'Norte') returning id into v_c1;
  insert into public.carteiras (org_id,nome) values (v_org.id,'Sul') returning id into v_c2;
  insert into public.carteira_membros (org_id,carteira_id,user_id) values (v_org.id,v_c1,v_focal);

  insert into public.contas (org_id,carteira_id,nome) values (v_org.id,v_c1,'Alfa') returning id into v_conta1;
  insert into public.frentes (org_id,carteira_id,titulo) values (v_org.id,v_c1,'Revisão') returning id into v_f1;
  insert into public.frentes (org_id,carteira_id,titulo) values (v_org.id,v_c1,'Outra') returning id into v_f2;

  -- O caminho oficial: cada valor confirmado e um lancamento.
  insert into public.capturas (org_id,carteira_id,entidade_tipo,entidade_id,valor,confirmado_em,autor_id)
    values (v_org.id,v_c1,'conta', v_conta1,50000, current_date - 70, v_owner),
           (v_org.id,v_c1,'frente',v_f1,   30000, current_date - 70, v_owner),
           (v_org.id,v_c1,'frente',v_f2,   20000, current_date - 5,  v_owner);

  insert into public.oportunidades (org_id,carteira_id,titulo,fase,retorno_confirmado,confirmado_em)
    values (v_org.id,v_c1,'Expansão','concluida',12000, current_date - 5);

  -- Valor sem data so existe como legado — e o unico jeito de estar sem data.
  insert into public.contas (org_id,carteira_id,nome) values (v_org.id,v_c2,'Beta') returning id into v_conta2;
  insert into public.capturas (org_id,carteira_id,entidade_tipo,entidade_id,valor,origem,descricao,autor_id)
    values (v_org.id,v_c2,'conta',v_conta2,99000,'legado','Valor anterior ao controle por eventos.',v_owner);

  select count(distinct mes) into v_qtd from public.captura_mensal where org_id=v_org.id;
  raise notice '1. série com % meses distintos', v_qtd;

  select sum(valor) into v_total from public.captura_mensal
   where org_id=v_org.id and mes = date_trunc('month', current_date)::date;
  raise notice '2. mês corrente soma % (20.000 da frente + 12.000 da oportunidade)', v_total;
  if v_total <> 32000 then raise exception 'FALHOU: soma do mes corrente.'; end if;

  select sum(valor) into v_total from public.captura_mensal where org_id=v_org.id;
  raise notice '3. total na curva: % — os 99.000 sem data ficam fora', v_total;
  if v_total <> 112000 then raise exception 'FALHOU: valor sem data entrou na curva.'; end if;

  v_sem := public.captura_sem_data(v_org.id);
  raise notice '4. captura sem data de confirmação: %', v_sem;
  if v_sem <> 99000 then raise exception 'FALHOU: contagem do que ficou de fora.'; end if;

  select count(distinct origem) into v_qtd from public.captura_mensal where org_id=v_org.id;
  raise notice '5. origens na série: % (conta, frente, oportunidade)', v_qtd;

  perform set_config('request.jwt.claims', json_build_object('sub',v_focal,'role','authenticated')::text, true);
  select coalesce(sum(valor),0) into v_total from public.captura_mensal;
  raise notice '6. ponto focal vê % — só a carteira dele', v_total;
  if v_total <> 112000 then raise exception 'FALHOU: alcance da serie.'; end if;

  perform set_config('role','postgres', true);
  delete from public.orgs where id=v_org.id;
  raise notice 'TODOS OS TESTES DA SÉRIE PASSARAM';
end $$;
