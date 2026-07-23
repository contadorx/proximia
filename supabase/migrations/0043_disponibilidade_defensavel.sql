-- =====================================================================
-- Migration : 0043_disponibilidade_defensavel.sql
-- Aplicar   : depois de 0042_operadores_plataforma.sql.
--
-- DOIS PROBLEMAS DA 0036, ACHADOS AO LIGAR A MEDIÇÃO
--
-- 1. O número não se defendia numa discussão.
--
--    `disponibilidade_periodo` calculava sobre os minutos MEDIDOS. Só que
--    quando a aplicação cai, ninguém registra nada — os minutos da queda
--    somem em vez de contar como fora do ar. Uma queda de três dias
--    produzia "100% de disponibilidade" com cobertura baixa.
--
--    A cobertura salvava a honestidade (sustenta_995 exigia 95%), mas o
--    número principal ainda era o otimista, e é ele que vai para a
--    conversa. Agora existem os dois, com nome que diz o que cada um é:
--
--      · disponibilidade_pct        — sobre o que foi medido. Serve para
--                                     saber se o que respondeu, respondeu bem.
--      · disponibilidade_defensavel_pct — minuto sem medição conta como
--                                     fora. É o número que se sustenta
--                                     diante de um cliente cobrando o
--                                     crédito previsto nos Termos.
--
--    `sustenta_995` passa a olhar o defensável.
--
-- 2. `registrar_ping` não era chamável por ninguém.
--
--    A 0036 revogou de PUBLIC — o que também tirou o service_role, que é
--    justamente quem precisa gravar. Na prática a tabela nunca receberia
--    uma linha. Corrigido abaixo.
-- =====================================================================

-- Trocar a lista de colunas de retorno exige recriar a função.
drop function if exists public.disponibilidade_periodo(timestamptz, timestamptz);

create function public.disponibilidade_periodo(
  p_inicio timestamptz, p_fim timestamptz default now())
returns table (
  minutos_medidos             bigint,
  minutos_esperados           bigint,
  cobertura_pct               numeric,
  minutos_fora                bigint,
  minutos_sem_medicao         bigint,
  disponibilidade_pct         numeric,
  disponibilidade_defensavel_pct numeric,
  sustenta_995                boolean
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with m as (
    select
      count(*)                                  as medidos,
      count(*) filter (where not saudavel)       as fora
    from public.disponibilidade
    where minuto >= p_inicio and minuto < p_fim
  ), e as (
    select greatest(1, floor(extract(epoch from (p_fim - p_inicio)) / 60))::bigint as esperados
  )
  select
    m.medidos,
    e.esperados,
    round(m.medidos * 100.0 / e.esperados, 2),
    m.fora,
    greatest(0, e.esperados - m.medidos),

    -- Otimista: só sobre o que respondeu.
    case when m.medidos = 0 then null
         else round((m.medidos - m.fora) * 100.0 / m.medidos, 3) end,

    -- Defensável: minuto sem medição conta como fora do ar. É o pior
    -- caso verdadeiro — e o pior caso é o que se promete em contrato.
    round((m.medidos - m.fora) * 100.0 / e.esperados, 3),

    -- Só sustenta o número dos Termos quem tem o defensável acima de
    -- 99,5%. Cobertura ruim derruba o defensável sozinha, então não
    -- precisa de segunda condição.
    (m.medidos - m.fora) * 100.0 / e.esperados >= 99.5
  from m, e;
$$;

revoke execute on function public.disponibilidade_periodo(timestamptz, timestamptz) from public, anon;
grant  execute on function public.disponibilidade_periodo(timestamptz, timestamptz) to authenticated, service_role;

-- O serviço precisa gravar o ping: é ele que a rota de saúde usa.
grant execute on function public.registrar_ping(boolean, int, text) to service_role;

-- E o diário da rotina, pelo mesmo motivo.
grant execute on function public.rotina_saude(text) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  if not has_function_privilege('service_role', 'public.registrar_ping(boolean, int, text)', 'EXECUTE') then
    raise exception 'O serviço continua sem poder gravar o ping — a medição nunca sairia do zero';
  end if;

  -- Cenário: uma hora de período, dez minutos medidos, um deles fora.
  -- Otimista = 90%. Defensável = 9 de 60 = 15%.
  delete from public.disponibilidade where minuto >= now() - interval '2 hours';
  insert into public.disponibilidade (minuto, saudavel, ms)
  select date_trunc('minute', now() - (g || ' minutes')::interval), g <> 3, 120
  from generate_series(1, 10) g;

  select * into r from public.disponibilidade_periodo(now() - interval '60 minutes', now());

  if r.disponibilidade_pct is distinct from 90.000 then
    raise exception 'Disponibilidade medida saiu % (esperava 90).', r.disponibilidade_pct;
  end if;
  if r.disponibilidade_defensavel_pct is distinct from 15.000 then
    raise exception 'Disponibilidade defensável saiu % (esperava 15).', r.disponibilidade_defensavel_pct;
  end if;
  if r.sustenta_995 then
    raise exception 'Com 15%% defensável, sustenta_995 devia ser falso.';
  end if;

  delete from public.disponibilidade where minuto >= now() - interval '2 hours';
  raise notice 'Disponibilidade: número defensável no lugar, e o serviço pode gravar o ping.';
end $$;
