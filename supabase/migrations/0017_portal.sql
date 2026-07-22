-- =====================================================================
-- Migration : 0017_portal.sql
-- Feature   : F22 — portal da unidade (fase 2)
-- O que faz : dá à unidade um endereço próprio, somente leitura, onde ela
--             acompanha a própria carteira sem precisar de usuário.
-- Aplicar   : depois de 0016_auditoria.sql.
--
-- O token no endereço é o segredo. Por isso:
--   - ele pode ser revogado e trocado a qualquer momento;
--   - pode ter prazo de validade;
--   - cada acesso é contado, e o último fica registrado;
--   - o portal nunca devolve dado pessoal — nada de contato, e-mail ou
--     nome de quem escreveu;
--   - valores podem ser escondidos por carteira, para quando o número
--     não deve circular fora de casa.
--
-- A leitura sai por função com privilégio, e não por política de tabela:
-- quem abre o portal não tem sessão nenhuma, e não deve mesmo ter.
-- =====================================================================

create table if not exists public.portais (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs (id) on delete cascade,
  carteira_id      uuid not null references public.carteiras (id) on delete cascade,

  token            text not null unique default encode(gen_random_bytes(24), 'hex'),
  ativo            boolean not null default true,
  expira_em        date,

  titulo           text,
  mensagem         text,
  mostrar_valores  boolean not null default true,

  acessos          integer not null default 0,
  ultimo_acesso    timestamptz,

  criado_em        timestamptz not null default now(),
  criado_por       uuid references auth.users (id),

  unique (carteira_id)
);

comment on table public.portais is
  'Endereço público de leitura de uma carteira. Um por carteira; o token é '
  'o segredo e pode ser trocado.';

alter table public.portais enable row level security;

drop policy if exists portais_le on public.portais;
create policy portais_le on public.portais
  for select to authenticated
  using (public.tem_acesso_carteira(carteira_id));

drop policy if exists portais_escreve on public.portais;
create policy portais_escreve on public.portais
  for all to authenticated
  using (public.pode_gerir_carteiras(org_id) and public.tem_acesso_carteira(carteira_id))
  with check (public.pode_gerir_carteiras(org_id) and public.tem_acesso_carteira(carteira_id));

grant select, insert, update, delete on public.portais to authenticated;

-- ---------------------------------------------------------------------
-- Leitura pública
-- ---------------------------------------------------------------------
-- Devolve um retrato da carteira em jsonb. Não recebe nada além do token
-- e não devolve nada que identifique pessoa.
create or replace function public.ver_portal(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_portal    public.portais;
  v_carteira  public.carteiras;
  v_org       text;
  v_valores   boolean;
  v_inicio    date := (current_date - interval '90 days')::date;
  v_resultado jsonb;
begin
  select * into v_portal from public.portais where token = p_token;

  if v_portal.id is null or not v_portal.ativo then
    return jsonb_build_object('valido', false, 'motivo', 'Este endereço não está mais disponível.');
  end if;

  if v_portal.expira_em is not null and v_portal.expira_em < current_date then
    return jsonb_build_object('valido', false, 'motivo', 'Este endereço expirou. Peça um novo.');
  end if;

  select * into v_carteira from public.carteiras where id = v_portal.carteira_id;
  select nome into v_org from public.orgs where id = v_portal.org_id;
  v_valores := v_portal.mostrar_valores;

  update public.portais
     set acessos = acessos + 1, ultimo_acesso = now()
   where id = v_portal.id;

  v_resultado := jsonb_build_object(
    'valido', true,
    'organizacao', v_org,
    'carteira', v_carteira.nome,
    'codigo', v_carteira.codigo,
    'regiao', v_carteira.regiao,
    'titulo', v_portal.titulo,
    'mensagem', v_portal.mensagem,
    'mostrar_valores', v_valores,
    'atualizado_em', to_char(now(), 'DD/MM/YYYY'),
    'maturidade', v_carteira.score_maturidade,
    'maturidade_ciclo', v_carteira.score_ciclo,

    'frentes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titulo', f.titulo,
        'situacao', f.status,
        'casos', f.qtd_casos,
        'proxima_etapa', f.proxima_etapa,
        'prazo', to_char(f.prazo, 'DD/MM/YYYY'),
        'potencial', case when v_valores then f.potencial_bruto end,
        'capturado', case when v_valores then f.valor_capturado end
      ) order by f.status, f.titulo)
      from public.frentes f
      where f.carteira_id = v_carteira.id
        and f.status in ('identificada', 'em_analise', 'em_execucao')
    ), '[]'::jsonb),

    'contratos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', c.numero,
        'conta', ct.nome,
        'fim', to_char(c.fim, 'DD/MM/YYYY'),
        'situacao', case when c.fim < current_date then 'vencido' else 'janela aberta' end
      ) order by c.fim)
      from public.contratos c
      join public.contas ct on ct.id = c.conta_id
      where c.carteira_id = v_carteira.id
        and c.status <> 'encerrado'
        and (c.fim < current_date or c.janela_renegociacao <= current_date)
    ), '[]'::jsonb),

    'entregas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'data', to_char(r.ocorrido_em, 'DD/MM/YYYY'),
        'titulo', coalesce(r.titulo, 'Registro'),
        'corpo', r.corpo
      ) order by r.ocorrido_em desc)
      from public.registros r
      where r.carteira_id = v_carteira.id
        and r.ativo
        and r.tipo in ('entrega', 'decisao')
        and r.ocorrido_em >= v_inicio
    ), '[]'::jsonb),

    'pendencias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titulo', k.titulo,
        'vence', to_char(k.vence_em, 'DD/MM/YYYY'),
        'atrasado', k.vence_em < current_date
      ) order by k.vence_em)
      from public.compromissos k
      where k.carteira_id = v_carteira.id and k.status = 'aberto'
      limit 10
    ), '[]'::jsonb),

    'oportunidades', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titulo', o.titulo,
        'fase', o.fase,
        'investimento', case when v_valores then o.investimento end,
        'payback_meses', case when v_valores then o.payback_meses end
      ) order by o.investimento desc nulls last)
      from public.oportunidades o
      where o.carteira_id = v_carteira.id
        and o.fase not in ('concluida', 'descartada')
    ), '[]'::jsonb)
  );

  return v_resultado;
end;
$$;

-- Aberta a quem não tem sessão: é esse o ponto do portal.
grant execute on function public.ver_portal(text) to anon, authenticated;

-- Trocar o segredo sem perder a configuração.
create or replace function public.trocar_token_portal(p_portal uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid;
  v_novo  text;
begin
  select org_id into v_org from public.portais where id = p_portal;

  if v_org is null then
    raise exception 'Portal não encontrado.';
  end if;
  if not public.pode_gerir_carteiras(v_org) then
    raise exception 'Seu perfil não permite trocar o endereço do portal.';
  end if;

  v_novo := encode(gen_random_bytes(24), 'hex');
  update public.portais
     set token = v_novo, acessos = 0, ultimo_acesso = null
   where id = p_portal;

  return v_novo;
end;
$$;

grant execute on function public.trocar_token_portal(uuid) to authenticated;
