-- =====================================================================
-- Migration : 0054_exclusao_em_lote.sql
-- Aplicar   : depois de 0053_base_sob_gestao.sql.
--
-- POR QUE EXCLUSÃO EM LOTE PRECISA DE FUNÇÃO PRÓPRIA
--
-- Apagar conta a conta funciona para três; para trezentas — o caso de uma
-- carga de teste que precisa ser refeita — vira trabalho manual e
-- convite ao erro.
--
-- Só que exclusão em lote é a operação mais perigosa que um produto
-- oferece: um clique apaga trabalho de meses. Por isso ela não é um
-- `delete` solto na aplicação, e sim uma função com quatro travas:
--
--   1. Só quem pode escrever na organização, e só nas carteiras a que
--      tem acesso — o alcance vale aqui como vale em todo lugar.
--   2. Teto por chamada: 500. Acima disso é operação de banco, com gente
--      olhando, não botão de tela.
--   3. Conta com captura confirmada NÃO é apagada. Captura é evento com
--      autor e comprovação; apagar em lote o que alguém confirmou é o
--      tipo de perda que não se desfaz. Elas são devolvidas na resposta
--      para a pessoa decidir uma a uma.
--   4. O que foi apagado fica na trilha de auditoria, com quem apagou.
--
-- A função devolve o que fez e o que recusou — em vez de apagar o que dá
-- e silenciar o resto.
-- =====================================================================

create or replace function public.excluir_contas_em_lote(p_ids uuid[])
returns table (
  apagadas         integer,
  recusadas_captura integer,
  recusadas_acesso  integer,
  nomes_recusados   text[]
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_apagadas  integer := 0;
  v_captura   integer := 0;
  v_acesso    integer := 0;
  v_nomes     text[] := '{}';
  v_conta     record;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return query select 0, 0, 0, '{}'::text[];
    return;
  end if;

  if array_length(p_ids, 1) > 500 then
    raise exception 'Máximo de 500 contas por vez. Acima disso, a operação é de banco, com alguém acompanhando.'
      using errcode = '22023';
  end if;

  for v_conta in
    select c.id, c.nome, c.org_id, c.carteira_id
      from public.contas c
     where c.id = any(p_ids)
  loop
    -- Alcance: escrever na organização e ter acesso à carteira.
    if not public.pode_escrever(v_conta.org_id)
       or not public.tem_acesso_carteira(v_conta.carteira_id) then
      v_acesso := v_acesso + 1;
      continue;
    end if;

    -- Captura confirmada trava a exclusão. Não é excesso de zelo: é o
    -- único dado do produto que alguém afirmou com comprovação.
    if exists (
      select 1 from public.capturas k
       where k.entidade_tipo = 'conta' and k.entidade_id = v_conta.id
    ) then
      v_captura := v_captura + 1;
      v_nomes := v_nomes || v_conta.nome;
      continue;
    end if;

    delete from public.contas where id = v_conta.id;
    v_apagadas := v_apagadas + 1;
  end loop;

  return query select v_apagadas, v_captura, v_acesso, v_nomes;
end;
$$;

revoke execute on function public.excluir_contas_em_lote(uuid[]) from public, anon;
grant  execute on function public.excluir_contas_em_lote(uuid[]) to authenticated;


do $$
begin
  if to_regprocedure('public.excluir_contas_em_lote(uuid[])') is null then
    raise exception 'A função de exclusão em lote não foi criada';
  end if;
  if has_function_privilege('anon', 'public.excluir_contas_em_lote(uuid[])', 'EXECUTE') then
    raise exception 'Anônimo pode apagar contas em lote';
  end if;
  raise notice 'Exclusão em lote: com teto, alcance e proteção do que tem captura.';
end $$;
