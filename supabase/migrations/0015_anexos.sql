-- =====================================================================
-- Migration : 0015_anexos.sql
-- Feature   : F20 — anexos e documentos (fase 2)
-- O que faz : o documento passa a poder morar aqui, e não só ser
--             apontado por link. Arquivo vai para o Storage; a linha
--             guarda a ficha e o autor.
-- Aplicar   : depois de 0014_alertas.sql.
--
-- Por que existe, se o produto sempre disse "documento fica no
-- repositório oficial do assinante":
--   Continua valendo para o acervo. O que não funcionava era o anexo de
--   trabalho — a ata, o laudo, a planilha da rodada — que ninguém vai
--   catalogar em repositório nenhum e que, sem lugar, volta para a caixa
--   de e-mail de uma pessoa. É exatamente a dependência que o produto
--   existe para quebrar.
--
-- Duas garantias do banco:
--   1. Anexo é ou arquivo ou link, nunca os dois. Um registro com as
--      duas coisas seria ambíguo na hora de abrir e na hora de apagar.
--   2. O alcance do arquivo é o alcance da carteira. Quem não abre a
--      carteira não baixa o arquivo — e isso vale também no Storage,
--      não só na tela.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ficha do anexo
-- ---------------------------------------------------------------------
create table if not exists public.anexos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,

  -- Carteira gravada junto, como em registros: é o que dá o alcance de
  -- acesso sem precisar varrer a entidade pai a cada consulta.
  carteira_id   uuid not null references public.carteiras (id) on delete cascade,
  entidade_tipo text not null check (entidade_tipo in
                  ('carteira', 'conta', 'contrato', 'frente', 'oportunidade')),
  entidade_id   uuid not null,

  nome          text not null check (length(trim(nome)) > 0),
  descricao     text,

  -- Arquivo no Storage: caminho dentro do balde 'anexos'.
  caminho       text unique,
  tipo_mime     text,
  tamanho_bytes bigint check (tamanho_bytes is null or tamanho_bytes >= 0),

  -- Ou endereço externo, quando o documento oficial vive fora.
  url           text,

  criado_em     timestamptz not null default now(),
  criado_por    uuid not null references auth.users (id),

  constraint anexo_arquivo_ou_link check (
    (caminho is not null and url is null) or
    (caminho is null and url is not null)
  )
);

comment on table public.anexos is
  'Documentos de trabalho ancorados numa entidade. Arquivo vai para o '
  'Storage; a linha guarda ficha, autor e data. Ou arquivo, ou link.';
comment on column public.anexos.caminho is
  'Caminho no balde anexos: org_id/entidade_tipo/entidade_id/arquivo. O '
  'primeiro nivel e a organizacao de proposito — e nele que a politica '
  'do Storage se apoia.';

create index if not exists idx_anexos_entidade
  on public.anexos (entidade_tipo, entidade_id, criado_em desc);
create index if not exists idx_anexos_carteira
  on public.anexos (carteira_id, criado_em desc);
create index if not exists idx_anexos_org
  on public.anexos (org_id, criado_em desc);

-- ---------------------------------------------------------------------
-- 2. RLS da ficha
-- ---------------------------------------------------------------------
alter table public.anexos enable row level security;

drop policy if exists anexos_le on public.anexos;
create policy anexos_le on public.anexos
  for select to authenticated
  using (public.tem_acesso_carteira(carteira_id));

-- criado_por = auth.uid(): ninguem anexa em nome de outra pessoa.
drop policy if exists anexos_cria on public.anexos;
create policy anexos_cria on public.anexos
  for insert to authenticated
  with check (
    public.pode_escrever(org_id)
    and public.tem_acesso_carteira(carteira_id)
    and criado_por = auth.uid()
  );

drop policy if exists anexos_atualiza on public.anexos;
create policy anexos_atualiza on public.anexos
  for update to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id))
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

drop policy if exists anexos_exclui on public.anexos;
create policy anexos_exclui on public.anexos
  for delete to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

grant select, insert, update, delete on public.anexos to authenticated;

-- ---------------------------------------------------------------------
-- 3. O balde
-- ---------------------------------------------------------------------
-- Privado. Nada de URL publica: o download sai por endereco assinado,
-- com validade curta, gerado depois de conferir o acesso.
insert into storage.buckets (id, name, public, file_size_limit)
values ('anexos', 'anexos', false, 26214400)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 4. RLS do arquivo
-- ---------------------------------------------------------------------
-- A politica do Storage nao enxerga a tabela de anexos: ela ve o caminho.
-- Por isso o caminho comeca pela organizacao — e a unica informacao de
-- alcance disponivel na hora de autorizar o objeto.
--
-- O cast do primeiro nivel para uuid pode falhar (arquivo largado fora do
-- padrao). Falhar aqui nao pode virar erro de banco: vira "nao autorizado".
create or replace function public.org_do_arquivo(p_nome text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_org uuid;
begin
  begin
    v_org := (storage.foldername(p_nome))[1]::uuid;
  exception when others then
    return null;
  end;
  return v_org;
end;
$$;

comment on function public.org_do_arquivo(text) is
  'Le a organizacao a partir do primeiro nivel do caminho do arquivo. '
  'Devolve null quando o caminho nao segue o padrao — e null nao '
  'autoriza nada.';

drop policy if exists anexos_arquivo_le on storage.objects;
create policy anexos_arquivo_le on storage.objects
  for select to authenticated
  using (bucket_id = 'anexos' and public.e_membro(public.org_do_arquivo(name)));

drop policy if exists anexos_arquivo_grava on storage.objects;
create policy anexos_arquivo_grava on storage.objects
  for insert to authenticated
  with check (bucket_id = 'anexos' and public.pode_escrever(public.org_do_arquivo(name)));

drop policy if exists anexos_arquivo_atualiza on storage.objects;
create policy anexos_arquivo_atualiza on storage.objects
  for update to authenticated
  using (bucket_id = 'anexos' and public.pode_escrever(public.org_do_arquivo(name)))
  with check (bucket_id = 'anexos' and public.pode_escrever(public.org_do_arquivo(name)));

drop policy if exists anexos_arquivo_apaga on storage.objects;
create policy anexos_arquivo_apaga on storage.objects
  for delete to authenticated
  using (bucket_id = 'anexos' and public.pode_escrever(public.org_do_arquivo(name)));

-- ---------------------------------------------------------------------
-- 5. Contagem por entidade
-- ---------------------------------------------------------------------
-- Para a tela dizer "3 anexos" sem carregar as tres fichas.
create or replace function public.contar_anexos(p_tipo text, p_ids uuid[])
returns table (entidade_id uuid, total bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select a.entidade_id, count(*)
  from public.anexos a
  where a.entidade_tipo = p_tipo and a.entidade_id = any(p_ids)
  group by a.entidade_id;
$$;

grant execute on function public.contar_anexos(text, uuid[]) to authenticated;
