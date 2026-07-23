-- =====================================================================
-- Migration : 0042_operadores_plataforma.sql
-- Feature   : gerir quem opera a plataforma, pela própria plataforma
-- Aplicar   : depois de 0041_conversao_por_fase.sql.
--
-- O QUE FALTAVA
--
-- A função de promover existe desde a 0032, e a tela de Negócio a chama —
-- mas só mostra o formulário para quem AINDA NÃO é operador. Depois que
-- alguém assume, o formulário some e não há caminho nenhum: nem para
-- promover o segundo, nem para remover quem saiu da empresa. Na prática,
-- a operação da plataforma virava pessoa única sem querer.
--
-- Pessoa única é dois problemas ao mesmo tempo: se ela perde o acesso,
-- ninguém promove ninguém e só o SQL resolve; e se a conta dela é
-- apagada, a tabela fica vazia — o que reabre a janela de bootstrap, em
-- que qualquer autenticado se promove.
--
-- O QUE ESTA MIGRATION FAZ
--
--   1. Lista os operadores com nome e e-mail (a tabela guarda só o id).
--   2. Remove operador, com duas travas.
--   3. Impede que o último seja removido — inclusive por cascata.
--
-- A trava 3 é a que interessa para segurança. `plataforma_admins`
-- referencia `auth.users` com ON DELETE CASCADE: apagar o usuário no
-- painel do Supabase apagava a linha de operador em silêncio, e a janela
-- de bootstrap reabria sem ninguém saber. Agora essa exclusão falha alto,
-- dizendo o que fazer antes. Falha barulhenta é melhor que porta aberta.
--
-- O bootstrap em si continua como está — é regra de negócio descrita em
-- supabase/testes/negocio.sql, e mexer nela é outra decisão. O que muda
-- aqui é o caminho pelo qual ela reabria por acidente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Quem opera hoje
-- ---------------------------------------------------------------------
-- A tabela guarda id e nome; o e-mail mora em auth.users, que o papel da
-- aplicação não lê. Por isso a lista sai por função com privilégio de
-- dono, guardada por e_admin_plataforma: só operador enxerga operador.

create or replace function public.operadores_da_plataforma()
returns table (user_id uuid, nome text, email text, criado_em timestamptz, sou_eu boolean)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.e_admin_plataforma() then
    raise exception 'Apenas quem opera a plataforma vê esta lista.' using errcode = '42501';
  end if;

  return query
    select
      pa.user_id,
      coalesce(nullif(trim(pa.nome), ''), p.nome, split_part(u.email, '@', 1)) as nome,
      u.email::text,
      pa.criado_em,
      pa.user_id = auth.uid() as sou_eu
    from public.plataforma_admins pa
    join auth.users u on u.id = pa.user_id
    left join public.perfis p on p.id = pa.user_id
    order by pa.criado_em;
end;
$$;

revoke execute on function public.operadores_da_plataforma() from public, anon;
grant  execute on function public.operadores_da_plataforma() to authenticated;


-- ---------------------------------------------------------------------
-- 2. Remover operador
-- ---------------------------------------------------------------------
-- Duas travas, e as duas seguem doutrina que o produto já aplica em
-- memberships: ninguém remove o próprio acesso (peça a outra pessoa), e
-- a operação nunca fica sem dono.

create or replace function public.remover_admin_plataforma(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.e_admin_plataforma() then
    raise exception 'Apenas quem opera a plataforma pode remover operador.' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Você não pode remover o próprio acesso de operador. Peça a outra pessoa.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.plataforma_admins where user_id = p_user_id) then
    raise exception 'Essa pessoa não opera a plataforma.' using errcode = 'P0002';
  end if;

  delete from public.plataforma_admins where user_id = p_user_id;
end;
$$;

revoke execute on function public.remover_admin_plataforma(uuid) from public, anon;
grant  execute on function public.remover_admin_plataforma(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 3. A operação nunca fica sem dono — nem por cascata
-- ---------------------------------------------------------------------
-- Vale para qualquer caminho de exclusão: a função acima, um DELETE
-- direto no SQL, ou a cascata disparada ao apagar o usuário no Auth.

create or replace function public.proteger_ultimo_operador()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_restantes integer;
begin
  select count(*) into v_restantes
    from public.plataforma_admins
   where user_id <> old.user_id;

  if v_restantes = 0 then
    raise exception
      'Esta é a última pessoa que opera a plataforma. Promova outra antes de remover — sem operador, ninguém consegue promover ninguém e a instalação fica aberta para quem se cadastrar primeiro.'
      using errcode = '23503';
  end if;

  return old;
end;
$$;

-- Como esvaziar de propósito (reinstalação, reset de ambiente): a trava é
-- deliberada, então tirar o último exige um ato deliberado também —
--
--   alter table public.plataforma_admins disable trigger trg_proteger_ultimo_operador;
--   delete from public.plataforma_admins;
--   alter table public.plataforma_admins enable  trigger trg_proteger_ultimo_operador;
--
-- Só quem tem acesso ao banco consegue, que é exatamente quem deveria.

drop trigger if exists trg_proteger_ultimo_operador on public.plataforma_admins;
create trigger trg_proteger_ultimo_operador
  before delete on public.plataforma_admins
  for each row execute function public.proteger_ultimo_operador();


-- ---------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.operadores_da_plataforma()') is null
     or to_regprocedure('public.remover_admin_plataforma(uuid)') is null then
    raise exception 'As funções de operador não foram criadas';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.plataforma_admins'::regclass
       and tgname = 'trg_proteger_ultimo_operador'
  ) then
    raise exception 'A trava do último operador não ficou de pé';
  end if;

  if has_function_privilege('anon', 'public.operadores_da_plataforma()', 'EXECUTE') then
    raise exception 'Anônimo consegue listar operadores da plataforma';
  end if;

  raise notice 'Operadores da plataforma: listar, remover e a trava do último no lugar.';
end $$;
