-- =====================================================================
-- Migration : 0027_historico_estado.sql
-- Feature   : B36 — histórico de estado
-- Aplicar   : depois de 0026_exportacoes.sql.
--
-- O banco guarda estado atual, não histórico de estado. "Qual era o
-- potencial em janeiro?" e "quantos contratos estavam vencidos em março?"
-- não têm resposta, porque esses números são recalculados a cada consulta
-- e o valor de ontem não ficou em lugar nenhum.
--
-- Isso não se resolve com gráfico melhor. Resolve-se guardando fotos — e
-- fotos só existem a partir do dia em que se começa a tirar. Por isso
-- esta migration vem antes das telas de relatório: cada semana de espera
-- é uma semana de série que não vai existir.
--
-- Duas peças:
--   1. Uma foto mensal dos números de cada carteira.
--   2. O registro de cada mudança de etapa das oportunidades, que é o que
--      permite saber onde o funil trava — hoje só se sabe há quanto tempo
--      a oportunidade está na etapa atual.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Foto mensal da carteira
-- ---------------------------------------------------------------------
create table if not exists public.fotos_carteira (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.orgs (id) on delete cascade,
  carteira_id             uuid not null references public.carteiras (id) on delete cascade,
  referencia              date not null,

  contas_total            integer not null default 0,
  contas_potencial        numeric(14, 2) not null default 0,
  contas_capturado        numeric(14, 2) not null default 0,
  frentes_abertas         integer not null default 0,
  frentes_potencial       numeric(14, 2) not null default 0,
  frentes_capturado       numeric(14, 2) not null default 0,
  contratos_vencidos      integer not null default 0,
  contratos_janela        integer not null default 0,
  oportunidades_abertas   integer not null default 0,
  oportunidades_investimento numeric(14, 2) not null default 0,
  compromissos_abertos    integer not null default 0,
  compromissos_atrasados  integer not null default 0,
  alertas_abertos         integer not null default 0,
  score_maturidade        numeric(5, 2),

  criado_em               timestamptz not null default now(),
  unique (carteira_id, referencia)
);

comment on table public.fotos_carteira is
  'Retrato dos números de uma carteira num mês. Escrita só pela rotina; '
  'nunca corrigida depois — foto retocada não serve de série histórica.';

create index if not exists idx_fotos_org on public.fotos_carteira (org_id, referencia);

-- Tira a foto do mês corrente. Rodar duas vezes no mesmo mês atualiza a
-- foto em vez de duplicar: até o mês fechar, o retrato é do dia.
create or replace function public.tirar_foto(p_org uuid, p_referencia date default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ref   date := coalesce(p_referencia, date_trunc('month', current_date)::date);
  v_qtd   integer;
begin
  insert into public.fotos_carteira (
    org_id, carteira_id, referencia,
    contas_total, contas_potencial, contas_capturado,
    frentes_abertas, frentes_potencial, frentes_capturado,
    contratos_vencidos, contratos_janela,
    oportunidades_abertas, oportunidades_investimento,
    compromissos_abertos, compromissos_atrasados,
    alertas_abertos, score_maturidade
  )
  select
    r.org_id, r.carteira_id, v_ref,
    r.contas_total, r.contas_potencial, r.contas_capturado,
    r.frentes_abertas, r.frentes_potencial, r.frentes_capturado,
    r.contratos_vencidos, r.contratos_janela,
    r.oportunidades_abertas, r.oportunidades_investimento,
    r.compromissos_abertos, r.compromissos_atrasados,
    (select count(*) from public.alertas a
      where a.carteira_id = r.carteira_id and a.status = 'aberto'),
    r.score_maturidade
  from public.carteira_resumo r
  where r.org_id = p_org
  on conflict (carteira_id, referencia) do update set
    contas_total               = excluded.contas_total,
    contas_potencial           = excluded.contas_potencial,
    contas_capturado           = excluded.contas_capturado,
    frentes_abertas            = excluded.frentes_abertas,
    frentes_potencial          = excluded.frentes_potencial,
    frentes_capturado          = excluded.frentes_capturado,
    contratos_vencidos         = excluded.contratos_vencidos,
    contratos_janela           = excluded.contratos_janela,
    oportunidades_abertas      = excluded.oportunidades_abertas,
    oportunidades_investimento = excluded.oportunidades_investimento,
    compromissos_abertos       = excluded.compromissos_abertos,
    compromissos_atrasados     = excluded.compromissos_atrasados,
    alertas_abertos            = excluded.alertas_abertos,
    score_maturidade           = excluded.score_maturidade;

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Histórico de etapas
-- ---------------------------------------------------------------------
create table if not exists public.oportunidade_etapas (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs (id) on delete cascade,
  oportunidade_id uuid not null references public.oportunidades (id) on delete cascade,

  fase            text not null,
  entrou_em       date not null,
  saiu_em         date,
  dias            integer generated always as (
                    case when saiu_em is null then null else saiu_em - entrou_em end
                  ) stored,

  autor_id        uuid references auth.users (id) on delete set null,
  criado_em       timestamptz not null default now()
);

comment on table public.oportunidade_etapas is
  'Uma linha por passagem por etapa. Permite responder onde o funil trava '
  '— coisa que fase_desde sozinho não responde, por ser sobrescrito.';

create index if not exists idx_etapas_oportunidade
  on public.oportunidade_etapas (oportunidade_id, entrou_em);
create index if not exists idx_etapas_fase on public.oportunidade_etapas (org_id, fase);

-- Fecha a passagem anterior e abre a nova, a cada mudança de etapa.
create or replace function public.registrar_etapa()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.oportunidade_etapas (org_id, oportunidade_id, fase, entrou_em, autor_id)
    values (new.org_id, new.id, new.fase, coalesce(new.fase_desde, current_date), auth.uid());
    return new;
  end if;

  if new.fase is distinct from old.fase then
    update public.oportunidade_etapas
       set saiu_em = current_date
     where oportunidade_id = new.id and saiu_em is null;

    insert into public.oportunidade_etapas (org_id, oportunidade_id, fase, entrou_em, autor_id)
    values (new.org_id, new.id, new.fase, current_date, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_registrar_etapa on public.oportunidades;
create trigger trg_registrar_etapa
  after insert or update on public.oportunidades
  for each row execute function public.registrar_etapa();

-- Traz o que já existe: a etapa atual de cada oportunidade vira a
-- primeira linha do histórico, com a data que o registro já guardava.
insert into public.oportunidade_etapas (org_id, oportunidade_id, fase, entrou_em)
select o.org_id, o.id, o.fase, o.fase_desde
  from public.oportunidades o
 where not exists (
   select 1 from public.oportunidade_etapas e where e.oportunidade_id = o.id
 );

-- ---------------------------------------------------------------------
-- 3. Tempo médio por etapa
-- ---------------------------------------------------------------------
-- Só considera passagem encerrada: etapa em curso ainda não tem duração,
-- e incluí-la puxaria a média para baixo todo dia.
drop view if exists public.tempo_por_etapa;

create view public.tempo_por_etapa
with (security_invoker = on)
as
select
  e.org_id,
  e.fase,
  count(*)                                   as passagens,
  round(avg(e.dias), 1)                      as dias_medio,
  percentile_cont(0.5) within group (order by e.dias) as dias_mediana,
  max(e.dias)                                as dias_maximo
from public.oportunidade_etapas e
where e.saiu_em is not null
group by e.org_id, e.fase;

grant select on public.tempo_por_etapa to authenticated;

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.fotos_carteira       enable row level security;
alter table public.oportunidade_etapas  enable row level security;

drop policy if exists fotos_le on public.fotos_carteira;
create policy fotos_le on public.fotos_carteira
  for select to authenticated using (public.tem_acesso_carteira(carteira_id));

-- Sem política de escrita: a foto é tirada pela rotina, com privilégio.
-- Foto que alguém pode ajustar depois não serve de série histórica.

drop policy if exists etapas_le on public.oportunidade_etapas;
create policy etapas_le on public.oportunidade_etapas
  for select to authenticated using (public.e_membro(org_id));

grant select on public.fotos_carteira      to authenticated;
grant select on public.oportunidade_etapas to authenticated;
grant execute on function public.tirar_foto(uuid, date) to authenticated;
