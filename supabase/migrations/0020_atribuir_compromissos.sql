-- =====================================================================
-- Migration : 0020_atribuir_compromissos.sql
-- Feature   : B27 — filas de trabalho
-- Aplicar   : depois de 0019_captura_mensal.sql.
--
-- Alertas já ganharam dono pela cadeia de responsabilidade na B24.
-- Compromisso ficou meio caminho: o gerado por contrato herda o
-- responsável da conta, mas o criado à mão e o gerado por cláusula podem
-- nascer sem ninguém — e compromisso sem dono é lembrete, não
-- compromisso.
--
-- Esta função fecha a lacuna com a mesma cadeia, e só mexe em quem está
-- sem dono: reatribuição manual feita por alguém não é desfeita por
-- varredura automática.
-- =====================================================================

create or replace function public.atribuir_compromissos(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atualizados integer;
begin
  if not public.pode_escrever(p_org) then
    raise exception 'Seu perfil não permite distribuir compromissos.';
  end if;

  update public.compromissos k
     set dono_id = public.dono_da_entidade(k.entidade_tipo, k.entidade_id, k.carteira_id)
   where k.org_id = p_org
     and k.status = 'aberto'
     and k.dono_id is null
     and public.dono_da_entidade(k.entidade_tipo, k.entidade_id, k.carteira_id) is not null;

  get diagnostics v_atualizados = row_count;
  return v_atualizados;
end;
$$;

grant execute on function public.atribuir_compromissos(uuid) to authenticated;
