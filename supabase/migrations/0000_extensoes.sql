-- =====================================================================
-- Migration : 0000_extensoes.sql
-- Feature   : F0 — esqueleto do aplicativo
-- O que faz : habilita as extensoes usadas por todas as migrations
--             seguintes. Nao cria tabela nem politica.
-- Aplicar   : primeira migration, antes de qualquer outra.
-- =====================================================================

-- Geracao de UUID (gen_random_uuid) usada como chave primaria padrao.
create extension if not exists pgcrypto;

-- Busca textual sem acento e por semelhanca, usada nas telas de busca
-- de contas e contratos a partir da F3.
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- Registro de controle: a partir da F1 as tabelas nascem sempre com RLS
-- habilitada na mesma migration que as cria. Nenhuma tabela de dado do
-- assinante pode existir sem politica.
