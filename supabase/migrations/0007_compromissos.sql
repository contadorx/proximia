-- =====================================================================
-- Migration : 0007_compromissos.sql
-- Feature   : F7 — compromissos e alertas
-- O que faz : transforma o que foi combinado em data com dono, e gera
--             sozinho os compromissos que nascem de contrato e de
--             clausula monitorada.
-- Aplicar   : depois de 0006_registros.sql.
--
-- Compromisso gerado nao e duplicado: cada contrato e cada clausula tem
-- no maximo um compromisso automatico, que se ajusta quando a data muda
-- e se cancela quando o contrato e encerrado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Compromissos
-- ---------------------------------------------------------------------
create table if not exists public.compromissos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  carteira_id   uuid not null references public.carteiras (id) on delete cascade,

  entidade_tipo text not null check (entidade_tipo in ('carteira', 'conta', 'contrato', 'frente')),
  entidade_id   uuid not null,

  titulo        text not null check (length(trim(titulo)) > 0),
  descricao     text,
  vence_em      date not null,
  dono_id       uuid references auth.users (id) on delete set null,
  alerta_dias   integer not null default 7 check (alerta_dias between 0 and 365),

  status        text not null default 'aberto'
                  check (status in ('aberto', 'concluido', 'cancelado')),
  concluido_em  date,
  concluido_por uuid references auth.users (id) on delete set null,

  origem        text not null default 'manual'
                  check (origem in ('manual', 'contrato', 'clausula')),
  origem_id     uuid,

  criado_em     timestamptz not null default now(),
  criado_por    uuid references auth.users (id),
  atualizado_em timestamptz not null default now(),

  constraint origem_tem_referencia check (origem = 'manual' or origem_id is not null)
);

comment on table public.compromissos is
  'O seguro da promessa: o que foi combinado vira data com dono. '
  'Compromisso de origem automatica e mantido pelo proprio banco.';

create unique index if not exists idx_compromisso_automatico
  on public.compromissos (origem, origem_id) where origem <> 'manual';
create index if not exists idx_compromissos_abertos
  on public.compromissos (org_id, vence_em) where status = 'aberto';
create index if not exists idx_compromissos_entidade
  on public.compromissos (entidade_tipo, entidade_id);

drop trigger if exists trg_compromissos_atualizacao on public.compromissos;
create trigger trg_compromissos_atualizacao
  before update on public.compromissos
  for each row execute function public.marcar_atualizacao();

-- ---------------------------------------------------------------------
-- 2. Geracao a partir do contrato
-- ---------------------------------------------------------------------
create or replace function public.sincronizar_compromisso_contrato()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dono  uuid;
  v_rotulo text;
begin
  -- Contrato encerrado ou sem janela: o compromisso automatico sai de cena.
  if new.status = 'encerrado' or new.janela_renegociacao is null then
    update public.compromissos
       set status = 'cancelado'
     where origem = 'contrato' and origem_id = new.id and status = 'aberto';
    return new;
  end if;

  select c.responsavel_id into v_dono from public.contas c where c.id = new.conta_id;
  v_rotulo := coalesce('Renegociar contrato ' || new.numero, 'Renegociar contrato');

  insert into public.compromissos (
    org_id, carteira_id, entidade_tipo, entidade_id, titulo, descricao,
    vence_em, dono_id, alerta_dias, origem, origem_id, criado_por
  )
  values (
    new.org_id, new.carteira_id, 'contrato', new.id, v_rotulo,
    'Gerado pela vigência: a janela abre ' || to_char(new.janela_renegociacao, 'DD/MM/YYYY')
      || ' e o contrato vence ' || to_char(new.fim, 'DD/MM/YYYY') || '.',
    new.janela_renegociacao, v_dono, 14, 'contrato', new.id, auth.uid()
  )
  on conflict (origem, origem_id) where origem <> 'manual'
  do update set
    vence_em  = excluded.vence_em,
    titulo    = excluded.titulo,
    descricao = excluded.descricao,
    status    = case when public.compromissos.status = 'cancelado'
                     then 'aberto' else public.compromissos.status end;

  return new;
end;
$$;

drop trigger if exists trg_compromisso_contrato on public.contratos;
create trigger trg_compromisso_contrato
  after insert or update of fim, aviso_previa_dias, status, numero, conta_id on public.contratos
  for each row execute function public.sincronizar_compromisso_contrato();

-- ---------------------------------------------------------------------
-- 3. Geracao a partir da clausula monitorada
-- ---------------------------------------------------------------------
create or replace function public.sincronizar_compromisso_clausula()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contrato public.contratos;
  v_dono uuid;
begin
  if not new.monitorada or new.data_referencia is null then
    update public.compromissos
       set status = 'cancelado'
     where origem = 'clausula' and origem_id = new.id and status = 'aberto';
    return new;
  end if;

  select * into v_contrato from public.contratos where id = new.contrato_id;
  select c.responsavel_id into v_dono from public.contas c where c.id = v_contrato.conta_id;

  insert into public.compromissos (
    org_id, carteira_id, entidade_tipo, entidade_id, titulo, descricao,
    vence_em, dono_id, alerta_dias, origem, origem_id, criado_por
  )
  values (
    new.org_id, v_contrato.carteira_id, 'contrato', v_contrato.id,
    left(new.descricao, 160),
    'Cláusula acompanhada. Referência em ' || to_char(new.data_referencia, 'DD/MM/YYYY')
      || ', com aviso ' || new.antecedencia_dias || ' dias antes.',
    new.data_referencia - new.antecedencia_dias, v_dono, 7, 'clausula', new.id, auth.uid()
  )
  on conflict (origem, origem_id) where origem <> 'manual'
  do update set
    vence_em  = excluded.vence_em,
    titulo    = excluded.titulo,
    descricao = excluded.descricao,
    status    = case when public.compromissos.status = 'cancelado'
                     then 'aberto' else public.compromissos.status end;

  return new;
end;
$$;

drop trigger if exists trg_compromisso_clausula on public.contrato_clausulas;
create trigger trg_compromisso_clausula
  after insert or update of monitorada, data_referencia, antecedencia_dias, descricao
  on public.contrato_clausulas
  for each row execute function public.sincronizar_compromisso_clausula();

-- ---------------------------------------------------------------------
-- 4. Limpeza ao excluir a origem
-- ---------------------------------------------------------------------
create or replace function public.limpar_compromissos_origem()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.compromissos
   where origem = tg_argv[0] and origem_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_limpar_compromisso_contrato on public.contratos;
create trigger trg_limpar_compromisso_contrato
  before delete on public.contratos
  for each row execute function public.limpar_compromissos_origem('contrato');

drop trigger if exists trg_limpar_compromisso_clausula on public.contrato_clausulas;
create trigger trg_limpar_compromisso_clausula
  before delete on public.contrato_clausulas
  for each row execute function public.limpar_compromissos_origem('clausula');

-- ---------------------------------------------------------------------
-- 5. Recuperacao do que ja existia antes desta migration
-- ---------------------------------------------------------------------
create or replace function public.gerar_compromissos_pendentes(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_antes integer;
  v_depois integer;
begin
  if not public.pode_gerir_carteiras(p_org) then
    raise exception 'Seu perfil não permite gerar compromissos.';
  end if;

  select count(*) into v_antes from public.compromissos
   where org_id = p_org and origem <> 'manual';

  -- Reexecuta os gatilhos sem alterar nada de fato.
  update public.contratos set fim = fim where org_id = p_org;
  update public.contrato_clausulas set monitorada = monitorada where org_id = p_org;

  select count(*) into v_depois from public.compromissos
   where org_id = p_org and origem <> 'manual';

  return v_depois - v_antes;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
alter table public.compromissos enable row level security;

drop policy if exists compromissos_le on public.compromissos;
create policy compromissos_le on public.compromissos
  for select to authenticated
  using (public.tem_acesso_carteira(carteira_id));

drop policy if exists compromissos_cria on public.compromissos;
create policy compromissos_cria on public.compromissos
  for insert to authenticated
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

drop policy if exists compromissos_atualiza on public.compromissos;
create policy compromissos_atualiza on public.compromissos
  for update to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id))
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

-- Compromisso automatico nao se apaga: cancela-se. Exclusao so de
-- compromisso manual, e so por quem administra carteiras.
drop policy if exists compromissos_exclui on public.compromissos;
create policy compromissos_exclui on public.compromissos
  for delete to authenticated
  using (origem = 'manual' and public.pode_gerir_carteiras(org_id));

-- ---------------------------------------------------------------------
-- 7. Permissoes
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.compromissos to authenticated;
grant execute on function public.gerar_compromissos_pendentes(uuid) to authenticated;
