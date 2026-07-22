-- =====================================================================
-- Migration : 0011_extrato_automatico.sql
-- Feature   : F13 — extrato periódico automático (fase 2)
-- O que faz : guarda a cadencia de envio de cada carteira, seus
--             destinatarios, e registra cada envio feito.
-- Aplicar   : depois de 0010_oportunidades.sql.
--
-- A cadencia e por carteira, nao por organizacao: uma unidade grande pode
-- precisar de extrato mensal e outra de trimestral, e forcar as duas ao
-- mesmo ritmo faz o documento virar ruido em uma delas.
--
-- Todo envio fica registrado, inclusive os que falharam. Sem esse
-- registro, "o cliente disse que nao recebeu" nao tem resposta.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Configuracao na carteira
-- ---------------------------------------------------------------------
alter table public.carteiras
  add column if not exists cadencia_extrato text not null default 'nenhuma'
    check (cadencia_extrato in ('nenhuma', 'quinzenal', 'mensal', 'trimestral'));

alter table public.carteiras
  add column if not exists extrato_dia integer not null default 1
    check (extrato_dia between 1 and 28);

alter table public.carteiras
  add column if not exists extrato_destinatarios jsonb not null default '[]'::jsonb;

alter table public.carteiras
  add column if not exists extrato_ultimo_envio date;

comment on column public.carteiras.extrato_dia is
  'Dia do mes do envio. Limitado a 28 de proposito: 29, 30 e 31 nao existem '
  'em todo mes e o envio simplesmente deixaria de acontecer.';
comment on column public.carteiras.extrato_destinatarios is
  'Lista de e-mails. O assinante e o controlador desses dados.';

-- ---------------------------------------------------------------------
-- 2. Registro de envios
-- ---------------------------------------------------------------------
create table if not exists public.envios (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs (id) on delete cascade,
  carteira_id    uuid not null references public.carteiras (id) on delete cascade,

  tipo           text not null default 'extrato' check (tipo in ('extrato')),
  origem         text not null default 'automatico' check (origem in ('automatico', 'manual')),

  destinatarios  jsonb not null default '[]'::jsonb,
  periodo_inicio date not null,
  periodo_fim    date not null,
  assunto        text,

  status         text not null default 'enviado'
                   check (status in ('enviado', 'simulado', 'falhou')),
  detalhe        text,

  criado_em      timestamptz not null default now(),
  criado_por     uuid references auth.users (id)
);

comment on table public.envios is
  'Historico de extratos enviados. "simulado" e o envio que aconteceu sem '
  'provedor de e-mail configurado: serve para testar antes de ligar o disparo.';

create index if not exists idx_envios_carteira
  on public.envios (carteira_id, criado_em desc);

-- ---------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------
alter table public.envios enable row level security;

drop policy if exists envios_le on public.envios;
create policy envios_le on public.envios
  for select to authenticated
  using (public.tem_acesso_carteira(carteira_id));

drop policy if exists envios_cria on public.envios;
create policy envios_cria on public.envios
  for insert to authenticated
  with check (public.pode_escrever(org_id) and public.tem_acesso_carteira(carteira_id));

-- Envio nao se apaga nem se corrige: e registro do que aconteceu.
grant select, insert on public.envios to authenticated;

-- ---------------------------------------------------------------------
-- 4. Quem esta devendo extrato hoje
-- ---------------------------------------------------------------------
-- Usada pela rotina diaria. Devolve as carteiras cuja cadencia venceu e
-- que ainda nao receberam envio no ciclo corrente.
create or replace function public.carteiras_para_enviar(p_hoje date default current_date)
returns table (
  carteira_id   uuid,
  org_id        uuid,
  nome          text,
  destinatarios jsonb,
  cadencia      text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.org_id, c.nome, c.extrato_destinatarios, c.cadencia_extrato
  from public.carteiras c
  where c.cadencia_extrato <> 'nenhuma'
    and c.status = 'ativa'
    and jsonb_array_length(c.extrato_destinatarios) > 0
    and (
      -- mensal: no dia configurado
      (c.cadencia_extrato = 'mensal' and extract(day from p_hoje) = c.extrato_dia)
      -- quinzenal: no dia configurado e catorze dias depois
      or (c.cadencia_extrato = 'quinzenal'
          and extract(day from p_hoje) in (c.extrato_dia, c.extrato_dia + 14))
      -- trimestral: no dia configurado, a cada tres meses a partir de janeiro
      or (c.cadencia_extrato = 'trimestral'
          and extract(day from p_hoje) = c.extrato_dia
          and extract(month from p_hoje)::int % 3 = 1)
    )
    -- nao repete no mesmo dia
    and (c.extrato_ultimo_envio is null or c.extrato_ultimo_envio < p_hoje);
$$;

revoke execute on function public.carteiras_para_enviar(date) from public;
