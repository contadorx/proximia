-- =====================================================================
-- Migration : 0041_conversao_por_fase.sql
-- Feature   : conversão observada por fase
-- Aplicar   : depois de 0040_defasagem_registro.sql.
--
-- O QUE ISTO É — E, SOBRETUDO, O QUE NÃO É
--
-- Todo CRM tem "previsão ponderada": alguém digita 30% para proposta,
-- 60% para negociação, e o sistema multiplica pelo valor. Esse número é
-- pior que uma meta. A meta é honesta sobre ser opinião; a probabilidade
-- digitada é opinião vestida de dado — ninguém discute uma meta achando
-- que ela é medição, e todo mundo discute receita ponderada achando.
--
-- O que entra aqui é outra coisa: a taxa OBSERVADA na história da própria
-- organização. De quantas oportunidades que passaram pela fase e já
-- fecharam, quantas fecharam ganhas. Tem procedência, tem tamanho de
-- amostra e é falseável — no trimestre seguinte a taxa muda ou não muda,
-- e dá para conferir.
--
-- NÃO HÁ MULTIPLICAÇÃO POR VALOR aqui, e é deliberado. Somar
-- investimento × taxa produz uma cifra única, e cifra única é o que vai
-- para o slide e vira alvo na segunda-feira. Se um dia a soma existir,
-- ela nasce desta medição — nunca de percentual digitado.
--
-- COMO SE CONTA
--
--   · passou pela fase        → existe passagem registrada em
--                               oportunidade_etapas;
--   · já fechou               → a oportunidade está hoje em concluida ou
--                               descartada;
--   · a taxa só olha o que fechou. Oportunidade viva não é vitória nem
--     derrota: fica contada à parte, como "ainda em jogo".
--
-- A view devolve CONTAGEM, não percentual. O percentual é calculado na
-- leitura, somando contagens — nunca fazendo média de taxas, que é o erro
-- clássico de dar a uma carteira de 3 casos o mesmo peso de uma com 300.
-- =====================================================================

create or replace view public.conversao_por_fase
with (security_invoker = on)
as
with passagens as (
  -- distinct porque uma oportunidade pode voltar para uma fase: passou é
  -- passou, e contar duas vezes inflaria o denominador.
  select distinct
    e.org_id,
    o.carteira_id,
    e.fase,
    e.oportunidade_id,
    o.fase as fase_atual
  from public.oportunidade_etapas e
  join public.oportunidades o on o.id = e.oportunidade_id
  -- Medir conversão depois de "concluida" não quer dizer nada: seria 100%
  -- por definição. Descartada, idem.
  where e.fase not in ('concluida', 'descartada')
)
select
  org_id,
  carteira_id,
  fase,
  count(*) filter (where fase_atual in ('concluida', 'descartada')) as fechadas,
  count(*) filter (where fase_atual = 'concluida')                  as ganhas,
  count(*) filter (where fase_atual = 'descartada')                 as perdidas,
  count(*) filter (where fase_atual not in ('concluida', 'descartada')) as em_jogo
from passagens
group by org_id, carteira_id, fase;

grant select on public.conversao_por_fase to authenticated;

comment on view public.conversao_por_fase is
  'Quantas oportunidades passaram por cada fase e como terminaram, na história da própria '
  'organização. Contagem, não percentual: a taxa é calculada na leitura somando contagens, '
  'para carteira pequena não pesar igual a carteira grande. Não multiplica por valor de '
  'propósito — cifra ponderada vira meta.';

-- ---------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.conversao_por_fase') is null then
    raise exception 'A view de conversão por fase não foi criada';
  end if;

  if not has_table_privilege('authenticated', 'public.conversao_por_fase', 'SELECT') then
    raise exception 'Faltou grant na view de conversão';
  end if;

  if not exists (
    select 1 from pg_class c
     where c.oid = 'public.conversao_por_fase'::regclass
       and array_to_string(c.reloptions, ',') like '%security_invoker=%'
  ) then
    raise exception 'A view não está com security_invoker — leria por cima da RLS';
  end if;

  raise notice 'Conversão por fase: view criada, com alcance da RLS.';
end $$;
