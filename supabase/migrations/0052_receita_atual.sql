-- =====================================================================
-- Migration : 0052_receita_atual.sql
-- Aplicar   : depois de 0051_importacao_tipos.sql.
--
-- A LACUNA QUE ISTO FECHA
--
-- O produto sabia guardar duas coisas sobre dinheiro numa conta:
--   · POTENCIAL — o que ainda pode ser capturado, com origem e data;
--   · CAPTURADO — o que uma iniciativa confirmou, com comprovação.
--
-- E não sabia guardar a terceira, que é a primeira que se olha numa
-- coordenação de grandes clientes: QUANTO ESTE CLIENTE JÁ PAGA.
--
-- Sem esse campo, quem carrega uma base de faturamento tem duas saídas
-- ruins: jogar a receita em `potencial_bruto` — que infla todo número do
-- produto e apaga a diferença entre "quanto vale" e "quanto dá para
-- crescer" — ou deixar em texto na observação, onde não ordena, não
-- filtra e não soma. A segunda é honesta e inútil; a primeira é cômoda e
-- errada.
--
-- AS TRÊS QUANTIDADES NÃO SE SOMAM, E AGORA SÃO TRÊS
--
--   receita_atual .... o que o cliente paga hoje. É tamanho.
--   potencial_bruto .. o que ainda pode ser capturado. É hipótese.
--   valor_capturado .. o que foi confirmado. É resultado.
--
-- Somar quaisquer duas produz um número que não significa nada. A regra
-- valia para duas e continua valendo para três — e é por isso que o
-- campo novo carrega ORIGEM e DATA, como o potencial já carrega: número
-- sem procedência não entra neste produto.
-- =====================================================================

alter table public.contas
  add column if not exists receita_atual   numeric(14, 2),
  add column if not exists receita_origem  text,
  add column if not exists receita_data    date;

comment on column public.contas.receita_atual is
  'O que o cliente já paga no período de referência. NÃO é potencial (que é hipótese) '
  'nem capturado (que é resultado de iniciativa). As três nunca se somam.';

comment on column public.contas.receita_origem is
  'De onde veio o número: qual base, qual extração. Receita sem procedência é receita '
  'que ninguém consegue defender numa reunião.';

comment on column public.contas.receita_data is
  'A que período o valor se refere. Sem isso, "R$ 6 milhões" não diz se é do ano passado '
  'ou de três anos atrás.';

-- Receita informada exige procedência, como o potencial já exigia.
alter table public.contas drop constraint if exists contas_receita_com_origem;
alter table public.contas add constraint contas_receita_com_origem
  check (receita_atual is null or coalesce(trim(receita_origem), '') <> '');


do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'contas'
       and column_name in ('receita_atual', 'receita_origem', 'receita_data')
     having count(*) = 3) then
    raise exception 'As colunas de receita atual não foram criadas';
  end if;

  -- A trava de procedência precisa estar de pé.
  begin
    insert into public.contas (org_id, carteira_id, nome, receita_atual)
    select o.id, c.id, '__teste_receita__', 100
      from public.orgs o join public.carteiras c on c.org_id = o.id limit 1;
    -- Se chegou aqui e alguma linha foi inserida, a trava falhou.
    if found then
      delete from public.contas where nome = '__teste_receita__';
      raise exception 'Receita sem origem foi aceita — a trava de procedência não está valendo';
    end if;
  exception
    when check_violation then null;  -- esperado
  end;

  raise notice 'Receita atual: três quantidades distintas, e a nova exige procedência.';
end $$;
