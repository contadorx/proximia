-- =====================================================================
-- Migration : 0050_correcao_score_sem_sessao.sql
-- Aplicar   : depois de 0049_adocao.sql.
--
-- DEFEITO QUE ESTA MIGRATION CORRIGE
--
-- A 0045 fechou um vazamento real: score_avaliacao devolvia a nota de
-- QUALQUER avaliação, inclusive de outra organização, porque recebia um
-- identificador e não conferia acesso. A guarda entrou assim:
--
--     when not public.tem_acesso_avaliacao(p_avaliacao) then null
--
-- Só que na mesma migration, para a família de responsabilidade, a
-- guarda foi escrita de outro jeito — e o outro jeito é o certo:
--
--     when auth.uid() is not null and not public.tem_acesso(...) then null
--
-- A diferença aparece quando não há sessão de usuário: no cron, numa
-- rotina de serviço, ou num carregamento inicial pelo editor de SQL.
-- Nesses casos auth.uid() é nulo, tem_acesso_avaliacao devolve falso, e
-- o score voltava NULO em vez de calcular.
--
-- Pela interface nada quebrava — lá sempre há sessão —, e foi por isso
-- que a suíte não pegou: os testes de maturidade rodam com sessão. O
-- defeito só apareceu numa carga inicial feita por SQL.
--
-- A correção iguala o critério ao da família de responsabilidade:
-- havendo sessão, exige acesso; não havendo, é serviço e passa. Isso só
-- é seguro porque a função NÃO é concedida ao papel anônimo — que também
-- tem sessão nula. O teste de alcance trava essa lista.
-- =====================================================================

create or replace function public.score_avaliacao(p_avaliacao uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    when auth.uid() is not null and not public.tem_acesso_avaliacao(p_avaliacao) then null
    when coalesce(sum(p.peso * d.peso * 4), 0) = 0 then null
    else round(sum(r.nota * p.peso * d.peso) / sum(p.peso * d.peso * 4) * 100, 1)
  end
  from public.maturidade_respostas r
  join public.maturidade_perguntas p on p.id = r.pergunta_id
  join public.maturidade_dimensoes d on d.id = p.dimensao_id
  where r.avaliacao_id = p_avaliacao;
$$;

revoke execute on function public.score_avaliacao(uuid) from public, anon;
grant  execute on function public.score_avaliacao(uuid) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.score_avaliacao(uuid)', 'EXECUTE') then
    raise exception 'score_avaliacao ficou alcançável pelo anônimo — a guarda deixa de valer';
  end if;
  raise notice 'score_avaliacao: calcula sem sessão (serviço) e continua fechado para quem não tem acesso.';
end $$;
