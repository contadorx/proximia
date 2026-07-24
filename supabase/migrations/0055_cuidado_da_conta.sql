-- =====================================================================
-- Migration : 0055_cuidado_da_conta.sql
-- Aplicar   : depois de 0054_exclusao_em_lote.sql.
--
-- =====================================================================
-- O QUE ISTO É — E POR QUE NÃO É UM "HEALTH SCORE"
-- =====================================================================
--
-- O pedido era um score por conta, para priorizar. A objeção conhecida
-- contra nota composta continua de pé: peso é opinião disfarçada de
-- número, e uma nota cuja composição ninguém enxerga vira autoridade sem
-- procedência — exatamente o que este produto recusa em todo lugar.
--
-- O desenho aqui resolve os dois lados com duas regras:
--
--   1. TODO ITEM É VERIFICÁVEL PELO PRÓPRIO PRODUTO. Não há campo de
--      texto livre nem julgamento humano dentro do cálculo. Cada critério
--      é uma pergunta de sim ou não que o banco responde sozinho — "tem
--      decisor mapeado?", "houve registro nos últimos 90 dias?". Isso faz
--      cada ponto do índice ter uma origem que dá para abrir e conferir.
--
--   2. O PESO É DO ASSINANTE. O produto sugere uma régua inicial e não
--      manda em nada: a operação decide o que conta, quanto conta, e o
--      que sai da conta. Régua diferente por operação é o esperado, não
--      um defeito.
--
-- O QUE O NÚMERO SIGNIFICA, LITERALMENTE
--
-- Quanto do que a SUA operação definiu como "conta bem cuidada" está
-- verdadeiro nesta conta. Nada além disso.
--
-- Ele NÃO prevê perda, NÃO estima risco e NÃO é nota de crédito. Índice
-- baixo não quer dizer que o cliente vai embora — quer dizer que há itens
-- do próprio checklist da operação sem cumprir. A diferença parece sutil
-- e não é: a primeira leitura vira alarme falso e desconfiança, a segunda
-- vira lista de tarefas.
--
-- É por isso que a tela mostra sempre OS ITENS, e o número só como
-- resumo deles.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. A régua: critérios do assinante
-- ---------------------------------------------------------------------
-- `chave` é fechada de propósito: cada valor corresponde a uma verificação
-- que o produto sabe fazer. Texto livre aqui viraria critério que ninguém
-- consegue avaliar — e um checklist que não se avalia sozinho é planilha.

create table if not exists public.conta_criterios (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,

  chave      text not null check (chave in (
    'tem_responsavel',
    'tem_documento',
    'tem_contato',
    'tem_decisor',
    'mais_de_um_contato',
    'tem_contrato_vigente',
    'contrato_fora_da_janela',
    'registro_recente',
    'tem_receita_informada',
    'tem_captura_recente',
    'sem_compromisso_atrasado',
    'sem_aviso_alto'
  )),

  rotulo     text not null,
  descricao  text,

  -- Peso relativo. 1 a 5 é escala curta de propósito: escala longa vira
  -- discussão sobre decimal e não sobre o que importa.
  peso       smallint not null default 1 check (peso between 1 and 5),

  -- Parâmetro do critério, quando ele tem um. Hoje só `registro_recente`
  -- usa: quantos dias contam como recente.
  parametro  integer,

  ativo      boolean not null default true,
  ordem      smallint not null default 0,
  criado_em  timestamptz not null default now()
);

create unique index if not exists idx_criterio_conta_unico
  on public.conta_criterios (org_id, chave);

alter table public.conta_criterios enable row level security;

drop policy if exists criterios_conta_le on public.conta_criterios;
create policy criterios_conta_le on public.conta_criterios
  for select to authenticated using (public.e_membro(org_id));

drop policy if exists criterios_conta_escreve on public.conta_criterios;
create policy criterios_conta_escreve on public.conta_criterios
  for all to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));

grant select, insert, update, delete on public.conta_criterios to authenticated;


-- ---------------------------------------------------------------------
-- 2. A régua sugerida — sugestão, nunca imposição
-- ---------------------------------------------------------------------
-- Os pesos abaixo são um ponto de partida defensável, não uma verdade.
-- Quem responde por grandes clientes vai discordar de alguns, e discordar
-- é o uso correto desta tela.

create or replace function public.garantir_criterios_conta(p_org uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_n integer;
begin
  perform public.exigir_participacao(p_org);

  insert into public.conta_criterios (org_id, chave, rotulo, descricao, peso, parametro, ordem)
  values
    (p_org, 'tem_decisor', 'Tem decisor mapeado',
     'Alguém com papel que decide está registrado nos contatos. Sem isso, na hora de aprovar não se sabe a quem pedir.', 5, null, 1),

    (p_org, 'registro_recente', 'Houve contato registrado no período',
     'Existe registro nos últimos 90 dias. Conta grande sem conversa registrada é conta que se afasta em silêncio.', 5, 90, 2),

    (p_org, 'tem_contrato_vigente', 'Tem contrato vigente',
     'Existe contrato ativo e dentro do prazo. Relação sem contrato é relação sem prazo, sem aviso e sem reajuste.', 4, null, 3),

    (p_org, 'contrato_fora_da_janela', 'Nenhum contrato vencido ou em janela',
     'Nada vencido nem dentro do aviso prévio. Se este item está falso, há prazo correndo agora.', 4, null, 4),

    (p_org, 'sem_aviso_alto', 'Sem aviso de severidade alta em aberto',
     'Nenhum alerta alto pendente nesta conta.', 3, null, 5),

    (p_org, 'sem_compromisso_atrasado', 'Sem compromisso atrasado',
     'O que foi combinado com o cliente está em dia. Atraso aqui é promessa não cumprida.', 3, null, 6),

    (p_org, 'mais_de_um_contato', 'Mais de um contato',
     'A relação não depende de uma pessoa só. Se ela sair, a conta não fica sem porta de entrada.', 3, null, 7),

    (p_org, 'tem_responsavel', 'Tem responsável definido',
     'Alguém da equipe responde por esta conta.', 3, null, 8),

    (p_org, 'tem_receita_informada', 'Receita atual informada',
     'Sabe-se quanto o cliente já paga. Sem isso não dá para medir o que se está protegendo.', 2, null, 9),

    (p_org, 'tem_captura_recente', 'Houve captura confirmada em 12 meses',
     'Alguma iniciativa se confirmou no período. Ausência não é falha — pode ser conta madura e estável.', 2, null, 10),

    (p_org, 'tem_contato', 'Tem ao menos um contato',
     'Existe pessoa registrada na conta.', 2, null, 11),

    (p_org, 'tem_documento', 'CNPJ registrado',
     'O cadastro tem documento, o que permite cruzar com base pública.', 1, null, 12)
  on conflict (org_id, chave) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.garantir_criterios_conta(uuid) from public, anon;
grant  execute on function public.garantir_criterios_conta(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 3. A avaliação — item a item, por conta
-- ---------------------------------------------------------------------
-- Devolve UMA LINHA POR CRITÉRIO, não só o total. É isso que permite a
-- tela mostrar o porquê: um índice de 60% sem a lista do que faltou seria
-- exatamente o número sem procedência que este produto recusa.

create or replace view public.conta_criterio_avaliado
with (security_invoker = on)
as
select
  c.org_id,
  c.carteira_id,
  c.id                         as conta_id,
  cr.id                        as criterio_id,
  cr.chave,
  cr.rotulo,
  cr.descricao,
  cr.peso,
  cr.ordem,
  cr.parametro,

  case cr.chave
    when 'tem_responsavel' then c.responsavel_id is not null

    when 'tem_documento' then coalesce(trim(c.documento), '') <> ''

    when 'tem_contato' then exists (
      select 1 from public.contatos k where k.conta_id = c.id)

    when 'tem_decisor' then exists (
      select 1 from public.contatos k
        join public.contato_papeis p on p.id = k.papel_id
       where k.conta_id = c.id and p.decide and p.ativo)

    when 'mais_de_um_contato' then (
      select count(*) from public.contatos k where k.conta_id = c.id) > 1

    when 'tem_contrato_vigente' then exists (
      select 1 from public.contratos ct
       where ct.conta_id = c.id
         and ct.status = 'vigente'
         and (ct.fim is null or ct.fim >= current_date))

    when 'contrato_fora_da_janela' then not exists (
      select 1 from public.contratos ct
       where ct.conta_id = c.id
         and ct.status <> 'encerrado'
         and (
           (ct.fim is not null and ct.fim < current_date)
           or (ct.janela_renegociacao is not null
               and current_date >= ct.janela_renegociacao
               and (ct.fim is null or ct.fim >= current_date))
         ))

    when 'registro_recente' then exists (
      select 1 from public.registros r
       where r.entidade_tipo = 'conta' and r.entidade_id = c.id and r.ativo
         and r.ocorrido_em >= current_date - (coalesce(cr.parametro, 90) || ' days')::interval)

    when 'tem_receita_informada' then c.receita_atual is not null

    when 'tem_captura_recente' then exists (
      select 1 from public.capturas k
       where k.entidade_tipo = 'conta' and k.entidade_id = c.id
         and k.tipo = 'captura'
         and k.confirmado_em >= current_date - interval '12 months')

    when 'sem_compromisso_atrasado' then not exists (
      select 1 from public.compromissos cp
       where cp.entidade_tipo = 'conta' and cp.entidade_id = c.id
         and cp.status = 'aberto' and cp.vence_em < current_date)

    when 'sem_aviso_alto' then not exists (
      select 1 from public.alertas a
       where a.entidade_tipo = 'conta' and a.entidade_id = c.id
         and a.status = 'aberto' and a.severidade = 'alta')

    else null
  end as cumprido

from public.contas c
join public.conta_criterios cr
  on cr.org_id = c.org_id and cr.ativo
where c.status = 'ativa';

grant select on public.conta_criterio_avaliado to authenticated;


-- ---------------------------------------------------------------------
-- 4. O resumo por conta
-- ---------------------------------------------------------------------

create or replace view public.conta_cuidado
with (security_invoker = on)
as
select
  org_id,
  carteira_id,
  conta_id,
  count(*)                                      as criterios,
  count(*) filter (where cumprido)               as cumpridos,
  sum(peso)                                      as peso_total,
  sum(peso) filter (where cumprido)              as peso_cumprido,
  round(
    coalesce(sum(peso) filter (where cumprido), 0) * 100.0 / nullif(sum(peso), 0),
    0
  )                                              as indice
from public.conta_criterio_avaliado
group by org_id, carteira_id, conta_id;

grant select on public.conta_cuidado to authenticated;

comment on view public.conta_cuidado is
  'Quanto do checklist definido pelo assinante está verdadeiro em cada conta. Não prevê perda '
  'nem estima risco: índice baixo significa itens do próprio checklist por cumprir. Os itens '
  'estão em conta_criterio_avaliado — o número sozinho não deve ser mostrado sem eles.';


do $$
begin
  if to_regclass('public.conta_criterios') is null
     or to_regclass('public.conta_criterio_avaliado') is null
     or to_regclass('public.conta_cuidado') is null then
    raise exception 'As estruturas do índice de cuidado não foram criadas';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.conta_criterios'::regclass) then
    raise exception 'RLS não está ligada em conta_criterios';
  end if;

  raise notice 'Índice de cuidado: régua do assinante, itens verificáveis e resumo por conta.';
end $$;
