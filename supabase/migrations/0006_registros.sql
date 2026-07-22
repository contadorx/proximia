-- =====================================================================
-- Migration : 0006_registros.sql
-- Feature   : F6 — timeline e memoria institucional
-- O que faz : registra o que acontece em qualquer entidade (carteira,
--             conta, contrato, frente) com autor, data e versao.
-- Aplicar   : depois de 0005_frentes.sql.
--
-- Duas garantias que o banco assume, e nao a tela:
--   1. Registro nao e sobrescrito. Editar gera uma nova versao e a
--      anterior continua existindo — e por isso que o historico serve
--      como memoria, e nao como rascunho.
--   2. Ninguem registra em nome de outra pessoa: a politica de escrita
--      exige que o autor seja quem esta na sessao.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Registros
-- ---------------------------------------------------------------------
create table if not exists public.registros (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,

  -- Carteira gravada junto de proposito: e o que da o alcance de acesso
  -- e o que permite montar o historico da carteira sem varrer tabelas.
  carteira_id   uuid not null references public.carteiras (id) on delete cascade,
  entidade_tipo text not null check (entidade_tipo in ('carteira', 'conta', 'contrato', 'frente')),
  entidade_id   uuid not null,

  tipo          text not null default 'nota'
                  check (tipo in ('nota', 'reuniao', 'decisao', 'entrega', 'envio')),
  titulo        text,
  corpo         text not null check (length(trim(corpo)) > 0),
  ocorrido_em   date not null default current_date,
  links         jsonb not null default '[]'::jsonb,

  autor_id      uuid not null references auth.users (id),
  versao        integer not null default 1 check (versao >= 1),
  substitui_id  uuid references public.registros (id) on delete set null,
  ativo         boolean not null default true,

  criado_em     timestamptz not null default now()
);

comment on table public.registros is
  'Historico da operacao. Cada linha tem autor e data e nunca e reescrita: '
  'a edicao cria uma versao nova e a anterior permanece.';
comment on column public.registros.ativo is
  'Versao corrente. Versoes anteriores ficam com ativo = false e continuam legiveis.';

create index if not exists idx_registros_entidade
  on public.registros (entidade_tipo, entidade_id, ocorrido_em desc) where ativo;
create index if not exists idx_registros_carteira
  on public.registros (carteira_id, ocorrido_em desc) where ativo;
create index if not exists idx_registros_org
  on public.registros (org_id, ocorrido_em desc) where ativo;

-- ---------------------------------------------------------------------
-- 2. Imutabilidade do conteudo
-- ---------------------------------------------------------------------
create or replace function public.registro_imutavel()
returns trigger
language plpgsql
as $$
begin
  if new.corpo        is distinct from old.corpo
  or new.titulo       is distinct from old.titulo
  or new.tipo         is distinct from old.tipo
  or new.ocorrido_em  is distinct from old.ocorrido_em
  or new.autor_id     is distinct from old.autor_id
  or new.entidade_id  is distinct from old.entidade_id
  or new.entidade_tipo is distinct from old.entidade_tipo
  or new.criado_em    is distinct from old.criado_em then
    raise exception 'Registro não é alterado no lugar: edite gerando uma nova versão.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_registro_imutavel on public.registros;
create trigger trg_registro_imutavel
  before update on public.registros
  for each row execute function public.registro_imutavel();

-- ---------------------------------------------------------------------
-- 3. Edicao versionada
-- ---------------------------------------------------------------------
-- Cria a versao seguinte e aposenta a anterior, na mesma transacao. O
-- autor da nova versao e quem editou: quem escreveu antes continua
-- creditado na versao dele.
create or replace function public.editar_registro(
  p_id          uuid,
  p_titulo      text,
  p_corpo       text,
  p_tipo        text,
  p_ocorrido_em date
)
returns public.registros
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atual public.registros;
  v_nova  public.registros;
begin
  select * into v_atual from public.registros where id = p_id and ativo;

  if v_atual.id is null then
    raise exception 'Registro não encontrado ou já substituído.';
  end if;

  if not (public.pode_escrever(v_atual.org_id) and public.tem_acesso_carteira(v_atual.carteira_id)) then
    raise exception 'Seu perfil não permite editar registros desta carteira.';
  end if;

  if coalesce(trim(p_corpo), '') = '' then
    raise exception 'Escreva o conteúdo do registro.';
  end if;

  insert into public.registros (
    org_id, carteira_id, entidade_tipo, entidade_id, tipo, titulo, corpo,
    ocorrido_em, links, autor_id, versao, substitui_id
  )
  values (
    v_atual.org_id, v_atual.carteira_id, v_atual.entidade_tipo, v_atual.entidade_id,
    coalesce(p_tipo, v_atual.tipo), p_titulo, p_corpo,
    coalesce(p_ocorrido_em, v_atual.ocorrido_em), v_atual.links,
    auth.uid(), v_atual.versao + 1, v_atual.id
  )
  returning * into v_nova;

  update public.registros set ativo = false where id = v_atual.id;

  return v_nova;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.registros enable row level security;

drop policy if exists registros_le on public.registros;
create policy registros_le on public.registros
  for select to authenticated
  using (public.tem_acesso_carteira(carteira_id));

-- autor_id = auth.uid(): ninguem escreve em nome de outra pessoa.
drop policy if exists registros_cria on public.registros;
create policy registros_cria on public.registros
  for insert to authenticated
  with check (
    public.pode_escrever(org_id)
    and public.tem_acesso_carteira(carteira_id)
    and autor_id = auth.uid()
  );

-- O update so consegue mexer em 'ativo': o gatilho barra o resto.
drop policy if exists registros_atualiza on public.registros;
create policy registros_atualiza on public.registros
  for update to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id))
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

-- Apagar historico e excecao, nao rotina: so administracao.
drop policy if exists registros_exclui on public.registros;
create policy registros_exclui on public.registros
  for delete to authenticated
  using (public.e_admin(org_id));

-- ---------------------------------------------------------------------
-- 5. Permissoes
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.registros to authenticated;
grant execute on function public.editar_registro(uuid, text, text, text, date) to authenticated;
