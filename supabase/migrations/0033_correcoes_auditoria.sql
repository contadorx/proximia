-- =====================================================================
-- Migration : 0033_correcoes_auditoria.sql
-- Feature   : B43 — correções da auditoria
-- Aplicar   : depois de 0032_negocio.sql.
--
-- Três correções que a auditoria apontou no banco:
--
--   1. O panorama separava captura de proteção nas FRENTES, mas somava
--      tudo nas CONTAS: uma conta "em proteção" com potencial declarado
--      inflava o teto ofensivo da carteira. Agora contas também separam.
--
--   2. captura_sem_data era SECURITY DEFINER filtrando só por org: ponto
--      focal via o agregado da organização inteira — a única leitura do
--      produto que ignorava o alcance por carteira. Vira invoker (a RLS
--      decide o que soma) e aceita recorte por carteira, para o filtro
--      da tela de relatórios valer também aqui.
--
--   3. tempo_por_etapa só existia agregado por organização; o filtro de
--      carteira da tela de relatórios não tinha como valer para ele.
--      Entra uma função com o mesmo formato, filtrável — mediana não se
--      recombina depois de agregada, então o recorte é feito na origem.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. carteira_resumo: proteção separada também nas contas
-- ---------------------------------------------------------------------
drop view if exists public.carteira_resumo;

create view public.carteira_resumo
with (security_invoker = on)
as
select
  c.id as carteira_id, c.org_id, c.nome, c.codigo, c.regiao, c.status,
  c.responsavel_id, c.score_maturidade, c.score_ciclo,

  coalesce(ct.total, 0)               as contas_total,
  coalesce(ct.protecao, 0)            as contas_protecao,
  coalesce(ct.potencial, 0)           as contas_potencial,
  coalesce(ct.potencial_protecao, 0)  as contas_potencial_protecao,
  coalesce(ct.capturado, 0)           as contas_capturado,

  coalesce(fr.abertas, 0)             as frentes_abertas,
  coalesce(fr.casos, 0)               as frentes_casos,
  coalesce(fr.potencial, 0)           as frentes_potencial,
  coalesce(fr.potencial_protecao, 0)  as frentes_potencial_protecao,
  coalesce(fr.capturado, 0)           as frentes_capturado,

  coalesce(co.total, 0)     as contratos_total,
  coalesce(co.vencidos, 0)  as contratos_vencidos,
  coalesce(co.janela, 0)    as contratos_janela,

  coalesce(op.abertas, 0)          as oportunidades_abertas,
  coalesce(op.investimento, 0)     as oportunidades_investimento,
  coalesce(op.resultado_mensal, 0) as oportunidades_resultado,

  coalesce(cp.abertos, 0)   as compromissos_abertos,
  coalesce(cp.atrasados, 0) as compromissos_atrasados,

  greatest(c.atualizado_em, coalesce(rg.ultimo, c.criado_em)) as ultima_movimentacao,
  rg.ultimo as ultimo_registro

from public.carteiras c

left join lateral (
  select count(*) as total,
         count(*) filter (where relacao = 'protecao') as protecao,
         -- Conta em proteção declara o valor que está em risco, não o
         -- que há para conquistar: fica fora do teto de captura.
         sum(potencial_bruto) filter (where relacao <> 'protecao') as potencial,
         sum(potencial_bruto) filter (where relacao = 'protecao')  as potencial_protecao,
         sum(valor_capturado) as capturado
    from public.contas x where x.carteira_id = c.id and x.status = 'ativa'
) ct on true

left join lateral (
  select
    count(*) filter (where status in ('identificada','em_analise','em_execucao')) as abertas,
    sum(qtd_casos) filter (where status in ('identificada','em_analise','em_execucao')) as casos,
    sum(potencial_bruto) filter (
      where status in ('identificada','em_analise','em_execucao') and natureza = 'captura') as potencial,
    sum(potencial_bruto) filter (
      where status in ('identificada','em_analise','em_execucao') and natureza = 'protecao') as potencial_protecao,
    sum(valor_capturado) as capturado
    from public.frentes x where x.carteira_id = c.id
) fr on true

left join lateral (
  select count(*) filter (where status <> 'encerrado') as total,
         count(*) filter (where status in ('vigente','em_renovacao') and fim < current_date) as vencidos,
         count(*) filter (where status <> 'encerrado' and fim >= current_date
                            and janela_renegociacao <= current_date) as janela
    from public.contratos x where x.carteira_id = c.id
) co on true

left join lateral (
  select count(*) filter (where fase not in ('concluida','descartada')) as abertas,
         sum(investimento) filter (where fase not in ('concluida','descartada')) as investimento,
         sum(resultado_mensal) filter (where fase not in ('concluida','descartada')) as resultado_mensal
    from public.oportunidades x where x.carteira_id = c.id
) op on true

left join lateral (
  select count(*) filter (where status = 'aberto') as abertos,
         count(*) filter (where status = 'aberto' and vence_em < current_date) as atrasados
    from public.compromissos x where x.carteira_id = c.id
) cp on true

left join lateral (
  select max(criado_em) as ultimo from public.registros x
   where x.carteira_id = c.id and x.ativo
) rg on true;

grant select on public.carteira_resumo to authenticated;

comment on view public.carteira_resumo is
  'Resumo por carteira sob security_invoker. contas_potencial e '
  'frentes_potencial são só captura; a proteção sai em colunas próprias '
  'e nunca se soma ao teto — nem aqui, nem na tela.';

-- Observação sobre a série histórica: tirar_foto grava contas_potencial
-- a partir desta view. A partir desta migration, a foto passa a guardar
-- o potencial de captura (sem proteção) — que é a leitura correta. As
-- fotos anteriores continuam como foram tiradas: foto não se retoca.

-- ---------------------------------------------------------------------
-- 2. captura_sem_data: alcance de quem pergunta, recorte por carteira
-- ---------------------------------------------------------------------
drop function if exists public.captura_sem_data(uuid);

create or replace function public.captura_sem_data(p_org uuid, p_carteiras uuid[] default null)
returns numeric
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(sum(valor), 0) from (
    select case when tipo = 'captura' then valor else -valor end as valor
      from public.capturas
     where org_id = p_org
       and confirmado_em is null
       and (p_carteiras is null or carteira_id = any(p_carteiras))
    union all
    select retorno_confirmado from public.oportunidades
     where org_id = p_org
       and retorno_confirmado > 0
       and confirmado_em is null
       and (p_carteiras is null or carteira_id = any(p_carteiras))
  ) fontes;
$$;

grant execute on function public.captura_sem_data(uuid, uuid[]) to authenticated;

comment on function public.captura_sem_data(uuid, uuid[]) is
  'Total capturado sem data de confirmação. Roda com o privilégio de '
  'quem chama: a RLS limita a soma ao que a pessoa enxerga.';

-- ---------------------------------------------------------------------
-- 3. tempo_por_etapa com recorte por carteira
-- ---------------------------------------------------------------------
create or replace function public.tempo_por_etapa_filtrado(p_org uuid, p_carteiras uuid[] default null)
returns table (
  fase         text,
  passagens    bigint,
  dias_medio   numeric,
  dias_mediana double precision,
  dias_maximo  integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    e.fase,
    count(*)                                            as passagens,
    round(avg(e.dias), 1)                               as dias_medio,
    percentile_cont(0.5) within group (order by e.dias) as dias_mediana,
    max(e.dias)                                         as dias_maximo
  from public.oportunidade_etapas e
  join public.oportunidades o on o.id = e.oportunidade_id
  where e.org_id = p_org
    and e.saiu_em is not null
    and (p_carteiras is null or o.carteira_id = any(p_carteiras))
  group by e.fase;
$$;

grant execute on function public.tempo_por_etapa_filtrado(uuid, uuid[]) to authenticated;

comment on function public.tempo_por_etapa_filtrado(uuid, uuid[]) is
  'Mesma leitura da view tempo_por_etapa, com recorte opcional por '
  'carteira. A mediana não se recombina depois de agregada — por isso o '
  'filtro entra na origem, não na tela.';
