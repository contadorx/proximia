-- =====================================================================
-- Migration : 0013_panorama_oportunidades_convites.sql
-- Features  : F17 — panorama com oportunidades · F18 — convite por e-mail
-- Aplicar   : depois de 0012_maturidade.sql.
--
-- Duas coisas independentes, na mesma migration porque as duas mexem em
-- estrutura pequena e são aplicadas juntas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Panorama passa a contar oportunidades
-- ---------------------------------------------------------------------
-- A visão foi escrita antes de oportunidades existirem, então a
-- consolidação por carteira contava meia história: mostrava o que se
-- espera capturar e não mostrava o que se pretende investir.
drop view if exists public.carteira_resumo;

create view public.carteira_resumo
with (security_invoker = on)
as
select
  c.id                as carteira_id,
  c.org_id,
  c.nome,
  c.codigo,
  c.regiao,
  c.status,
  c.responsavel_id,
  c.score_maturidade,
  c.score_ciclo,

  coalesce(ct.total, 0)                 as contas_total,
  coalesce(ct.protecao, 0)              as contas_protecao,
  coalesce(ct.potencial, 0)             as contas_potencial,
  coalesce(ct.capturado, 0)             as contas_capturado,

  coalesce(fr.abertas, 0)               as frentes_abertas,
  coalesce(fr.casos, 0)                 as frentes_casos,
  coalesce(fr.potencial, 0)             as frentes_potencial,
  coalesce(fr.capturado, 0)             as frentes_capturado,

  coalesce(co.total, 0)                 as contratos_total,
  coalesce(co.vencidos, 0)              as contratos_vencidos,
  coalesce(co.janela, 0)                as contratos_janela,

  coalesce(op.abertas, 0)               as oportunidades_abertas,
  coalesce(op.investimento, 0)          as oportunidades_investimento,
  coalesce(op.resultado_mensal, 0)      as oportunidades_resultado,

  coalesce(cp.abertos, 0)               as compromissos_abertos,
  coalesce(cp.atrasados, 0)             as compromissos_atrasados,

  greatest(c.atualizado_em, coalesce(rg.ultimo, c.criado_em)) as ultima_movimentacao,
  rg.ultimo                                                   as ultimo_registro

from public.carteiras c

left join lateral (
  select
    count(*)                                              as total,
    count(*) filter (where relacao = 'protecao')          as protecao,
    sum(potencial_bruto)                                  as potencial,
    sum(valor_capturado)                                  as capturado
  from public.contas x
  where x.carteira_id = c.id and x.status = 'ativa'
) ct on true

left join lateral (
  select
    count(*) filter (where status in ('identificada', 'em_analise', 'em_execucao')) as abertas,
    sum(qtd_casos) filter (where status in ('identificada', 'em_analise', 'em_execucao')) as casos,
    sum(potencial_bruto) filter (where status in ('identificada', 'em_analise', 'em_execucao')) as potencial,
    sum(valor_capturado)                                                              as capturado
  from public.frentes x
  where x.carteira_id = c.id
) fr on true

left join lateral (
  select
    count(*) filter (where status <> 'encerrado')                     as total,
    count(*) filter (where status = 'vigente' and fim < current_date) as vencidos,
    count(*) filter (where status <> 'encerrado'
                       and fim >= current_date
                       and janela_renegociacao <= current_date)       as janela
  from public.contratos x
  where x.carteira_id = c.id
) co on true

left join lateral (
  select
    count(*) filter (where fase not in ('concluida', 'descartada'))            as abertas,
    sum(investimento) filter (where fase not in ('concluida', 'descartada'))   as investimento,
    sum(resultado_mensal) filter (where fase not in ('concluida', 'descartada')) as resultado_mensal
  from public.oportunidades x
  where x.carteira_id = c.id
) op on true

left join lateral (
  select
    count(*) filter (where status = 'aberto')                             as abertos,
    count(*) filter (where status = 'aberto' and vence_em < current_date) as atrasados
  from public.compromissos x
  where x.carteira_id = c.id
) cp on true

left join lateral (
  select max(criado_em) as ultimo
  from public.registros x
  where x.carteira_id = c.id and x.ativo
) rg on true;

comment on view public.carteira_resumo is
  'Consolidacao por carteira. Respeita a RLS de cada tabela de origem: quem '
  'so acessa uma carteira so ve os numeros dela.';

grant select on public.carteira_resumo to authenticated;

-- ---------------------------------------------------------------------
-- 2. Convites
-- ---------------------------------------------------------------------
-- Ate aqui, incluir alguem exigia que a pessoa ja tivesse criado o acesso
-- por conta propria — atrito na hora de montar a equipe. O convite inverte
-- a ordem: manda o link, a pessoa entra e o vinculo se cria sozinho.
create table if not exists public.convites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  email      text not null,
  papel      public.papel_membro not null default 'analista',
  token      text not null unique default encode(gen_random_bytes(24), 'hex'),
  status     text not null default 'pendente'
               check (status in ('pendente', 'aceito', 'cancelado')),
  expira_em  timestamptz not null default now() + interval '14 days',
  criado_em  timestamptz not null default now(),
  criado_por uuid references auth.users (id),
  aceito_em  timestamptz,
  aceito_por uuid references auth.users (id)
);

comment on table public.convites is
  'Convite de acesso. O token e o segredo do link; expira em 14 dias e vale '
  'uma vez so.';

create unique index if not exists idx_convite_pendente
  on public.convites (org_id, lower(email)) where status = 'pendente';

-- Aceitar o convite: valida token, prazo e e-mail, e cria o vinculo.
-- SECURITY DEFINER porque quem aceita ainda nao e membro de nada e, por
-- isso, nao enxerga o convite pelas politicas normais.
-- Os nomes de saida nao repetem nomes de coluna das tabelas: se
-- repetissem, o "on conflict (org_id, user_id)" la embaixo ficaria
-- ambiguo entre a coluna da tabela e a variavel de retorno.
create or replace function public.aceitar_convite(p_token text)
returns table (organizacao_id uuid, organizacao_nome text, papel_concedido public.papel_membro)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_convite public.convites;
  v_email   text;
begin
  if auth.uid() is null then
    raise exception 'Faça login para aceitar o convite.';
  end if;

  select u.email into v_email from auth.users u where u.id = auth.uid();
  select * into v_convite from public.convites c where c.token = p_token;

  if v_convite.id is null then
    raise exception 'Convite não encontrado. Confira o link recebido.';
  end if;
  if v_convite.status <> 'pendente' then
    raise exception 'Este convite já foi usado ou cancelado.';
  end if;
  if v_convite.expira_em < now() then
    raise exception 'Este convite expirou. Peça um novo.';
  end if;
  if lower(v_convite.email) <> lower(v_email) then
    raise exception 'Este convite foi enviado para %, e você está com outro e-mail.', v_convite.email;
  end if;

  insert into public.memberships (org_id, user_id, papel, criado_por)
  values (v_convite.org_id, auth.uid(), v_convite.papel, v_convite.criado_por)
  on conflict (org_id, user_id) do update set papel = excluded.papel, ativo = true;

  update public.convites
     set status = 'aceito', aceito_em = now(), aceito_por = auth.uid()
   where id = v_convite.id;

  return query
    select o.id, o.nome, v_convite.papel from public.orgs o where o.id = v_convite.org_id;
end;
$$;

-- Leitura do convite antes de aceitar, para a tela dizer de quem e para quem.
create or replace function public.ver_convite(p_token text)
returns table (org_nome text, email text, papel public.papel_membro, valido boolean, motivo text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    o.nome,
    c.email,
    c.papel,
    (c.status = 'pendente' and c.expira_em >= now()) as valido,
    case
      when c.status = 'aceito' then 'Este convite já foi usado.'
      when c.status = 'cancelado' then 'Este convite foi cancelado.'
      when c.expira_em < now() then 'Este convite expirou.'
      else null
    end
  from public.convites c
  join public.orgs o on o.id = c.org_id
  where c.token = p_token;
$$;

alter table public.convites enable row level security;

drop policy if exists convites_le on public.convites;
create policy convites_le on public.convites
  for select to authenticated using (public.e_admin(org_id));

drop policy if exists convites_escreve on public.convites;
create policy convites_escreve on public.convites
  for all to authenticated
  using (public.e_admin(org_id))
  with check (public.e_admin(org_id));

grant select, insert, update, delete on public.convites to authenticated;
grant execute on function public.aceitar_convite(text) to authenticated;
grant execute on function public.ver_convite(text) to authenticated, anon;
