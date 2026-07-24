-- =====================================================================
-- Migration : 0051_importacao_tipos.sql
-- Aplicar   : depois de 0050_correcao_score_sem_sessao.sql.
--
-- DEFEITO QUE ESTA MIGRATION CORRIGE
--
-- A tela de importação oferece seis recursos — carteiras, contas,
-- contratos, frentes, oportunidades e maturidade. A trava do banco, criada
-- na 0009, aceita só os quatro originais:
--
--     check (tipo in ('carteiras', 'contas', 'contratos', 'frentes'))
--
-- Oportunidades e maturidade entraram no produto depois (migrations 0010
-- e 0012) e a trava nunca foi ampliada. Quem tentasse importar um desses
-- dois recebia, no meio do caminho:
--
--     new row for relation "importacoes" violates check constraint
--     "importacoes_tipo_check"
--
-- A conferência do arquivo passava — ela é toda em TypeScript e não toca
-- nesta tabela —, então a falha só aparecia ao gravar o registro da
-- importação. Sintoma clássico de duas listas do mesmo domínio mantidas
-- em lugares diferentes: uma cresceu, a outra não.
--
-- Também explica por que a suíte não pegou: os testes de importação
-- exercitam o validador, não o registro da importação.
-- =====================================================================

alter table public.importacoes drop constraint if exists importacoes_tipo_check;

alter table public.importacoes add constraint importacoes_tipo_check
  check (tipo in (
    'carteiras', 'contas', 'contratos', 'frentes',
    -- Faltavam estes dois:
    'oportunidades', 'maturidade'));


-- ---------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------
do $$
declare
  v_def text;
  v_faltando text[] := '{}';
  t text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.importacoes'::regclass
     and conname = 'importacoes_tipo_check';

  -- A lista precisa bater com TipoImportacao em lib/importacao.ts.
  foreach t in array array['carteiras','contas','contratos','frentes','oportunidades','maturidade'] loop
    if position(t in v_def) = 0 then
      v_faltando := v_faltando || t;
    end if;
  end loop;

  if array_length(v_faltando, 1) > 0 then
    raise exception 'A trava de tipo não aceita: %', array_to_string(v_faltando, ', ');
  end if;

  raise notice 'Importação: os seis tipos que a tela oferece agora são aceitos pelo banco.';
end $$;
