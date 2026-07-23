-- =====================================================================
-- Stub    : 00_stub_supabase.sql
-- Para    : rodar as migrations e os testes de supabase/testes num
--           Postgres puro (CI ou local), onde os esquemas `auth` e
--           `storage` do Supabase nao existem.
-- Escopo  : o MINIMO que as migrations e os testes referenciam:
--           auth.users (id, email, raw_user_meta_data), auth.uid(),
--           storage.buckets, storage.objects, storage.foldername().
-- Aviso   : NAO usar em ambiente Supabase real — la esses objetos ja
--           existem e sao mantidos pela plataforma.
-- =====================================================================

-- Papeis que o Supabase cria e as migrations/testes referenciam.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Esquema auth
-- ---------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- auth.uid(): mesmo contrato do Supabase — le o `sub` das claims da
-- sessao. Os testes simulam sessao com
--   set_config('request.jwt.claims', json_build_object('sub', ...)::text, true)
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'anon'
  )
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

-- ---------------------------------------------------------------------
-- Esquema storage
-- ---------------------------------------------------------------------
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

-- storage.foldername(): mesmo contrato do Supabase — as partes do
-- caminho, sem o nome do arquivo. Ex.: 'org/conta/arq.pdf' -> {org,conta}.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;
