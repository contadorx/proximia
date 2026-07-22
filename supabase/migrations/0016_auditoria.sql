-- =====================================================================
-- Migration : 0016_auditoria.sql
-- Feature   : F21 — registro de acesso e alterações (fase 2)
-- O que faz : grava quem alterou o quê, e quando, nas tabelas que
--             importam. Paga a lacuna declarada na Política de
--             Privacidade.
-- Aplicar   : depois de 0015_anexos.sql.
--
-- Duas decisões que definem a feature:
--
--   1. Ninguém escreve na auditoria. Não há política de INSERT para
--      usuário: as linhas só nascem por gatilho. Registro que a própria
--      pessoa pode forjar não serve de auditoria.
--
--   2. Guarda o que mudou, não o registro inteiro. Copiar a linha toda a
--      cada alteração encheria o banco de repetição e espalharia dado
--      pessoal por mais um lugar — o contrário do que a LGPD pede.
-- =====================================================================

create table if not exists public.auditoria (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,

  acao          text not null check (acao in ('criou', 'alterou', 'excluiu')),
  tabela        text not null,
  registro_id   uuid,
  resumo        text,

  -- Apenas os campos que mudaram, com valor anterior e novo.
  mudancas      jsonb not null default '{}'::jsonb,

  autor_id      uuid references auth.users (id) on delete set null,
  criado_em     timestamptz not null default now()
);

comment on table public.auditoria is
  'Trilha de alterações. Escrita apenas por gatilho; nenhum usuário insere '
  'nem edita linha aqui.';

create index if not exists idx_auditoria_org on public.auditoria (org_id, criado_em desc);
create index if not exists idx_auditoria_registro on public.auditoria (tabela, registro_id);

-- ---------------------------------------------------------------------
-- Gatilho
-- ---------------------------------------------------------------------
-- Campos que nunca entram na trilha: ou são ruído (carimbos de tempo,
-- colunas geradas) ou não deveriam ser copiados adiante.
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org       uuid;
  v_id        uuid;
  v_mudancas  jsonb := '{}'::jsonb;
  v_antes     jsonb;
  v_depois    jsonb;
  v_chave     text;
  v_resumo    text;
  v_ignorar   text[] := array[
    'atualizado_em', 'criado_em', 'criado_por',
    'janela_renegociacao', 'resultado_mensal', 'payback_meses', 'retorno_percentual',
    'fase_desde', 'links', 'dados_cadastrais', 'payload', 'relatorio'
  ];
begin
  if tg_op = 'DELETE' then
    v_org := old.org_id;
    v_id := old.id;
  else
    v_org := new.org_id;
    v_id := new.id;
  end if;

  -- Um rótulo legível, para a tela não mostrar só identificadores.
  v_resumo := coalesce(
    to_jsonb(coalesce(new, old)) ->> 'nome',
    to_jsonb(coalesce(new, old)) ->> 'titulo',
    to_jsonb(coalesce(new, old)) ->> 'numero',
    to_jsonb(coalesce(new, old)) ->> 'email',
    null
  );

  if tg_op = 'UPDATE' then
    v_antes := to_jsonb(old);
    v_depois := to_jsonb(new);

    for v_chave in select jsonb_object_keys(v_depois) loop
      if not (v_chave = any (v_ignorar))
         and (v_antes -> v_chave) is distinct from (v_depois -> v_chave) then
        v_mudancas := v_mudancas || jsonb_build_object(
          v_chave, jsonb_build_object('de', v_antes -> v_chave, 'para', v_depois -> v_chave)
        );
      end if;
    end loop;

    -- Alteração que não mexeu em nada relevante não vira linha.
    if v_mudancas = '{}'::jsonb then
      return new;
    end if;
  end if;

  begin
    insert into public.auditoria (org_id, acao, tabela, registro_id, resumo, mudancas, autor_id)
    values (
      v_org,
      case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'excluiu' end,
      tg_table_name,
      v_id,
      v_resumo,
      v_mudancas,
      auth.uid()
    );
  exception when foreign_key_violation then
    -- A organização inteira está sendo excluída, e as linhas filhas caem
    -- em cascata. Registrar a exclusão de cada uma seria escrever numa
    -- trilha que some no mesmo instante — e, pior, impediria a exclusão.
    null;
  end;

  return coalesce(new, old);
end;
$$;

-- Tabelas acompanhadas: as que representam compromisso, dinheiro ou
-- acesso. Histórico e alertas ficam de fora — o histórico já é imutável
-- por desenho, e alerta nasce de varredura, não de decisão de alguém.
do $$
declare t text;
begin
  foreach t in array array[
    'carteiras', 'contas', 'contratos', 'contrato_clausulas',
    'frentes', 'oportunidades', 'compromissos',
    'memberships', 'convites', 'anexos',
    'maturidade_avaliacoes', 'maturidade_dimensoes', 'maturidade_perguntas'
  ]
  loop
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format(
      'create trigger trg_auditoria after insert or update or delete on public.%I
         for each row execute function public.registrar_auditoria()', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.auditoria enable row level security;

-- Quem administra e quem acompanha leem a trilha. Ponto focal e analista
-- não: a trilha é instrumento de controle, não de operação.
drop policy if exists auditoria_le on public.auditoria;
create policy auditoria_le on public.auditoria
  for select to authenticated
  using (public.papel_na_org(org_id) in ('owner', 'admin', 'leitura_ampla'));

-- Sem política de escrita, de propósito: só o gatilho grava.
grant select on public.auditoria to authenticated;
