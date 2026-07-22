-- =====================================================================
-- Migration : 0017_portal.sql
-- Feature   : F22 — portal da carteira (fase 2)
-- O que faz : a situação da carteira passa a poder ser aberta por quem
--             não tem acesso ao sistema — a unidade, a área parceira, o
--             cliente — por um endereço com segredo, somente leitura.
-- Aplicar   : depois de 0016_auditoria.sql.
--
-- O problema que resolve: hoje mostrar a situação para fora exige gerar
-- PDF e mandar por e-mail. O PDF nasce velho, e ninguém sabe se foi
-- aberto. O portal é a mesma página, sempre atual, e deixa rastro.
--
-- O que o desenho leva a sério:
--
--   1. Link com segredo não é link público. Ele expira, pode ser
--      revogado, vale para uma carteira só e não dá acesso a nenhuma
--      outra tela. Quem tem o endereço vê aquela carteira e mais nada.
--
--   2. Potencial não sai por padrão. É a regra mais dura do produto:
--      potencial é teto estimado, e teto estimado que chega a quem não
--      participou da apuração vira número cobrado. Quem quiser expor
--      liga a chave, uma carteira de cada vez, sabendo o que faz.
--
--   3. Nome de pessoa também não sai por padrão. Entrega registrada
--      interessa a quem recebe; quem digitou é assunto interno.
--
--   4. Toda abertura é registrada. "Mandei e não sei se olharam" é
--      exatamente a pergunta que o produto existe para responder.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. O link
-- ---------------------------------------------------------------------
create table if not exists public.portais (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs (id) on delete cascade,
  carteira_id        uuid not null references public.carteiras (id) on delete cascade,

  titulo             text,
  destinatario       text,

  token              text not null unique default encode(gen_random_bytes(24), 'hex'),
  status             text not null default 'ativo' check (status in ('ativo', 'revogado')),
  expira_em          timestamptz not null default now() + interval '90 days',

  -- O que o visitante enxerga. Os dois primeiros começam desligados de
  -- propósito; ver comentário no cabeçalho.
  mostrar_valores    boolean not null default false,
  mostrar_autores    boolean not null default false,
  mostrar_contratos  boolean not null default true,
  mostrar_pendencias boolean not null default true,
  dias_periodo       integer not null default 90 check (dias_periodo between 7 and 730),

  criado_em          timestamptz not null default now(),
  criado_por         uuid references auth.users (id),
  revogado_em        timestamptz,
  revogado_por       uuid references auth.users (id)
);

comment on table public.portais is
  'Endereco externo de leitura para uma carteira. O token e o segredo do '
  'link: expira, e revogavel e nao da acesso a nenhuma outra carteira.';

create index if not exists idx_portais_carteira on public.portais (carteira_id, criado_em desc);

-- ---------------------------------------------------------------------
-- 2. Quem abriu
-- ---------------------------------------------------------------------
create table if not exists public.portal_acessos (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.orgs (id) on delete cascade,
  carteira_id uuid not null references public.carteiras (id) on delete cascade,
  portal_id   uuid not null references public.portais (id) on delete cascade,
  agente      text,
  criado_em   timestamptz not null default now()
);

comment on table public.portal_acessos is
  'Registro de abertura do portal. Guarda data e navegador. Nao guarda '
  'IP: identificaria a pessoa do outro lado sem necessidade nenhuma para '
  'a finalidade, que e saber se o material foi visto.';

create index if not exists idx_portal_acessos on public.portal_acessos (portal_id, criado_em desc);

-- ---------------------------------------------------------------------
-- 3. Leitura pública
-- ---------------------------------------------------------------------
-- Todo o portal cabe nesta função. O visitante é anônimo: não existe
-- sessão, não existe vínculo, e nenhuma política de RLS o autorizaria a
-- ler tabela nenhuma. Então nada é lido direto — só sai daqui, já
-- filtrado pelo que o link permite mostrar.
create or replace function public.portal_dados(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_p       public.portais;
  v_c       public.carteiras;
  v_org     text;
  v_desde   date;
  v_hoje    date := current_date;
begin
  select * into v_p from public.portais where token = p_token;

  if v_p.id is null then
    return jsonb_build_object('valido', false, 'motivo', 'Endereço não encontrado. Confira o link recebido.');
  end if;
  if v_p.status = 'revogado' then
    return jsonb_build_object('valido', false, 'motivo', 'Este acesso foi encerrado por quem o criou.');
  end if;
  if v_p.expira_em < now() then
    return jsonb_build_object('valido', false, 'motivo', 'Este acesso expirou. Peça um link novo.');
  end if;

  select * into v_c from public.carteiras where id = v_p.carteira_id;
  select nome into v_org from public.orgs where id = v_p.org_id;
  v_desde := v_hoje - v_p.dias_periodo;

  return jsonb_build_object(
    'valido', true,
    'portal_id', v_p.id,
    'titulo', v_p.titulo,
    'expira_em', v_p.expira_em,
    'periodo_dias', v_p.dias_periodo,
    'desde', v_desde,
    'mostrar_valores', v_p.mostrar_valores,
    'organizacao', v_org,
    'carteira', jsonb_build_object(
      'nome', v_c.nome, 'codigo', v_c.codigo, 'regiao', v_c.regiao
    ),

    'contas', (select count(*) from public.contas x
                where x.carteira_id = v_p.carteira_id and x.status = 'ativa'),

    'potencial', case when v_p.mostrar_valores then (
        select coalesce(sum(f.potencial_bruto), 0) from public.frentes f
         where f.carteira_id = v_p.carteira_id
           and f.status in ('identificada', 'em_analise', 'em_execucao')
      ) else null end,
    'capturado', case when v_p.mostrar_valores then (
        select coalesce(sum(f.valor_capturado), 0) from public.frentes f
         where f.carteira_id = v_p.carteira_id
      ) else null end,

    'frentes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'titulo', f.titulo,
               'status', f.status,
               'casos', f.qtd_casos,
               'proxima', f.proxima_etapa,
               'prazo', f.prazo,
               'potencial', case when v_p.mostrar_valores then f.potencial_bruto else null end,
               'capturado', case when v_p.mostrar_valores then f.valor_capturado else null end
             ) order by f.status, f.titulo), '[]'::jsonb)
      from public.frentes f
      where f.carteira_id = v_p.carteira_id
        and f.status in ('identificada', 'em_analise', 'em_execucao')
    ),

    'contratos', case when v_p.mostrar_contratos then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'numero', c.numero,
               'conta', ct.nome,
               'fim', c.fim,
               'situacao', case when c.fim < v_hoje then 'vencido' else 'janela aberta' end
             ) order by c.fim), '[]'::jsonb)
      from public.contratos c
      left join public.contas ct on ct.id = c.conta_id
      where c.carteira_id = v_p.carteira_id
        and c.status <> 'encerrado'
        and (c.fim < v_hoje or c.janela_renegociacao <= v_hoje)
    ) else null end,

    'entregas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'data', r.ocorrido_em,
               'titulo', r.titulo,
               'corpo', r.corpo,
               'autor', case when v_p.mostrar_autores then pf.nome else null end
             ) order by r.ocorrido_em desc), '[]'::jsonb)
      from public.registros r
      left join public.perfis pf on pf.id = r.autor_id
      where r.carteira_id = v_p.carteira_id
        and r.ativo
        and r.tipo in ('entrega', 'decisao')
        and r.ocorrido_em >= v_desde
    ),

    'pendencias', case when v_p.mostrar_pendencias then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'titulo', k.titulo,
               'vence', k.vence_em,
               'atrasado', k.vence_em < v_hoje
             ) order by k.vence_em), '[]'::jsonb)
      from public.compromissos k
      where k.carteira_id = v_p.carteira_id and k.status = 'aberto'
    ) else null end
  );
end;
$$;

comment on function public.portal_dados(text) is
  'Unica porta do visitante anonimo. Devolve so o que o link autoriza; '
  'nenhuma tabela e exposta diretamente ao papel anon.';

-- ---------------------------------------------------------------------
-- 4. Marcação da visita
-- ---------------------------------------------------------------------
-- Separada da leitura de propósito: a função de dados é `stable` e não
-- deve escrever. Aqui é o oposto — grava e não devolve nada.
create or replace function public.portal_visita(p_token text, p_agente text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p public.portais;
begin
  select * into v_p from public.portais
   where token = p_token and status = 'ativo' and expira_em >= now();

  if v_p.id is null then
    return;
  end if;

  insert into public.portal_acessos (org_id, carteira_id, portal_id, agente)
  values (v_p.org_id, v_p.carteira_id, v_p.id, left(coalesce(p_agente, ''), 300));

  insert into public.auditoria (org_id, user_id, origem, acao, entidade_tipo, entidade_id, resumo)
  values (v_p.org_id, null, 'portal', 'abriu_portal', 'portais', v_p.id,
          coalesce(v_p.destinatario, v_p.titulo, 'visitante do portal'));
end;
$$;

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
alter table public.portais       enable row level security;
alter table public.portal_acessos enable row level security;

-- Criar link externo é decisão de quem responde pela carteira, não de
-- quem opera dentro dela.
drop policy if exists portais_le on public.portais;
create policy portais_le on public.portais
  for select to authenticated using (public.tem_acesso_carteira(carteira_id));

drop policy if exists portais_escreve on public.portais;
create policy portais_escreve on public.portais
  for all to authenticated
  using (public.pode_gerir_carteiras(org_id) and public.tem_acesso_carteira(carteira_id))
  with check (public.pode_gerir_carteiras(org_id) and public.tem_acesso_carteira(carteira_id));

drop policy if exists portal_acessos_le on public.portal_acessos;
create policy portal_acessos_le on public.portal_acessos
  for select to authenticated using (public.tem_acesso_carteira(carteira_id));

-- Nenhuma política de escrita em portal_acessos: a visita entra pela
-- função acima, e ninguém falsifica leitura de material que não leu.

grant select, insert, update, delete on public.portais to authenticated;
grant select on public.portal_acessos to authenticated;

-- O anônimo executa as duas funções e nada mais. Não recebe select em
-- tabela nenhuma.
grant execute on function public.portal_dados(text) to anon, authenticated;
grant execute on function public.portal_visita(text, text) to anon, authenticated;
