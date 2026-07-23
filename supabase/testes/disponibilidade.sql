-- =====================================================================
-- Disponibilidade — o número que se defende.
--
-- O que se prova aqui:
--   1. Minuto sem medição conta como fora do ar no número defensável.
--   2. O número medido continua existindo, para a outra pergunta.
--   3. Ping repetido no mesmo minuto não cria linha nova, e uma falha no
--      minuto contamina o minuto inteiro (não se apaga com um sucesso).
--   4. sustenta_995 só é verdadeiro com o defensável acima de 99,5%.
--   5. O serviço consegue gravar; o papel da aplicação, não.
-- =====================================================================

do $$
declare
  r record;
  v_n integer;
begin
  delete from public.disponibilidade;

  -- -------------------------------------- 1 e 2. os dois números
  -- Uma hora de período. Dez minutos medidos, um deles fora.
  insert into public.disponibilidade (minuto, saudavel, ms)
  select date_trunc('minute', now() - (g || ' minutes')::interval), g <> 3, 100
  from generate_series(1, 10) g;

  select * into r from public.disponibilidade_periodo(now() - interval '60 minutes', now());

  if r.disponibilidade_pct is distinct from 90.000 then
    raise exception 'FALHOU: medido saiu % (esperava 90).', r.disponibilidade_pct;
  end if;
  raise notice '1. sobre o que respondeu: 90%% — 9 de 10 minutos medidos';

  if r.disponibilidade_defensavel_pct is distinct from 15.000 then
    raise exception 'FALHOU: defensável saiu % (esperava 15).', r.disponibilidade_defensavel_pct;
  end if;
  raise notice '2. minuto sem medição conta como fora: 9 de 60 = 15%%';

  if r.minutos_sem_medicao <> 50 then
    raise exception 'FALHOU: minutos sem medição = % (esperava 50).', r.minutos_sem_medicao;
  end if;
  raise notice '3. a lacuna de medição é dita, não escondida';

  -- ------------------------------ 3. o minuto é um só, e a falha manda
  delete from public.disponibilidade;
  perform public.registrar_ping(true, 100, null);
  perform public.registrar_ping(false, 5000, 'banco fora');
  perform public.registrar_ping(true, 90, null);

  select count(*) into v_n from public.disponibilidade;
  if v_n <> 1 then
    raise exception 'FALHOU: três pings no mesmo minuto viraram % linhas.', v_n;
  end if;
  raise notice '4. pings do mesmo minuto ocupam uma linha só';

  select count(*) into v_n from public.disponibilidade where not saudavel;
  if v_n <> 1 then
    raise exception 'FALHOU: o sucesso apagou a falha do minuto.';
  end if;
  raise notice '5. falha no minuto não é apagada por um sucesso depois';

  -- ------------------------------------------ 4. o limite dos Termos
  delete from public.disponibilidade;
  -- 60 minutos, todos medidos e saudáveis: 100%.
  --
  -- A série vai de 0 a 59, não de 1 a 60: date_trunc arredonda o minuto
  -- para baixo, então o registro de "60 minutos atrás" cai FORA da janela
  -- e a cobertura vira 59 de 60. Detalhe de borda que só aparece quando
  -- se testa o limite — e que, num relatório real, tiraria a promessa do
  -- ar por engano.
  insert into public.disponibilidade (minuto, saudavel, ms)
  select date_trunc('minute', now() - (g || ' minutes')::interval), true, 100
  from generate_series(0, 59) g;

  select * into r from public.disponibilidade_periodo(now() - interval '60 minutes', now());
  if not r.sustenta_995 then
    raise exception 'FALHOU: 60 de 60 saudáveis não sustentou 99,5%%.';
  end if;
  raise notice '6. medição completa e sem queda sustenta os 99,5%% dos Termos';

  -- Um minuto fora em 60 = 98,3%: não sustenta.
  update public.disponibilidade set saudavel = false
   where minuto = (select max(minuto) from public.disponibilidade);

  select * into r from public.disponibilidade_periodo(now() - interval '60 minutes', now());
  if r.sustenta_995 then
    raise exception 'FALHOU: com um minuto fora em 60, sustenta_995 devia ser falso.';
  end if;
  raise notice '7. um minuto fora em sessenta já derruba a promessa';

  -- ------------------------------------------ 5. quem pode gravar
  if not has_function_privilege('service_role', 'public.registrar_ping(boolean, int, text)', 'EXECUTE') then
    raise exception 'FALHOU: o serviço não consegue gravar o ping.';
  end if;
  if has_function_privilege('authenticated', 'public.registrar_ping(boolean, int, text)', 'EXECUTE') then
    raise exception 'FALHOU: o papel da aplicação pode forjar medição de disponibilidade.';
  end if;
  raise notice '8. só o serviço grava o ping — a aplicação não forja medição';

  delete from public.disponibilidade;
  raise notice 'TODOS OS TESTES DE DISPONIBILIDADE PASSARAM';
end $$;
