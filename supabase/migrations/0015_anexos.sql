-- =====================================================================
-- Migration : 0015_anexos.sql
-- Feature   : F20 — anexos (fase 2)
-- O que faz : permite guardar arquivos junto do registro a que pertencem,
--             em bucket privado, com o mesmo alcance por carteira que já
--             vale para o resto.
-- Aplicar   : depois de 0014_alertas.sql.
--
-- O caminho do arquivo começa sempre pelo identificador da organização.
-- Isso não é organização de pastas: é o que permite a política do storage
-- decidir acesso olhando só para o nome do objeto, sem consultar tabela.
--   {org_id}/{entidade_tipo}/{uuid}-{nome do arquivo}
--
-- Nada fica público. O download sai por link assinado de curta duração,
-- gerado sob demanda para quem tem acesso à carteira.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bucket
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anexos', 'anexos', false, 20971520,
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'text/csv', 'text/plain',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel', 'application/msword'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 2. Registro do anexo
-- ---------------------------------------------------------------------
create table if not exists public.anexos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  carteira_id   uuid not null references public.carteiras (id) on delete cascade,

  entidade_tipo text not null check (entidade_tipo in
                  ('carteira', 'conta', 'contrato', 'frente', 'oportunidade')),
  entidade_id   uuid not null,

  nome          text not null,
  caminho       text not null unique,
  tipo_mime     text,
  tamanho       bigint check (tamanho >= 0),
  descricao     text,

  criado_em     timestamptz not null default now(),
  criado_por    uuid references auth.users (id)
);

comment on table public.anexos is
  'Ponteiro para o arquivo no bucket. A linha e o objeto andam juntos: '
  'excluir o anexo apaga os dois.';

create index if not exists idx_anexos_entidade
  on public.anexos (entidade_tipo, entidade_id, criado_em desc);
create index if not exists idx_anexos_carteira on public.anexos (carteira_id);

-- ---------------------------------------------------------------------
-- 3. RLS da tabela
-- ---------------------------------------------------------------------
alter table public.anexos enable row level security;

drop policy if exists anexos_le on public.anexos;
create policy anexos_le on public.anexos
  for select to authenticated
  using (public.tem_acesso_carteira(carteira_id));

drop policy if exists anexos_cria on public.anexos;
create policy anexos_cria on public.anexos
  for insert to authenticated
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

drop policy if exists anexos_exclui on public.anexos;
create policy anexos_exclui on public.anexos
  for delete to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

grant select, insert, delete on public.anexos to authenticated;

-- ---------------------------------------------------------------------
-- 4. RLS do bucket
-- ---------------------------------------------------------------------
-- A primeira pasta do caminho é o identificador da organização. Se a
-- pessoa é membro dela, pode ler e gravar ali; se não é, o objeto não
-- existe para ela.
drop policy if exists anexos_objetos_le on storage.objects;
create policy anexos_objetos_le on storage.objects
  for select to authenticated
  using (
    bucket_id = 'anexos'
    and public.e_membro(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists anexos_objetos_cria on storage.objects;
create policy anexos_objetos_cria on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and public.pode_escrever(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists anexos_objetos_exclui on storage.objects;
create policy anexos_objetos_exclui on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'anexos'
    and public.pode_escrever(((storage.foldername(name))[1])::uuid)
  );
