-- =====================================================================
-- Migration : 0005_frentes.sql
-- Feature   : F5 — frentes de trabalho
-- O que faz : registra o trabalho de volume de forma agregada por
--             carteira. Uma linha por tema, com quantidade de casos,
--             potencial, capturado, dono, proxima etapa e o link para a
--             base viva — que continua fora do sistema.
-- Aplicar   : depois de 0004_contratos.sql.
--
-- Por que agregado: carteira tem dezenas de contas de alto valor e
-- milhares de itens miudos. Ferramenta que tenta gerir item a item vira
-- cadastro paralelo, desatualiza e ninguem abre mais. Conta grande tem
-- ficha; volume tem frente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catalogo de frentes (configuravel por organizacao)
-- ---------------------------------------------------------------------
create table if not exists public.frente_catalogo (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  nome       text not null,
  descricao  text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

comment on table public.frente_catalogo is
  'Tipos de frente que a organizacao usa. Nenhum tipo vem embutido no produto: '
  'cada assinante cadastra o proprio vocabulario.';

create unique index if not exists idx_catalogo_nome
  on public.frente_catalogo (org_id, lower(nome));

-- ---------------------------------------------------------------------
-- 2. Frentes
-- ---------------------------------------------------------------------
create table if not exists public.frentes (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.orgs (id) on delete cascade,
  carteira_id             uuid not null references public.carteiras (id) on delete cascade,
  catalogo_id             uuid references public.frente_catalogo (id) on delete set null,

  titulo                  text not null,
  status                  text not null default 'identificada'
                            check (status in ('identificada', 'em_analise', 'em_execucao',
                                              'concluida', 'descartada')),
  motivo_descarte         text,
  dono_id                 uuid references auth.users (id) on delete set null,

  qtd_casos               integer check (qtd_casos >= 0),
  potencial_bruto         numeric(14, 2) check (potencial_bruto >= 0),
  potencial_origem        text,
  potencial_data          date,
  valor_capturado         numeric(14, 2) check (valor_capturado >= 0),
  capturado_confirmado_em date,

  proxima_etapa           text,
  prazo                   date,
  links                   jsonb not null default '[]'::jsonb,
  observacoes             text,

  criado_em               timestamptz not null default now(),
  criado_por              uuid references auth.users (id),
  atualizado_em           timestamptz not null default now(),

  -- Mesma regra das contas: estimativa entra com procedencia e data.
  constraint frente_potencial_declarado check (
    potencial_bruto is null
    or (potencial_origem is not null and potencial_data is not null)
  ),

  -- Descarte sem motivo apaga o aprendizado. Se nao vale a pena, o
  -- registro precisa dizer por que.
  constraint descarte_justificado check (
    status <> 'descartada' or motivo_descarte is not null
  )
);

comment on column public.frentes.links is
  'Lista [{rotulo, url}] apontando para a base de trabalho. O arquivo vive no '
  'repositorio do assinante; aqui fica so o link rastreavel.';
comment on column public.frentes.qtd_casos is
  'Quantos itens a frente representa. E o que permite gerir volume sem '
  'transformar o sistema em copia da base operacional.';

create index if not exists idx_frentes_carteira on public.frentes (carteira_id);
create index if not exists idx_frentes_org_status on public.frentes (org_id, status);

drop trigger if exists trg_frentes_atualizacao on public.frentes;
create trigger trg_frentes_atualizacao
  before update on public.frentes
  for each row execute function public.marcar_atualizacao();

-- ---------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------
alter table public.frente_catalogo enable row level security;
alter table public.frentes         enable row level security;

-- catalogo -----------------------------------------------------------
drop policy if exists catalogo_le on public.frente_catalogo;
create policy catalogo_le on public.frente_catalogo
  for select to authenticated
  using (public.e_membro(org_id));

drop policy if exists catalogo_cria on public.frente_catalogo;
create policy catalogo_cria on public.frente_catalogo
  for insert to authenticated
  with check (public.pode_gerir_carteiras(org_id));

drop policy if exists catalogo_atualiza on public.frente_catalogo;
create policy catalogo_atualiza on public.frente_catalogo
  for update to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));

drop policy if exists catalogo_exclui on public.frente_catalogo;
create policy catalogo_exclui on public.frente_catalogo
  for delete to authenticated
  using (public.e_admin(org_id));

-- frentes ------------------------------------------------------------
drop policy if exists frentes_le on public.frentes;
create policy frentes_le on public.frentes
  for select to authenticated
  using (public.tem_acesso_carteira(carteira_id));

drop policy if exists frentes_cria on public.frentes;
create policy frentes_cria on public.frentes
  for insert to authenticated
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

drop policy if exists frentes_atualiza on public.frentes;
create policy frentes_atualiza on public.frentes
  for update to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id))
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

drop policy if exists frentes_exclui on public.frentes;
create policy frentes_exclui on public.frentes
  for delete to authenticated
  using (public.pode_gerir_carteiras(org_id));

-- ---------------------------------------------------------------------
-- 4. Permissoes
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.frente_catalogo to authenticated;
grant select, insert, update, delete on public.frentes         to authenticated;
