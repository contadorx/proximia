#!/usr/bin/env bash
# =====================================================================
# testes-banco.sh — prepara um Postgres limpo e roda os testes de banco.
#
# O que faz, na ordem:
#   1. stubs de auth/storage (supabase/testes/ci/00_stub_supabase.sql)
#   2. migrations de supabase/migrations, em ordem de nome
#   3. usuários de teste (supabase/testes/ci/01_usuarios_teste.sql)
#   4. todos os supabase/testes/*.sql — para na PRIMEIRA exceção
#
# Uso:
#   DATABASE_URL=postgres://user:senha@host:5432/banco scripts/testes-banco.sh
#
# Saída além do terminal: resultados/banco.tsv com uma linha por arquivo
# (arquivo <TAB> resultado), consumida por scripts/relatorio.mjs.
# Convém rodar num banco descartável: o script não apaga nada sozinho,
# mas os testes criam e removem dados próprios.
# =====================================================================
set -euo pipefail

: "${DATABASE_URL:?Defina DATABASE_URL apontando para um Postgres 16 descartável}"

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)
# Migrations em transação única: `-1` faz o arquivo inteiro ser um bloco.
# Sem isso, o psql confirma instrução a instrução e uma migration que
# falha no meio deixa o banco meio migrado — metade das tabelas novas,
# metade das políticas, e nenhum caminho de volta que não seja manual.
# Verificado: as 37 migrations aplicam assim sem erro (nenhuma usa
# CREATE INDEX CONCURRENTLY, que é o que impediria).
PSQL_ATOMICO=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -1)
LOG_DIR="$RAIZ/resultados"
mkdir -p "$LOG_DIR"
RESULTADO="$LOG_DIR/banco.tsv"
: > "$RESULTADO"

echo "== 1/4 stubs de auth e storage =="
"${PSQL[@]}" -f "$RAIZ/supabase/testes/ci/00_stub_supabase.sql"

echo "== 2/4 migrations =="
for f in "$RAIZ"/supabase/migrations/0*.sql; do
  echo "   $(basename "$f")"
  "${PSQL_ATOMICO[@]}" -f "$f"
done

echo "== 3/4 usuários de teste =="
"${PSQL[@]}" -f "$RAIZ/supabase/testes/ci/01_usuarios_teste.sql"

echo "== 4/4 testes de supabase/testes =="
falhou=0
for f in "$RAIZ"/supabase/testes/*.sql; do
  nome="$(basename "$f")"
  echo "-- $nome"
  if "${PSQL[@]}" -f "$f"; then
    printf '%s\tPassou\n' "$nome" >> "$RESULTADO"
  else
    printf '%s\tFalhou\n' "$nome" >> "$RESULTADO"
    falhou=1
    break   # primeira exceção derruba o build, como combinado
  fi
done

if [ "$falhou" -ne 0 ]; then
  # o que não chegou a rodar fica registrado como não executado
  depois=0
  for f in "$RAIZ"/supabase/testes/*.sql; do
    nome="$(basename "$f")"
    if [ "$depois" -eq 1 ]; then printf '%s\tNão executado\n' "$nome" >> "$RESULTADO"; fi
    grep -q "^$nome	Falhou$" "$RESULTADO" && depois=1
  done
  echo "FALHOU — veja acima a primeira exceção." >&2
  exit 1
fi

echo "OK — todos os arquivos de supabase/testes passaram."
