-- =====================================================================
-- Migration : 0049_adocao.sql
-- Aplicar   : depois de 0048_cobertura_por_conta.sql.
--
-- O LAÇO FRIO QUE ISTO QUEBRA
--
-- O extrato periódico nasce em 'nenhuma' (migration 0011), e o resumo
-- diário só dispara para quem já tem aviso ou compromisso na mão. Junte
-- os dois na primeira semana de uso e o resultado é: sem dado não há
-- aviso, sem aviso não sai e-mail, sem e-mail ninguém volta, sem voltar
-- não entra dado.
--
-- O produto depende de alguém lembrar dele sozinho justamente na semana
-- em que ele ainda não provou nada.
--
-- A correção é de uma linha: carteira nova nasce com extrato quinzenal.
-- Não se mexe no que já existe — quem escolheu 'nenhuma' escolheu, e
-- reverter escolha de gente é pior que o problema.
--
-- Quinzenal, e não semanal, porque 'semanal' não existe: a trava da
-- migration 0011 aceita nenhuma, quinzenal, mensal e trimestral.
-- Quinzenal é a mais frequente disponível — e cadência que chega demais
-- vira e-mail ignorado, que é o oposto do que se quer aqui.
-- =====================================================================

alter table public.carteiras
  alter column cadencia_extrato set default 'quinzenal';

comment on column public.carteiras.cadencia_extrato is
  'Cadência do extrato por e-mail. Nasce quinzenal: é o mecanismo que traz a pessoa de volta '
  'na semana em que o produto ainda não provou nada. Quem já escolheu outra coisa não é alterado.';


-- ---------------------------------------------------------------------
-- Quem nunca entrou — a conversa que o gestor precisa ter
-- ---------------------------------------------------------------------
-- O produto media adoção só do lado do operador da plataforma. O
-- administrador da organização não tinha como responder "quem da minha
-- equipe ainda não começou?".
--
-- Deliberadamente NÃO mede presença: nada de contagem de cliques nem de
-- tempo de sessão. Último registro é atividade com significado; presença
-- é vigilância com outro nome.

create or replace view public.adocao_equipe
with (security_invoker = on)
as
select
  m.org_id,
  m.user_id,
  m.papel,
  (select max(r.criado_em) from public.registros r where r.autor_id = m.user_id and r.org_id = m.org_id)
    as ultimo_registro,
  (select count(*) from public.registros r
    where r.autor_id = m.user_id and r.org_id = m.org_id
      and r.criado_em > now() - interval '30 days')
    as registros_30d,
  (select count(*) from public.compromissos c
    where c.dono_id = m.user_id and c.org_id = m.org_id and c.status = 'aberto')
    as compromissos_abertos
from public.memberships m
where m.ativo;

grant select on public.adocao_equipe to authenticated;

comment on view public.adocao_equipe is
  'Atividade com significado por pessoa: último registro, registros em 30 dias e compromissos '
  'em aberto. Não mede presença nem cliques — adoção de ferramenta se resolve em conversa, e '
  'a conversa precisa de fato, não de vigilância.';


do $$
begin
  if (select column_default from information_schema.columns
       where table_schema='public' and table_name='carteiras'
         and column_name='cadencia_extrato') not like '%quinzenal%' then
    raise exception 'A cadência do extrato não nasce quinzenal';
  end if;

  if to_regclass('public.adocao_equipe') is null then
    raise exception 'A view de adoção da equipe não foi criada';
  end if;

  raise notice 'Adoção: extrato quinzenal por padrão e leitura de atividade por pessoa.';
end $$;
