-- =====================================================================
-- Migration : 0035_correcao_rls_escrita_cruzada.sql
-- Aplicar   : depois de 0034_equipe.sql (build b44).
-- Origem    : bateria de ataque à RLS (qa/carga/04_ataque_rls.sql).
--
-- Fecha dois defeitos comprovados com efeito real, e relata um terceiro
-- que é decisão de projeto.
--
--   A. Lógica de três valores nas guardas — o mais grave.
--
--      papel_na_org devolve NULL para quem não é membro. Daí e_admin,
--      pode_escrever e pode_gerir_carteiras também devolvem NULL. E a
--      guarda usada em sete funções —
--
--          if not public.e_admin(p_org) then raise exception ...
--
--      — não dispara com NULL: `not NULL` é NULL, e IF NULL não executa
--      o ramo. A trava parece correta e nunca protege contra exatamente
--      quem deveria barrar: o de fora.
--
--      Consequência comprovada na b44: um usuário ANÔNIMO (chave
--      pública, sem login) chamou vincular_membro e virou ADMIN da
--      organização da vítima — e a partir daí lê tudo legitimamente,
--      porque a RLS passa a reconhecê-lo como membro.
--
--      Correção: as três funções passam a devolver false, nunca NULL.
--      Nenhuma regra muda — "não é membro" deixa de ser desconhecido e
--      passa a ser não.
--
--   B. Escrita cruzada por SECURITY DEFINER.
--
--      gerar_alertas, gerar_alertas_marcos, atribuir_alertas e tirar_foto
--      recebem p_org de fora, rodam como dono (que ignora RLS) e não
--      checam participação. No teste, 752 alertas e 25 fotos plantados na
--      organização da vítima.
--
--      Política de INSERT não resolve: a função roda como dono, que tem
--      bypassrls, e a política de linha nem é consultada. A trava tem de
--      vir antes da chamada.
--
--      COMO ESTA VERSÃO FAZ, E POR QUÊ:
--
--      A versão anterior desta migration lia pg_get_functiondef e
--      injetava o gate procurando o texto "begin" do corpo. Falhou em
--      produção com "Não encontrei o begin do corpo de gerar_alertas":
--      basta o corpo estar gravado com quebra de linha CRLF (arquivo
--      salvo no Windows, ou colado no editor SQL) para a busca não casar.
--      Cirurgia de texto em definição de função é frágil por natureza.
--
--      Aqui não há manipulação de texto nenhuma. Cada função original é
--      RENOMEADA para <nome>__nucleo (DDL puro; o corpo fica intacto byte
--      a byte) e um invólucro com o nome original é criado, com o gate na
--      entrada e a delegação ao núcleo. As assinaturas dos invólucros são
--      escritas à mão e conferem com as originais.
--
--   C. Bootstrap do admin de plataforma — RELATADO, NÃO CORRIGIDO.
--      Ver o bloco no fim do arquivo.
--
-- Idempotente: rodar duas vezes não quebra nada.
-- =====================================================================


-- =====================================================================
-- A. As guardas deixam de devolver NULL
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


-- =====================================================================
-- B. O gate
-- =====================================================================
--
-- Verdadeiro quando é seguro agir sobre p_org. Três caminhos:
--
--   1. Conexão DIRETA ao banco (migrations, provisionamento, psql do
--      operador): passa. Dentro de uma função SECURITY DEFINER,
--      current_user já virou o dono e não serve de discriminador —
--      session_user preserva o papel de login. No Supabase, todo tráfego
--      da API chega como `authenticator`; conexão direta chega como
--      postgres/supabase_admin.
--
--   2. Tráfego da API com papel de serviço (o cron, que atravessa
--      organizações de propósito): passa. O papel verdadeiro está na
--      claim `role` do JWT — não em auth.uid(), porque o papel `anon`
--      também tem uid nulo, e foi assim que uma versão anterior deste
--      gate deixou o anônimo entrar.
--
--   3. Usuário autenticado: só passa na própria organização.
--
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
  if session_user <> 'authenticator' then
    return;
  end if;

  papel_jwt := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '');

  if papel_jwt = 'service_role' then
    return;
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

-- Toda função nasce com EXECUTE para PUBLIC. Revogar de `authenticated`
-- não adianta enquanto o grant de PUBLIC estiver de pé — o padrão certo
-- (que o produto já usa em carteiras_para_enviar e resumo_do_dia) é
-- revogar de PUBLIC e conceder de volta só a quem precisa.
revoke execute on function public.exigir_participacao(uuid) from public;
grant  execute on function public.exigir_participacao(uuid) to authenticated;


-- =====================================================================
-- B.1 Renomear os originais para __nucleo (DDL puro, corpo intacto)
-- =====================================================================
do $$
begin
  if to_regprocedure('public.gerar_alertas__nucleo(uuid, integer, integer, integer)') is null then
    alter function public.gerar_alertas(uuid, integer, integer, integer)
      rename to gerar_alertas__nucleo;
  end if;

  if to_regprocedure('public.gerar_alertas_marcos__nucleo(uuid)') is null then
    alter function public.gerar_alertas_marcos(uuid)
      rename to gerar_alertas_marcos__nucleo;
  end if;

  if to_regprocedure('public.atribuir_alertas__nucleo(uuid)') is null then
    alter function public.atribuir_alertas(uuid)
      rename to atribuir_alertas__nucleo;
  end if;

  if to_regprocedure('public.tirar_foto__nucleo(uuid, date)') is null then
    alter function public.tirar_foto(uuid, date)
      rename to tirar_foto__nucleo;
  end if;
end $$;

-- O núcleo não é chamável por ninguém da aplicação: quem chama é o
-- invólucro, que passa pelo gate. Sem isto, bastaria chamar o núcleo
-- direto para contornar a correção.
-- Revoga dos DOIS lugares: o grant implicito de PUBLIC (que toda funcao
-- ganha ao nascer) e o grant explicito a `authenticated` que as
-- migrations originais deram (0014, 0018, 0027, 0031) e que acompanha a
-- funcao no rename. Tirar so um dos dois nao fecha nada -- foi o que a
-- verificacao no fim deste arquivo pegou na primeira tentativa.
revoke execute on function public.gerar_alertas__nucleo(uuid, integer, integer, integer) from public, authenticated;
revoke execute on function public.gerar_alertas_marcos__nucleo(uuid) from public, authenticated;
revoke execute on function public.atribuir_alertas__nucleo(uuid) from public, authenticated;
revoke execute on function public.tirar_foto__nucleo(uuid, date) from public, authenticated;


-- =====================================================================
-- B.2 Invólucros com o nome original — gate na entrada, delegação depois
-- =====================================================================

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
begin
  perform public.exigir_participacao(p_org);
  return public.gerar_alertas__nucleo(
    p_org, p_dias_carteira, p_dias_frente, p_dias_oportunidade);
end;
$$;

create or replace function public.gerar_alertas_marcos(p_org uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.exigir_participacao(p_org);
  return public.gerar_alertas_marcos__nucleo(p_org);
end;
$$;

create or replace function public.atribuir_alertas(p_org uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.exigir_participacao(p_org);
  return public.atribuir_alertas__nucleo(p_org);
end;
$$;

create or replace function public.tirar_foto(p_org uuid, p_referencia date default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.exigir_participacao(p_org);
  return public.tirar_foto__nucleo(p_org, p_referencia);
end;
$$;

-- Os invólucros nascem com EXECUTE para PUBLIC, como toda função. O
-- gate já barra anônimo e forasteiro, mas o alcance certo é: aplicação
-- autenticada, mais o serviço.
revoke execute on function public.gerar_alertas(uuid, integer, integer, integer) from public, anon;
revoke execute on function public.gerar_alertas_marcos(uuid) from public, anon;
revoke execute on function public.atribuir_alertas(uuid) from public, anon;
revoke execute on function public.tirar_foto(uuid, date) from public, anon;

grant execute on function public.gerar_alertas(uuid, integer, integer, integer) to authenticated, service_role;
grant execute on function public.gerar_alertas_marcos(uuid) to authenticated, service_role;
grant execute on function public.atribuir_alertas(uuid) to authenticated, service_role;
grant execute on function public.tirar_foto(uuid, date) to authenticated, service_role;


-- =====================================================================
-- B.3 Verificação — a migration falha se a correção não ficou de pé
-- =====================================================================
do $$
declare
  n integer;
  org_inexistente uuid := '00000000-0000-4000-0000-000000000000';
begin
  -- Como conexão direta, o gate libera: aqui se confirma apenas que os
  -- invólucros e os núcleos continuam executáveis e encadeados.
  select public.gerar_alertas(org_inexistente) into n;
  select public.gerar_alertas_marcos(org_inexistente) into n;
  select public.atribuir_alertas(org_inexistente) into n;
  select public.tirar_foto(org_inexistente, null) into n;

  -- E que o núcleo ficou fora do alcance da aplicação.
  if has_function_privilege('authenticated',
       'public.gerar_alertas__nucleo(uuid, integer, integer, integer)', 'EXECUTE') then
    raise exception 'gerar_alertas__nucleo continua chamável pela aplicação — correção incompleta';
  end if;

  -- E que as guardas não devolvem mais NULL para quem está de fora.
  if public.e_admin(org_inexistente) is null
     or public.pode_escrever(org_inexistente) is null
     or public.pode_gerir_carteiras(org_inexistente) is null then
    raise exception 'As guardas ainda devolvem NULL — correção incompleta';
  end if;

  raise notice 'Correção aplicada: guardas sem NULL, gate ativo, núcleos fora do alcance.';
end $$;


-- =====================================================================
-- C. Bootstrap do admin de plataforma — RELATADO, NÃO CORRIGIDO
-- =====================================================================
--
-- promover_admin_plataforma permite que o primeiro usuário autenticado
-- se torne operador da plataforma quando plataforma_admins está vazia.
-- Confirmado na prática: com a tabela zerada, um usuário comum se
-- promoveu e passou a enxergar todas as organizações.
--
-- Mas isto é DELIBERADO: supabase/testes/negocio.sql descreve o
-- comportamento como o bootstrap do primeiro operador ("criado sem
-- ninguém autorizar"). Mexer nisso muda regra de negócio — fica
-- relatado, não corrigido.
--
-- O risco é uma corrida: entre o primeiro deploy e a promoção do
-- operador legítimo, qualquer pessoa que consiga se cadastrar leva a
-- plataforma inteira.
--
-- Correção recomendada (exige atualizar negocio.sql junto):
--   revoke execute on function public.promover_admin_plataforma(text)
--     from public, authenticated;
-- e promover o primeiro operador no provisionamento, com privilégio de
-- serviço. O teste passaria a verificar que a aplicação NÃO consegue se
-- autopromover — que é a garantia que se quer.
