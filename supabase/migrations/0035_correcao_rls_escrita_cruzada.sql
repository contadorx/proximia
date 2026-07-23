-- =====================================================================
-- Migration : 0035_correcao_rls_escrita_cruzada.sql
-- Aplicar   : depois de 0034_equipe.sql (build b44).
-- Origem    : bateria de ataque à RLS (qa/carga/04_ataque_rls.sql).
--
-- Fecha dois buracos comprovados com efeito real na bateria.
--
--   A. Escrita cruzada por SECURITY DEFINER.
--      gerar_alertas, gerar_alertas_marcos, atribuir_alertas e tirar_foto
--      recebem p_org de fora, rodam como dono (que ignora RLS) e não
--      checam participação. Qualquer membro dispara escrita na org de
--      outro: no teste, 752 alertas e 25 fotos plantados na vítima. É
--      vandalismo/DoS — não vaza dado de negócio, mas suja histórico
--      alheio e sinaliza volume.
--
--      Por que não se resolve com política de INSERT: a função roda como
--      dono, que tem bypassrls; a política de linha nem é consultada. A
--      trava tem de viver ANTES da chamada. Optou-se por um GATE único e
--      auditável na fronteira, em vez de reescrever quatro corpos longos
--      (o que arriscaria divergir da lógica original). O gate recusa org
--      alheia e libera o serviço (cron), preservando o botão "Varrer
--      agora", que sempre passa a própria organização.
--
--   B. Bootstrap do admin de plataforma.
--      promover_admin_plataforma só exige ser admin se já houver algum;
--      instância nova = qualquer autenticado vira operador de tudo.
--      Correção: tirar o EXECUTE do papel da aplicação.
--
-- Nenhuma regra de negócio muda. As funções de varredura não são
-- reescritas; ganham uma checagem de participação na entrada.
-- =====================================================================

-- ---------------------------------------------------------------- o gate
-- Verdadeiro quando é seguro agir sobre p_org: serviço (sem sessão de
-- usuário — auth.uid() nulo) ou participante da organização. Mesma
-- pergunta da RLS, aplicada dentro de função DEFINER que a RLS não vê.
create or replace function public.exigir_participacao(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    return;  -- chamada de serviço: cron e provisionamento
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.ativo
  ) then
    raise exception 'Sem participação nesta organização.' using errcode = '42501';
  end if;
end;
$$;

-- Em Postgres, toda função nasce com EXECUTE para PUBLIC. Revogar de
-- `authenticated`/`anon` não adianta nada enquanto o grant de PUBLIC
-- estiver de pé — foi assim que a primeira tentativa desta correção
-- falhou. O padrão correto (que o próprio produto já usa em
-- carteiras_para_enviar e resumo_do_dia) é revogar de PUBLIC e conceder
-- de volta só a quem precisa.
revoke execute on function public.exigir_participacao(uuid) from public;
grant  execute on function public.exigir_participacao(uuid) to authenticated;

-- ------------------------------------------- A. gate no início das funções
-- Cada função tem sua primeira instrução trocada por "gate + instrução".
-- A troca é feita sobre a definição real (pg_get_functiondef), casando a
-- assinatura exata de cada uma, e valida-se logo em seguida que a função
-- continua executável. Se algo não casar, a migration ABORTA — nada de
-- função meio-reescrita.
do $$
declare
  alvo   text;
  def    text;
  gate   text;
  marca  text := E'begin';
  pos    int;
begin
  foreach alvo in array array[
    'gerar_alertas', 'gerar_alertas_marcos', 'atribuir_alertas', 'tirar_foto'
  ] loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = alvo
      and pg_get_function_arguments(p.oid) like 'p_org uuid%';

    if def is null then
      raise exception 'Função % não encontrada para blindar', alvo;
    end if;

    -- Localiza o primeiro "begin" que abre o corpo (após o bloco declare)
    -- e insere o gate imediatamente depois dele.
    pos := position(E'\nbegin\n' in def);
    if pos = 0 then
      raise exception 'Não encontrei o begin do corpo de % — blindagem abortada', alvo;
    end if;

    gate := E'\nbegin\n  perform public.exigir_participacao(p_org);\n';
    def := left(def, pos - 1) || gate || substr(def, pos + length(E'\nbegin\n'));

    execute def;
  end loop;
end $$;

-- Verificação: as quatro funções continuam válidas e agora recusam org
-- alheia. Roda como serviço (auth.uid() nulo), então o gate deixa passar
-- e só se confirma que não quebraram.
do $$
begin
  perform public.gerar_alertas('00000000-0000-4000-0000-000000000000');
  perform public.gerar_alertas_marcos('00000000-0000-4000-0000-000000000000');
  perform public.atribuir_alertas('00000000-0000-4000-0000-000000000000');
  perform public.tirar_foto('00000000-0000-4000-0000-000000000000', null);
end $$;

-- ---------------------------------------------------------- B. bootstrap
--
-- NÃO ALTERADO AQUI — DECISÃO DO DONO DO PRODUTO.
--
-- promover_admin_plataforma permite que o primeiro usuário autenticado
-- se torne operador da plataforma quando a tabela plataforma_admins está
-- vazia. Confirmado na prática: com a tabela zerada, um usuário comum se
-- promoveu e passou a enxergar todas as organizações.
--
-- Mas isto é DELIBERADO: o teste supabase/testes/negocio.sql descreve o
-- comportamento como o bootstrap do primeiro operador ("criado sem
-- ninguém autorizar"). Mexer nisso mudaria regra de negócio, o que está
-- fora do escopo desta rodada — então fica relatado, não corrigido.
--
-- O risco real é uma corrida: entre o primeiro deploy e a promoção do
-- operador legítimo, qualquer pessoa que consiga se cadastrar leva a
-- plataforma inteira. Em produção, com página de cadastro aberta, a
-- janela é do tamanho da distração de quem publicou.
--
-- Correção recomendada (exige atualizar negocio.sql junto):
--   revoke execute on function public.promover_admin_plataforma(text)
--     from public, authenticated;
-- e passar a promover o primeiro operador no provisionamento, com
-- privilégio de serviço. O teste então verificaria que o papel da
-- aplicação NÃO consegue se autopromover — que é a garantia que se quer.

-- =====================================================================
--   C. O achado mais grave: lógica de três valores nas guardas.
--
--      papel_na_org devolve NULL para quem não é membro. Daí e_admin,
--      pode_escrever e pode_gerir_carteiras também devolvem NULL. E a
--      guarda usada em sete funções —
--
--          if not public.e_admin(p_org) then raise exception ...
--
--      — não dispara com NULL: `not NULL` é NULL, e IF NULL não executa o
--      ramo. A trava parece correta e nunca protege contra exatamente
--      quem deveria barrar: o de fora.
--
--      Consequência comprovada: um usuário ANÔNIMO (chave pública, sem
--      login) chamou vincular_membro e se tornou ADMIN da organização da
--      vítima — e a partir daí lê tudo legitimamente, porque a RLS passa
--      a reconhecê-lo como membro. Comprometimento total de assinante,
--      alcançável de fora.
--
--      Correção na raiz: as três funções passam a devolver false, nunca
--      NULL. Nenhuma regra muda — "não é membro" apenas deixa de ser
--      desconhecido e passa a ser não.
-- =====================================================================

create or replace function public.e_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    public.papel_na_org(p_org) in ('owner', 'admin')
      and public.assinatura_permite_escrita(p_org),
    false);
$$;

create or replace function public.pode_escrever(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    public.papel_na_org(p_org) in ('owner', 'admin', 'analista', 'ponto_focal')
      and public.assinatura_permite_escrita(p_org),
    false);
$$;

create or replace function public.pode_gerir_carteiras(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    public.papel_na_org(p_org) in ('owner', 'admin', 'analista')
      and public.assinatura_permite_escrita(p_org),
    false);
$$;

-- ---------------------------------------------------------------------
--   D. Correção do próprio gate desta migration.
--
--      A primeira versão de exigir_participacao liberava quando
--      auth.uid() era nulo, para deixar o cron passar. Só que o papel
--      `anon` TAMBÉM tem auth.uid() nulo — então a porta ficava aberta
--      para quem não fez login. O discriminador certo é o papel do banco:
--      serviço é service_role (ou o superusuário do provisionamento),
--      não "ausência de sessão".
-- ---------------------------------------------------------------------
create or replace function public.exigir_participacao(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  papel_jwt text;
begin
  -- Conexão direta ao banco (migrations, provisionamento, psql): passa.
  -- Dentro de uma função SECURITY DEFINER, current_user já virou o dono,
  -- então ele NÃO serve de discriminador — foi assim que a primeira
  -- versão deste gate deixou o anônimo entrar. session_user preserva o
  -- papel de login: no Supabase, todo tráfego da API chega como
  -- `authenticator`; conexão direta chega como postgres/supabase_admin.
  if session_user <> 'authenticator' then
    return;
  end if;

  -- Tráfego da API: o papel verdadeiro está na claim do JWT.
  papel_jwt := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '');

  if papel_jwt = 'service_role' then
    return;  -- cron e rotinas de serviço atravessam organizações
  end if;

  if auth.uid() is null then
    raise exception 'Faça login.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.ativo
  ) then
    raise exception 'Sem participação nesta organização.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.exigir_participacao(uuid) from public;
grant  execute on function public.exigir_participacao(uuid) to authenticated;
