-- =====================================================================
-- Migration : 0016_auditoria.sql
-- Feature   : F21 — registro de acesso (fase 2)
-- O que faz : fecha a lacuna declarada desde o documento de riscos —
--             "registrar quem acessou o quê é desejável, mas fica para
--             fase posterior". É esta fase.
-- Aplicar   : depois de 0015_anexos.sql.
--
-- O que a trilha responde, e que até aqui ficava sem resposta:
--   "quem mudou o valor deste contrato?", "quem apagou aquela conta?",
--   "quem baixou o laudo?", "alguém abriu o portal que eu mandei?".
--
-- Três decisões que valem explicação:
--
--   1. A trilha é só de acréscimo. Não existe update nem delete para
--      ninguém — nem para o dono da organização. Registro de acesso que
--      o administrador pode reescrever não serve para nada, porque a
--      pergunta que ele responde é justamente sobre o administrador.
--
--   2. Ela guarda o que mudou, não o que era. Numa alteração, ficam os
--      nomes dos campos tocados, e não o conteúdo anterior. Guardar o
--      conteúdo transformaria a trilha numa segunda base de dados
--      pessoais, com todo o passivo e nenhum uso.
--
--   3. Histórico não entra. `registros` já nasce imutável e versionado —
--      auditar quem escreveu memória que já tem autor gravado seria a
--      mesma informação duas vezes. Compromisso automático também fica
--      de fora: nasce de gatilho, aos montes, e enterraria o resto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A trilha
-- ---------------------------------------------------------------------
create table if not exists public.auditoria (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references public.orgs (id) on delete cascade,

  -- Null quando a ação veio de rotina de servidor ou de visitante do
  -- portal. A coluna origem diz qual dos dois.
  user_id       uuid references auth.users (id) on delete set null,
  origem        text not null default 'app'
                  check (origem in ('app', 'gatilho', 'rotina', 'portal')),

  acao          text not null check (acao in (
                  'criou', 'alterou', 'excluiu',
                  'leu', 'baixou', 'exportou', 'enviou', 'abriu_portal')),

  entidade_tipo text not null,
  entidade_id   uuid,

  resumo        text,
  campos        text[],
  detalhe       jsonb not null default '{}'::jsonb,

  criado_em     timestamptz not null default now()
);

comment on table public.auditoria is
  'Trilha de acesso e alteracao. So aceita acrescimo: nao ha politica de '
  'update nem de delete, e o grant tambem nao existe.';
comment on column public.auditoria.campos is
  'Nomes dos campos alterados. O conteudo anterior nao e guardado de '
  'proposito — a trilha diz o que foi tocado, nao repete o dado.';

create index if not exists idx_auditoria_org
  on public.auditoria (org_id, criado_em desc);
create index if not exists idx_auditoria_entidade
  on public.auditoria (entidade_tipo, entidade_id, criado_em desc);
create index if not exists idx_auditoria_pessoa
  on public.auditoria (org_id, user_id, criado_em desc);

-- ---------------------------------------------------------------------
-- 2. Gatilho genérico
-- ---------------------------------------------------------------------
-- Um só gatilho para todas as tabelas auditadas. O nome da tabela vira o
-- tipo de entidade; a operação vira a ação.
create or replace function public.auditar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_linha    jsonb;
  v_antes    jsonb;
  v_acao     text;
  v_org      uuid;
  v_resumo   text;
  v_campos   text[];
begin
  if tg_op = 'DELETE' then
    v_linha := to_jsonb(old);
    v_acao  := 'excluiu';
  else
    v_linha := to_jsonb(new);
    v_acao  := case when tg_op = 'INSERT' then 'criou' else 'alterou' end;
  end if;

  v_org := (v_linha ->> 'org_id')::uuid;
  if v_org is null then
    return coalesce(new, old);
  end if;

  -- Exclusão da organização inteira cascateia para todas as tabelas
  -- auditadas, e cada linha apagada chegaria aqui querendo gravar trilha
  -- para uma organização que já não existe — a gravação falharia na
  -- chave estrangeira e derrubaria a exclusão toda.
  --
  -- Quando a organização vai embora, a trilha dela vai junto por
  -- definição: não há a quem prestar contas. Então aqui é silêncio.
  if tg_op = 'DELETE' and not exists (select 1 from public.orgs o where o.id = v_org) then
    return old;
  end if;

  -- Primeiro campo de identificação que a tabela tiver. Sem isso a
  -- trilha vira uma lista de uuids, ilegível para quem for consultar.
  v_resumo := coalesce(
    v_linha ->> 'nome',
    v_linha ->> 'titulo',
    v_linha ->> 'numero',
    v_linha ->> 'email',
    left(v_linha ->> 'id', 8)
  );

  if tg_op = 'UPDATE' then
    v_antes := to_jsonb(old);
    select array_agg(chave order by chave) into v_campos
      from jsonb_object_keys(v_linha) chave
     where v_linha -> chave is distinct from v_antes -> chave;

    -- Nada mudou de fato: gravar seria ruído.
    if v_campos is null then
      return new;
    end if;
  end if;

  insert into public.auditoria (org_id, user_id, origem, acao, entidade_tipo, entidade_id, resumo, campos)
  values (v_org, auth.uid(), 'gatilho', v_acao, tg_table_name, (v_linha ->> 'id')::uuid, v_resumo, v_campos);

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Onde o gatilho entra
-- ---------------------------------------------------------------------
-- O que decide a lista: dado que alguém pode contestar depois. Contrato,
-- conta, valor de frente, oportunidade, anexo, quem tem acesso.
do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'carteiras', 'contas', 'contratos', 'contrato_clausulas',
    'frentes', 'oportunidades', 'anexos', 'memberships', 'convites'
  ]
  loop
    if to_regclass('public.' || v_tabela) is not null then
      execute format('drop trigger if exists trg_auditar_%1$s on public.%1$I', v_tabela);
      execute format(
        'create trigger trg_auditar_%1$s after insert or update or delete on public.%1$I
           for each row execute function public.auditar()', v_tabela);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Registro do que não é escrita
-- ---------------------------------------------------------------------
-- Leitura, download e exportação não passam por gatilho — não alteram
-- nada. A aplicação chama esta função nos pontos que importam: baixar um
-- anexo, abrir o extrato de uma carteira, exportar uma base.
create or replace function public.registrar_acesso(
  p_org           uuid,
  p_acao          text,
  p_entidade_tipo text,
  p_entidade_id   uuid default null,
  p_resumo        text default null,
  p_detalhe       jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- A função é SECURITY DEFINER e escreve numa tabela que ninguém pode
  -- escrever direto. Sem esta checagem, qualquer sessão autenticada
  -- plantaria linha em qualquer organização.
  if not public.e_membro(p_org) then
    raise exception 'Sem vínculo com esta organização.';
  end if;

  insert into public.auditoria (org_id, user_id, origem, acao, entidade_tipo, entidade_id, resumo, detalhe)
  values (p_org, auth.uid(), 'app', p_acao, p_entidade_tipo, p_entidade_id, p_resumo, coalesce(p_detalhe, '{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Quem lê
-- ---------------------------------------------------------------------
alter table public.auditoria enable row level security;

-- Só administração lê, e o resto do produto continua funcionando sem
-- saber que a trilha existe.
drop policy if exists auditoria_le on public.auditoria;
create policy auditoria_le on public.auditoria
  for select to authenticated using (public.e_admin(org_id));

-- Nenhuma política de insert, update ou delete. Escrita entra pelas
-- funções acima, que são SECURITY DEFINER e checam vínculo.
grant select on public.auditoria to authenticated;
grant execute on function public.registrar_acesso(uuid, text, text, uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Prazo de guarda
-- ---------------------------------------------------------------------
-- Trilha que cresce para sempre vira passivo. Quem administra define o
-- prazo e roda a limpeza; o padrão de 365 dias é sugestão, não regra.
create or replace function public.limpar_auditoria(p_org uuid, p_dias integer default 365)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_removidas integer;
begin
  if not public.e_admin(p_org) then
    raise exception 'Apenas a administração da organização pode limpar a trilha.';
  end if;
  if p_dias < 30 then
    raise exception 'O prazo mínimo de guarda é de 30 dias.';
  end if;

  delete from public.auditoria
   where org_id = p_org and criado_em < now() - make_interval(days => p_dias);

  get diagnostics v_removidas = row_count;

  -- A limpeza também é um evento auditável — inclusive porque é a única
  -- operação capaz de tirar linha da trilha.
  insert into public.auditoria (org_id, user_id, origem, acao, entidade_tipo, resumo, detalhe)
  values (p_org, auth.uid(), 'app', 'excluiu', 'auditoria',
          v_removidas || ' linha(s) além do prazo de guarda',
          jsonb_build_object('dias', p_dias, 'removidas', v_removidas));

  return v_removidas;
end;
$$;

grant execute on function public.limpar_auditoria(uuid, integer) to authenticated;
