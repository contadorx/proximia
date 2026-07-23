-- =====================================================================
-- Migration : 0038_porta_entrada.sql
-- Feature   : B45 — porta de entrada de dados
-- Aplicar   : depois de 0037_mapa_decisores.sql.
--
-- Hoje o único caminho de entrada em massa é a planilha pela tela. Na
-- primeira reunião com a área de tecnologia do cliente isso vira objeção,
-- e com razão: o motor de cálculo dele já apura frentes e oportunidades,
-- e não há por onde empurrar.
--
-- O que se constrói aqui é a PORTA, não o conector. O produto não precisa
-- entender de faturamento nem de consumo — precisa aceitar as mesmas
-- linhas que a planilha aceita, com a mesma conferência.
--
-- =====================================================================
-- A DECISÃO DE SEGURANÇA QUE SUSTENTA O RESTO
-- =====================================================================
--
-- Uma chamada por chave de API não tem sessão de usuário. Sem sessão,
-- auth.uid() é nulo e a RLS não tem por onde decidir — e a invariante do
-- produto diz que o isolamento é do banco, nunca da aplicação.
--
-- A saída: a organização NUNCA vem no corpo da requisição nem é escolhida
-- pela aplicação. Quem resolve qual organização é o banco, a partir da
-- chave, dentro de função SECURITY DEFINER. Se a aplicação estiver errada
-- ou comprometida, ela não tem como escrever na organização de outro
-- assinante — ela sequer sabe qual é, até o banco dizer.
--
-- A chave em si nunca é guardada. Fica o resumo sha256 e um prefixo curto
-- para exibição. Perdeu, não recupera: gera outra.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. As chaves
-- ---------------------------------------------------------------------

create table if not exists public.chaves_api (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs (id) on delete cascade,
  nome         text not null,

  -- Prefixo visível: identifica a chave na tela e no registro de chamadas
  -- sem revelar nada. É por ele que a busca começa.
  prefixo      text not null,
  -- sha256 do segredo inteiro. Nunca existe texto claro no banco.
  resumo       text not null,

  limite_por_minuto integer not null default 60 check (limite_por_minuto between 1 and 6000),

  criada_em    timestamptz not null default now(),
  criada_por   uuid references auth.users (id),
  ultimo_uso   timestamptz,
  revogada_em  timestamptz,
  revogada_por uuid references auth.users (id)
);

create unique index if not exists idx_chave_prefixo on public.chaves_api (prefixo);
create index if not exists idx_chaves_org on public.chaves_api (org_id, revogada_em);


-- ---------------------------------------------------------------------
-- 2. O registro de cada chamada
-- ---------------------------------------------------------------------
-- Inclusive as recusadas. Quem integra precisa poder responder "mandei e
-- não entrou, por quê?" sem depender de log de servidor.

create table if not exists public.chamadas_api (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  chave_id      uuid references public.chaves_api (id) on delete set null,

  recurso       text not null,
  modo          text not null default 'gravar' check (modo in ('gravar', 'conferencia')),

  linhas_recebidas integer not null default 0,
  linhas_gravadas  integer not null default 0,
  linhas_recusadas integer not null default 0,

  -- Motivo linha a linha, no mesmo formato da conferência da planilha.
  recusas       jsonb not null default '[]'::jsonb,

  situacao      text not null default 'ok'
                check (situacao in ('ok', 'parcial', 'recusada', 'erro')),
  detalhe       text,
  duracao_ms    integer,
  criada_em     timestamptz not null default now()
);

create index if not exists idx_chamadas_org on public.chamadas_api (org_id, criada_em desc);
create index if not exists idx_chamadas_chave on public.chamadas_api (chave_id, criada_em desc);


-- ---------------------------------------------------------------------
-- 3. Alcance
-- ---------------------------------------------------------------------

alter table public.chaves_api   enable row level security;
alter table public.chamadas_api enable row level security;

-- Ler a chave é ver metadado (nome, prefixo, uso) — nunca o segredo, que
-- não está guardado. Quem administra a organização enxerga.
drop policy if exists chaves_le on public.chaves_api;
create policy chaves_le on public.chaves_api
  for select to authenticated using (public.e_admin(org_id));

-- Criar e revogar passam por função; nenhuma política de escrita direta.

drop policy if exists chamadas_le on public.chamadas_api;
create policy chamadas_le on public.chamadas_api
  for select to authenticated using (public.e_membro(org_id));


-- ---------------------------------------------------------------------
-- 4. Criar chave — o segredo aparece UMA vez
-- ---------------------------------------------------------------------
-- Devolve o segredo em texto claro nesta única resposta. Depois disso só
-- existe o resumo; nem o operador da plataforma consegue recuperar.

create or replace function public.criar_chave_api(
  p_org uuid, p_nome text, p_limite integer default 60)
returns table (id uuid, prefixo text, chave text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_prefixo text;
  v_segredo text;
  v_chave   text;
  v_id      uuid;
begin
  if not public.e_admin(p_org) then
    raise exception 'Somente administradores criam chaves de API.' using errcode = '42501';
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Dê um nome à chave — é como você vai reconhecê-la depois.'
      using errcode = '23514';
  end if;

  -- Prefixo curto e legível para a tela; segredo longo para a chamada.
  v_prefixo := 'pxm_' || encode(gen_random_bytes(4), 'hex');
  v_segredo := encode(gen_random_bytes(24), 'hex');
  v_chave   := v_prefixo || '_' || v_segredo;

  insert into public.chaves_api (org_id, nome, prefixo, resumo, limite_por_minuto, criada_por)
  values (
    p_org, trim(p_nome), v_prefixo,
    encode(digest(v_chave, 'sha256'), 'hex'),
    coalesce(p_limite, 60), auth.uid())
  returning chaves_api.id into v_id;

  return query select v_id, v_prefixo, v_chave;
end;
$$;

create or replace function public.revogar_chave_api(p_chave_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.chaves_api where id = p_chave_id;
  if v_org is null then
    raise exception 'Chave não encontrada.' using errcode = 'P0002';
  end if;
  if not public.e_admin(v_org) then
    raise exception 'Somente administradores revogam chaves.' using errcode = '42501';
  end if;

  -- Revogar não apaga: o registro de chamadas continua apontando para uma
  -- chave que existiu, e a auditoria se mantém legível.
  update public.chaves_api
     set revogada_em = coalesce(revogada_em, now()), revogada_por = auth.uid()
   where id = p_chave_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Autenticar a chamada — aqui mora o isolamento
-- ---------------------------------------------------------------------
-- Recebe a chave crua, devolve a organização. A aplicação não passa
-- org_id em lugar nenhum: ela descobre por aqui, e só isso.
--
-- Também aplica, na mesma passada, o que não pode ficar na aplicação:
-- chave revogada, assinatura suspensa e limite de vazão.

create or replace function public.autenticar_chave_api(p_chave text)
returns table (org_id uuid, chave_id uuid, nome text, limite integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_prefixo text;
  v_reg     record;
  v_no_minuto integer;
begin
  if p_chave is null or position('_' in p_chave) = 0 then
    raise exception 'Chave inválida.' using errcode = '28000';
  end if;

  -- O prefixo é 'pxm_xxxxxxxx' — os dois primeiros trechos.
  v_prefixo := split_part(p_chave, '_', 1) || '_' || split_part(p_chave, '_', 2);

  select c.* into v_reg from public.chaves_api c where c.prefixo = v_prefixo;

  -- Mensagem igual para chave inexistente e resumo errado: distinguir as
  -- duas ajudaria quem está tentando adivinhar.
  if v_reg.id is null
     or v_reg.resumo <> encode(digest(p_chave, 'sha256'), 'hex') then
    raise exception 'Chave inválida.' using errcode = '28000';
  end if;

  if v_reg.revogada_em is not null then
    raise exception 'Chave revogada.' using errcode = '28000';
  end if;

  if not public.assinatura_permite_escrita(v_reg.org_id) then
    raise exception 'Assinatura suspensa: a organização segue consultando e exportando, mas não recebe dados novos.'
      using errcode = '42501';
  end if;

  select count(*) into v_no_minuto
    from public.chamadas_api ch
   where ch.chave_id = v_reg.id
     and ch.criada_em > now() - interval '1 minute';

  if v_no_minuto >= v_reg.limite_por_minuto then
    raise exception 'Limite de % chamadas por minuto atingido nesta chave.', v_reg.limite_por_minuto
      using errcode = '53400';
  end if;

  update public.chaves_api set ultimo_uso = now() where id = v_reg.id;

  return query select v_reg.org_id, v_reg.id, v_reg.nome, v_reg.limite_por_minuto;
end;
$$;

create or replace function public.registrar_chamada_api(
  p_chave_id uuid, p_recurso text, p_modo text,
  p_recebidas integer, p_gravadas integer, p_recusadas integer,
  p_recusas jsonb, p_situacao text, p_detalhe text default null,
  p_ms integer default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_org uuid;
  v_id  uuid;
begin
  select org_id into v_org from public.chaves_api where id = p_chave_id;
  if v_org is null then
    raise exception 'Chave não encontrada para registro.' using errcode = 'P0002';
  end if;

  insert into public.chamadas_api (
    org_id, chave_id, recurso, modo,
    linhas_recebidas, linhas_gravadas, linhas_recusadas,
    recusas, situacao, detalhe, duracao_ms)
  values (
    v_org, p_chave_id, p_recurso, coalesce(p_modo, 'gravar'),
    coalesce(p_recebidas, 0), coalesce(p_gravadas, 0), coalesce(p_recusadas, 0),
    coalesce(p_recusas, '[]'::jsonb), coalesce(p_situacao, 'ok'), p_detalhe, p_ms)
  returning id into v_id;

  return v_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. Quem pode chamar o quê
-- ---------------------------------------------------------------------
-- As funções de autenticação e registro são do SERVIÇO: quem as chama é a
-- rota da API, com a chave de serviço. Deixá-las abertas ao papel da
-- aplicação permitiria a um usuário comum testar chaves em série.

revoke execute on function public.autenticar_chave_api(text) from public, anon, authenticated;
revoke execute on function public.registrar_chamada_api(uuid, text, text, integer, integer, integer, jsonb, text, text, integer)
  from public, anon, authenticated;

revoke execute on function public.criar_chave_api(uuid, text, integer) from public, anon;
grant  execute on function public.criar_chave_api(uuid, text, integer) to authenticated;

revoke execute on function public.revogar_chave_api(uuid) from public, anon;
grant  execute on function public.revogar_chave_api(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 6.1 Privilégios de tabela
-- ---------------------------------------------------------------------
-- RLS decide QUAIS linhas; o grant decide se o papel pode olhar a tabela.
-- Sem os dois, a política existe e a consulta morre em "permission denied"
-- — foi o que o teste desta migration pegou.
--
-- Aqui vão também os grants dos catálogos da 0037, que saíram sem eles.
-- A convenção da casa é não editar migration aplicada: se a 0037 já
-- rodou na sua instância, é esta que conserta; se ainda não rodou, as
-- duas se aplicam em ordem e o resultado é o mesmo.

grant select on public.chaves_api   to authenticated;
grant select on public.chamadas_api to authenticated;
-- Escrita de chave passa por função (criar/revogar), e o registro de
-- chamadas é do serviço: nenhum insert direto pelo papel da aplicação.

grant select, insert, update, delete on public.contato_papeis   to authenticated;
grant select, insert, update, delete on public.contato_posturas to authenticated;

-- ---------------------------------------------------------------------
-- 7. Verificação
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.chaves_api') is null or to_regclass('public.chamadas_api') is null then
    raise exception 'Tabelas da porta de entrada não foram criadas';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.chaves_api'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.chamadas_api'::regclass) then
    raise exception 'RLS não está ligada nas tabelas novas';
  end if;

  if has_function_privilege('authenticated', 'public.autenticar_chave_api(text)', 'EXECUTE') then
    raise exception 'autenticar_chave_api continua chamável pela aplicação — permitiria varredura de chaves';
  end if;

  if not has_table_privilege('authenticated', 'public.chaves_api', 'SELECT')
     or not has_table_privilege('authenticated', 'public.contato_papeis', 'SELECT') then
    raise exception 'Faltou grant de tabela: a política existe mas a consulta morre em permission denied';
  end if;

  raise notice 'Porta de entrada: tabelas, RLS, grants e alcance das funções no lugar.';
end $$;
