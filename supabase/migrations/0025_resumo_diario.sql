-- =====================================================================
-- Migration : 0025_resumo_diario.sql
-- Feature   : B32 — alertas por e-mail
-- Aplicar   : depois de 0024_playbooks.sql.
--
-- Os alertas existem desde a B19 e nunca saíram da tela: quem não abre o
-- sistema não fica sabendo. Isso inverte a promessa do produto — ele
-- deveria avisar, não esperar ser consultado.
--
-- Duas decisões que definem o formato:
--
--   1. Um e-mail por pessoa por dia, com o que é dela. Um e-mail por
--      alerta é como se ensina alguém a criar filtro para o seu domínio.
--
--   2. Silêncio é informação. Sem nada para agir, não sai e-mail. Resumo
--      diário que chega dizendo "está tudo bem" vira ruído, e em duas
--      semanas ninguém abre — inclusive no dia em que não estava tudo bem.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. O registro de envios passa a aceitar o resumo
-- ---------------------------------------------------------------------
alter table public.envios drop constraint if exists envios_tipo_check;
alter table public.envios add constraint envios_tipo_check
  check (tipo in ('extrato', 'resumo'));

-- O resumo é por pessoa, não por carteira. A coluna existente continua
-- valendo para extrato; para resumo, ela guarda a carteira de referência
-- ou fica nula.
alter table public.envios alter column carteira_id drop not null;

-- ---------------------------------------------------------------------
-- 2. Preferência de cada pessoa
-- ---------------------------------------------------------------------
create table if not exists public.preferencias_aviso (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,

  resumo_diario  boolean not null default true,
  apenas_alta    boolean not null default false,

  atualizado_em  timestamptz not null default now(),
  unique (org_id, user_id)
);

comment on table public.preferencias_aviso is
  'Cada pessoa decide se recebe o resumo e com que corte. Sem linha, vale '
  'o padrão: recebe, com tudo.';

alter table public.preferencias_aviso enable row level security;

-- A preferência é da pessoa: ela lê e escreve a própria, e ninguém edita
-- a dos outros. Aviso que outro liga por você é spam com autorização.
drop policy if exists preferencias_le on public.preferencias_aviso;
create policy preferencias_le on public.preferencias_aviso
  for select to authenticated using (user_id = auth.uid());

drop policy if exists preferencias_escreve on public.preferencias_aviso;
create policy preferencias_escreve on public.preferencias_aviso
  for all to authenticated
  using (user_id = auth.uid() and public.e_membro(org_id))
  with check (user_id = auth.uid() and public.e_membro(org_id));

grant select, insert, update, delete on public.preferencias_aviso to authenticated;

-- ---------------------------------------------------------------------
-- 3. Quem tem o que hoje
-- ---------------------------------------------------------------------
-- Devolve uma linha por pessoa que tem algo exigindo ação. Quem não tem
-- nada simplesmente não aparece — é assim que o silêncio acontece.
create or replace function public.resumo_do_dia(p_org uuid)
returns table (
  user_id                uuid,
  email                  text,
  nome                   text,
  alertas_altos          bigint,
  alertas_total          bigint,
  compromissos_atrasados bigint,
  compromissos_hoje      bigint,
  apenas_alta            boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.user_id,
    p.email,
    p.nome,
    count(distinct a.id) filter (where a.severidade = 'alta')            as alertas_altos,
    count(distinct a.id)                                                 as alertas_total,
    count(distinct k.id) filter (where k.vence_em < current_date)        as compromissos_atrasados,
    count(distinct k.id) filter (where k.vence_em = current_date)        as compromissos_hoje,
    coalesce(pr.apenas_alta, false)                                      as apenas_alta
  from public.memberships m
  join public.perfis p on p.id = m.user_id
  left join public.preferencias_aviso pr on pr.org_id = m.org_id and pr.user_id = m.user_id
  left join public.alertas a
         on a.org_id = m.org_id and a.dono_id = m.user_id and a.status = 'aberto'
  left join public.compromissos k
         on k.org_id = m.org_id and k.dono_id = m.user_id and k.status = 'aberto'
        and k.vence_em <= current_date
  where m.org_id = p_org
    and m.ativo
    and p.email is not null
    and coalesce(pr.resumo_diario, true)
  group by m.user_id, p.email, p.nome, pr.apenas_alta
  having
    -- Sem nada para agir, a pessoa não entra na lista de envio.
    count(distinct a.id) filter (where a.severidade = 'alta') > 0
    or (not coalesce(pr.apenas_alta, false)
        and (count(distinct a.id) > 0
             or count(distinct k.id) filter (where k.vence_em <= current_date) > 0));
$$;

revoke execute on function public.resumo_do_dia(uuid) from public;
