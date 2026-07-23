-- =====================================================================
-- Migration : 0045_alcance_das_funcoes.sql
-- Aplicar   : depois de 0044_erros_cliente.sql.
--
-- O QUE ESTA MIGRATION FECHA
--
-- Em Postgres, toda função nasce executável por PUBLIC. A auditoria
-- encontrou 129 de 157 funções assim — inclusive para o papel `anon`,
-- que é quem chega sem login. As perigosas foram fechadas na hora
-- (0035, 0038); o restante ficou como dívida, e é ela que sai aqui.
--
-- A maior parte é inofensiva: guardas que devolvem false para quem não é
-- membro. Mas "provavelmente inofensiva" não é auditoria, e havia pelo
-- menos um vazamento real, corrigido abaixo.
--
-- COMO SE DECIDE QUEM PODE EXECUTAR O QUÊ
--
--   · Guarda usada em política de RLS → precisa de EXECUTE para
--     `authenticated`. A expressão da política é avaliada com o papel de
--     quem consulta: sem o grant, TODA consulta quebra.
--   · Função usada dentro de view com security_invoker → mesma coisa.
--   · Função chamada pela aplicação por RPC → `authenticated`.
--   · Função de gatilho → ninguém. Gatilho roda no contexto do dono.
--   · Auxiliar chamada só por outra função SECURITY DEFINER → ninguém.
--     A chamada interna roda como o dono da função de fora.
--   · Rotina de serviço (cron, rota de API com chave) → `service_role`.
--   · Porta pública por desenho (portal, convite, domínio de SSO) →
--     `anon` também.
--
-- A revogação é feita varrendo o catálogo, e não digitando 157 nomes:
-- lista digitada à mão envelhece e deixa função nova aberta. Os grants,
-- ao contrário, são explícitos e por nome — é a parte que precisa ser
-- lida e conferida por gente. O bloco de verificação no fim prova o
-- estado final e derruba a migration se algo ficou aberto.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Vazamento residual: a nota de qualquer avaliação
-- ---------------------------------------------------------------------
-- score_avaliacao é SECURITY DEFINER e recebe um identificador. Ela é
-- usada pela view maturidade_resultado, então precisa continuar
-- executável — mas, chamada direto com o id de outra organização,
-- devolvia a nota. Número pequeno, vazamento real.
--
-- A guarda usa a função de acesso que já existe. Dentro da view o
-- resultado não muda: quem consulta tem acesso à própria avaliação.

create or replace function public.score_avaliacao(p_avaliacao uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    when not public.tem_acesso_avaliacao(p_avaliacao) then null
    when coalesce(sum(p.peso * d.peso * 4), 0) = 0 then null
    else round(sum(r.nota * p.peso * d.peso) / sum(p.peso * d.peso * 4) * 100, 1)
  end
  from public.maturidade_respostas r
  join public.maturidade_perguntas p on p.id = r.pergunta_id
  join public.maturidade_dimensoes d on d.id = p.dimensao_id
  where r.avaliacao_id = p_avaliacao;
$$;


-- ---------------------------------------------------------------------
-- 1b. A mesma classe de vazamento, na família de responsabilidade
-- ---------------------------------------------------------------------
-- responsavel_primario, dono_da_entidade e observadores_da_carteira
-- recebem um identificador de carteira e devolvem QUEM responde por ela.
-- Chamadas com o id de outra organização, entregavam pessoas — não é o
-- dado mais sensível do produto, mas é mapa de quem é quem no cliente,
-- e a invariante diz que alcance é do banco.
--
-- A guarda tem um cuidado: elas são chamadas por dentro da varredura de
-- alertas, que roda pelo cron SEM sessão de usuário. Por isso o critério
-- é "havendo sessão, exige acesso; não havendo, é serviço e passa". Isso
-- só é seguro porque o grant abaixo não inclui `anon` — que também tem
-- sessão nula. Se um dia alguém conceder a anon, esta guarda deixa de
-- valer, e é por isso que o teste de alcance trava a lista.

create or replace function public.responsavel_primario(p_carteira uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case when auth.uid() is not null
              and not public.tem_acesso_carteira(p_carteira) then null
  else coalesce(
    (select r.user_id
       from public.responsabilidades r
       join public.papeis_operacionais p on p.id = r.papel_id
      where r.carteira_id = p_carteira and p.primario and p.ativo
      order by r.criado_em
      limit 1),
    (select c.responsavel_id from public.carteiras c where c.id = p_carteira)
  ) end;
$$;

create or replace function public.observadores_da_carteira(p_carteira uuid, p_dono uuid)
returns uuid[]
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case when auth.uid() is not null
              and not public.tem_acesso_carteira(p_carteira) then '{}'::uuid[]
  else coalesce(
    (select array_agg(distinct r.user_id)
       from public.responsabilidades r
      where r.carteira_id = p_carteira
        and (p_dono is null or r.user_id <> p_dono)),
    '{}'::uuid[]
  ) end;
$$;

-- dono_da_entidade recebe a carteira como terceiro argumento, então a
-- guarda usa o mesmo critério sem precisar reescrever o corpo: entra
-- antes, e o resto segue igual.
do $$
declare def text; pos int;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'dono_da_entidade';

  pos := position(E'\nbegin\n' in def);
  if pos = 0 then
    raise exception 'Não encontrei o corpo de dono_da_entidade para blindar';
  end if;

  def := left(def, pos - 1)
      || E'\nbegin\n  if auth.uid() is not null and not public.tem_acesso_carteira(p_carteira) then\n    return null;\n  end if;\n'
      || substr(def, pos + length(E'\nbegin\n'));

  execute def;
end $$;


-- ---------------------------------------------------------------------
-- 2. Fechar tudo
-- ---------------------------------------------------------------------
-- Só funções deste esquema que não pertencem a extensão: pg_trgm e
-- unaccent têm as próprias, e mexer nelas quebraria a busca.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (
         select 1 from pg_depend d
          where d.objid = p.oid and d.deptype = 'e'
       )
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role',
                   r.assinatura);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 3. Devolver o acesso, por nome e por motivo
-- ---------------------------------------------------------------------

do $$
declare
  -- Guardas de política e auxiliares de view: sem elas, consulta quebra.
  v_leitura text[] := array[
    'anexos_permitidos', 'compartilha_org', 'e_admin', 'e_admin_plataforma',
    'e_membro', 'e_membro_carteira', 'orgs_do_usuario', 'papel_na_org',
    'pode_escrever', 'pode_gerir_carteiras', 'tem_acesso_avaliacao',
    'tem_acesso_carteira', 'tem_acesso_conta', 'tem_acesso_contrato',
    'assinatura_permite_escrita',
    'vpl', 'tir_mensal', 'payback_descontado', 'taxa_mensal', 'score_avaliacao',
    'responsavel_primario', 'dono_da_entidade', 'observadores_da_carteira'
  ];

  -- Chamadas pela aplicação, com sessão de usuário.
  v_aplicacao text[] := array[
    'buscar', 'captura_sem_data', 'tempo_por_etapa_filtrado',
    'criar_organizacao', 'vincular_membro', 'editar_registro',
    'gerar_alertas', 'gerar_alertas_marcos', 'atribuir_alertas',
    'atribuir_compromissos', 'gerar_compromissos_pendentes', 'reatribuir_alerta',
    'tirar_foto', 'garantir_fases', 'garantir_catalogo_decisao',
    'trocar_token_portal', 'provisionar_acesso_sso',
    'criar_chave_api', 'revogar_chave_api',
    'painel_negocio', 'criar_assinante', 'atualizar_assinatura',
    'promover_admin_plataforma', 'remover_admin_plataforma', 'operadores_da_plataforma',
    'exigir_participacao', 'rotina_saude', 'disponibilidade_periodo'
  ];

  -- Portas públicas por desenho: quem chega sem login precisa delas.
  v_publicas text[] := array[
    'ver_portal', 'ver_convite', 'aceitar_convite', 'sso_do_dominio'
  ];

  -- Rotinas de serviço: cron e rotas autenticadas por chave.
  v_servico text[] := array[
    'carteiras_para_enviar', 'resumo_do_dia',
    'rotina_iniciar', 'rotina_concluir', 'registrar_ping',
    'autenticar_chave_api', 'registrar_chamada_api',
    'registrar_erro_cliente', 'limpar_erros_antigos',
    'gerar_alertas', 'gerar_alertas_marcos', 'atribuir_alertas',
    'atribuir_compromissos', 'tirar_foto', 'rotina_saude', 'disponibilidade_periodo'
  ];

  r record;
begin
  for r in
    select p.proname, p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    if r.proname = any(v_leitura) or r.proname = any(v_aplicacao) then
      execute format('grant execute on function %s to authenticated', r.assinatura);
    end if;

    if r.proname = any(v_publicas) then
      execute format('grant execute on function %s to anon, authenticated', r.assinatura);
    end if;

    if r.proname = any(v_servico) then
      execute format('grant execute on function %s to service_role', r.assinatura);
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 4. Verificação — a migration falha se sobrou porta aberta
-- ---------------------------------------------------------------------
do $$
declare
  v_abertas text;
  v_anon    text;
  v_n       integer;
begin
  -- Nenhuma função nossa executável por PUBLIC.
  select string_agg(p.proname, ', '), count(*)
    into v_abertas, v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and (p.proacl is null
          or exists (select 1 from aclexplode(p.proacl) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE'));

  if v_n > 0 then
    raise exception 'Ainda há % função(ões) executável(is) por PUBLIC: %', v_n, left(v_abertas, 300);
  end if;

  -- O anônimo só alcança as quatro portas públicas.
  select string_agg(p.proname, ', ') into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.proname not in ('ver_portal', 'ver_convite', 'aceitar_convite', 'sso_do_dominio');

  if v_anon is not null then
    raise exception 'O anônimo alcança função que não é porta pública: %', v_anon;
  end if;

  -- As guardas de política continuam acessíveis: sem isto, tudo quebra.
  if not has_function_privilege('authenticated', 'public.e_membro(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.tem_acesso_carteira(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.pode_escrever(uuid)', 'EXECUTE') then
    raise exception 'Uma guarda de política perdeu o grant — nenhuma consulta funcionaria';
  end if;

  raise notice 'Alcance das funções: nada aberto a PUBLIC, anônimo só nas quatro portas públicas.';
end $$;
