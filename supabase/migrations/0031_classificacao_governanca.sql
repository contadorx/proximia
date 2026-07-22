-- =====================================================================
-- Migration : 0031_classificacao_governanca.sql
-- Feature   : B41 — cinco lacunas apontadas pelo backlog de histórias
-- Aplicar   : depois de 0030_busca.sql.
--
-- Cinco coisas pequenas que, juntas, fecham nove histórias do backlog:
--
--   1. Classificações livres por conta — ramo, natureza, porte, o que o
--      assinante quiser. Campo fixo por setor sairia caro depois.
--   2. Natureza da iniciativa: captura ou proteção. Sem isso, nada impede
--      somar desconto contratado como receita a recuperar — o erro que a
--      própria doutrina do produto existe para evitar.
--   3. Prioridade, para a lista virar fila de trabalho.
--   4. Marcos de renovação: um contrato relevante precisa avisar em 180,
--      90 e 60 dias, não uma vez só.
--   5. Interruptor de anexo: há operação em que política interna proíbe
--      guardar arquivo fora do repositório oficial.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Classificações livres
-- ---------------------------------------------------------------------
-- Dois níveis num objeto só: o grupo é a pergunta ("Ramo"), o valor é a
-- resposta ("Indústria"). Assim o assinante cria as dimensões que a
-- operação dele usa, sem que o produto precise conhecê-las.
create table if not exists public.classificacoes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  grupo      text not null,
  valor      text not null,
  descricao  text,
  ordem      integer not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create unique index if not exists idx_classificacao_unica
  on public.classificacoes (org_id, lower(grupo), lower(valor));
create index if not exists idx_classificacao_grupo on public.classificacoes (org_id, grupo);

create table if not exists public.conta_classificacoes (
  conta_id         uuid not null references public.contas (id) on delete cascade,
  classificacao_id uuid not null references public.classificacoes (id) on delete cascade,
  org_id           uuid not null references public.orgs (id) on delete cascade,
  criado_em        timestamptz not null default now(),
  primary key (conta_id, classificacao_id)
);

create index if not exists idx_conta_class_conta on public.conta_classificacoes (conta_id);

alter table public.classificacoes       enable row level security;
alter table public.conta_classificacoes enable row level security;

drop policy if exists classificacoes_le on public.classificacoes;
create policy classificacoes_le on public.classificacoes
  for select to authenticated using (public.e_membro(org_id));

drop policy if exists classificacoes_escreve on public.classificacoes;
create policy classificacoes_escreve on public.classificacoes
  for all to authenticated
  using (public.pode_gerir_carteiras(org_id))
  with check (public.pode_gerir_carteiras(org_id));

-- Classificar uma conta é operação de quem trabalha nela.
drop policy if exists conta_class_le on public.conta_classificacoes;
create policy conta_class_le on public.conta_classificacoes
  for select to authenticated
  using (exists (select 1 from public.contas c
                  where c.id = conta_id and public.tem_acesso_carteira(c.carteira_id)));

drop policy if exists conta_class_escreve on public.conta_classificacoes;
create policy conta_class_escreve on public.conta_classificacoes
  for all to authenticated
  using (public.pode_escrever(org_id)
         and exists (select 1 from public.contas c
                      where c.id = conta_id and public.tem_acesso_carteira(c.carteira_id)))
  with check (public.pode_escrever(org_id)
              and exists (select 1 from public.contas c
                           where c.id = conta_id and public.tem_acesso_carteira(c.carteira_id)));

grant select, insert, update, delete on public.classificacoes       to authenticated;
grant select, insert, delete         on public.conta_classificacoes to authenticated;

-- ---------------------------------------------------------------------
-- 2. Natureza: captura ou proteção
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'natureza_iniciativa') then
    create type public.natureza_iniciativa as enum ('captura', 'protecao');
  end if;
end
$$;

alter table public.frentes
  add column if not exists natureza public.natureza_iniciativa not null default 'captura';
alter table public.oportunidades
  add column if not exists natureza public.natureza_iniciativa not null default 'captura';

comment on column public.frentes.natureza is
  'Captura é receita nova; proteção é receita que já existe e pode ser '
  'perdida. Somar as duas como potencial a capturar é o erro que a '
  'disciplina do produto existe para evitar.';

-- O panorama passa a separar as duas. Antes somava tudo em um número só,
-- e uma carteira defensiva parecia ter potencial ofensivo.
drop view if exists public.carteira_resumo;

create view public.carteira_resumo
with (security_invoker = on)
as
select
  c.id as carteira_id, c.org_id, c.nome, c.codigo, c.regiao, c.status,
  c.responsavel_id, c.score_maturidade, c.score_ciclo,

  coalesce(ct.total, 0)      as contas_total,
  coalesce(ct.protecao, 0)   as contas_protecao,
  coalesce(ct.potencial, 0)  as contas_potencial,
  coalesce(ct.capturado, 0)  as contas_capturado,

  coalesce(fr.abertas, 0)             as frentes_abertas,
  coalesce(fr.casos, 0)               as frentes_casos,
  coalesce(fr.potencial, 0)           as frentes_potencial,
  coalesce(fr.potencial_protecao, 0)  as frentes_potencial_protecao,
  coalesce(fr.capturado, 0)           as frentes_capturado,

  coalesce(co.total, 0)     as contratos_total,
  coalesce(co.vencidos, 0)  as contratos_vencidos,
  coalesce(co.janela, 0)    as contratos_janela,

  coalesce(op.abertas, 0)          as oportunidades_abertas,
  coalesce(op.investimento, 0)     as oportunidades_investimento,
  coalesce(op.resultado_mensal, 0) as oportunidades_resultado,

  coalesce(cp.abertos, 0)   as compromissos_abertos,
  coalesce(cp.atrasados, 0) as compromissos_atrasados,

  greatest(c.atualizado_em, coalesce(rg.ultimo, c.criado_em)) as ultima_movimentacao,
  rg.ultimo as ultimo_registro

from public.carteiras c

left join lateral (
  select count(*) as total,
         count(*) filter (where relacao = 'protecao') as protecao,
         sum(potencial_bruto) as potencial,
         sum(valor_capturado) as capturado
    from public.contas x where x.carteira_id = c.id and x.status = 'ativa'
) ct on true

left join lateral (
  select
    count(*) filter (where status in ('identificada','em_analise','em_execucao')) as abertas,
    sum(qtd_casos) filter (where status in ('identificada','em_analise','em_execucao')) as casos,
    sum(potencial_bruto) filter (
      where status in ('identificada','em_analise','em_execucao') and natureza = 'captura') as potencial,
    sum(potencial_bruto) filter (
      where status in ('identificada','em_analise','em_execucao') and natureza = 'protecao') as potencial_protecao,
    sum(valor_capturado) as capturado
    from public.frentes x where x.carteira_id = c.id
) fr on true

left join lateral (
  select count(*) filter (where status <> 'encerrado') as total,
         count(*) filter (where status in ('vigente','em_renovacao') and fim < current_date) as vencidos,
         count(*) filter (where status <> 'encerrado' and fim >= current_date
                            and janela_renegociacao <= current_date) as janela
    from public.contratos x where x.carteira_id = c.id
) co on true

left join lateral (
  select count(*) filter (where fase not in ('concluida','descartada')) as abertas,
         sum(investimento) filter (where fase not in ('concluida','descartada')) as investimento,
         sum(resultado_mensal) filter (where fase not in ('concluida','descartada')) as resultado_mensal
    from public.oportunidades x where x.carteira_id = c.id
) op on true

left join lateral (
  select count(*) filter (where status = 'aberto') as abertos,
         count(*) filter (where status = 'aberto' and vence_em < current_date) as atrasados
    from public.compromissos x where x.carteira_id = c.id
) cp on true

left join lateral (
  select max(criado_em) as ultimo from public.registros x
   where x.carteira_id = c.id and x.ativo
) rg on true;

grant select on public.carteira_resumo to authenticated;

-- ---------------------------------------------------------------------
-- 3. Prioridade
-- ---------------------------------------------------------------------
-- Escala curta e de significado fixo: 1 é o que se ataca primeiro. Deixar
-- a escala livre faria cada unidade inventar a sua e o número perderia
-- comparabilidade entre carteiras.
alter table public.frentes
  add column if not exists prioridade smallint not null default 3
    check (prioridade between 1 and 5);
alter table public.oportunidades
  add column if not exists prioridade smallint not null default 3
    check (prioridade between 1 and 5);

create index if not exists idx_frentes_prioridade
  on public.frentes (org_id, prioridade) where status in ('identificada','em_analise','em_execucao');
create index if not exists idx_oportunidades_prioridade
  on public.oportunidades (org_id, prioridade) where fase not in ('concluida','descartada');

-- ---------------------------------------------------------------------
-- 4. Marcos de renovação e status "em renovação"
-- ---------------------------------------------------------------------
alter table public.contratos drop constraint if exists contratos_status_check;
alter table public.contratos add constraint contratos_status_check
  check (status in ('vigente', 'em_renovacao', 'encerrado', 'rascunho'));

alter table public.contratos
  add column if not exists marcos_aviso integer[] not null default '{180,90,60}';

comment on column public.contratos.marcos_aviso is
  'Dias antes do fim em que o contrato deve avisar. Contrato relevante '
  'precisa de mais de um toque: 180 para pensar, 90 para propor, 60 para '
  'fechar.';

-- Um alerta por marco atingido, e não um só na janela.
create or replace function public.gerar_alertas_marcos(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_criados integer := 0;
  v_c       record;
  v_marco   integer;
  v_faltam  integer;
begin
  for v_c in
    select id, carteira_id, org_id, numero, fim, marcos_aviso
      from public.contratos
     where org_id = p_org
       and status in ('vigente', 'em_renovacao')
       and fim >= current_date
  loop
    v_faltam := v_c.fim - current_date;

    foreach v_marco in array v_c.marcos_aviso loop
      -- Dispara quando o prazo restante cruza o marco, e só uma vez por
      -- marco: a chave carrega o número de dias.
      if v_faltam <= v_marco then
        insert into public.alertas (
          org_id, carteira_id, tipo, severidade, entidade_tipo, entidade_id,
          titulo, detalhe, chave)
        values (
          v_c.org_id, v_c.carteira_id, 'contrato_janela',
          case when v_marco <= 60 then 'alta' else 'atencao' end,
          'contrato', v_c.id,
          'Renovação em ' || v_marco || ' dias: ' || coalesce(v_c.numero, 'sem número'),
          'Faltam ' || v_faltam || ' dias para o fim, em ' || to_char(v_c.fim, 'DD/MM/YYYY') || '.',
          'contrato_marco:' || v_c.id || ':' || v_marco)
        on conflict (org_id, chave) do nothing;

        if found then
          v_criados := v_criados + 1;
        end if;
      end if;
    end loop;
  end loop;

  return v_criados;
end;
$$;

grant execute on function public.gerar_alertas_marcos(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Interruptor de anexo
-- ---------------------------------------------------------------------
alter table public.orgs
  add column if not exists permite_anexos boolean not null default true;

comment on column public.orgs.permite_anexos is
  'Desligado, o produto aceita apenas link para repositório externo. '
  'Existe porque há operação cuja política interna proíbe guardar arquivo '
  'fora do repositório oficial.';

create or replace function public.anexos_permitidos(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select coalesce((select permite_anexos from public.orgs where id = p_org), true) $$;

grant execute on function public.anexos_permitidos(uuid) to authenticated;

-- A trava vale no armazenamento, não só na tela: tela escondida ainda
-- aceita requisição montada à mão.
drop policy if exists anexos_objetos_cria on storage.objects;
create policy anexos_objetos_cria on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and public.pode_escrever(((storage.foldername(name))[1])::uuid)
    and public.anexos_permitidos(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists anexos_cria on public.anexos;
create policy anexos_cria on public.anexos
  for insert to authenticated
  with check (
    public.pode_escrever(org_id)
    and public.tem_acesso_carteira(carteira_id)
    and public.anexos_permitidos(org_id)
  );
