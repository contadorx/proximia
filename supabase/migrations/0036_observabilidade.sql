-- =====================================================================
-- Migration : 0036_observabilidade.sql
-- Aplicar   : depois de 0035_correcao_rls_escrita_cruzada.sql (build b44).
--
-- O que resolve, na ordem em que a falta dói:
--
--   1. A rotina diária (/api/cron/extratos) pode falhar em silêncio hoje.
--      Nenhuma das cinco chamadas RPC dela verifica erro — a rotina pode
--      falhar em TODAS as organizações e ainda responder HTTP 200. Se ela
--      não roda, o mês fica com buraco no histórico e ninguém sabe.
--
--   2. Não existe medição de disponibilidade. Os Termos prometem 99,5%
--      em 12 meses com crédito de um mês em caso de descumprimento — e
--      nada mede isso.
--
-- A escolha de projeto: o diário mora no próprio Postgres, não numa
-- ferramenta de terceiro. Motivos: custo fixo zero, nenhum dado de
-- negócio saindo de casa, e a mesma janela de manutenção do resto. O que
-- sai para fora (rastreamento de erro) leva só identificador, nunca
-- conteúdo — isso está no código da aplicação, não aqui.
-- =====================================================================

-- ------------------------------------------------------ diário da rotina
create table if not exists public.rotina_execucoes (
  id            uuid primary key default gen_random_uuid(),
  rotina        text not null default 'extratos',
  iniciada_em   timestamptz not null default now(),
  concluida_em  timestamptz,

  -- 'ok' | 'parcial' | 'falhou'. Parcial é o caso importante: a rotina
  -- terminou, mas alguma organização ficou para trás.
  situacao      text not null default 'executando'
                check (situacao in ('executando', 'ok', 'parcial', 'falhou')),

  orgs_total    integer not null default 0,
  orgs_ok       integer not null default 0,
  orgs_falhas   integer not null default 0,

  -- Uma linha por organização que falhou, com o motivo. Sem dado de
  -- negócio: identificador e mensagem técnica.
  falhas        jsonb not null default '[]'::jsonb,

  duracao_ms    integer,
  detalhe       text
);

create index if not exists idx_rotina_recente
  on public.rotina_execucoes (rotina, iniciada_em desc);

alter table public.rotina_execucoes enable row level security;

-- Só quem opera a plataforma lê o diário: é informação da operação, não
-- do assinante.
drop policy if exists rotina_le on public.rotina_execucoes;
create policy rotina_le on public.rotina_execucoes
  for select to authenticated
  using (public.e_admin_plataforma());

-- A escrita é do serviço (cron). Nenhuma política de escrita para o papel
-- da aplicação — de propósito.

-- ------------------------------------------------- abrir e fechar a corrida
create or replace function public.rotina_iniciar(p_rotina text default 'extratos')
returns uuid
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  insert into public.rotina_execucoes (rotina) values (p_rotina) returning id;
$$;

create or replace function public.rotina_concluir(
  p_id uuid, p_total int, p_ok int, p_falhas jsonb, p_detalhe text default null)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  update public.rotina_execucoes set
    concluida_em = now(),
    orgs_total   = p_total,
    orgs_ok      = p_ok,
    orgs_falhas  = jsonb_array_length(coalesce(p_falhas, '[]'::jsonb)),
    falhas       = coalesce(p_falhas, '[]'::jsonb),
    duracao_ms   = extract(milliseconds from (now() - iniciada_em))::int
                   + extract(seconds from (now() - iniciada_em))::int * 1000,
    detalhe      = p_detalhe,
    situacao     = case
                     when jsonb_array_length(coalesce(p_falhas, '[]'::jsonb)) = 0 then 'ok'
                     when p_ok = 0 then 'falhou'
                     else 'parcial'
                   end
  where id = p_id;
$$;

revoke execute on function public.rotina_iniciar(text) from public;
revoke execute on function public.rotina_concluir(uuid, int, int, jsonb, text) from public;

-- ------------------------------------------- o caso "nem chegou a rodar"
-- O alerta mais difícil é o do silêncio: nada falhou porque nada rodou.
-- Esta função responde "a rotina está saudável?" e é o que o monitor
-- externo consulta.
create or replace function public.rotina_saude(p_rotina text default 'extratos')
returns table (
  situacao       text,
  ultima_em      timestamptz,
  horas_atras    numeric,
  ultima_falhas  integer,
  detalhe        text
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with ultima as (
    select * from public.rotina_execucoes
    where rotina = p_rotina and concluida_em is not null
    order by iniciada_em desc limit 1
  )
  select
    case
      when (select count(*) from ultima) = 0 then 'nunca_rodou'
      when extract(epoch from (now() - (select concluida_em from ultima))) / 3600 > 26 then 'atrasada'
      when (select situacao from ultima) = 'falhou' then 'falhou'
      when (select situacao from ultima) = 'parcial' then 'parcial'
      else 'ok'
    end,
    (select concluida_em from ultima),
    round(extract(epoch from (now() - (select concluida_em from ultima))) / 3600, 1),
    (select orgs_falhas from ultima),
    case
      when (select count(*) from ultima) = 0
        then 'A rotina nunca registrou uma execução concluída.'
      when extract(epoch from (now() - (select concluida_em from ultima))) / 3600 > 26
        then 'Passou de 26 horas sem rodar — o agendamento pode estar desligado.'
      when (select orgs_falhas from ultima) > 0
        then (select orgs_falhas from ultima) || ' organização(ões) ficaram para trás na última execução.'
      else 'Última execução completa.'
    end;
$$;

revoke execute on function public.rotina_saude(text) from public;
grant  execute on function public.rotina_saude(text) to authenticated;

-- A janela é 26 horas, não 24, de propósito: a rotina diária tem folga
-- para atrasar um pouco (fila da plataforma, horário de verão) sem
-- disparar alarme falso. Passou disso, é problema de verdade.

-- ------------------------------------------------ medição de disponibilidade
-- Um ping por minuto vindo do monitor externo. É o que sustenta — ou
-- desmente — o número dos Termos.
create table if not exists public.disponibilidade (
  minuto      timestamptz primary key,
  saudavel    boolean not null,
  ms          integer,
  detalhe     text
);

create index if not exists idx_disponibilidade_ruim
  on public.disponibilidade (minuto desc) where not saudavel;

alter table public.disponibilidade enable row level security;

drop policy if exists disponibilidade_le on public.disponibilidade;
create policy disponibilidade_le on public.disponibilidade
  for select to authenticated
  using (public.e_admin_plataforma());

create or replace function public.registrar_ping(p_saudavel boolean, p_ms int, p_detalhe text default null)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  insert into public.disponibilidade (minuto, saudavel, ms, detalhe)
  values (date_trunc('minute', now()), p_saudavel, p_ms, p_detalhe)
  on conflict (minuto) do update set
    saudavel = public.disponibilidade.saudavel and excluded.saudavel,
    ms       = greatest(public.disponibilidade.ms, excluded.ms),
    detalhe  = coalesce(excluded.detalhe, public.disponibilidade.detalhe);
$$;

revoke execute on function public.registrar_ping(boolean, int, text) from public;

-- O número dos Termos, calculado do que foi medido — e honesto sobre a
-- cobertura: se o monitor só mediu 30% dos minutos do período, o
-- resultado diz isso, em vez de fingir 100%.
create or replace function public.disponibilidade_periodo(
  p_inicio timestamptz, p_fim timestamptz default now())
returns table (
  minutos_medidos    bigint,
  minutos_esperados  bigint,
  cobertura_pct      numeric,
  minutos_fora       bigint,
  disponibilidade_pct numeric,
  sustenta_995       boolean
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with m as (
    select count(*) medidos, count(*) filter (where not saudavel) fora
    from public.disponibilidade
    where minuto >= p_inicio and minuto < p_fim
  ), e as (
    select greatest(1, floor(extract(epoch from (p_fim - p_inicio)) / 60))::bigint esperados
  )
  select
    m.medidos, e.esperados,
    round(m.medidos * 100.0 / e.esperados, 2),
    m.fora,
    case when m.medidos = 0 then null
         else round((m.medidos - m.fora) * 100.0 / m.medidos, 3) end,
    case when m.medidos = 0 then false
         else (m.medidos - m.fora) * 100.0 / m.medidos >= 99.5
              and m.medidos * 100.0 / e.esperados >= 95 end
  from m, e;
$$;

revoke execute on function public.disponibilidade_periodo(timestamptz, timestamptz) from public;
grant  execute on function public.disponibilidade_periodo(timestamptz, timestamptz) to authenticated;

-- sustenta_995 exige DUAS coisas: disponibilidade >= 99,5% e cobertura de
-- medição >= 95%. Sem a segunda, o primeiro número não defende nada — é
-- fácil ter 100% de disponibilidade medindo só quando está no ar.
