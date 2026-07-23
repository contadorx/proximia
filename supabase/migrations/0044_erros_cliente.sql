-- =====================================================================
-- Migration : 0044_erros_cliente.sql
-- Aplicar   : depois de 0043_disponibilidade_defensavel.sql.
--
-- O BURACO QUE ISTO FECHA
--
-- Erro na sessão de um assinante morria na tela dele. A biblioteca de
-- telemetria existe desde a 0036, mas era chamada num lugar só — a rota
-- de entrada de dados — e o erro do navegador não chegava a ninguém.
-- O operador só descobria por reclamação.
--
-- DUAS DECISÕES QUE SUSTENTAM O RESTO
--
-- 1. O relatório leva IDENTIFICADOR, nunca CONTEÚDO. Nome de conta,
--    valor, potencial e texto de registro não entram aqui — nem em
--    mensagem de erro, nem em campo extra. A limpeza acontece na
--    aplicação (lib/telemetria.ts, com teste que trava isso) e esta
--    tabela guarda só o que sobrou. É a mesma promessa que impede mandar
--    histórico para modelo de terceiro: quem não pode sair, não sai por
--    nenhuma porta.
--
-- 2. A gravação é limitada por minuto. A rota que recebe o relatório é
--    pública por necessidade — erro acontece antes do login também —,
--    e sem teto uma página em laço de erro, ou alguém mal-intencionado,
--    encheria a tabela. O teto vive no banco, não na aplicação, porque é
--    no banco que ele não tem como ser contornado.
-- =====================================================================

create table if not exists public.erros_cliente (
  id          uuid primary key default gen_random_uuid(),

  -- Nulos quando o erro acontece antes do login, que é caso comum.
  org_id      uuid references public.orgs (id) on delete set null,
  user_id     uuid references auth.users (id) on delete set null,

  onde        text not null,
  tipo        text not null default 'Error',
  mensagem    text not null,
  rota        text,
  pilha       text,

  -- Agente do navegador, cortado. Serve para reconhecer "só acontece no
  -- Safari" — não para identificar pessoa.
  agente      text,

  criado_em   timestamptz not null default now()
);

create index if not exists idx_erros_recentes on public.erros_cliente (criado_em desc);
create index if not exists idx_erros_org on public.erros_cliente (org_id, criado_em desc);

alter table public.erros_cliente enable row level security;

-- Só quem opera a plataforma lê. É informação de operação do produto, e
-- pode conter rota e mensagem técnica de qualquer assinante.
drop policy if exists erros_le on public.erros_cliente;
create policy erros_le on public.erros_cliente
  for select to authenticated using (public.e_admin_plataforma());

grant select on public.erros_cliente to authenticated;
-- Nenhuma escrita direta: passa pela função abaixo, que impõe o teto.


-- ---------------------------------------------------------------------
-- Gravação com teto por minuto
-- ---------------------------------------------------------------------
-- Devolve o id quando gravou, e nulo quando recusou por teto. A rota não
-- trata a recusa como erro: perder o centésimo relatório do mesmo minuto
-- não custa nada, e a alternativa é a tabela virar despejo.

create or replace function public.registrar_erro_cliente(
  p_onde text,
  p_tipo text,
  p_mensagem text,
  p_rota text default null,
  p_pilha text default null,
  p_agente text default null,
  p_org uuid default null,
  p_user uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_no_minuto integer;
  v_id uuid;
begin
  if coalesce(trim(p_mensagem), '') = '' then
    return null;
  end if;

  select count(*) into v_no_minuto
    from public.erros_cliente
   where criado_em > now() - interval '1 minute';

  -- Sessenta por minuto na instalação inteira. Uma página em laço de
  -- erro estoura isso em segundos, e é justamente aí que parar de gravar
  -- é o comportamento certo: o primeiro relatório já disse o que era.
  if v_no_minuto >= 60 then
    return null;
  end if;

  insert into public.erros_cliente (org_id, user_id, onde, tipo, mensagem, rota, pilha, agente)
  values (
    p_org, p_user,
    left(coalesce(p_onde, 'navegador'), 60),
    left(coalesce(p_tipo, 'Error'), 60),
    left(p_mensagem, 300),
    left(p_rota, 200),
    left(p_pilha, 400),
    left(p_agente, 200))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.registrar_erro_cliente(text, text, text, text, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.registrar_erro_cliente(text, text, text, text, text, text, uuid, uuid)
  to service_role;


-- ---------------------------------------------------------------------
-- Limpeza
-- ---------------------------------------------------------------------
-- Erro de trinta dias atrás não ajuda a diagnosticar nada e vira custo de
-- armazenamento. A rotina diária chama isto.

create or replace function public.limpar_erros_antigos(p_dias integer default 30)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_apagados integer;
begin
  delete from public.erros_cliente
   where criado_em < now() - (p_dias || ' days')::interval;
  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$$;

revoke execute on function public.limpar_erros_antigos(integer) from public, anon, authenticated;
grant  execute on function public.limpar_erros_antigos(integer) to service_role;


-- ---------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.erros_cliente') is null then
    raise exception 'Tabela de erros não foi criada';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.erros_cliente'::regclass) then
    raise exception 'RLS não está ligada em erros_cliente';
  end if;

  if has_function_privilege('authenticated', 'public.registrar_erro_cliente(text, text, text, text, text, text, uuid, uuid)', 'EXECUTE') then
    raise exception 'A aplicação pode gravar erro direto, contornando o teto';
  end if;

  raise notice 'Erros do navegador: tabela, RLS, teto por minuto e limpeza no lugar.';
end $$;
