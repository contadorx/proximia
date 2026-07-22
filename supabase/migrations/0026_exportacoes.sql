-- =====================================================================
-- Migration : 0026_exportacoes.sql
-- Feature   : B33 — exportação de dados
-- Aplicar   : depois de 0025_resumo_diario.sql.
--
-- Os Termos prometem extração em formato legível por máquina no
-- encerramento, e a Política de Privacidade fala em portabilidade. Nada
-- disso estava implementado — era dívida de conformidade, não de
-- conveniência.
--
-- A exportação em si sai por rota da aplicação, sob a sessão de quem
-- pede: o alcance é o mesmo da tela, e ponto focal exporta apenas as
-- carteiras dele. Aqui fica só o registro de que aconteceu.
--
-- Por que registrar: exportação é o momento em que os dados saem do
-- controle do sistema. Quem levou, quando e o quê é a pergunta que
-- aparece depois de um incidente — e a resposta precisa existir antes.
-- =====================================================================

create table if not exists public.exportacoes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,

  recurso    text not null,
  formato    text not null default 'csv' check (formato in ('csv', 'json')),
  linhas     integer,

  autor_id   uuid references auth.users (id) on delete set null,
  criado_em  timestamptz not null default now()
);

comment on table public.exportacoes is
  'Trilha de extrações. Só o registro do ato — nunca uma cópia do que foi '
  'levado, o que dobraria a exposição em vez de reduzi-la.';

create index if not exists idx_exportacoes_org
  on public.exportacoes (org_id, criado_em desc);

alter table public.exportacoes enable row level security;

-- Quem administra e quem acompanha leem a trilha, como na auditoria.
drop policy if exists exportacoes_le on public.exportacoes;
create policy exportacoes_le on public.exportacoes
  for select to authenticated
  using (public.papel_na_org(org_id) in ('owner', 'admin', 'leitura_ampla'));

-- Quem exporta registra a própria extração; ninguém escreve pelos outros.
drop policy if exists exportacoes_cria on public.exportacoes;
create policy exportacoes_cria on public.exportacoes
  for insert to authenticated
  with check (public.e_membro(org_id) and autor_id = auth.uid());

grant select, insert on public.exportacoes to authenticated;
