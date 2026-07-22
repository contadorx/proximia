-- =====================================================================
-- Migration : 0028_financeiro.sql
-- Feature   : B37 — análise financeira das oportunidades
-- Aplicar   : depois de 0027_historico_estado.sql.
--
-- O produto já calculava payback simples e retorno percentual. Os dois
-- ignoram o tempo: mil reais daqui a cinco anos valem menos que mil hoje,
-- e decidir investimento sem isso favorece sistematicamente projeto longo.
--
-- Entram três leituras que descontam o tempo:
--
--   VPL  — quanto o projeto vale hoje, já descontado o custo do dinheiro.
--          Positivo significa que cria valor acima da taxa exigida.
--   TIR  — a taxa em que o projeto empata. Compara-se com a taxa exigida.
--   Payback descontado — quando o investimento se paga em valor de hoje;
--          sempre mais longo que o simples, e mais honesto.
--
-- A taxa de desconto é do assinante, não do produto: cada operação tem o
-- próprio custo de capital, e cravar um número seria opinar sobre o
-- negócio dos outros.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Parâmetros financeiros da organização
-- ---------------------------------------------------------------------
create table if not exists public.parametros_financeiros (
  org_id              uuid primary key references public.orgs (id) on delete cascade,
  taxa_desconto_anual numeric(6, 4) not null default 0.12
                        check (taxa_desconto_anual >= 0 and taxa_desconto_anual < 3),
  observacao          text,
  atualizado_em       timestamptz not null default now(),
  atualizado_por      uuid references auth.users (id)
);

comment on column public.parametros_financeiros.taxa_desconto_anual is
  'Custo de capital da operação, em fração ao ano (0,12 = 12%). Padrão de '
  'partida, não recomendação: cada assinante define o seu.';

alter table public.parametros_financeiros enable row level security;

drop policy if exists parametros_le on public.parametros_financeiros;
create policy parametros_le on public.parametros_financeiros
  for select to authenticated using (public.e_membro(org_id));

drop policy if exists parametros_escreve on public.parametros_financeiros;
create policy parametros_escreve on public.parametros_financeiros
  for all to authenticated
  using (public.e_admin(org_id))
  with check (public.e_admin(org_id));

grant select, insert, update on public.parametros_financeiros to authenticated;

-- ---------------------------------------------------------------------
-- 2. As contas
-- ---------------------------------------------------------------------
-- Fluxo mensal constante: investimento na entrada, resultado líquido
-- todo mês pelo horizonte declarado. É a forma do dado que o produto
-- coleta — e assumir mais precisão do que o dado tem seria falso rigor.

create or replace function public.taxa_mensal(p_anual numeric)
returns numeric
language sql
immutable
as $$ select power(1 + p_anual, 1.0 / 12) - 1 $$;

-- Valor presente líquido de um fluxo constante.
create or replace function public.vpl(
  p_investimento numeric,
  p_fluxo_mensal numeric,
  p_meses        integer,
  p_taxa_mensal  numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_investimento is null or p_fluxo_mensal is null or p_meses is null then null
    when p_taxa_mensal = 0 then (p_fluxo_mensal * p_meses) - p_investimento
    else round(
      p_fluxo_mensal * (1 - power(1 + p_taxa_mensal, -p_meses)) / p_taxa_mensal
        - p_investimento,
      2)
  end
$$;

-- Payback descontado, em meses. Nulo quando o fluxo nunca cobre o
-- investimento em valor presente — e nesse caso dizer "não tem" é a
-- resposta certa, não um número grande.
create or replace function public.payback_descontado(
  p_investimento numeric,
  p_fluxo_mensal numeric,
  p_taxa_mensal  numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_investimento is null or p_fluxo_mensal is null or p_fluxo_mensal <= 0 then null
    when p_taxa_mensal = 0 then round(p_investimento / p_fluxo_mensal, 1)
    -- O valor presente de uma perpetuidade é fluxo/taxa. Se o
    -- investimento passa disso, nenhum prazo paga.
    when p_investimento >= p_fluxo_mensal / p_taxa_mensal then null
    else round(
      -ln(1 - (p_investimento * p_taxa_mensal / p_fluxo_mensal)) / ln(1 + p_taxa_mensal),
      1)
  end
$$;

-- Taxa interna de retorno mensal, por bisseção. Não há forma fechada
-- para fluxo com prazo finito; vinte e cinco iterações dão precisão bem
-- além da que o dado de entrada merece.
create or replace function public.tir_mensal(
  p_investimento numeric,
  p_fluxo_mensal numeric,
  p_meses        integer
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_baixo  numeric := 0.0000001;
  v_alto   numeric := 1.0;
  v_meio   numeric;
  v_valor  numeric;
begin
  if p_investimento is null or p_fluxo_mensal is null or p_meses is null
     or p_investimento <= 0 or p_fluxo_mensal <= 0 then
    return null;
  end if;

  -- Sem cobrir o investimento nem sem juro nenhum, não existe taxa que
  -- empate: o projeto perde dinheiro em qualquer cenário.
  if p_fluxo_mensal * p_meses <= p_investimento then
    return null;
  end if;

  for i in 1..25 loop
    v_meio := (v_baixo + v_alto) / 2;
    v_valor := p_fluxo_mensal * (1 - power(1 + v_meio, -p_meses)) / v_meio - p_investimento;

    if v_valor > 0 then
      v_baixo := v_meio;
    else
      v_alto := v_meio;
    end if;
  end loop;

  return round((v_baixo + v_alto) / 2, 6);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. A leitura pronta
-- ---------------------------------------------------------------------
drop view if exists public.oportunidade_financeiro;

create view public.oportunidade_financeiro
with (security_invoker = on)
as
select
  o.id                      as oportunidade_id,
  o.org_id,
  o.carteira_id,
  o.titulo,
  o.fase,
  o.investimento,
  o.retorno_mensal,
  o.custo_mensal,
  o.horizonte_meses,
  o.resultado_mensal,
  o.payback_meses            as payback_simples,
  o.retorno_percentual,

  coalesce(pf.taxa_desconto_anual, 0.12)                       as taxa_anual,
  public.taxa_mensal(coalesce(pf.taxa_desconto_anual, 0.12))   as taxa_mes,

  public.vpl(
    o.investimento, o.resultado_mensal, o.horizonte_meses,
    public.taxa_mensal(coalesce(pf.taxa_desconto_anual, 0.12))
  )                                                            as vpl,

  public.payback_descontado(
    o.investimento, o.resultado_mensal,
    public.taxa_mensal(coalesce(pf.taxa_desconto_anual, 0.12))
  )                                                            as payback_descontado,

  -- Payback que só chega depois do horizonte declarado é payback que não
  -- acontece. O número continua visível, mas acompanhado do aviso — sem
  -- ele, "314 meses" num projeto de 60 parece resposta e é armadilha.
  case
    when public.payback_descontado(
      o.investimento, o.resultado_mensal,
      public.taxa_mensal(coalesce(pf.taxa_desconto_anual, 0.12))) is null then false
    else public.payback_descontado(
      o.investimento, o.resultado_mensal,
      public.taxa_mensal(coalesce(pf.taxa_desconto_anual, 0.12))) <= o.horizonte_meses
  end                                                          as paga_no_horizonte,

  public.tir_mensal(o.investimento, o.resultado_mensal, o.horizonte_meses) as tir_mes,

  case
    when public.tir_mensal(o.investimento, o.resultado_mensal, o.horizonte_meses) is null
      then null
    else round(
      (power(1 + public.tir_mensal(o.investimento, o.resultado_mensal, o.horizonte_meses), 12) - 1)
      * 100, 2)
  end                                                          as tir_anual_pct,

  -- Índice de lucratividade: quanto de valor presente cada real investido
  -- devolve. Acima de 1, o projeto se paga com folga.
  case
    when o.investimento is null or o.investimento = 0 then null
    else round(
      (public.vpl(
        o.investimento, o.resultado_mensal, o.horizonte_meses,
        public.taxa_mensal(coalesce(pf.taxa_desconto_anual, 0.12))
      ) + o.investimento) / o.investimento, 2)
  end                                                          as indice_lucratividade,

  -- Custo total no horizonte: o que sai do caixa somando capital e
  -- operação. Some isso ao retorno bruto e a conta fecha.
  case
    when o.investimento is null then null
    else o.investimento + (o.custo_mensal * o.horizonte_meses)
  end                                                          as custo_total_horizonte,

  case
    when o.retorno_mensal is null then null
    else o.retorno_mensal * o.horizonte_meses
  end                                                          as retorno_bruto_horizonte

from public.oportunidades o
left join public.parametros_financeiros pf on pf.org_id = o.org_id;

comment on view public.oportunidade_financeiro is
  'Leitura financeira por oportunidade. Fluxo constante: é a forma do dado '
  'que o produto coleta, e assumir mais precisão seria falso rigor.';

grant select on public.oportunidade_financeiro to authenticated;
grant execute on function public.taxa_mensal(numeric)                         to authenticated;
grant execute on function public.vpl(numeric, numeric, integer, numeric)      to authenticated;
grant execute on function public.payback_descontado(numeric, numeric, numeric) to authenticated;
grant execute on function public.tir_mensal(numeric, numeric, integer)        to authenticated;
