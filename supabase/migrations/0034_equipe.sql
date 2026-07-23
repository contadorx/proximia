-- =====================================================================
-- Migration : 0034_equipe.sql
-- Feature   : B44 — equipe: responsável não precisa ser usuário
-- Aplicar   : depois de 0033_correcoes_auditoria.sql.
--
-- O problema real: uma operação começa a registrar carteiras, contas e
-- compromissos ANTES de todo mundo ter login. Até aqui, responsável e
-- dono referenciavam auth.users — quem ainda não aceitou convite não
-- podia responder por nada, e o dado nascia sem dono.
--
-- A saída: `equipe` é o catálogo de pessoas da operação. Toda pessoa
-- pode existir com nome e e-mail antes do acesso; quando aceita o
-- convite, o vínculo acontece sozinho, por gatilho, casando pelo e-mail
-- — e tudo o que ela já respondia passa a valer para alertas e resumo
-- diário sem redigitação.
--
-- O truque do backfill: cada usuário existente vira uma linha de equipe
-- com id = user_id. Assim, todos os responsavel_id/dono_id já gravados
-- continuam válidos quando as chaves estrangeiras são repontadas — a
-- migração não reescreve nenhum dado das fichas.
--
-- O que segue sendo de usuário (auth.users), de propósito: autoria.
-- autor_id, criado_por, concluido_por, silenciado_por registram quem FEZ
-- a ação — e ação só existe com sessão. Responder é diferente de fazer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A tabela
-- ---------------------------------------------------------------------
create table if not exists public.equipe (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,

  nome        text not null check (length(btrim(nome)) > 0),
  email       text check (email is null or position('@' in email) > 1),

  -- Preenchido quando a pessoa vira usuária. Nulo é estado legítimo:
  -- a pessoa existe na operação antes de existir no login.
  user_id     uuid references auth.users (id) on delete set null,

  ativo       boolean not null default true,
  observacao  text,

  criado_por  uuid references auth.users (id),
  criado_em   timestamptz not null default now()
);

comment on table public.equipe is
  'Pessoas da operação. Podem existir antes de ter acesso; o vínculo com '
  'o usuário acontece no aceite do convite, casando pelo e-mail.';
comment on column public.equipe.user_id is
  'Nulo enquanto a pessoa não tem login. Preenchido por gatilho no aceite.';

-- Um e-mail por organização; um usuário só pode ser uma pessoa por org.
create unique index if not exists idx_equipe_email
  on public.equipe (org_id, lower(email)) where email is not null;
create unique index if not exists idx_equipe_usuario
  on public.equipe (org_id, user_id) where user_id is not null;
create index if not exists idx_equipe_org_nome on public.equipe (org_id, nome);

-- ---------------------------------------------------------------------
-- 2. Backfill: cada usuário existente vira pessoa, com id = user_id
-- ---------------------------------------------------------------------
insert into public.equipe (id, org_id, nome, email, user_id, ativo)
select
  m.user_id,                                   -- id = user_id: preserva os dados já gravados
  m.org_id,
  coalesce(nullif(btrim(p.nome), ''), p.email, 'Pessoa sem perfil'),
  p.email,
  m.user_id,
  m.ativo
from public.memberships m
left join public.perfis p on p.id = m.user_id
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------
alter table public.equipe enable row level security;

drop policy if exists equipe_le on public.equipe;
create policy equipe_le on public.equipe
  for select to authenticated
  using (org_id in (select public.orgs_do_usuario()));

-- Gerir pessoas é gerir estrutura: dono, administrador e analista.
drop policy if exists equipe_cria on public.equipe;
create policy equipe_cria on public.equipe
  for insert to authenticated
  with check (public.pode_gerir_carteiras(org_id));

drop policy if exists equipe_edita on public.equipe;
create policy equipe_edita on public.equipe
  for update to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));

drop policy if exists equipe_exclui on public.equipe;
create policy equipe_exclui on public.equipe
  for delete to authenticated
  using (public.e_admin(org_id));

grant select, insert, update, delete on public.equipe to authenticated;

-- ---------------------------------------------------------------------
-- 4. Vínculo automático no aceite (e em qualquer criação de membership)
-- ---------------------------------------------------------------------
-- A checagem fica no banco, não na tela: qualquer caminho que crie o
-- membership — aceitar convite, vincular_membro, criar organização —
-- garante a pessoa na equipe. Se já existe uma pessoa com o mesmo
-- e-mail (cadastrada antes do acesso), ela É a pessoa: ganha o user_id
-- e mantém o id — tudo o que ela respondia continua dela.
create or replace function public.garantir_equipe()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome  text;
  v_email text;
begin
  select coalesce(nullif(btrim(p.nome), ''), p.email, 'Pessoa sem perfil'), p.email
    into v_nome, v_email
    from public.perfis p
   where p.id = new.user_id;

  -- Já é pessoa desta organização? Nada a fazer.
  if exists (select 1 from public.equipe e
              where e.org_id = new.org_id and e.user_id = new.user_id) then
    return new;
  end if;

  -- Pessoa pré-cadastrada com o mesmo e-mail: casa, mantendo o id dela.
  if v_email is not null then
    update public.equipe e
       set user_id = new.user_id,
           nome = coalesce(nullif(btrim(v_nome), ''), e.nome),
           ativo = true
     where e.org_id = new.org_id
       and e.user_id is null
       and lower(e.email) = lower(v_email);
    if found then
      return new;
    end if;
  end if;

  -- Pessoa nova: nasce com id = user_id, como no backfill.
  insert into public.equipe (id, org_id, nome, email, user_id, ativo)
  values (new.user_id, new.org_id, coalesce(v_nome, 'Pessoa sem perfil'), v_email, new.user_id, true)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_garantir_equipe on public.memberships;
create trigger trg_garantir_equipe
  after insert on public.memberships
  for each row execute function public.garantir_equipe();

-- ---------------------------------------------------------------------
-- 5. Reponta as chaves de responsável/dono para a equipe
-- ---------------------------------------------------------------------
-- Os valores gravados continuam válidos: o backfill criou as linhas de
-- equipe com o mesmo id dos usuários.
alter table public.carteiras drop constraint if exists carteiras_responsavel_id_fkey;
alter table public.carteiras
  add constraint carteiras_responsavel_id_fkey
  foreign key (responsavel_id) references public.equipe (id) on delete set null;

alter table public.contas drop constraint if exists contas_responsavel_id_fkey;
alter table public.contas
  add constraint contas_responsavel_id_fkey
  foreign key (responsavel_id) references public.equipe (id) on delete set null;

alter table public.frentes drop constraint if exists frentes_dono_id_fkey;
alter table public.frentes
  add constraint frentes_dono_id_fkey
  foreign key (dono_id) references public.equipe (id) on delete set null;

alter table public.oportunidades drop constraint if exists oportunidades_responsavel_id_fkey;
alter table public.oportunidades
  add constraint oportunidades_responsavel_id_fkey
  foreign key (responsavel_id) references public.equipe (id) on delete set null;

alter table public.compromissos drop constraint if exists compromissos_dono_id_fkey;
alter table public.compromissos
  add constraint compromissos_dono_id_fkey
  foreign key (dono_id) references public.equipe (id) on delete set null;

alter table public.alertas drop constraint if exists alertas_dono_id_fkey;
alter table public.alertas
  add constraint alertas_dono_id_fkey
  foreign key (dono_id) references public.equipe (id) on delete set null;

-- responsabilidades.user_id passa a apontar para a equipe. O nome da
-- coluna fica — renomear agora quebraria consultas sem ganho de clareza
-- no banco; o comentário diz o que ela é.
alter table public.responsabilidades drop constraint if exists responsabilidades_user_id_fkey;
alter table public.responsabilidades
  add constraint responsabilidades_user_id_fkey
  foreign key (user_id) references public.equipe (id) on delete cascade;

comment on column public.responsabilidades.user_id is
  'Pessoa da equipe (public.equipe.id) — que pode ou não ter login. '
  'Excluir a pessoa leva junto as responsabilidades dela.';

-- ---------------------------------------------------------------------
-- 6. Resumo diário e visão de acesso: o dono agora é pessoa da equipe
-- ---------------------------------------------------------------------
-- Um usuário corresponde a no máximo uma pessoa por organização, então o
-- join é direto. Quem não tem login não recebe resumo — e-mail de rotina
-- vai para quem pode agir dentro do sistema.
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
  left join public.equipe e on e.org_id = m.org_id and e.user_id = m.user_id
  left join public.preferencias_aviso pr on pr.org_id = m.org_id and pr.user_id = m.user_id
  left join public.alertas a
         on a.org_id = m.org_id and a.dono_id = e.id and a.status = 'aberto'
  left join public.compromissos k
         on k.org_id = m.org_id and k.dono_id = e.id and k.status = 'aberto'
        and k.vence_em <= current_date
  where m.org_id = p_org
    and m.ativo
    and p.email is not null
    and coalesce(pr.resumo_diario, true)
  group by m.user_id, p.email, p.nome, pr.apenas_alta
  having
    count(distinct a.id) filter (where a.severidade = 'alta') > 0
    or (not coalesce(pr.apenas_alta, false)
        and (count(distinct a.id) > 0
             or count(distinct k.id) filter (where k.vence_em <= current_date) > 0));
$$;

revoke execute on function public.resumo_do_dia(uuid) from public;

drop view if exists public.acesso_pessoas;

create view public.acesso_pessoas
with (security_invoker = on)
as
select
  m.org_id,
  m.user_id,
  m.papel,
  m.ativo,
  m.criado_em,
  p.nome,
  p.email,

  case
    when m.papel = 'ponto_focal'
      then (select count(*) from public.carteira_membros cm
             where cm.org_id = m.org_id and cm.user_id = m.user_id)
    else (select count(*) from public.carteiras c where c.org_id = m.org_id)
  end                                                                   as carteiras_visiveis,

  (select count(distinct r.carteira_id) from public.responsabilidades r
    where r.org_id = m.org_id and r.user_id = e.id)                     as carteiras_respondidas,

  (select count(*) from public.alertas a
    where a.org_id = m.org_id and a.dono_id = e.id and a.status = 'aberto')
                                                                        as alertas_abertos,

  (select count(*) from public.compromissos k
    where k.org_id = m.org_id and k.dono_id = e.id and k.status = 'aberto')
                                                                        as compromissos_abertos,

  (select max(r.criado_em) from public.registros r
    where r.org_id = m.org_id and r.autor_id = m.user_id)               as ultimo_registro

from public.memberships m
left join public.perfis p on p.id = m.user_id
left join public.equipe e on e.org_id = m.org_id and e.user_id = m.user_id;

comment on view public.acesso_pessoas is
  'Quem tem acesso, com que alcance, por quantas carteiras responde e quanto '
  'carrega. Responsabilidades e fila contam pela pessoa da equipe vinculada. '
  'Respeita a RLS das tabelas de origem.';

grant select on public.acesso_pessoas to authenticated;
