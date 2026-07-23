-- =====================================================================
-- Índices candidatos — saíram do plano de execução, não de palpite.
--
-- Cada um responde a uma varredura sequencial observada no EXPLAIN
-- ANALYZE com a massa de carga. Índice não muda regra de negócio: é
-- caminho de leitura. Os números do antes e do depois estão no relatório.
--
-- Aplicar como migration 0035 depois de conferir o ganho no seu volume.
-- =====================================================================

-- 1. compromissos por carteira.
--    Sem ele, a view carteira_resumo (tela Comparativo) varre a tabela
--    inteira uma vez POR CARTEIRA: com 25 carteiras e 3 mil compromissos,
--    são 76 mil linhas lidas para devolver 25.
create index if not exists idx_compromissos_carteira
  on public.compromissos (carteira_id);

-- 2. registros por autor.
--    A view acesso_pessoas busca o último registro de cada pessoa e hoje
--    faz varredura sequencial em registros por pessoa da organização.
create index if not exists idx_registros_autor
  on public.registros (autor_id, ocorrido_em desc);

-- 3. registros por carteira e mês, só os ativos.
--    esforco_mensal agrupa por carteira e mês filtrando `ativo`; o índice
--    parcial evita ler o histórico substituído.
create index if not exists idx_registros_carteira_mes
  on public.registros (carteira_id, ocorrido_em desc) where ativo;

-- 4. capturas por carteira.
--    A série mensal do painel agrupa por carteira; hoje só existem
--    índices por org e por entidade.
create index if not exists idx_capturas_carteira
  on public.capturas (carteira_id, confirmado_em desc);

-- 5. contratos por conta e fim.
--    A ficha da conta e o calendário de vencimentos leem por conta e
--    ordenam por fim.
create index if not exists idx_contratos_conta_fim
  on public.contratos (conta_id, fim desc nulls last);

analyze;
