-- =====================================================================
-- Migration : 0040_defasagem_registro.sql
-- Feature   : medir a distância entre acontecer e ser registrado
-- Aplicar   : depois de 0039_acesso_corporativo.sql.
--
-- POR QUE ISTO VEM ANTES DE QUALQUER APLICATIVO DE CAMPO
--
-- A pergunta que sobrou da avaliação é o que acontece com o registro
-- entre a visita e a mesa. A resposta usual seria "fazer um aplicativo".
-- Mas o produto já guarda as duas datas: `ocorrido_em` (quando
-- aconteceu) e `criado_em` (quando foi digitado). A diferença entre elas
-- É a pergunta — e responder com o dado que já existe custa uma view.
--
-- O que se faz com o número:
--   · mediana abaixo de um dia  → não há problema; aplicativo seria
--     desperdício com cara de modernização;
--   · de três a cinco dias      → há perda de qualidade, porque registro
--     de memória é registro vago;
--   · acima disso               → é ali que o dado nasce errado, e agora
--     se sabe em qual carteira.
--
-- UMA ESCOLHA DELIBERADA: POR CARTEIRA, NÃO POR PESSOA
--
-- A avaliação sugeriu medir "por carteira e por pessoa". Ao escrever,
-- ficou claro que a segunda parte era um erro: defasagem por pessoa não
-- mede qualidade do dado, mede a pessoa — e vira régua de cobrança na
-- primeira reunião difícil. A carteira diz onde olhar sem apontar para
-- ninguém, que é o que a decisão precisa. A view não expõe autor.
-- =====================================================================

create or replace view public.defasagem_registro
with (security_invoker = on)
as
with base as (
  select
    r.org_id,
    r.carteira_id,
    -- O dia de quem digitou, não o dia do servidor. `criado_em` é
    -- timestamptz e o servidor roda em UTC: sem converter, tudo o que for
    -- registrado depois das 21h locais cairia no dia seguinte e somaria um
    -- dia falso de defasagem na operação inteira.
    --
    -- LIMITAÇÃO CONHECIDA: o fuso está fixo em São Paulo. Serve para uma
    -- operação brasileira, que é o caso hoje, e erra em uma unidade para
    -- quem registrar de outro fuso — Acre e Fernando de Noronha, na
    -- prática. Quando houver assinante fora do horário de Brasília, isto
    -- vira coluna de configuração da organização, não constante aqui.
    (r.criado_em at time zone 'America/Sao_Paulo')::date - r.ocorrido_em as dias
  from public.registros r
  where r.ativo
    -- Janela de doze meses: defasagem de dois anos atrás não descreve a
    -- operação de hoje, e arrastaria a mediana para sempre.
    and r.ocorrido_em >= current_date - interval '12 months'
)
select
  org_id,
  carteira_id,

  count(*)                                          as registros,

  -- Registro com data futura é planejamento, não atraso: alguém anotou
  -- antes de acontecer. Fica de fora da mediana e é contado à parte,
  -- porque somá-lo como "defasagem negativa" mentiria para os dois lados.
  count(*) filter (where dias < 0)                  as registros_antecipados,

  count(*) filter (where dias = 0)                  as no_mesmo_dia,
  count(*) filter (where dias between 1 and 7)      as ate_uma_semana,
  count(*) filter (where dias > 7)                  as acima_de_uma_semana,

  percentile_cont(0.5) within group (order by dias)
    filter (where dias >= 0)                        as dias_mediana,
  percentile_cont(0.9) within group (order by dias)
    filter (where dias >= 0)                        as dias_p90,
  max(dias) filter (where dias >= 0)                as dias_maximo

from base
group by org_id, carteira_id;

grant select on public.defasagem_registro to authenticated;

comment on view public.defasagem_registro is
  'Distância em dias entre o que aconteceu (ocorrido_em) e o que foi digitado (criado_em), '
  'por carteira, nos últimos doze meses. Serve para decidir se registro em campo é problema '
  'real antes de construir qualquer coisa para resolvê-lo. Não expõe autor de propósito: '
  'a medida é de qualidade do dado, não de pessoa.';

-- ---------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.defasagem_registro') is null then
    raise exception 'A view de defasagem não foi criada';
  end if;

  if not has_table_privilege('authenticated', 'public.defasagem_registro', 'SELECT') then
    raise exception 'Faltou grant na view de defasagem';
  end if;

  -- security_invoker é o que faz a RLS de registros valer aqui. Sem ele,
  -- a view leria com o privilégio de quem a criou e vazaria organização.
  if not exists (
    select 1 from pg_class c
     where c.oid = 'public.defasagem_registro'::regclass
       and array_to_string(c.reloptions, ',') like '%security_invoker=%'
  ) then
    raise exception 'A view não está com security_invoker — leria por cima da RLS';
  end if;

  raise notice 'Defasagem de registro: view criada, com alcance da RLS.';
end $$;
