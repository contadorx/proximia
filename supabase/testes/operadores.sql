-- =====================================================================
-- Operadores da plataforma — promover, remover e a trava do último.
--
-- O que se prova aqui:
--   1. Só operador enxerga a lista de operadores.
--   2. Só operador promove; usuário comum não.
--   3. Ninguém remove o próprio acesso (peça a outra pessoa).
--   4. O último operador não pode ser removido pela função.
--   5. Nem por DELETE direto no banco.
--   6. Nem por cascata ao apagar o usuário no Auth — que era o caminho
--      silencioso pelo qual a janela de bootstrap reabria.
--   7. Com dois operadores, remover um funciona normalmente.
-- =====================================================================

do $$
declare
  v_a uuid; v_b uuid; v_comum uuid;
  v_n integer;
  v_erro text;
  v_lista record;
begin
  -- Estado limpo: esta suíte compartilha o banco.
  delete from public.plataforma_admins;

  insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-4000-cccc-000000000001', 'op-a@exemplo.com',    '{"nome":"Operadora A"}'),
    ('00000000-0000-4000-cccc-000000000002', 'op-b@exemplo.com',    '{"nome":"Operador B"}'),
    ('00000000-0000-4000-cccc-000000000003', 'comum@exemplo.com',   '{"nome":"Pessoa comum"}')
  on conflict (id) do nothing;

  select id into v_a     from auth.users where email = 'op-a@exemplo.com';
  select id into v_b     from auth.users where email = 'op-b@exemplo.com';
  select id into v_comum from auth.users where email = 'comum@exemplo.com';

  -- Primeiro operador entra por provisionamento, como manda o guia.
  insert into public.plataforma_admins (user_id, nome) values (v_a, 'Operadora A');

  -- ------------------------------------------- 1. só operador vê a lista
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_comum, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.operadores_da_plataforma();
    raise exception 'FALHOU: usuário comum listou os operadores.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '1. usuário comum não enxerga a lista de operadores';
  end;

  -- --------------------------------------------- 2. só operador promove
  begin
    perform public.promover_admin_plataforma('comum@exemplo.com');
    raise exception 'FALHOU: usuário comum se promoveu com a tabela cheia.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '2. com operador existente, ninguém se autopromove';
  end;

  -- Agora como operadora A.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

  select count(*) into v_n from public.operadores_da_plataforma();
  if v_n <> 1 then
    raise exception 'FALHOU: a lista trouxe % operador(es), esperava 1.', v_n;
  end if;

  select * into v_lista from public.operadores_da_plataforma() limit 1;
  if v_lista.email <> 'op-a@exemplo.com' or not v_lista.sou_eu then
    raise exception 'FALHOU: a lista não traz e-mail ou não marca quem sou eu.';
  end if;
  raise notice '3. a lista traz nome, e-mail e marca a própria linha';

  -- ------------------------------------------- 3. não remove a si mesmo
  begin
    perform public.remover_admin_plataforma(v_a);
    raise exception 'FALHOU: removeu o próprio acesso de operador.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '4. ninguém remove o próprio acesso de operador';
  end;

  -- --------------------------------- 4 e 5. o último não sai, de jeito nenhum
  perform set_config('role', 'postgres', true);
  begin
    delete from public.plataforma_admins where user_id = v_a;
    raise exception 'FALHOU: DELETE direto esvaziou a operação.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '5. DELETE direto no último operador é recusado';
  end;

  -- ------------------------------------------------ 6. nem por cascata
  -- Este é o caminho silencioso: apagar o usuário no painel do Supabase
  -- levava a linha de operador junto e reabria a janela de bootstrap.
  begin
    delete from auth.users where id = v_a;
    raise exception 'FALHOU: apagar o usuário no Auth esvaziou a operação por cascata.';
  exception when others then
    v_erro := sqlerrm;
    if v_erro like 'FALHOU%' then raise; end if;
    raise notice '6. apagar o usuário do último operador falha alto, em vez de esvaziar em silêncio';
  end;

  select count(*) into v_n from public.plataforma_admins;
  if v_n <> 1 then
    raise exception 'FALHOU: a operação ficou com % operador(es) depois das tentativas.', v_n;
  end if;

  -- --------------------------- 7. com dois, remover um funciona
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  perform public.promover_admin_plataforma('op-b@exemplo.com');
  select count(*) into v_n from public.plataforma_admins;
  if v_n <> 2 then
    raise exception 'FALHOU: promoção pela operadora não funcionou (% operadores).', v_n;
  end if;
  raise notice '7. operador promove outro pela plataforma';

  perform public.remover_admin_plataforma(v_b);
  select count(*) into v_n from public.plataforma_admins;
  if v_n <> 1 then
    raise exception 'FALHOU: remoção com dois operadores não funcionou.';
  end if;
  raise notice '8. com dois operadores, remover um funciona';

  -- E agora o usuário do Auth pode ser apagado, porque não é o último.
  perform set_config('role', 'postgres', true);
  perform public.promover_admin_plataforma('op-b@exemplo.com');
  delete from auth.users where id = v_b;
  select count(*) into v_n from public.plataforma_admins;
  if v_n <> 1 then
    raise exception 'FALHOU: cascata não funcionou quando havia outro operador.';
  end if;
  raise notice '9. havendo outro operador, apagar um usuário no Auth funciona normalmente';

  -- Limpeza. A trava do último operador é justamente o que impede um
  -- delete solto aqui — então desligá-la é o ato deliberado previsto na
  -- migration. Se este trecho falhar, a trava está funcionando.
  alter table public.plataforma_admins disable trigger trg_proteger_ultimo_operador;
  delete from public.plataforma_admins;
  alter table public.plataforma_admins enable trigger trg_proteger_ultimo_operador;
  delete from auth.users where email in ('op-a@exemplo.com', 'op-b@exemplo.com', 'comum@exemplo.com');

  raise notice 'TODOS OS TESTES DE OPERADOR DA PLATAFORMA PASSARAM';
end $$;
