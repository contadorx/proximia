-- =====================================================================
-- Migration : 0056_plano_maturidade.sql
-- Aplicar   : depois de 0055_cuidado_da_conta.sql.
--
-- O QUE FALTAVA
--
-- O diagnóstico de maturidade dizia onde cada unidade está e parava ali.
-- Saber que uma SPE tem 40% não move nada — a pergunta seguinte é
-- sempre "e agora, por onde começo?", e ela não tinha resposta dentro do
-- produto.
--
-- Este plano fecha esse laço, com três decisões.
--
-- 1. A PRIORIDADE É CALCULADA, NÃO OPINADA.
--
--    Cada pergunta vale um tanto do score, e o quanto ela vale sai da
--    régua que o próprio assinante montou: peso da pergunta × peso da
--    dimensão. Uma pergunta com nota 1 e peso alto devolve mais pontos
--    que três perguntas com nota 3 e peso baixo — e a conta é feita,
--    não estimada. `pontos_recuperaveis` diz, em pontos do score, quanto
--    aquela lacuna vale se for levada a 4.
--
--    Isso troca "acho que devíamos melhorar o relacionamento" por
--    "fechar esta pergunta vale 8,6 pontos; aquela vale 1,2".
--
-- 2. ITEM DE PLANO VIRA COMPROMISSO DE VERDADE.
--
--    Plano que mora em tela de plano não é acompanhado. Ao criar o item,
--    nasce um compromisso na carteira — com dono e prazo, na mesma
--    Pendências onde o resto do trabalho já aparece. Não há objeto novo
--    competindo por atenção: há um vínculo.
--
-- 3. O PLANO SOBREVIVE AO CICLO.
--
--    Ele guarda a nota de origem e o ciclo em que a lacuna foi vista.
--    No ciclo seguinte, dá para dizer o que mudou de fato — que é a única
--    forma de um diagnóstico anual valer alguma coisa.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Onde estão as lacunas, e quanto cada uma vale
-- ---------------------------------------------------------------------

create or replace view public.maturidade_lacuna
with (security_invoker = on)
as
with base as (
  select
    a.id            as avaliacao_id,
    a.org_id,
    a.carteira_id,
    a.ciclo_id,
    p.id            as pergunta_id,
    p.texto         as pergunta,
    d.id            as dimensao_id,
    d.nome          as dimensao,
    r.nota,
    (p.peso * d.peso)                  as peso_combinado,
    sum(p.peso * d.peso * 4) over (partition by a.id) as denominador
  from public.maturidade_avaliacoes a
  join public.maturidade_respostas r  on r.avaliacao_id = a.id
  join public.maturidade_perguntas p  on p.id = r.pergunta_id
  join public.maturidade_dimensoes d  on d.id = p.dimensao_id
)
select
  avaliacao_id,
  org_id,
  carteira_id,
  ciclo_id,
  pergunta_id,
  pergunta,
  dimensao_id,
  dimensao,
  nota,
  peso_combinado,
  -- Quanto do score volta se esta pergunta for a 4. É a régua do
  -- assinante respondendo onde o esforço rende mais.
  round((4 - nota) * peso_combinado * 100.0 / nullif(denominador, 0), 1)
    as pontos_recuperaveis
from base
where nota < 4;

grant select on public.maturidade_lacuna to authenticated;

comment on view public.maturidade_lacuna is
  'Perguntas com nota abaixo do máximo, com quantos pontos do score cada uma devolve se for '
  'resolvida. A prioridade sai da régua do assinante — peso da pergunta x peso da dimensão — '
  'e não de opinião sobre o que é mais importante.';


-- ---------------------------------------------------------------------
-- 2. O plano
-- ---------------------------------------------------------------------

create table if not exists public.maturidade_plano (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs (id) on delete cascade,
  carteira_id    uuid not null references public.carteiras (id) on delete cascade,
  pergunta_id    uuid not null references public.maturidade_perguntas (id) on delete cascade,

  -- O retrato do momento em que a lacuna foi vista. Guardar isto é o que
  -- permite dizer, no ciclo seguinte, o que mudou.
  ciclo_origem_id uuid references public.maturidade_ciclos (id) on delete set null,
  nota_origem     smallint not null check (nota_origem between 0 and 4),

  acao           text not null check (length(btrim(acao)) > 0),
  dono_id        uuid references public.equipe (id) on delete set null,
  prazo          date,

  status         text not null default 'aberto'
                 check (status in ('aberto', 'concluido', 'cancelado')),

  -- O compromisso que nasceu junto. Plano sem compromisso não é
  -- acompanhado; compromisso sem plano perde a origem.
  compromisso_id uuid references public.compromissos (id) on delete set null,

  criado_em      timestamptz not null default now(),
  criado_por     uuid references auth.users (id),
  concluido_em   timestamptz
);

create index if not exists idx_plano_carteira on public.maturidade_plano (carteira_id, status);
create index if not exists idx_plano_pergunta on public.maturidade_plano (pergunta_id);

alter table public.maturidade_plano enable row level security;

drop policy if exists plano_le on public.maturidade_plano;
create policy plano_le on public.maturidade_plano
  for select to authenticated using (public.tem_acesso_carteira(carteira_id));

drop policy if exists plano_escreve on public.maturidade_plano;
create policy plano_escreve on public.maturidade_plano
  for all to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id))
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

grant select, insert, update, delete on public.maturidade_plano to authenticated;


-- ---------------------------------------------------------------------
-- 3. Criar item de plano — e o compromisso junto
-- ---------------------------------------------------------------------
-- O compromisso guarda de onde veio, e a lista de origens é fechada de
-- propósito: assim a tela consegue agrupar e explicar. Origem nova entra
-- ampliando a trava, nunca driblando com 'manual' — compromisso que
-- mente sobre a própria origem some do agrupamento e some do sentido.
--
-- E a trava `origem_tem_referencia` exige que origem não-manual aponte
-- para o que a gerou: aqui é a pergunta do diagnóstico. Assim, do
-- compromisso dá para voltar à lacuna que o justificou.

alter table public.compromissos drop constraint if exists compromissos_origem_check;
alter table public.compromissos add constraint compromissos_origem_check
  check (origem in ('manual', 'contrato', 'clausula', 'playbook', 'maturidade'));


create or replace function public.criar_item_plano(
  p_avaliacao uuid,
  p_pergunta uuid,
  p_acao text,
  p_dono uuid default null,
  p_prazo date default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_org       uuid;
  v_carteira  uuid;
  v_ciclo     uuid;
  v_nota      smallint;
  v_pergunta  text;
  v_dono_user uuid;
  v_compromisso uuid;
  v_id        uuid;
begin
  select a.org_id, a.carteira_id, a.ciclo_id, r.nota, p.texto
    into v_org, v_carteira, v_ciclo, v_nota, v_pergunta
    from public.maturidade_avaliacoes a
    join public.maturidade_respostas r on r.avaliacao_id = a.id and r.pergunta_id = p_pergunta
    join public.maturidade_perguntas p on p.id = p_pergunta
   where a.id = p_avaliacao;

  if v_org is null then
    raise exception 'Avaliação ou pergunta não encontrada.' using errcode = 'P0002';
  end if;

  if not public.pode_escrever(v_org) or not public.tem_acesso_carteira(v_carteira) then
    raise exception 'Sem permissão para planejar nesta carteira.' using errcode = '42501';
  end if;

  -- O compromisso é da carteira: é lá que o trabalho de maturidade
  -- acontece, e é lá que ele aparece em Pendências junto do resto.
  select e.user_id into v_dono_user from public.equipe e where e.id = p_dono;

  insert into public.compromissos
    (org_id, carteira_id, entidade_tipo, entidade_id, titulo, descricao,
     vence_em, dono_id, origem, origem_id)
  values
    (v_org, v_carteira, 'carteira', v_carteira,
     left('Maturidade: ' || p_acao, 160),
     'Origem: pergunta "' || left(v_pergunta, 120) || '" com nota ' || v_nota || ' no diagnóstico.',
     p_prazo, v_dono_user, 'maturidade', p_pergunta)
  returning id into v_compromisso;

  insert into public.maturidade_plano
    (org_id, carteira_id, pergunta_id, ciclo_origem_id, nota_origem,
     acao, dono_id, prazo, compromisso_id, criado_por)
  values
    (v_org, v_carteira, p_pergunta, v_ciclo, v_nota,
     p_acao, p_dono, p_prazo, v_compromisso, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.criar_item_plano(uuid, uuid, text, uuid, date) from public, anon;
grant  execute on function public.criar_item_plano(uuid, uuid, text, uuid, date) to authenticated;


-- ---------------------------------------------------------------------
-- 4. O que mudou desde que o plano foi feito
-- ---------------------------------------------------------------------
-- Compara a nota de origem com a nota mais recente da mesma pergunta na
-- mesma carteira. É o que transforma diagnóstico anual em ciclo.

create or replace view public.maturidade_plano_situacao
with (security_invoker = on)
as
select
  pl.id,
  pl.org_id,
  pl.carteira_id,
  pl.pergunta_id,
  pl.acao,
  pl.dono_id,
  pl.prazo,
  pl.status,
  pl.nota_origem,
  pl.criado_em,
  pl.compromisso_id,
  p.texto                       as pergunta,
  d.nome                        as dimensao,
  atual.nota                    as nota_atual,
  atual.ciclo_nome              as ciclo_atual,
  case
    when atual.nota is null            then 'sem nova avaliação'
    when atual.nota > pl.nota_origem   then 'melhorou'
    when atual.nota = pl.nota_origem   then 'sem mudança'
    else 'piorou'
  end                           as movimento
from public.maturidade_plano pl
join public.maturidade_perguntas p on p.id = pl.pergunta_id
join public.maturidade_dimensoes d on d.id = p.dimensao_id
left join lateral (
  select r.nota, c.nome as ciclo_nome
    from public.maturidade_avaliacoes a
    join public.maturidade_respostas r on r.avaliacao_id = a.id
    join public.maturidade_ciclos c on c.id = a.ciclo_id
   where a.carteira_id = pl.carteira_id
     and r.pergunta_id = pl.pergunta_id
     and (pl.ciclo_origem_id is null or a.ciclo_id <> pl.ciclo_origem_id)
   order by c.referencia desc nulls last, a.criado_em desc
   limit 1
) atual on true;

grant select on public.maturidade_plano_situacao to authenticated;


do $$
begin
  if to_regclass('public.maturidade_plano') is null
     or to_regclass('public.maturidade_lacuna') is null
     or to_regclass('public.maturidade_plano_situacao') is null then
    raise exception 'As estruturas do plano de maturidade não foram criadas';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.maturidade_plano'::regclass) then
    raise exception 'RLS não está ligada em maturidade_plano';
  end if;
  raise notice 'Plano de maturidade: lacunas priorizadas, itens que viram compromisso e leitura de ciclo.';
end $$;
