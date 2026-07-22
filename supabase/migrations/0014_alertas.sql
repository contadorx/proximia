-- =====================================================================
-- Migration : 0014_alertas.sql
-- Feature   : F19 — alertas proativos (fase 2)
-- O que faz : o sistema passa a falar antes de alguém perguntar. Uma
--             rotina diária varre a operação e abre alerta para o que
--             está saindo do trilho.
-- Aplicar   : depois de 0013_panorama_oportunidades_convites.sql.
--
-- Regras de convivência com quem usa:
--   1. Alerta não duplica. Cada situação tem uma chave, e a rotina
--      reabre a existente em vez de criar outra igual.
--   2. Alerta some sozinho quando a causa some — contrato renovado,
--      compromisso concluído. Ninguém precisa limpar caixa de entrada.
--   3. Alerta pode ser silenciado. Se a pessoa já sabe e decidiu conviver
--      com aquilo, o sistema para de insistir naquele caso específico.
-- =====================================================================

create table if not exists public.alertas (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs (id) on delete cascade,
  carteira_id  uuid not null references public.carteiras (id) on delete cascade,

  tipo         text not null check (tipo in (
                 'contrato_vencido', 'contrato_janela', 'compromisso_atrasado',
                 'carteira_parada', 'frente_parada', 'oportunidade_parada',
                 'potencial_sem_captura')),
  severidade   text not null default 'atencao' check (severidade in ('alta', 'atencao', 'informativa')),

  entidade_tipo text check (entidade_tipo in ('carteira', 'conta', 'contrato', 'frente', 'oportunidade')),
  entidade_id   uuid,

  titulo       text not null,
  detalhe      text,

  -- Identidade da situação. É o que impede o mesmo problema de virar
  -- dez alertas ao longo de dez dias.
  chave        text not null,

  status       text not null default 'aberto' check (status in ('aberto', 'resolvido', 'silenciado')),
  criado_em    timestamptz not null default now(),
  visto_em     timestamptz,
  resolvido_em timestamptz,
  silenciado_por uuid references auth.users (id)
);

create unique index if not exists idx_alerta_chave on public.alertas (org_id, chave);
create index if not exists idx_alertas_abertos
  on public.alertas (org_id, severidade, criado_em desc) where status = 'aberto';

-- ---------------------------------------------------------------------
-- Geração
-- ---------------------------------------------------------------------
-- Recebe os limites como parâmetro: o que é "parado" muda de operação
-- para operação, e cravar 30 dias no código seria opinião disfarçada de
-- regra.
create or replace function public.gerar_alertas(
  p_org                uuid,
  p_dias_carteira      integer default 30,
  p_dias_frente        integer default 45,
  p_dias_oportunidade  integer default 60
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_abertos_antes integer;
  v_abertos_depois integer;
begin
  select count(*) into v_abertos_antes
    from public.alertas where org_id = p_org and status = 'aberto';

  -- ---------- contratos vencidos ----------
  insert into public.alertas (org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, chave)
  select
    c.org_id, c.carteira_id, 'contrato_vencido', 'alta', 'contrato', c.id,
    'Contrato vencido: ' || coalesce(c.numero, 'sem número'),
    'Venceu em ' || to_char(c.fim, 'DD/MM/YYYY') ||
      case when c.renovacao_automatica then ' e renova sozinho.' else ' e não tem renovação automática.' end,
    'contrato_vencido:' || c.id
  from public.contratos c
  where c.org_id = p_org and c.status = 'vigente' and c.fim < current_date
  on conflict (org_id, chave) do update
    set status = case when public.alertas.status = 'resolvido' then 'aberto' else public.alertas.status end,
        detalhe = excluded.detalhe;

  -- ---------- janela de renegociação aberta ----------
  insert into public.alertas (org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, chave)
  select
    c.org_id, c.carteira_id, 'contrato_janela', 'atencao', 'contrato', c.id,
    'Janela aberta: ' || coalesce(c.numero, 'sem número'),
    'A conversa deveria ter começado em ' || to_char(c.janela_renegociacao, 'DD/MM/YYYY') ||
      '. O contrato vence em ' || to_char(c.fim, 'DD/MM/YYYY') || '.',
    'contrato_janela:' || c.id
  from public.contratos c
  where c.org_id = p_org and c.status <> 'encerrado'
    and c.fim >= current_date and c.janela_renegociacao <= current_date
  on conflict (org_id, chave) do update
    set status = case when public.alertas.status = 'resolvido' then 'aberto' else public.alertas.status end,
        detalhe = excluded.detalhe;

  -- ---------- compromissos atrasados ----------
  insert into public.alertas (org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, chave)
  select
    k.org_id, k.carteira_id, 'compromisso_atrasado', 'alta', k.entidade_tipo, k.entidade_id,
    'Compromisso atrasado: ' || k.titulo,
    'Venceu em ' || to_char(k.vence_em, 'DD/MM/YYYY') || ' e continua em aberto.',
    'compromisso:' || k.id
  from public.compromissos k
  where k.org_id = p_org and k.status = 'aberto' and k.vence_em < current_date
  on conflict (org_id, chave) do update
    set status = case when public.alertas.status = 'resolvido' then 'aberto' else public.alertas.status end,
        detalhe = excluded.detalhe;

  -- ---------- carteira sem movimento ----------
  insert into public.alertas (org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, chave)
  select
    r.org_id, r.carteira_id, 'carteira_parada', 'atencao', 'carteira', r.carteira_id,
    'Sem movimento: ' || r.nome,
    'Nada registrado há ' || (current_date - r.ultima_movimentacao::date) || ' dias.',
    'carteira_parada:' || r.carteira_id
  from public.carteira_resumo r
  where r.org_id = p_org
    and r.status = 'ativa'
    and (current_date - r.ultima_movimentacao::date) >= p_dias_carteira
  on conflict (org_id, chave) do update
    set status = case when public.alertas.status = 'resolvido' then 'aberto' else public.alertas.status end,
        detalhe = excluded.detalhe;

  -- ---------- frente parada ----------
  insert into public.alertas (org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, chave)
  select
    f.org_id, f.carteira_id, 'frente_parada', 'atencao', 'frente', f.id,
    'Frente parada: ' || f.titulo,
    'Sem atualização há ' || (current_date - f.atualizado_em::date) || ' dias.',
    'frente_parada:' || f.id
  from public.frentes f
  where f.org_id = p_org
    and f.status in ('em_analise', 'em_execucao')
    and (current_date - f.atualizado_em::date) >= p_dias_frente
  on conflict (org_id, chave) do update
    set status = case when public.alertas.status = 'resolvido' then 'aberto' else public.alertas.status end,
        detalhe = excluded.detalhe;

  -- ---------- oportunidade parada na fase ----------
  insert into public.alertas (org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, chave)
  select
    o.org_id, o.carteira_id, 'oportunidade_parada', 'atencao', 'oportunidade', o.id,
    'Parada em ' || o.fase || ': ' || o.titulo,
    'Na mesma fase há ' || (current_date - o.fase_desde) || ' dias.',
    'oportunidade_parada:' || o.id
  from public.oportunidades o
  where o.org_id = p_org
    and o.fase not in ('concluida', 'descartada')
    and (current_date - o.fase_desde) >= p_dias_oportunidade
  on conflict (org_id, chave) do update
    set status = case when public.alertas.status = 'resolvido' then 'aberto' else public.alertas.status end,
        detalhe = excluded.detalhe;

  -- ---------- frente em execução sem nada capturado ----------
  insert into public.alertas (org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, chave)
  select
    f.org_id, f.carteira_id, 'potencial_sem_captura', 'informativa', 'frente', f.id,
    'Em execução sem captura: ' || f.titulo,
    'Potencial estimado registrado e nada confirmado até agora.',
    'sem_captura:' || f.id
  from public.frentes f
  where f.org_id = p_org
    and f.status = 'em_execucao'
    and f.potencial_bruto is not null and f.potencial_bruto > 0
    and coalesce(f.valor_capturado, 0) = 0
    and (current_date - f.criado_em::date) >= p_dias_frente
  on conflict (org_id, chave) do update
    set status = case when public.alertas.status = 'resolvido' then 'aberto' else public.alertas.status end,
        detalhe = excluded.detalhe;

  -- ---------- fecha o que deixou de ser verdade ----------
  -- Alerta silenciado continua silenciado: quem decidiu conviver com a
  -- situação não precisa decidir de novo.
  update public.alertas a
     set status = 'resolvido', resolvido_em = now()
   where a.org_id = p_org
     and a.status = 'aberto'
     and not exists (
       select 1 from public.contratos c
        where a.chave = 'contrato_vencido:' || c.id
          and c.status = 'vigente' and c.fim < current_date)
     and not exists (
       select 1 from public.contratos c
        where a.chave = 'contrato_janela:' || c.id
          and c.status <> 'encerrado' and c.fim >= current_date
          and c.janela_renegociacao <= current_date)
     and not exists (
       select 1 from public.compromissos k
        where a.chave = 'compromisso:' || k.id
          and k.status = 'aberto' and k.vence_em < current_date)
     and not exists (
       select 1 from public.carteira_resumo r
        where a.chave = 'carteira_parada:' || r.carteira_id
          and (current_date - r.ultima_movimentacao::date) >= p_dias_carteira)
     and not exists (
       select 1 from public.frentes f
        where a.chave = 'frente_parada:' || f.id
          and f.status in ('em_analise', 'em_execucao')
          and (current_date - f.atualizado_em::date) >= p_dias_frente)
     and not exists (
       select 1 from public.oportunidades o
        where a.chave = 'oportunidade_parada:' || o.id
          and o.fase not in ('concluida', 'descartada')
          and (current_date - o.fase_desde) >= p_dias_oportunidade)
     and not exists (
       select 1 from public.frentes f
        where a.chave = 'sem_captura:' || f.id
          and f.status = 'em_execucao'
          and f.potencial_bruto > 0 and coalesce(f.valor_capturado, 0) = 0);

  select count(*) into v_abertos_depois
    from public.alertas where org_id = p_org and status = 'aberto';

  return v_abertos_depois - v_abertos_antes;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.alertas enable row level security;

drop policy if exists alertas_le on public.alertas;
create policy alertas_le on public.alertas
  for select to authenticated using (public.tem_acesso_carteira(carteira_id));

-- Silenciar e reabrir é operação de quem trabalha na carteira. Criar
-- alerta na mão não existe: alerta nasce de fato observado.
drop policy if exists alertas_atualiza on public.alertas;
create policy alertas_atualiza on public.alertas
  for update to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id))
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

grant select, update on public.alertas to authenticated;
grant execute on function public.gerar_alertas(uuid, integer, integer, integer) to authenticated;
