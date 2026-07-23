-- =====================================================================
-- Migration : 0037_mapa_decisores.sql
-- Feature   : B44 — mapa de decisores
-- Aplicar   : depois de 0036_observabilidade.sql.
--
-- A ficha da conta responde hoje quanto vale e o que está combinado. Não
-- responde a pergunta que se faz no carro, cinco minutos antes da
-- reunião: quem decide, quem influencia, quem é contra, e por onde a
-- informação entra. `contatos` tem nome, cargo, e-mail e telefone — uma
-- agenda, não um mapa.
--
-- O QUE ISTO NÃO É: não é CRM de contatos. Não entra campanha, sequência
-- de e-mail nem registro de ligação. É mapa de quem decide.
--
-- =====================================================================
-- A DECISÃO DE PROJETO QUE SUSTENTA O RESTO
-- =====================================================================
--
-- Papel na decisão e postura são catálogo do assinante — "Diretor de
-- Operações" e "Gerente de Utilidades" não podem estar no código, porque
-- o vocabulário muda de setor para setor.
--
-- Só que dois alertas precisam ser calculáveis: "conta de criticidade
-- alta sem nenhum decisor mapeado" e "conta com um único contato". Se o
-- catálogo for texto livre, o produto não tem como saber quais papéis
-- decidem — e o alerta viraria adivinhação sobre o vocabulário do
-- cliente.
--
-- A saída: o catálogo carrega uma PROPRIEDADE ESTRUTURAL, não semântica.
-- O assinante escreve o rótulo que quiser e responde uma pergunta que
-- vale em qualquer setor: "este papel decide?" (booleano `decide`) e
-- "esta postura é a favor, neutra ou contra?" (`tom`). O produto nunca
-- interpreta o rótulo; lê só a propriedade. Assim o alerta é computável
-- e o agnosticismo continua de pé.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Catálogos do assinante
-- ---------------------------------------------------------------------

create table if not exists public.contato_papeis (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  rotulo     text not null,
  descricao  text,
  -- Propriedade estrutural: quem tem este papel assina embaixo?
  decide     boolean not null default false,
  ordem      integer not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create unique index if not exists idx_contato_papel_unico
  on public.contato_papeis (org_id, lower(rotulo));

create table if not exists public.contato_posturas (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  rotulo     text not null,
  descricao  text,
  -- Propriedade estrutural: para que lado esta postura joga?
  tom        text not null default 'neutro'
             check (tom in ('favoravel', 'neutro', 'contrario')),
  ordem      integer not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create unique index if not exists idx_contato_postura_unica
  on public.contato_posturas (org_id, lower(rotulo));


-- ---------------------------------------------------------------------
-- 2. O contato vira nó de um mapa
-- ---------------------------------------------------------------------

alter table public.contatos
  add column if not exists papel_id   uuid references public.contato_papeis (id) on delete set null,
  add column if not exists postura_id uuid references public.contato_posturas (id) on delete set null,
  -- 1 a 5. Escala curta de propósito: escala longa vira falsa precisão
  -- num julgamento que é qualitativo.
  add column if not exists influencia smallint check (influencia between 1 and 5),
  add column if not exists area       text,
  -- Auto-referência: monta a hierarquia sem tabela extra.
  add column if not exists reporta_a  uuid references public.contatos (id) on delete set null;

create index if not exists idx_contatos_reporta on public.contatos (reporta_a);
create index if not exists idx_contatos_conta   on public.contatos (conta_id);



-- ---------------------------------------------------------------------
-- 3. As duas travas da hierarquia
-- ---------------------------------------------------------------------
-- Sem elas o mapa vira grafo quebrado: alguém reportando a contato de
-- outra conta, ou um ciclo que trava a montagem da árvore na tela.

create or replace function public.validar_hierarquia_contato()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_conta_chefe uuid;
  v_atual       uuid;
  v_saltos      integer := 0;
begin
  if new.reporta_a is null then
    return new;
  end if;

  if new.reporta_a = new.id then
    raise exception 'Um contato não reporta a si mesmo.' using errcode = '23514';
  end if;

  select conta_id into v_conta_chefe from public.contatos where id = new.reporta_a;

  if v_conta_chefe is null then
    raise exception 'A quem este contato reporta não existe.' using errcode = '23503';
  end if;

  if v_conta_chefe <> new.conta_id then
    raise exception 'Só dá para reportar a alguém da mesma conta.' using errcode = '23514';
  end if;

  -- Ciclo: sobe a cadeia a partir do chefe; se voltar ao próprio nó,
  -- recusa. O teto de saltos protege contra ciclo pré-existente.
  v_atual := new.reporta_a;
  while v_atual is not null and v_saltos < 50 loop
    if v_atual = new.id then
      raise exception 'Isso fecharia um ciclo na hierarquia.' using errcode = '23514';
    end if;
    select reporta_a into v_atual from public.contatos where id = v_atual;
    v_saltos := v_saltos + 1;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_hierarquia_contato on public.contatos;
create trigger trg_hierarquia_contato
  before insert or update of reporta_a, conta_id on public.contatos
  for each row execute function public.validar_hierarquia_contato();


-- ---------------------------------------------------------------------
-- 4. Valores iniciais SUGERIDOS — nunca fixos
-- ---------------------------------------------------------------------
-- Roda no primeiro acesso e não repete. O assinante renomeia, desativa e
-- acrescenta à vontade; nada aqui é referenciado por rótulo no código.

create or replace function public.garantir_catalogo_decisao(p_org uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_criados integer := 0;
  v_n       integer;
begin
  perform public.exigir_participacao(p_org);

  insert into public.contato_papeis (org_id, rotulo, descricao, decide, ordem)
  values
    (p_org, 'Decisor',      'Assina embaixo. Sem o sim dele, não anda.',            true,  1),
    (p_org, 'Influenciador','Não decide, mas a opinião dele pesa na decisão.',      false, 2),
    (p_org, 'Técnico',      'Avalia a viabilidade e aponta impedimento.',           false, 3),
    (p_org, 'Operacional',  'Convive com o serviço no dia a dia.',                  false, 4),
    (p_org, 'Financeiro',   'Olha custo, prazo e contrato.',                        false, 5),
    (p_org, 'Porta de entrada', 'Por onde a informação entra e circula.',           false, 6)
  on conflict do nothing;
  get diagnostics v_n = row_count; v_criados := v_criados + v_n;

  insert into public.contato_posturas (org_id, rotulo, descricao, tom, ordem)
  values
    (p_org, 'Apoia',      'Defende a solução internamente.',            'favoravel', 1),
    (p_org, 'Neutro',     'Sem posição declarada.',                     'neutro',    2),
    (p_org, 'Cético',     'Tem dúvidas, mas não bloqueia.',             'neutro',    3),
    (p_org, 'Resistente', 'Age contra. Trate antes da reunião.',        'contrario', 4),
    (p_org, 'Sem contato','Ainda não houve conversa com esta pessoa.',  'neutro',    5)
  on conflict do nothing;
  get diagnostics v_n = row_count; v_criados := v_criados + v_n;

  return v_criados;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Alcance — RLS em tudo que é novo
-- ---------------------------------------------------------------------

alter table public.contato_papeis   enable row level security;
alter table public.contato_posturas enable row level security;

drop policy if exists papeis_decisao_le on public.contato_papeis;
create policy papeis_decisao_le on public.contato_papeis
  for select to authenticated using (public.e_membro(org_id));

drop policy if exists papeis_decisao_escreve on public.contato_papeis;
create policy papeis_decisao_escreve on public.contato_papeis
  for all to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));

drop policy if exists posturas_le on public.contato_posturas;
create policy posturas_le on public.contato_posturas
  for select to authenticated using (public.e_membro(org_id));

drop policy if exists posturas_escreve on public.contato_posturas;
create policy posturas_escreve on public.contato_posturas
  for all to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));


-- ---------------------------------------------------------------------
-- 6. Os dois alertas novos
-- ---------------------------------------------------------------------
-- O check de tipo é fechado de propósito — alerta com tipo inventado
-- some do agrupamento da tela. Ampliar exige recriar a restrição.

alter table public.alertas drop constraint if exists alertas_tipo_check;
alter table public.alertas add constraint alertas_tipo_check check (tipo in (
  'contrato_vencido', 'contrato_janela', 'compromisso_atrasado',
  'carteira_parada', 'frente_parada', 'oportunidade_parada',
  'potencial_sem_captura',
  -- novos:
  'conta_sem_decisor', 'conta_ponto_unico'));

-- Só conta ATIVA entra. E só quem tem contato cadastrado: conta sem
-- nenhum contato é problema de cadastro, não de mapa — avisar disso
-- encheria a tela no primeiro dia de uso e ensinaria a ignorar aviso.
create or replace function public.gerar_alertas_decisores__nucleo(p_org uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_antes  integer;
  v_depois integer;
begin
  select count(*) into v_antes
    from public.alertas
   where org_id = p_org and status = 'aberto'
     and tipo in ('conta_sem_decisor', 'conta_ponto_unico');

  -- (a) criticidade alta e ninguém que decide
  insert into public.alertas (
    org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id,
    titulo, detalhe, chave)
  select
    c.org_id, c.carteira_id, 'conta_sem_decisor', 'atencao', 'conta', c.id,
    'Sem decisor mapeado: ' || c.nome,
    'A conta é de criticidade alta e nenhum contato tem papel que decide. '
      || 'Na hora de aprovar, não se sabe a quem pedir.',
    'conta_sem_decisor:' || c.id
  from public.contas c
  where c.org_id = p_org
    and c.status = 'ativa'
    and c.criticidade = 'alta'
    and exists (select 1 from public.contatos k where k.conta_id = c.id)
    and not exists (
      select 1
        from public.contatos k
        join public.contato_papeis p on p.id = k.papel_id
       where k.conta_id = c.id and p.decide and p.ativo)
  on conflict (org_id, chave) do update
    set status  = case when public.alertas.status = 'resolvido' then 'aberto'
                       else public.alertas.status end,
        detalhe = excluded.detalhe;

  -- (b) ponto único de relacionamento
  insert into public.alertas (
    org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id,
    titulo, detalhe, chave)
  select
    c.org_id, c.carteira_id, 'conta_ponto_unico', 'atencao', 'conta', c.id,
    'Um contato só: ' || c.nome,
    'Todo o relacionamento passa por uma pessoa. Se ela sair da empresa, '
      || 'a conta fica sem porta de entrada.',
    'conta_ponto_unico:' || c.id
  from public.contas c
  where c.org_id = p_org
    and c.status = 'ativa'
    and (select count(*) from public.contatos k where k.conta_id = c.id) = 1
  on conflict (org_id, chave) do update
    set status  = case when public.alertas.status = 'resolvido' then 'aberto'
                       else public.alertas.status end,
        detalhe = excluded.detalhe;

  -- Some sozinho quando a causa some — a mesma regra dos outros sete.
  update public.alertas a
     set status = 'resolvido', resolvido_em = now()
   where a.org_id = p_org
     and a.status in ('aberto', 'silenciado')
     and a.tipo = 'conta_sem_decisor'
     and exists (
       select 1
         from public.contatos k
         join public.contato_papeis p on p.id = k.papel_id
        where k.conta_id = a.entidade_id and p.decide and p.ativo);

  update public.alertas a
     set status = 'resolvido', resolvido_em = now()
   where a.org_id = p_org
     and a.status in ('aberto', 'silenciado')
     and a.tipo = 'conta_ponto_unico'
     and (select count(*) from public.contatos k where k.conta_id = a.entidade_id) <> 1;

  select count(*) into v_depois
    from public.alertas
   where org_id = p_org and status = 'aberto'
     and tipo in ('conta_sem_decisor', 'conta_ponto_unico');

  return v_depois - v_antes;
end;
$$;

revoke execute on function public.gerar_alertas_decisores__nucleo(uuid) from public, authenticated;


-- ---------------------------------------------------------------------
-- 7. A varredura passa a incluir o mapa
-- ---------------------------------------------------------------------
-- O invólucro de 0035 continua sendo a porta: gate na entrada, depois o
-- núcleo antigo e o novo. A soma das duas diferenças é o que a tela e o
-- cron mostram como "quantos abriram ou fecharam".
--
-- Migration aplicada não se edita: 0035 fica como está, e esta troca o
-- invólucro por uma versão que sabe do mapa.

create or replace function public.gerar_alertas(
  p_org               uuid,
  p_dias_carteira     integer default 30,
  p_dias_frente       integer default 45,
  p_dias_oportunidade integer default 60)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_base       integer;
  v_decisores  integer;
begin
  perform public.exigir_participacao(p_org);

  v_base := public.gerar_alertas__nucleo(
    p_org, p_dias_carteira, p_dias_frente, p_dias_oportunidade);
  v_decisores := public.gerar_alertas_decisores__nucleo(p_org);

  return v_base + v_decisores;
end;
$$;

revoke execute on function public.gerar_alertas(uuid, integer, integer, integer) from public, anon;
grant execute on function public.gerar_alertas(uuid, integer, integer, integer)
  to authenticated, service_role;

revoke execute on function public.garantir_catalogo_decisao(uuid) from public, anon;
grant  execute on function public.garantir_catalogo_decisao(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 8. Verificação — a migration falha se algo não ficou de pé
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.contato_papeis') is null
     or to_regclass('public.contato_posturas') is null then
    raise exception 'Catálogos de decisão não foram criados';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'contatos'
       and column_name in ('papel_id', 'postura_id', 'influencia', 'reporta_a', 'area')
     having count(*) = 5) then
    raise exception 'Colunas do mapa não chegaram em contatos';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.alertas'::regclass and conname = 'alertas_tipo_check'
       and pg_get_constraintdef(oid) like '%conta_sem_decisor%') then
    raise exception 'O check de tipo de alerta não aceita os tipos novos';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.contato_papeis'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.contato_posturas'::regclass) then
    raise exception 'RLS não está ligada nos catálogos novos';
  end if;

  raise notice 'Mapa de decisores: catálogos, colunas, travas e alertas no lugar.';
end $$;
