-- =====================================================================
-- Migration : 0019_captura_mensal.sql
-- Feature   : B25 — painel de decisão
-- Aplicar   : depois de 0018_responsabilidades.sql.
--
-- O painel precisava responder "o que mudou", e para isso falta série no
-- tempo. Ela já existe nos dados, escondida: contas, frentes e
-- oportunidades guardam o valor confirmado e a data da confirmação.
-- Agrupar por essa data dá uma curva legítima, sem inventar histórico e
-- sem criar tabela de fatos.
--
-- Uma consequência honesta: valor capturado sem data de confirmação fica
-- fora da curva. A tela diz isso em vez de somar tudo no mês corrente,
-- que daria um pico falso.
-- =====================================================================

drop view if exists public.captura_mensal;

create view public.captura_mensal
with (security_invoker = on)
as
select
  org_id,
  carteira_id,
  date_trunc('month', confirmado_em)::date as mes,
  origem,
  sum(valor)                               as valor
from (
  select org_id, carteira_id, capturado_confirmado_em as confirmado_em,
         'conta'::text as origem, valor_capturado as valor
    from public.contas
   where valor_capturado is not null
     and valor_capturado > 0
     and capturado_confirmado_em is not null

  union all

  select org_id, carteira_id, capturado_confirmado_em,
         'frente', valor_capturado
    from public.frentes
   where valor_capturado is not null
     and valor_capturado > 0
     and capturado_confirmado_em is not null

  union all

  -- Oportunidade concluída entra pelo retorno mensal confirmado: é o que
  -- ela passou a gerar, não o que se investiu nela.
  select org_id, carteira_id, confirmado_em,
         'oportunidade', retorno_confirmado
    from public.oportunidades
   where retorno_confirmado is not null
     and retorno_confirmado > 0
     and confirmado_em is not null
) fontes
group by org_id, carteira_id, date_trunc('month', confirmado_em), origem;

comment on view public.captura_mensal is
  'Valor confirmado por mês, por carteira e por origem. Respeita a RLS das '
  'tabelas de origem.';

grant select on public.captura_mensal to authenticated;

-- ---------------------------------------------------------------------
-- Quanto ficou de fora da curva
-- ---------------------------------------------------------------------
-- Serve para a tela ser honesta sobre o próprio gráfico: se há muito
-- valor sem data, a curva conta meia história e quem lê precisa saber.
create or replace function public.captura_sem_data(p_org uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(valor), 0) from (
    select valor_capturado as valor from public.contas
     where org_id = p_org and valor_capturado > 0 and capturado_confirmado_em is null
    union all
    select valor_capturado from public.frentes
     where org_id = p_org and valor_capturado > 0 and capturado_confirmado_em is null
    union all
    select retorno_confirmado from public.oportunidades
     where org_id = p_org and retorno_confirmado > 0 and confirmado_em is null
  ) fontes;
$$;

grant execute on function public.captura_sem_data(uuid) to authenticated;
