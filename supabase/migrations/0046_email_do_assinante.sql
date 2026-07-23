-- =====================================================================
-- Migration : 0046_email_do_assinante.sql
-- Aplicar   : depois de 0045_alcance_das_funcoes.sql.
--
-- O QUE FALTAVA
--
-- Ao criar um assinante, informa-se o e-mail de quem vai ser dono — e
-- depois disso o painel nunca mais mostrava esse e-mail. Para saber a
-- quem pertence uma organização, era preciso ir ao banco.
--
-- E há uma informação mais útil que o e-mail sozinho: **o convite foi
-- aceito?** Organização criada há duas semanas com convite pendente não
-- é assinante devagar, é assinante que nunca entrou — e isso muda o que
-- se faz a respeito. O painel passa a dizer os dois.
--
-- De onde vem cada coisa:
--   · dono aceito  → memberships com papel owner, cruzado com auth.users;
--   · convite      → o mais recente da organização, com data de aceite.
--
-- A função já é SECURITY DEFINER e guardada por e_admin_plataforma, então
-- ler auth.users aqui não abre nada novo: quem chega até esta linha já
-- enxerga a lista inteira de assinantes.
-- =====================================================================

create or replace function public.painel_negocio()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v jsonb;
begin
  if not public.e_admin_plataforma() then
    raise exception 'Sem acesso ao painel do negócio.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'receita_recorrente', coalesce((
      select sum(o.valor_mensal) from public.orgs o
       where o.assinatura_status = 'ativa' and not o.conta_teste), 0),

    'receita_em_avaliacao', coalesce((
      select sum(o.valor_mensal) from public.orgs o
       where o.assinatura_status = 'avaliacao' and not o.conta_teste), 0),

    'assinantes', jsonb_build_object(
      'ativos',    (select count(*) from public.orgs where assinatura_status = 'ativa'     and not conta_teste),
      'avaliacao', (select count(*) from public.orgs where assinatura_status = 'avaliacao' and not conta_teste),
      'suspensos', (select count(*) from public.orgs where assinatura_status = 'suspensa'  and not conta_teste),
      'encerrados',(select count(*) from public.orgs where assinatura_status = 'encerrada' and not conta_teste)
    ),

    'serie', coalesce((
      select jsonb_agg(jsonb_build_object('mes', m, 'novos', n) order by m)
        from (select to_char(date_trunc('month', criado_em), 'YYYY-MM') m, count(*) n
                from public.orgs
               where criado_em >= date_trunc('month', now()) - interval '5 months'
                 and not conta_teste
               group by 1) t), '[]'::jsonb),

    'lista', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'nome', o.nome,
        'slug', o.slug,
        'status', o.assinatura_status,
        'plano', p.nome,
        'plano_id', o.plano_id,
        'valor_mensal', o.valor_mensal,
        'ciclo', o.ciclo,
        'avaliacao_ate', o.avaliacao_ate,
        'proximo_vencimento', o.proximo_vencimento,
        'conta_teste', o.conta_teste,
        'observacao_interna', o.observacao_interna,
        'criado_em', o.criado_em,

        -- Quem é o dono, e se ele já entrou.
        --
        -- `dono_email` é quem aceitou e virou owner. `convite_email` é
        -- para quem o convite foi mandado. Quando os dois existem e são
        -- iguais, o ciclo fechou; quando só o convite existe, ninguém
        -- entrou ainda — que é a informação que faltava no painel.
        'dono_email', (
          select u.email from public.memberships m
            join auth.users u on u.id = m.user_id
           where m.org_id = o.id and m.papel = 'owner' and m.ativo
           order by m.criado_em limit 1),

        'convite_email', (
          select c.email from public.convites c
           where c.org_id = o.id
           order by c.criado_em desc limit 1),

        'convite_aceito_em', (
          select c.aceito_em from public.convites c
           where c.org_id = o.id
           order by c.criado_em desc limit 1),

        -- Uso real: assinante que não usa é churn que ainda não avisou.
        'carteiras', (select count(*) from public.carteiras c where c.org_id = o.id),
        'pessoas',   (select count(*) from public.memberships m where m.org_id = o.id and m.ativo),
        'ultimo_registro', (select max(r.criado_em) from public.registros r where r.org_id = o.id)
      ) order by o.conta_teste, o.criado_em desc)
      from public.orgs o
      left join public.planos p on p.id = o.plano_id), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

revoke execute on function public.painel_negocio() from public, anon;
grant  execute on function public.painel_negocio() to authenticated;


-- ---------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------
do $$
declare v jsonb;
begin
  if has_function_privilege('anon', 'public.painel_negocio()', 'EXECUTE') then
    raise exception 'painel_negocio ficou alcançável pelo anônimo';
  end if;

  raise notice 'Painel do negócio: e-mail do dono e estado do convite disponíveis.';
end $$;
