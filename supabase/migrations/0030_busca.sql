-- =====================================================================
-- Migration : 0030_busca.sql
-- Feature   : B39 — busca global
-- Aplicar   : depois de 0029_series_relatorios.sql.
--
-- Com dezoito carteiras e centenas de contas, achar alguma coisa hoje
-- exige saber em que tela ela mora. Quem usa não pensa assim: pensa no
-- nome do cliente, no número do contrato, no CNPJ.
--
-- A função roda com o privilégio de quem chama — sem SECURITY DEFINER,
-- de propósito. Assim a busca enxerga exatamente o que a pessoa
-- enxergaria navegando: ponto focal não descobre a existência de uma
-- conta de outra carteira por um resultado de busca.
-- =====================================================================

create extension if not exists pg_trgm;

-- Índices de similaridade: sem eles, buscar por trecho no meio do nome
-- varre a tabela inteira. Com poucos registros ninguém nota; com muitos,
-- a busca fica lenta justamente para quem mais precisa dela.
create index if not exists idx_busca_carteiras     on public.carteiras     using gin (nome gin_trgm_ops);
create index if not exists idx_busca_contas        on public.contas        using gin (nome gin_trgm_ops);
create index if not exists idx_busca_contas_razao  on public.contas        using gin (razao_social gin_trgm_ops);
create index if not exists idx_busca_frentes       on public.frentes       using gin (titulo gin_trgm_ops);
create index if not exists idx_busca_oportunidades on public.oportunidades using gin (titulo gin_trgm_ops);
create index if not exists idx_busca_contratos     on public.contratos     using gin (numero gin_trgm_ops);
create index if not exists idx_busca_compromissos  on public.compromissos  using gin (titulo gin_trgm_ops);

create or replace function public.buscar(p_termo text, p_limite integer default 8)
returns table (
  tipo        text,
  id          uuid,
  titulo      text,
  detalhe     text,
  carteira_id uuid,
  posicao     integer
)
language sql
stable
as $$
  with termo as (
    select
      trim(p_termo)                                   as texto,
      '%' || trim(p_termo) || '%'                     as padrao,
      nullif(regexp_replace(p_termo, '\D', '', 'g'), '') as digitos
  )

  (
select 'carteira', c.id, c.nome,
         coalesce(c.codigo, '') || case when c.regiao is not null then ' · ' || c.regiao else '' end,
         c.id, 1
    from public.carteiras c, termo t
   where c.nome ilike t.padrao or c.codigo ilike t.padrao
   limit p_limite
  )

  union all

  (
-- Conta entra por nome, razão social e documento. Digitar o CNPJ com
  -- ou sem pontuação tem de funcionar igual: ninguém guarda a máscara.
  select 'conta', c.id, c.nome,
         coalesce(c.razao_social, c.segmento, ''),
         c.carteira_id, 2
    from public.contas c, termo t
   where c.nome ilike t.padrao
      or c.razao_social ilike t.padrao
      or (t.digitos is not null and c.documento like '%' || t.digitos || '%')
   limit p_limite
  )

  union all

  (
select 'contrato', ct.id,
         coalesce(ct.numero, 'sem número'),
         coalesce(co.nome, '') ||
           case when ct.fim is not null then ' · vence ' || to_char(ct.fim, 'DD/MM/YYYY') else '' end,
         ct.carteira_id, 3
    from public.contratos ct
    left join public.contas co on co.id = ct.conta_id, termo t
   where ct.numero ilike t.padrao or co.nome ilike t.padrao
   limit p_limite
  )

  union all

  (
select 'frente', f.id, f.titulo, f.status, f.carteira_id, 4
    from public.frentes f, termo t
   where f.titulo ilike t.padrao
   limit p_limite
  )

  union all

  (
select 'oportunidade', o.id, o.titulo, o.fase, o.carteira_id, 5
    from public.oportunidades o, termo t
   where o.titulo ilike t.padrao
   limit p_limite
  )

  union all

  (
select 'compromisso', k.id, k.titulo,
         to_char(k.vence_em, 'DD/MM/YYYY') || ' · ' || k.status,
         k.carteira_id, 6
    from public.compromissos k, termo t
   where k.titulo ilike t.padrao and k.status = 'aberto'
   limit p_limite
  )
$$;

comment on function public.buscar(text, integer) is
  'Busca unificada. Sem SECURITY DEFINER de propósito: roda com o '
  'privilégio de quem chama, então a RLS decide o que aparece.';

grant execute on function public.buscar(text, integer) to authenticated;
