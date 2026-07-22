-- =====================================================================
-- Migration : 0012_maturidade.sql
-- Feature   : F14 — motor de maturidade (fase 2)
-- O que faz : questionario ponderado por dimensao, ciclos de avaliacao e
--             score calculado pelo banco, com evolucao entre ciclos.
-- Aplicar   : depois de 0011_extrato_automatico.sql.
--
-- Nada de questionario embutido: dimensoes e perguntas sao do assinante.
-- O produto entrega a mecanica — pesos, escala, calculo e comparacao —,
-- nao um modelo de maturidade de um setor especifico.
--
-- Escala de 0 a 4, uma unica para todo o produto:
--   0 nao existe · 1 inicial · 2 em estruturacao · 3 estabelecido · 4 maduro
-- Pergunta sem resposta fica fora da conta, e nao conta como zero: uma
-- avaliacao parcial mostra o score do que foi de fato avaliado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Questionario
-- ---------------------------------------------------------------------
create table if not exists public.maturidade_dimensoes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  nome       text not null,
  descricao  text,
  peso       numeric(5, 2) not null default 1 check (peso > 0 and peso <= 10),
  ordem      integer not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create unique index if not exists idx_dimensao_nome
  on public.maturidade_dimensoes (org_id, lower(nome));

create table if not exists public.maturidade_perguntas (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  dimensao_id uuid not null references public.maturidade_dimensoes (id) on delete cascade,
  texto       text not null,
  ajuda       text,
  peso        numeric(5, 2) not null default 1 check (peso > 0 and peso <= 10),
  ordem       integer not null default 0,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users (id)
);

create index if not exists idx_perguntas_dimensao on public.maturidade_perguntas (dimensao_id);

-- ---------------------------------------------------------------------
-- 2. Ciclos
-- ---------------------------------------------------------------------
create table if not exists public.maturidade_ciclos (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  nome       text not null,
  referencia date not null default current_date,
  status     text not null default 'aberto' check (status in ('aberto', 'fechado')),
  criado_em  timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create unique index if not exists idx_ciclo_nome
  on public.maturidade_ciclos (org_id, lower(nome));

comment on table public.maturidade_ciclos is
  'Rodada de avaliacao. Comparar carteiras so faz sentido dentro do mesmo '
  'ciclo, e comparar a mesma carteira entre ciclos e o que mostra evolucao.';

-- ---------------------------------------------------------------------
-- 3. Avaliacoes e respostas
-- ---------------------------------------------------------------------
create table if not exists public.maturidade_avaliacoes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  carteira_id   uuid not null references public.carteiras (id) on delete cascade,
  ciclo_id      uuid not null references public.maturidade_ciclos (id) on delete cascade,
  status        text not null default 'rascunho' check (status in ('rascunho', 'concluida')),
  observacoes   text,
  concluida_em  timestamptz,
  criado_em     timestamptz not null default now(),
  criado_por    uuid references auth.users (id),
  atualizado_em timestamptz not null default now(),
  unique (carteira_id, ciclo_id)
);

drop trigger if exists trg_avaliacao_atualizacao on public.maturidade_avaliacoes;
create trigger trg_avaliacao_atualizacao
  before update on public.maturidade_avaliacoes
  for each row execute function public.marcar_atualizacao();

create table if not exists public.maturidade_respostas (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs (id) on delete cascade,
  avaliacao_id uuid not null references public.maturidade_avaliacoes (id) on delete cascade,
  pergunta_id  uuid not null references public.maturidade_perguntas (id) on delete cascade,
  nota         integer not null check (nota between 0 and 4),
  observacao   text,
  criado_em    timestamptz not null default now(),
  criado_por   uuid references auth.users (id),
  unique (avaliacao_id, pergunta_id)
);

create index if not exists idx_respostas_avaliacao on public.maturidade_respostas (avaliacao_id);

-- ---------------------------------------------------------------------
-- 4. Calculo do score
-- ---------------------------------------------------------------------
-- Media ponderada das respostas dadas, em porcentagem da nota maxima.
-- Peso da pergunta multiplicado pelo peso da dimensao.
create or replace function public.score_avaliacao(p_avaliacao uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when coalesce(sum(p.peso * d.peso * 4), 0) = 0 then null
    else round(sum(r.nota * p.peso * d.peso) / sum(p.peso * d.peso * 4) * 100, 1)
  end
  from public.maturidade_respostas r
  join public.maturidade_perguntas p on p.id = r.pergunta_id
  join public.maturidade_dimensoes d on d.id = p.dimensao_id
  where r.avaliacao_id = p_avaliacao;
$$;

drop view if exists public.maturidade_resultado;
create view public.maturidade_resultado
with (security_invoker = on)
as
select
  a.id            as avaliacao_id,
  a.org_id,
  a.carteira_id,
  a.ciclo_id,
  a.status,
  a.concluida_em,
  c.nome          as ciclo_nome,
  c.referencia    as ciclo_referencia,
  ct.nome         as carteira_nome,
  (select count(*) from public.maturidade_respostas r where r.avaliacao_id = a.id) as respondidas,
  (select count(*)
     from public.maturidade_perguntas p
     join public.maturidade_dimensoes d on d.id = p.dimensao_id
    where p.org_id = a.org_id and p.ativo and d.ativo)                              as total_perguntas,
  public.score_avaliacao(a.id) as score
from public.maturidade_avaliacoes a
join public.maturidade_ciclos c on c.id = a.ciclo_id
join public.carteiras ct on ct.id = a.carteira_id;

drop view if exists public.maturidade_por_dimensao;
create view public.maturidade_por_dimensao
with (security_invoker = on)
as
select
  a.id      as avaliacao_id,
  a.org_id,
  a.carteira_id,
  d.id      as dimensao_id,
  d.nome    as dimensao,
  d.ordem,
  count(r.id) as respondidas,
  round(sum(r.nota * p.peso) / nullif(sum(p.peso * 4), 0) * 100, 1) as score
from public.maturidade_avaliacoes a
join public.maturidade_respostas r on r.avaliacao_id = a.id
join public.maturidade_perguntas p on p.id = r.pergunta_id
join public.maturidade_dimensoes d on d.id = p.dimensao_id
group by a.id, a.org_id, a.carteira_id, d.id, d.nome, d.ordem;

-- Ao concluir, o score vai para a carteira: e o mesmo numero que o
-- panorama e o extrato ja usam, entao a avaliacao alimenta o resto do
-- produto em vez de viver num canto separado.
create or replace function public.publicar_score_carteira()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_score numeric;
  v_ciclo text;
begin
  if new.status = 'concluida' and (old.status is distinct from new.status) then
    v_score := public.score_avaliacao(new.id);
    select nome into v_ciclo from public.maturidade_ciclos where id = new.ciclo_id;

    if v_score is not null then
      update public.carteiras
         set score_maturidade = v_score,
             score_ciclo = v_ciclo
       where id = new.carteira_id;
    end if;

    new.concluida_em := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_publicar_score on public.maturidade_avaliacoes;
create trigger trg_publicar_score
  before update on public.maturidade_avaliacoes
  for each row execute function public.publicar_score_carteira();

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
alter table public.maturidade_dimensoes  enable row level security;
alter table public.maturidade_perguntas  enable row level security;
alter table public.maturidade_ciclos     enable row level security;
alter table public.maturidade_avaliacoes enable row level security;
alter table public.maturidade_respostas  enable row level security;

-- Questionario e ciclos: leitura para a organizacao, escrita para quem
-- administra carteiras. O desenho da regua nao e decisao de campo.
do $$
declare t text;
begin
  foreach t in array array['maturidade_dimensoes', 'maturidade_perguntas', 'maturidade_ciclos']
  loop
    execute format('drop policy if exists %I_le on public.%I', t, t);
    execute format(
      'create policy %I_le on public.%I for select to authenticated using (public.e_membro(org_id))', t, t);

    execute format('drop policy if exists %I_escreve on public.%I', t, t);
    execute format(
      'create policy %I_escreve on public.%I for all to authenticated
         using (public.pode_gerir_carteiras(org_id))
         with check (public.pode_gerir_carteiras(org_id))', t, t);
  end loop;
end
$$;

-- Avaliacao segue o alcance da carteira: quem opera a carteira responde.
drop policy if exists avaliacoes_le on public.maturidade_avaliacoes;
create policy avaliacoes_le on public.maturidade_avaliacoes
  for select to authenticated using (public.tem_acesso_carteira(carteira_id));

drop policy if exists avaliacoes_escreve on public.maturidade_avaliacoes;
create policy avaliacoes_escreve on public.maturidade_avaliacoes
  for all to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id))
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

create or replace function public.tem_acesso_avaliacao(p_avaliacao uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.maturidade_avaliacoes a
    where a.id = p_avaliacao and public.tem_acesso_carteira(a.carteira_id)
  );
$$;

drop policy if exists respostas_le on public.maturidade_respostas;
create policy respostas_le on public.maturidade_respostas
  for select to authenticated using (public.tem_acesso_avaliacao(avaliacao_id));

drop policy if exists respostas_escreve on public.maturidade_respostas;
create policy respostas_escreve on public.maturidade_respostas
  for all to authenticated
  using (public.pode_escrever(org_id) and public.tem_acesso_avaliacao(avaliacao_id))
  with check (public.pode_escrever(org_id) and public.tem_acesso_avaliacao(avaliacao_id));

-- ---------------------------------------------------------------------
-- 6. Permissoes
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.maturidade_dimensoes  to authenticated;
grant select, insert, update, delete on public.maturidade_perguntas  to authenticated;
grant select, insert, update, delete on public.maturidade_ciclos     to authenticated;
grant select, insert, update, delete on public.maturidade_avaliacoes to authenticated;
grant select, insert, update, delete on public.maturidade_respostas  to authenticated;
grant select on public.maturidade_resultado     to authenticated;
grant select on public.maturidade_por_dimensao  to authenticated;
grant execute on function public.score_avaliacao(uuid)     to authenticated;
grant execute on function public.tem_acesso_avaliacao(uuid) to authenticated;
