-- =====================================================================
-- Migration : 0009_importacoes.sql
-- Feature   : F10 — importacao de dados
-- O que faz : guarda cada tentativa de importacao com o que foi lido, o
--             que foi recusado e o motivo, antes de qualquer gravacao.
-- Aplicar   : depois de 0008_panorama.sql.
--
-- A importacao acontece em duas etapas: primeiro o arquivo e lido e
-- conferido, gerando um relatorio linha a linha; so depois, com o
-- relatorio na tela, a pessoa confirma. Carga que grava sem conferencia
-- e a forma mais rapida de encher um sistema de dado errado.
-- =====================================================================

create table if not exists public.importacoes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,

  tipo          text not null check (tipo in ('carteiras', 'contas', 'contratos', 'frentes')),
  arquivo_nome  text,
  status        text not null default 'conferida'
                  check (status in ('conferida', 'concluida', 'descartada')),

  linhas_total  integer not null default 0,
  linhas_ok     integer not null default 0,
  linhas_erro   integer not null default 0,
  linhas_gravadas integer not null default 0,

  -- Linhas validas, prontas para gravar quando houver confirmacao.
  payload       jsonb not null default '[]'::jsonb,
  -- Uma entrada por linha recusada: numero da linha e o motivo.
  relatorio     jsonb not null default '[]'::jsonb,

  criado_em     timestamptz not null default now(),
  criado_por    uuid references auth.users (id),
  concluido_em  timestamptz
);

comment on table public.importacoes is
  'Historico das cargas. Serve tambem de auditoria: mostra o que entrou, '
  'o que foi recusado e por que.';

create index if not exists idx_importacoes_org
  on public.importacoes (org_id, criado_em desc);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.importacoes enable row level security;

-- Importar mexe em varias carteiras de uma vez: e operacao de quem
-- administra carteiras, nunca de ponto focal.
drop policy if exists importacoes_le on public.importacoes;
create policy importacoes_le on public.importacoes
  for select to authenticated
  using (public.pode_gerir_carteiras(org_id));

drop policy if exists importacoes_cria on public.importacoes;
create policy importacoes_cria on public.importacoes
  for insert to authenticated
  with check (public.pode_gerir_carteiras(org_id));

drop policy if exists importacoes_atualiza on public.importacoes;
create policy importacoes_atualiza on public.importacoes
  for update to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));

drop policy if exists importacoes_exclui on public.importacoes;
create policy importacoes_exclui on public.importacoes
  for delete to authenticated
  using (public.e_admin(org_id));

grant select, insert, update, delete on public.importacoes to authenticated;
