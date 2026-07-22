-- =====================================================================
-- Migration : 0022_capturas.sql
-- Feature   : B29 — evento de captura
-- Aplicar   : depois de 0021_gestao_acesso.sql.
--
-- Até aqui, o produto era rigoroso com o potencial — estimativa só entra
-- com origem e data — e frouxo com o capturado, que era um campo que
-- alguém editava. O número que sustenta a tese inteira ("isto foi
-- entregue") não tinha autor, não tinha data confiável e não tinha
-- rastro. Numa reunião difícil, é justamente esse que precisa ser
-- defensável.
--
-- Agora captura é evento: valor, data, autor e o que comprova. O campo
-- valor_capturado continua existindo, mas vira soma dos eventos, mantida
-- por gatilho — assim panorama, extrato e a série mensal seguem
-- funcionando sem reescrever nada.
--
-- Correção não apaga: registra-se um estorno. O saldo muda, e os dois
-- lançamentos ficam.
--
-- Escopo: contas e frentes, onde "capturado" significa valor confirmado
-- de uma vez. Oportunidade guarda retorno mensal, que é outra natureza,
-- e segue como está.
-- =====================================================================

create table if not exists public.capturas (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  carteira_id   uuid not null references public.carteiras (id) on delete cascade,

  entidade_tipo text not null check (entidade_tipo in ('conta', 'frente')),
  entidade_id   uuid not null,

  tipo          text not null default 'captura' check (tipo in ('captura', 'estorno')),
  valor         numeric(14, 2) not null check (valor > 0),
  confirmado_em date,
  descricao     text,
  comprovacao   text,

  -- 'legado' são os valores que já existiam no campo antes desta
  -- migration. Ficam marcados para ninguém confundir com registro feito
  -- por alguém, e são os únicos que podem estar sem data.
  origem        text not null default 'registro' check (origem in ('registro', 'legado')),

  autor_id      uuid references auth.users (id),
  criado_em     timestamptz not null default now(),

  constraint captura_com_data check (origem = 'legado' or confirmado_em is not null)
);

comment on table public.capturas is
  'Cada valor confirmado, com autor e data. O campo valor_capturado das '
  'entidades passa a ser a soma destes eventos.';
comment on column public.capturas.tipo is
  'Estorno corrige sem apagar: o saldo muda e os dois lançamentos ficam.';

create index if not exists idx_capturas_entidade
  on public.capturas (entidade_tipo, entidade_id, confirmado_em desc);
create index if not exists idx_capturas_org
  on public.capturas (org_id, confirmado_em desc);

-- ---------------------------------------------------------------------
-- O campo vira soma dos eventos
-- ---------------------------------------------------------------------
create or replace function public.recalcular_capturado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tipo  text := coalesce(new.entidade_tipo, old.entidade_tipo);
  v_id    uuid := coalesce(new.entidade_id, old.entidade_id);
  v_total numeric;
  v_data  date;
begin
  select
    coalesce(sum(case when tipo = 'captura' then valor else -valor end), 0),
    max(confirmado_em)
  into v_total, v_data
  from public.capturas
  where entidade_tipo = v_tipo and entidade_id = v_id;

  -- Entidade já excluída: não há campo para atualizar, e insistir levantaria
  -- erro no meio de uma exclusão em cascata.
  if v_tipo = 'conta' and exists (select 1 from public.contas where id = v_id) then
    update public.contas
       set valor_capturado = nullif(v_total, 0), capturado_confirmado_em = v_data
     where id = v_id;
  elsif v_tipo = 'frente' and exists (select 1 from public.frentes where id = v_id) then
    update public.frentes
       set valor_capturado = nullif(v_total, 0), capturado_confirmado_em = v_data
     where id = v_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalcular_capturado on public.capturas;
create trigger trg_recalcular_capturado
  after insert or update or delete on public.capturas
  for each row execute function public.recalcular_capturado();

-- ---------------------------------------------------------------------
-- Limpeza ao excluir a entidade
-- ---------------------------------------------------------------------
-- O vínculo é polimórfico e não tem chave estrangeira, então a exclusão
-- em cascata não alcança os eventos. Sem isto, apagar uma conta deixaria
-- capturas órfãs — que continuariam somando na série mensal da
-- organização e inflando o resultado do mês.
create or replace function public.limpar_capturas_entidade()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.capturas
   where entidade_tipo = tg_argv[0] and entidade_id = old.id;
  return null;
end;
$$;

-- Depois da exclusão, e não antes: apagando antes, o recálculo dispararia
-- um update na mesma linha que está saindo, e o Postgres recusa.
drop trigger if exists trg_limpar_capturas on public.contas;
create trigger trg_limpar_capturas
  after delete on public.contas
  for each row execute function public.limpar_capturas_entidade('conta');

drop trigger if exists trg_limpar_capturas on public.frentes;
create trigger trg_limpar_capturas
  after delete on public.frentes
  for each row execute function public.limpar_capturas_entidade('frente');

-- ---------------------------------------------------------------------
-- Traz o que já existia
-- ---------------------------------------------------------------------
-- Cada valor já registrado vira um evento marcado como legado, com a data
-- que houver. Nenhum número muda; o que muda é passar a existir rastro.
do $$
declare
  v_conta integer;
  v_frente integer;
begin
  insert into public.capturas
    (org_id, carteira_id, entidade_tipo, entidade_id, valor, confirmado_em, origem, descricao)
  select org_id, carteira_id, 'conta', id, valor_capturado, capturado_confirmado_em, 'legado',
         'Valor que já estava registrado antes do controle por eventos.'
    from public.contas
   where valor_capturado is not null and valor_capturado > 0
     and not exists (select 1 from public.capturas c
                      where c.entidade_tipo = 'conta' and c.entidade_id = contas.id);
  get diagnostics v_conta = row_count;

  insert into public.capturas
    (org_id, carteira_id, entidade_tipo, entidade_id, valor, confirmado_em, origem, descricao)
  select org_id, carteira_id, 'frente', id, valor_capturado, capturado_confirmado_em, 'legado',
         'Valor que já estava registrado antes do controle por eventos.'
    from public.frentes
   where valor_capturado is not null and valor_capturado > 0
     and not exists (select 1 from public.capturas c
                      where c.entidade_tipo = 'frente' and c.entidade_id = frentes.id);
  get diagnostics v_frente = row_count;

  raise notice 'Capturas trazidas do que já existia: % em contas, % em frentes.', v_conta, v_frente;
end
$$;

-- ---------------------------------------------------------------------
-- A série mensal passa a ler os eventos
-- ---------------------------------------------------------------------
drop view if exists public.captura_mensal;

create view public.captura_mensal
with (security_invoker = on)
as
select
  org_id,
  carteira_id,
  date_trunc('month', confirmado_em)::date as mes,
  origem_valor                             as origem,
  sum(valor)                               as valor
from (
  select org_id, carteira_id, confirmado_em,
         entidade_tipo as origem_valor,
         case when tipo = 'captura' then valor else -valor end as valor
    from public.capturas
   where confirmado_em is not null

  union all

  select org_id, carteira_id, confirmado_em, 'oportunidade', retorno_confirmado
    from public.oportunidades
   where retorno_confirmado is not null
     and retorno_confirmado > 0
     and confirmado_em is not null
) fontes
group by org_id, carteira_id, date_trunc('month', confirmado_em), origem_valor;

grant select on public.captura_mensal to authenticated;

create or replace function public.captura_sem_data(p_org uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(valor), 0) from (
    select case when tipo = 'captura' then valor else -valor end as valor
      from public.capturas
     where org_id = p_org and confirmado_em is null
    union all
    select retorno_confirmado from public.oportunidades
     where org_id = p_org and retorno_confirmado > 0 and confirmado_em is null
  ) fontes;
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.capturas enable row level security;

drop policy if exists capturas_le on public.capturas;
create policy capturas_le on public.capturas
  for select to authenticated
  using (public.tem_acesso_carteira(carteira_id));

drop policy if exists capturas_cria on public.capturas;
create policy capturas_cria on public.capturas
  for insert to authenticated
  with check (
    public.pode_escrever(org_id)
    and public.tem_acesso_carteira(carteira_id)
    and autor_id = auth.uid()
  );

-- Sem política de UPDATE, de propósito: valor confirmado não se reescreve.
-- Errou, registra estorno. Excluir é exceção de administração.
drop policy if exists capturas_exclui on public.capturas;
create policy capturas_exclui on public.capturas
  for delete to authenticated
  using (public.e_admin(org_id));

grant select, insert, delete on public.capturas to authenticated;
