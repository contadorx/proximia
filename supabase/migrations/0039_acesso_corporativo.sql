-- =====================================================================
-- Migration : 0039_acesso_corporativo.sql
-- Feature   : B46 — acesso corporativo (SSO)
-- Aplicar   : depois de 0038_porta_entrada.sql.
--
-- Em empresa grande isto é bloqueador silencioso: o produto some da lista
-- de fornecedores aprovados e ninguém diz por quê. Não é preferência de
-- quem usa — é política de quem aprova.
--
-- O QUE NÃO SE ESCREVE AQUI: protocolo de autenticação. SAML é do
-- Supabase Auth, que já implementa e mantém. O que este produto guarda é
-- a ligação entre um DOMÍNIO DE E-MAIL e uma ORGANIZAÇÃO, mais a regra de
-- provisionamento. A identidade continua sendo verificada lá.
--
-- =====================================================================
-- A DECISÃO QUE EVITA O SEQUESTRO DE DOMÍNIO
-- =====================================================================
--
-- Um cadastro de domínio ingênuo é um buraco: bastaria a organização A
-- declarar "gmail.com" — ou pior, o domínio do concorrente — para que
-- todo mundo daquele domínio caísse dentro dela no primeiro login.
--
-- Três travas, em camada:
--
--   1. Um domínio pertence a UMA organização (índice único). Quem chegar
--      depois é recusado, e a mensagem diz para falar com o suporte.
--
--   2. O provisionamento automático só acontece quando a pessoa entrou
--      PELO SSO daquela organização — não por ter um e-mail parecido. É a
--      diferença entre "tem endereço @acme.com" e "a Acme autenticou esta
--      pessoa". Quem entra por e-mail e senha num domínio registrado
--      continua precisando de convite, como hoje.
--
--   3. O domínio nasce NÃO VERIFICADO e sem provisionar. Ligar o
--      provisionamento é ato explícito de administrador, e a tela diz o
--      que isso significa.
--
-- Verificação por DNS ficou de fora desta entrega — está relatado no fim
-- do arquivo, com o que precisaria.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Domínios da organização
-- ---------------------------------------------------------------------

create table if not exists public.org_dominios (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,

  -- Sempre em minúsculas, sem arroba: "acme.com.br".
  dominio     text not null check (dominio = lower(dominio) and position('@' in dominio) = 0),

  -- Identificador do provedor SSO no Supabase Auth. Opaco para nós: quem
  -- cria e mantém é o operador, pelo painel ou pela CLI do Supabase.
  -- Vazio significa "domínio conhecido, SSO ainda não configurado".
  sso_provider_id text,

  -- A organização decide se o próprio domínio é obrigado a entrar por
  -- SSO. Quem já entra por e-mail e senha continua entrando enquanto isto
  -- for falso — a convivência é requisito, não concessão.
  exige_sso   boolean not null default false,

  -- Provisionar na primeira entrada, com o papel padrão configurado.
  provisiona  boolean not null default false,
  papel_padrao public.papel_membro not null default 'ponto_focal',

  verificado_em timestamptz,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users (id)
);

-- Um domínio, uma organização. É a primeira trava contra sequestro.
create unique index if not exists idx_dominio_unico on public.org_dominios (dominio);
create index if not exists idx_dominios_org on public.org_dominios (org_id);

alter table public.org_dominios enable row level security;

drop policy if exists dominios_le on public.org_dominios;
create policy dominios_le on public.org_dominios
  for select to authenticated using (public.e_membro(org_id));

drop policy if exists dominios_escreve on public.org_dominios;
create policy dominios_escreve on public.org_dominios
  for all to authenticated
  using (public.e_admin(org_id))
  with check (public.e_admin(org_id));

grant select, insert, update, delete on public.org_dominios to authenticated;


-- ---------------------------------------------------------------------
-- 2. A pergunta da tela de entrada, antes do login
-- ---------------------------------------------------------------------
-- Quem chama é o ANÔNIMO: a tela precisa saber, ao ver o e-mail digitado,
-- se aquele domínio entra por SSO. Por isso a resposta é a mínima
-- possível — sem nome de organização, sem contagem, sem lista. Só o
-- necessário para decidir qual botão mostrar.

create or replace function public.sso_do_dominio(p_email text)
returns table (exige_sso boolean, provider_id text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select d.exige_sso, d.sso_provider_id
    from public.org_dominios d
   where d.dominio = lower(split_part(trim(p_email), '@', 2))
     and d.sso_provider_id is not null
   limit 1;
$$;

revoke execute on function public.sso_do_dominio(text) from public;
grant  execute on function public.sso_do_dominio(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. Provisionamento na primeira entrada
-- ---------------------------------------------------------------------
-- Chamada depois do login, por quem ainda não tem vínculo nenhum. Só
-- cria acesso se:
--   · existe domínio registrado para o e-mail da sessão;
--   · aquele domínio tem provisionamento ligado;
--   · a sessão veio pelo SSO daquela organização.
--
-- A terceira condição é o que separa "tem e-mail do domínio" de "a
-- empresa autenticou esta pessoa". Sem ela, qualquer um que criasse conta
-- com um endereço do domínio entraria sozinho.

create or replace function public.provisionar_acesso_sso()
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user     uuid := auth.uid();
  v_email    text;
  v_provider text;
  v_dom      record;
begin
  if v_user is null then
    return null;
  end if;

  select u.email,
         coalesce(u.raw_app_meta_data ->> 'provider', '')
    into v_email, v_provider
    from auth.users u
   where u.id = v_user;

  if v_email is null then
    return null;
  end if;

  select * into v_dom
    from public.org_dominios d
   where d.dominio = lower(split_part(v_email, '@', 2))
     and d.provisiona
   limit 1;

  if v_dom.id is null then
    return null;
  end if;

  -- A sessão precisa ter vindo do SSO daquela organização. O Supabase
  -- marca a origem em app_metadata.provider: 'sso:<provider_id>' para
  -- SAML, 'email' para senha.
  if v_dom.sso_provider_id is null
     or v_provider is distinct from ('sso:' || v_dom.sso_provider_id) then
    return null;
  end if;

  -- Já tem vínculo? Então não é primeira entrada; nada a fazer.
  if exists (
    select 1 from public.memberships m
     where m.org_id = v_dom.org_id and m.user_id = v_user
  ) then
    return v_dom.org_id;
  end if;

  -- Organização suspensa não ganha gente nova.
  if not public.assinatura_permite_escrita(v_dom.org_id) then
    return null;
  end if;

  insert into public.memberships (org_id, user_id, papel, criado_por)
  values (v_dom.org_id, v_user, v_dom.papel_padrao, v_user)
  on conflict (org_id, user_id) do nothing;

  return v_dom.org_id;
end;
$$;

revoke execute on function public.provisionar_acesso_sso() from public, anon;
grant  execute on function public.provisionar_acesso_sso() to authenticated;


-- ---------------------------------------------------------------------
-- 4. Verificação
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.org_dominios') is null then
    raise exception 'Tabela de domínios não foi criada';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.org_dominios'::regclass) then
    raise exception 'RLS não está ligada em org_dominios';
  end if;

  if not has_table_privilege('authenticated', 'public.org_dominios', 'SELECT') then
    raise exception 'Faltou grant de tabela em org_dominios';
  end if;

  if has_function_privilege('anon', 'public.provisionar_acesso_sso()', 'EXECUTE') then
    raise exception 'Anônimo pode provisionar acesso — correção incompleta';
  end if;

  if not has_function_privilege('anon', 'public.sso_do_dominio(text)', 'EXECUTE') then
    raise exception 'A tela de entrada não consegue perguntar pelo domínio';
  end if;

  raise notice 'Acesso corporativo: domínios, RLS, grants e provisionamento no lugar.';
end $$;


-- ---------------------------------------------------------------------
-- O QUE FICOU DE FORA, E O QUE PRECISARIA
-- ---------------------------------------------------------------------
--
-- VERIFICAÇÃO DE DOMÍNIO POR DNS. Hoje a trava é o índice único mais a
-- exigência de sessão SSO para provisionar. Isso já impede o sequestro
-- prático, mas não impede uma organização de OCUPAR um domínio que não é
-- dela e com isso bloquear a legítima de cadastrá-lo.
--
-- O caminho: coluna `desafio_dns` com um token, a tela mostrando o
-- registro TXT a criar, e uma rotina que consulta o DNS e carimba
-- `verificado_em`. Enquanto não houver isso, `verificado_em` fica nulo e
-- a tela mostra o domínio como não verificado — dizer que não se sabe é
-- melhor que fingir que se sabe.
