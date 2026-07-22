-- =====================================================================
-- Migration : 0021_gestao_acesso.sql
-- Feature   : B28 — gestão de acesso
-- Aplicar   : depois de 0020_atribuir_compromissos.sql.
--
-- As políticas já diziam que administrador altera vínculo. Faltavam as
-- travas que impedem alguém de, com um clique bem-intencionado, deixar a
-- organização sem dono ou tirar o próprio acesso.
--
-- Três garantias, todas no banco e não na tela — tela some, banco fica:
--   1. Sempre existe pelo menos um dono ativo.
--   2. Ninguém rebaixa nem desativa a si mesmo.
--   3. Quem não é dono não promove ninguém a dono.
-- =====================================================================

create or replace function public.proteger_vinculo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_donos integer;
  v_eu    uuid := auth.uid();
begin
  -- Rotina de servidor (sem sessão) segue sem travas: carga, migração e
  -- manutenção precisam poder mexer.
  if v_eu is null then
    return coalesce(new, old);
  end if;

  -- A organização inteira está sendo excluída e os vínculos caem em
  -- cascata. Exigir que sobre um dono aqui impediria a exclusão de
  -- acontecer — a trava existe para proteger organização viva.
  if not exists (select 1 from public.orgs o where o.id = coalesce(new.org_id, old.org_id)) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.user_id = v_eu then
      raise exception 'Você não pode remover o próprio acesso. Peça a outra pessoa.';
    end if;
  else
    if new.user_id = v_eu and old.papel is distinct from new.papel then
      raise exception 'Você não pode alterar o próprio papel. Peça a outra pessoa.';
    end if;
    if new.user_id = v_eu and old.ativo and not new.ativo then
      raise exception 'Você não pode desativar o próprio acesso.';
    end if;
    if new.papel = 'owner' and coalesce(old.papel, 'analista') <> 'owner'
       and public.papel_na_org(new.org_id) <> 'owner' then
      raise exception 'Só quem é dono pode tornar outra pessoa dona.';
    end if;
  end if;

  -- A organização não pode ficar sem dono ativo.
  if (tg_op = 'DELETE' and old.papel = 'owner')
     or (tg_op = 'UPDATE' and old.papel = 'owner'
         and (new.papel <> 'owner' or (old.ativo and not new.ativo))) then
    select count(*) into v_donos
      from public.memberships m
     where m.org_id = coalesce(new.org_id, old.org_id)
       and m.papel = 'owner' and m.ativo
       and m.user_id <> coalesce(new.user_id, old.user_id);

    if v_donos = 0 then
      raise exception 'A organização ficaria sem dono. Defina outro dono antes.';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_proteger_vinculo on public.memberships;
create trigger trg_proteger_vinculo
  before update or delete on public.memberships
  for each row execute function public.proteger_vinculo();

-- ---------------------------------------------------------------------
-- Retrato do acesso de cada pessoa
-- ---------------------------------------------------------------------
-- Junta num lugar só o que hoje está espalhado por três telas: o papel
-- que define o alcance, quantas carteiras a pessoa enxerga, por quantas
-- responde e quanto tem na fila.
drop view if exists public.acesso_pessoas;

create view public.acesso_pessoas
with (security_invoker = on)
as
select
  m.org_id,
  m.user_id,
  m.papel,
  m.ativo,
  m.criado_em,
  p.nome,
  p.email,

  -- Quem não é ponto focal enxerga tudo; o ponto focal, só o que foi vinculado.
  case
    when m.papel = 'ponto_focal'
      then (select count(*) from public.carteira_membros cm
             where cm.org_id = m.org_id and cm.user_id = m.user_id)
    else (select count(*) from public.carteiras c where c.org_id = m.org_id)
  end                                                                   as carteiras_visiveis,

  (select count(distinct r.carteira_id) from public.responsabilidades r
    where r.org_id = m.org_id and r.user_id = m.user_id)                as carteiras_respondidas,

  (select count(*) from public.alertas a
    where a.org_id = m.org_id and a.dono_id = m.user_id and a.status = 'aberto')
                                                                        as alertas_abertos,

  (select count(*) from public.compromissos k
    where k.org_id = m.org_id and k.dono_id = m.user_id and k.status = 'aberto')
                                                                        as compromissos_abertos,

  (select max(r.criado_em) from public.registros r
    where r.org_id = m.org_id and r.autor_id = m.user_id)               as ultimo_registro

from public.memberships m
left join public.perfis p on p.id = m.user_id;

comment on view public.acesso_pessoas is
  'Quem tem acesso, com que alcance, por quantas carteiras responde e quanto '
  'carrega. Respeita a RLS das tabelas de origem.';

grant select on public.acesso_pessoas to authenticated;
