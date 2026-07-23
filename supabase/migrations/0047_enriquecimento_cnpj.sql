-- =====================================================================
-- Migration : 0047_enriquecimento_cnpj.sql
-- Aplicar   : depois de 0046_email_do_assinante.sql.
--
-- O QUE ISTO PERMITE
--
-- Preencher razão social, natureza e situação cadastral a partir do
-- CNPJ, consultando o registro público da Receita Federal por uma API
-- aberta. Digitar isso à mão em trezentas contas é trabalho que a
-- máquina faz melhor — e com menos erro de digitação.
--
-- =====================================================================
-- A DECISÃO QUE PRECISA FICAR ESCRITA
-- =====================================================================
--
-- Este é o PRIMEIRO terceiro a receber um dado de cliente. Até aqui,
-- Supabase, Vercel e Brevo guardam, executam e transportam; nenhum lê
-- conteúdo. Uma consulta de CNPJ envia o CNPJ do cliente para fora.
--
-- Por que ainda assim é defensável, diferente do caso da IA:
--
--   · o que sai é UM identificador público, não o histórico da conta;
--   · o que volta é registro público — qualquer pessoa consulta o mesmo
--     CNPJ no site da Receita e obtém o mesmo resultado;
--   · não sai nada da operação: nem potencial, nem captura, nem contrato.
--
-- Mesmo assim, a promessa do produto está escrita, e promessa escrita
-- não se ajusta em silêncio. Por isso:
--
--   · o interruptor é POR ORGANIZAÇÃO e nasce DESLIGADO;
--   · a tela diz, antes de ligar, o que sai e para onde;
--   · cada consulta fica registrada, com o CNPJ e o resultado — quem
--     auditar precisa poder responder "o que vocês mandaram para fora?".
--
-- =====================================================================
-- E UMA REGRA DE PRODUTO
-- =====================================================================
--
-- O enriquecimento NUNCA sobrescreve o que a pessoa escreveu. Preenche
-- só campo vazio. O dado da Receita é o que está registrado; o que a
-- operação sabe pode ser mais atual, ou mais útil — e o produto inteiro
-- se sustenta em não substituir o que alguém afirmou por algo que ele
-- não conferiu.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. O interruptor
-- ---------------------------------------------------------------------

alter table public.orgs
  add column if not exists enriquecimento_cnpj boolean not null default false;

comment on column public.orgs.enriquecimento_cnpj is
  'Consultar o registro público da Receita a partir do CNPJ. Nasce desligado: '
  'liga-lo é decisão do assinante, porque envia o CNPJ da conta para fora.';


-- ---------------------------------------------------------------------
-- 2. Procedência no que foi preenchido
-- ---------------------------------------------------------------------
-- Todo valor exibido diz de onde veio. Campo preenchido por consulta
-- externa não pode parecer campo digitado por quem conhece a conta.

alter table public.contas
  add column if not exists dados_receita_em     timestamptz,
  add column if not exists dados_receita_origem text;

comment on column public.contas.dados_receita_em is
  'Quando os dados cadastrais vieram da consulta pública, se vieram.';


-- ---------------------------------------------------------------------
-- 3. Registro das consultas
-- ---------------------------------------------------------------------
-- Serve para duas perguntas: "o que saiu daqui?" e "por que esta conta
-- ficou sem preencher?".

create table if not exists public.consultas_cnpj (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  conta_id    uuid references public.contas (id) on delete set null,

  documento   text not null,
  situacao    text not null check (situacao in ('ok', 'nao_encontrado', 'recusado', 'erro')),
  detalhe     text,
  campos      integer not null default 0,

  criado_por  uuid references auth.users (id),
  criado_em   timestamptz not null default now()
);

create index if not exists idx_consultas_cnpj_org on public.consultas_cnpj (org_id, criado_em desc);

alter table public.consultas_cnpj enable row level security;

drop policy if exists consultas_cnpj_le on public.consultas_cnpj;
create policy consultas_cnpj_le on public.consultas_cnpj
  for select to authenticated using (public.e_membro(org_id));

grant select on public.consultas_cnpj to authenticated;


-- ---------------------------------------------------------------------
-- 4. Gravar a consulta
-- ---------------------------------------------------------------------

create or replace function public.registrar_consulta_cnpj(
  p_org uuid,
  p_conta uuid,
  p_documento text,
  p_situacao text,
  p_detalhe text default null,
  p_campos integer default 0)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_id uuid;
begin
  if not public.e_membro(p_org) then
    raise exception 'Sem participação nesta organização.' using errcode = '42501';
  end if;

  insert into public.consultas_cnpj (org_id, conta_id, documento, situacao, detalhe, campos, criado_por)
  values (p_org, p_conta, left(p_documento, 20), p_situacao, left(p_detalhe, 200),
          coalesce(p_campos, 0), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.registrar_consulta_cnpj(uuid, uuid, text, text, text, integer)
  from public, anon;
grant execute on function public.registrar_consulta_cnpj(uuid, uuid, text, text, text, integer)
  to authenticated;


-- ---------------------------------------------------------------------
-- 5. Aplicar o resultado — só no que está vazio
-- ---------------------------------------------------------------------
-- A regra de não sobrescrever vive AQUI, no banco, e não na tela: assim
-- ela vale para qualquer caminho que venha a existir depois, inclusive a
-- porta de entrada por API.

create or replace function public.aplicar_dados_receita(
  p_conta uuid,
  p_razao_social text default null,
  p_segmento text default null,
  p_origem text default 'Receita Federal')
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_org uuid;
  v_carteira uuid;
  v_preenchidos integer := 0;
  v_razao text;
  v_seg text;
begin
  select org_id, carteira_id into v_org, v_carteira
    from public.contas where id = p_conta;

  if v_org is null then
    raise exception 'Conta não encontrada.' using errcode = 'P0002';
  end if;

  if not public.pode_escrever(v_org) or not public.tem_acesso_carteira(v_carteira) then
    raise exception 'Sem permissão para alterar esta conta.' using errcode = '42501';
  end if;

  if not (select o.enriquecimento_cnpj from public.orgs o where o.id = v_org) then
    raise exception 'O enriquecimento por CNPJ está desligado nesta organização.'
      using errcode = '42501';
  end if;

  select razao_social, segmento into v_razao, v_seg
    from public.contas where id = p_conta;

  update public.contas set
    -- coalesce na ordem certa: o que já existe manda. Inverter esta
    -- ordem é o bug que apaga o trabalho de quem conhece a conta.
    razao_social = coalesce(nullif(trim(v_razao), ''), nullif(trim(p_razao_social), '')),
    segmento     = coalesce(nullif(trim(v_seg), ''),   nullif(trim(p_segmento), '')),
    dados_receita_em = now(),
    dados_receita_origem = p_origem
  where id = p_conta;

  if coalesce(trim(v_razao), '') = '' and coalesce(trim(p_razao_social), '') <> '' then
    v_preenchidos := v_preenchidos + 1;
  end if;
  if coalesce(trim(v_seg), '') = '' and coalesce(trim(p_segmento), '') <> '' then
    v_preenchidos := v_preenchidos + 1;
  end if;

  return v_preenchidos;
end;
$$;

revoke execute on function public.aplicar_dados_receita(uuid, text, text, text) from public, anon;
grant execute on function public.aplicar_dados_receita(uuid, text, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'orgs'
       and column_name = 'enriquecimento_cnpj') then
    raise exception 'O interruptor de enriquecimento não foi criado';
  end if;

  if (select column_default from information_schema.columns
       where table_schema='public' and table_name='orgs'
         and column_name='enriquecimento_cnpj') not like '%false%' then
    raise exception 'O enriquecimento não está desligado por padrão';
  end if;

  if to_regclass('public.consultas_cnpj') is null then
    raise exception 'O registro de consultas não foi criado';
  end if;

  raise notice 'Enriquecimento por CNPJ: desligado por padrão, com registro de consultas.';
end $$;
