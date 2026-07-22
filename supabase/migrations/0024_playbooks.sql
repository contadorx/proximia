-- =====================================================================
-- Migration : 0024_playbooks.sql
-- Feature   : B31 — playbooks de cadência
-- Aplicar   : depois de 0023_pipeline.sql.
--
-- Até aqui, compromisso nascia sozinho só de data de contrato e de
-- cláusula monitorada. Todo o resto dependia de alguém lembrar — que é
-- exatamente o problema que o produto diz resolver. Sem cadência, a
-- disciplina continua sendo da pessoa, não do sistema.
--
-- Playbook é uma resposta a "quando isto acontece, faça aquilo": a
-- oportunidade entra numa etapa e os compromissos daquela etapa nascem
-- com prazo e dono. Duas escolhas de desenho:
--
--   1. O conteúdo é do assinante. O produto não traz playbook pronto —
--      trazer seria embutir o processo de uma empresa no produto.
--
--   2. O dono é uma regra, não uma pessoa. Cravar nome faria o playbook
--      quebrar na primeira mudança de equipe; a regra ("responsável da
--      oportunidade", "quem responde pela carteira", "quem moveu")
--      sobrevive à rotatividade.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Compromisso passa a aceitar origem de playbook
-- ---------------------------------------------------------------------
alter table public.compromissos drop constraint if exists compromissos_origem_check;
alter table public.compromissos add constraint compromissos_origem_check
  check (origem in ('manual', 'contrato', 'clausula', 'playbook'));

-- O índice antigo garantia um compromisso por origem no banco inteiro.
-- Isso vale para contrato e cláusula, que são um para um. Playbook é um
-- para muitos: a mesma tarefa gera compromisso em cada oportunidade que
-- passa pela etapa. Então a regra se divide.
drop index if exists public.idx_compromisso_automatico;
create unique index if not exists idx_compromisso_automatico
  on public.compromissos (origem, origem_id)
  where origem in ('contrato', 'clausula');

-- Para playbook, o que não pode repetir é a mesma tarefa em aberto na
-- mesma oportunidade. Concluída, uma nova passagem pela etapa recria.
create unique index if not exists idx_compromissos_playbook
  on public.compromissos (entidade_id, origem_id)
  where origem = 'playbook' and status = 'aberto';

-- Mudar o índice quebra o ON CONFLICT das funções que sincronizam
-- compromisso de contrato e de cláusula: elas apontavam para o predicado
-- antigo. Recriadas aqui apontando para o novo — mesma lógica, mesma
-- escrita, só o alvo do conflito muda.
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
  on conflict (origem, origem_id) where origem in ('contrato', 'clausula')
  do update set
    vence_em  = excluded.vence_em,
    titulo    = excluded.titulo,
    descricao = excluded.descricao,
    status    = case when public.compromissos.status = 'cancelado'
                     then 'aberto' else public.compromissos.status end;

  return new;
end;
$$;

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
  on conflict (origem, origem_id) where origem in ('contrato', 'clausula')
  do update set
    vence_em  = excluded.vence_em,
    titulo    = excluded.titulo,
    descricao = excluded.descricao,
    status    = case when public.compromissos.status = 'cancelado'
                     then 'aberto' else public.compromissos.status end;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Playbooks e suas tarefas
-- ---------------------------------------------------------------------
create table if not exists public.playbooks (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  nome       text not null,
  descricao  text,

  -- Por ora, um gatilho só: a oportunidade entrar em determinada etapa.
  -- A coluna existe para os próximos sem quebrar o que já roda.
  gatilho    text not null default 'oportunidade_fase'
               check (gatilho in ('oportunidade_fase')),
  fase       text not null check (fase in ('identificacao', 'viabilidade', 'proposta',
                                           'negociacao', 'aprovada', 'implantacao',
                                           'concluida', 'descartada')),

  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

comment on table public.playbooks is
  'Cadência: quando a oportunidade entra numa etapa, os compromissos da '
  'etapa nascem sozinhos. O conteúdo é do assinante.';

-- Um playbook ativo por etapa: dois disparando juntos criariam fila
-- duplicada sem que ninguém percebesse.
create unique index if not exists idx_playbook_fase_ativo
  on public.playbooks (org_id, fase) where ativo;

create table if not exists public.playbook_tarefas (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs (id) on delete cascade,
  playbook_id  uuid not null references public.playbooks (id) on delete cascade,

  titulo       text not null,
  descricao    text,
  dias_apos    integer not null default 0 check (dias_apos between 0 and 365),
  alerta_dias  integer not null default 3 check (alerta_dias between 0 and 90),

  -- Regra de dono, não pessoa: sobrevive à troca de equipe.
  dono_regra   text not null default 'responsavel_entidade'
                 check (dono_regra in ('responsavel_entidade', 'responsavel_carteira', 'quem_moveu')),

  ordem        integer not null default 0,
  criado_em    timestamptz not null default now()
);

create index if not exists idx_tarefas_playbook on public.playbook_tarefas (playbook_id, ordem);

-- ---------------------------------------------------------------------
-- 3. O gatilho
-- ---------------------------------------------------------------------
create or replace function public.aplicar_playbook()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_playbook uuid;
  v_tarefa   record;
  v_dono     uuid;
  v_quem     uuid := auth.uid();
begin
  if new.fase is not distinct from old.fase then
    return new;
  end if;

  select id into v_playbook
    from public.playbooks
   where org_id = new.org_id and fase = new.fase and ativo
   limit 1;

  if v_playbook is null then
    return new;
  end if;

  for v_tarefa in
    select * from public.playbook_tarefas where playbook_id = v_playbook order by ordem, criado_em
  loop
    -- Não recria o que já está aberto: uma oportunidade que volta para a
    -- mesma etapa não deve duplicar a fila de quem já está tocando.
    if exists (
      select 1 from public.compromissos k
       where k.entidade_tipo = 'oportunidade'
         and k.entidade_id = new.id
         and k.origem = 'playbook'
         and k.origem_id = v_tarefa.id
         and k.status = 'aberto'
    ) then
      continue;
    end if;

    v_dono := case v_tarefa.dono_regra
      when 'quem_moveu' then coalesce(v_quem, new.responsavel_id)
      when 'responsavel_carteira' then public.responsavel_primario(new.carteira_id)
      else coalesce(new.responsavel_id, public.responsavel_primario(new.carteira_id))
    end;

    insert into public.compromissos
      (org_id, carteira_id, entidade_tipo, entidade_id, titulo, descricao,
       vence_em, dono_id, alerta_dias, origem, origem_id, criado_por)
    values
      (new.org_id, new.carteira_id, 'oportunidade', new.id,
       v_tarefa.titulo, v_tarefa.descricao,
       current_date + v_tarefa.dias_apos, v_dono, v_tarefa.alerta_dias,
       'playbook', v_tarefa.id, v_quem);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_aplicar_playbook on public.oportunidades;
create trigger trg_aplicar_playbook
  after update on public.oportunidades
  for each row execute function public.aplicar_playbook();

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.playbooks        enable row level security;
alter table public.playbook_tarefas enable row level security;

drop policy if exists playbooks_le on public.playbooks;
create policy playbooks_le on public.playbooks
  for select to authenticated using (public.e_membro(org_id));

drop policy if exists playbooks_escreve on public.playbooks;
create policy playbooks_escreve on public.playbooks
  for all to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));

drop policy if exists tarefas_le on public.playbook_tarefas;
create policy tarefas_le on public.playbook_tarefas
  for select to authenticated using (public.e_membro(org_id));

drop policy if exists tarefas_escreve on public.playbook_tarefas;
create policy tarefas_escreve on public.playbook_tarefas
  for all to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));

grant select, insert, update, delete on public.playbooks        to authenticated;
grant select, insert, update, delete on public.playbook_tarefas to authenticated;
