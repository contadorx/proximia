-- =====================================================================
-- Massa de carga — 20 organizações, uma delas no volume-alvo.
--
-- Roda com privilégio de serviço (postgres/bypassrls) de propósito: a
-- regra da rodada é não enfraquecer RLS para facilitar teste. Nenhuma
-- política é tocada aqui; só se escreve por cima delas.
--
-- Alvo da org grande (ORG-01):
--   25 carteiras · 800 contas · 400 contratos · 300 frentes
--   150 oportunidades · 15.000 registros · 3 anos de capturas e alertas
--
-- As outras 19 orgs existem para que as tabelas tenham vizinhança: RLS
-- filtra linha a linha, e medir com uma org só esconde o custo do filtro.
-- =====================================================================

set client_min_messages to warning;

-- ---------------------------------------------------------------- gente
-- Usuários do teste. Senha não importa: aqui só se testa banco.
insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid,
       'carga' || g || '@exemplo.com',
       jsonb_build_object('nome', 'Pessoa ' || g)
from generate_series(1, 60) g
on conflict (id) do nothing;

-- Atacante e vítima, nomeados para a entrega 2.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-9900-000000000001', 'atacante@exemplo.com',  '{"nome":"Atacante"}'),
  ('00000000-0000-4000-9900-000000000002', 'vitima@exemplo.com',    '{"nome":"Vitima"}'),
  ('00000000-0000-4000-9900-000000000003', 'focal-carga@exemplo.com',     '{"nome":"Focal"}'),
  ('00000000-0000-4000-9900-000000000004', 'forasteiro@exemplo.com','{"nome":"Forasteiro"}')
on conflict (id) do nothing;

insert into public.perfis (id, nome, email)
select id, coalesce(raw_user_meta_data->>'nome', email), email
from auth.users
on conflict (id) do nothing;

-- ----------------------------------------------------------------- orgs
insert into public.orgs (id, nome, slug, assinatura_status, permite_anexos)
select ('00000000-0000-4000-a000-' || lpad(g::text, 12, '0'))::uuid,
       'Organização ' || lpad(g::text, 2, '0'),
       'org-' || lpad(g::text, 2, '0'),
       case when g = 19 then 'suspensa' else 'ativa' end,
       true
from generate_series(1, 20) g
on conflict (id) do nothing;

-- Vínculos: cada org tem 3 pessoas. A org 01 é a vítima (volume-alvo);
-- a org 02 é a casa do atacante.
insert into public.memberships (org_id, user_id, papel)
select o.id,
       ('00000000-0000-4000-9000-' || lpad((((g - 1) * 3) + p)::text, 12, '0'))::uuid,
       (array['owner','admin','analista'])[p]::papel_membro
from generate_series(1, 20) g
join public.orgs o on o.slug = 'org-' || lpad(g::text, 2, '0')
cross join generate_series(1, 3) p
on conflict (org_id, user_id) do nothing;

insert into public.memberships (org_id, user_id, papel) values
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-9900-000000000001', 'admin'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-9900-000000000002', 'owner'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-9900-000000000003', 'ponto_focal')
on conflict (org_id, user_id) do update set papel = excluded.papel, ativo = true;

-- ------------------------------------------------------------ carteiras
-- Org 01: 25 carteiras. Demais: 3 cada.
insert into public.carteiras (id, org_id, nome, codigo, regiao, status, responsavel_id, score_maturidade)
select ('00000000-0000-4000-b0' || lpad(g::text, 2, '0') || '-' || lpad(c::text, 12, '0'))::uuid,
       o.id,
       'Carteira ' || lpad(c::text, 2, '0') || ' — org ' || lpad(g::text, 2, '0'),
       'C' || lpad(g::text, 2, '0') || lpad(c::text, 2, '0'),
       (array['Norte','Sul','Leste','Oeste','Centro'])[1 + (c % 5)],
       case when c % 11 = 0 then 'pausada' else 'ativa' end,
       ('00000000-0000-4000-9000-' || lpad((((g - 1) * 3) + 1 + (c % 3))::text, 12, '0'))::uuid,
       40 + (c * 7) % 55
from generate_series(1, 20) g
join public.orgs o on o.slug = 'org-' || lpad(g::text, 2, '0')
cross join generate_series(1, 25) c
where g = 1 or c <= 3
on conflict (id) do nothing;

-- O ponto focal enxerga uma carteira só: é ele quem tenta descobrir as
-- outras 24 na entrega 2.
insert into public.carteira_membros (org_id, carteira_id, user_id)
values ('00000000-0000-4000-a000-000000000001',
        '00000000-0000-4000-b001-000000000001',
        '00000000-0000-4000-9900-000000000003')
on conflict do nothing;

-- --------------------------------------------------------------- contas
-- Org 01: 800 contas distribuídas nas 25 carteiras. Demais: 40 por org.
insert into public.contas (id, org_id, carteira_id, nome, razao_social, documento, segmento,
                           relacao, criticidade, status, potencial_bruto, potencial_origem, potencial_data)
select ('00000000-0000-4000-c0' || lpad(g::text, 2, '0') || '-' || lpad(n::text, 12, '0'))::uuid,
       o.id,
       ('00000000-0000-4000-b0' || lpad(g::text, 2, '0') || '-' ||
        lpad((1 + (n % case when g = 1 then 25 else 3 end))::text, 12, '0'))::uuid,
       'Conta ' || lpad(n::text, 4, '0') || ' org' || lpad(g::text, 2, '0'),
       'Razão Social ' || n || ' Ltda',
       lpad((11000000000000 + g * 1000000 + n)::text, 14, '0'),
       (array['Indústria','Comércio','Serviços','Logística','Agro'])[1 + (n % 5)],
       (array['estrategica','contrato','pipeline','protecao'])[1 + (n % 4)],
       (array['alta','media','baixa'])[1 + (n % 3)],
       'ativa',
       case when n % 4 = 0 then null else (10000 + (n * 137) % 900000)::numeric end,
       case when n % 4 = 0 then null else 'estudo tarifário' end,
       case when n % 4 = 0 then null else current_date - (n % 400) end
from generate_series(1, 20) g
join public.orgs o on o.slug = 'org-' || lpad(g::text, 2, '0')
cross join generate_series(1, 800) n
where g = 1 or n <= 40
on conflict (id) do nothing;

-- ------------------------------------------------------------ contratos
-- 400 na org 01 · 15 nas demais. Datas espalhadas para gerar vencidos,
-- em janela e vigentes — é o que faz a varredura de alertas trabalhar.
insert into public.contratos (id, org_id, carteira_id, conta_id, numero, inicio, fim,
                              renovacao_automatica, aviso_previa_dias, valor_base, status)
select ('00000000-0000-4000-d0' || lpad(g::text, 2, '0') || '-' || lpad(n::text, 12, '0'))::uuid,
       c.org_id, c.carteira_id, c.id,
       'CT-' || lpad(g::text, 2, '0') || '-' || lpad(n::text, 4, '0'),
       current_date - ((n % 900) + 400),
       current_date + (((n * 37) % 700) - 200),
       (n % 3 = 0),
       (array[30, 60, 90])[1 + (n % 3)],
       (5000 + (n * 91) % 250000)::numeric,
       case when n % 23 = 0 then 'encerrado' else 'vigente' end
from generate_series(1, 20) g
join public.orgs o on o.slug = 'org-' || lpad(g::text, 2, '0')
cross join generate_series(1, 400) n
join public.contas c
  on c.id = ('00000000-0000-4000-c0' || lpad(g::text, 2, '0') || '-' || lpad(n::text, 12, '0'))::uuid
where g = 1 or n <= 15
on conflict (id) do nothing;

-- --------------------------------------------------------------- frentes
insert into public.frentes (id, org_id, carteira_id, titulo, status, natureza, qtd_casos,
                            potencial_bruto, potencial_origem, potencial_data, prazo)
select ('00000000-0000-4000-e0' || lpad(g::text, 2, '0') || '-' || lpad(n::text, 12, '0'))::uuid,
       o.id,
       ('00000000-0000-4000-b0' || lpad(g::text, 2, '0') || '-' ||
        lpad((1 + (n % case when g = 1 then 25 else 3 end))::text, 12, '0'))::uuid,
       'Frente ' || lpad(n::text, 3, '0') || ' org' || lpad(g::text, 2, '0'),
       (array['identificada','em_analise','em_execucao','concluida'])[1 + (n % 4)],
       (case when n % 5 = 0 then 'protecao' else 'captura' end)::natureza_iniciativa,
       1 + (n % 40),
       (20000 + (n * 311) % 700000)::numeric,
       'levantamento de campo',
       current_date - (n % 500),
       current_date + ((n * 13) % 200) - 60
from generate_series(1, 20) g
join public.orgs o on o.slug = 'org-' || lpad(g::text, 2, '0')
cross join generate_series(1, 300) n
where g = 1 or n <= 12
on conflict (id) do nothing;

-- --------------------------------------------------------- oportunidades
insert into public.oportunidades (id, org_id, carteira_id, conta_id, titulo, fase, fase_desde,
                                  investimento, retorno_mensal, custo_mensal, horizonte_meses,
                                  estimativa_origem, estimativa_data)
select ('00000000-0000-4000-f0' || lpad(g::text, 2, '0') || '-' || lpad(n::text, 12, '0'))::uuid,
       c.org_id, c.carteira_id, c.id,
       'Oportunidade ' || lpad(n::text, 3, '0') || ' org' || lpad(g::text, 2, '0'),
       (array['identificacao','viabilidade','proposta','negociacao','implantacao'])[1 + (n % 5)],
       current_date - ((n * 7) % 240),
       (50000 + (n * 733) % 600000)::numeric,
       (2000 + (n * 97) % 40000)::numeric,
       (500 + (n * 31) % 8000)::numeric,
       12 + (n % 48),
       'estudo de viabilidade',
       current_date - (n % 300)
from generate_series(1, 20) g
join public.orgs o on o.slug = 'org-' || lpad(g::text, 2, '0')
cross join generate_series(1, 150) n
join public.contas c
  on c.id = ('00000000-0000-4000-c0' || lpad(g::text, 2, '0') || '-' || lpad(n::text, 12, '0'))::uuid
where g = 1 or n <= 8
on conflict (id) do nothing;

-- ------------------------------------------------------------- registros
-- 15.000 na org 01, espalhados por contas e frentes ao longo de 3 anos.
insert into public.registros (org_id, carteira_id, entidade_tipo, entidade_id, tipo, titulo, corpo,
                              ocorrido_em, autor_id, criado_em)
select c.org_id, c.carteira_id, 'conta', c.id,
       (array['nota','reuniao','decisao','entrega','envio'])[1 + (n % 5)],
       'Registro ' || n,
       'Conversa registrada em ' || (current_date - (n % 1095))::text ||
       ' sobre acompanhamento da conta, com encaminhamentos combinados.',
       current_date - (n % 1095),
       '00000000-0000-4000-9900-000000000002',
       now() - ((n % 1095) || ' days')::interval
from generate_series(1, 15000) n
join public.contas c
  on c.id = ('00000000-0000-4000-c001-' || lpad((1 + (n % 800))::text, 12, '0'))::uuid;

insert into public.registros (org_id, carteira_id, entidade_tipo, entidade_id, tipo, titulo, corpo,
                              ocorrido_em, autor_id, criado_em)
select c.org_id, c.carteira_id, 'conta', c.id, 'nota', 'Registro ' || n,
       'Anotação de acompanhamento.', current_date - (n % 700),
       ('00000000-0000-4000-9000-' || lpad((((g - 1) * 3) + 1)::text, 12, '0'))::uuid,
       now() - ((n % 700) || ' days')::interval
from generate_series(2, 20) g
cross join generate_series(1, 200) n
join public.contas c
  on c.id = ('00000000-0000-4000-c0' || lpad(g::text, 2, '0') || '-' ||
             lpad((1 + (n % 40))::text, 12, '0'))::uuid;

-- -------------------------------------------------------------- capturas
-- 3 anos de eventos. Entram pela tabela de eventos, como manda o modelo:
-- o gatilho recalcula valor_capturado sozinho.
insert into public.capturas (org_id, carteira_id, entidade_tipo, entidade_id, tipo, valor,
                             confirmado_em, descricao, origem, autor_id)
select c.org_id, c.carteira_id, 'conta', c.id,
       case when n % 19 = 0 then 'estorno' else 'captura' end,
       (1000 + (n * 53) % 90000)::numeric,
       current_date - (n % 1095),
       'Captura confirmada — lote de carga',
       'registro',
       '00000000-0000-4000-9900-000000000002'
from generate_series(1, 6000) n
join public.contas c
  on c.id = ('00000000-0000-4000-c001-' || lpad((1 + (n % 800))::text, 12, '0'))::uuid;

insert into public.capturas (org_id, carteira_id, entidade_tipo, entidade_id, tipo, valor,
                             confirmado_em, descricao, origem, autor_id)
select f.org_id, f.carteira_id, 'frente', f.id, 'captura',
       (5000 + (n * 71) % 120000)::numeric,
       current_date - (n % 1095),
       'Captura de frente — lote de carga', 'registro',
       '00000000-0000-4000-9900-000000000002'
from generate_series(1, 1200) n
join public.frentes f
  on f.id = ('00000000-0000-4000-e001-' || lpad((1 + (n % 300))::text, 12, '0'))::uuid;

insert into public.capturas (org_id, carteira_id, entidade_tipo, entidade_id, tipo, valor,
                             confirmado_em, origem, autor_id)
select c.org_id, c.carteira_id, 'conta', c.id, 'captura',
       (2000 + (n * 37) % 50000)::numeric,
       current_date - (n % 600), 'registro',
       ('00000000-0000-4000-9000-' || lpad((((g - 1) * 3) + 1)::text, 12, '0'))::uuid
from generate_series(2, 20) g
cross join generate_series(1, 150) n
join public.contas c
  on c.id = ('00000000-0000-4000-c0' || lpad(g::text, 2, '0') || '-' ||
             lpad((1 + (n % 40))::text, 12, '0'))::uuid;

-- ---------------------------------------------------------- compromissos
insert into public.compromissos (org_id, carteira_id, entidade_tipo, entidade_id, titulo,
                                 vence_em, dono_id, status, origem)
select c.org_id, c.carteira_id, 'conta', c.id,
       'Retornar contato — ' || c.nome,
       current_date + ((n % 120) - 40),
       case when n % 7 = 0 then null
            else ('00000000-0000-4000-9000-' || lpad((1 + (n % 3))::text, 12, '0'))::uuid end,
       case when n % 9 = 0 then 'concluido' else 'aberto' end,
       'manual'
from generate_series(1, 1200) n
join public.contas c
  on c.id = ('00000000-0000-4000-c001-' || lpad((1 + (n % 800))::text, 12, '0'))::uuid;

-- --------------------------------------------------------------- anexos
-- Um anexo por conta em 200 contas da org 01, e um na org 02, para o
-- teste de alcance ao bucket.
insert into public.anexos (org_id, carteira_id, entidade_tipo, entidade_id, nome, caminho,
                           tamanho, tipo_mime, criado_por)
select c.org_id, c.carteira_id, 'conta', c.id,
       'contrato-' || n || '.pdf',
       c.org_id || '/conta/' || c.id || '/contrato-' || n || '.pdf',
       120000 + n, 'application/pdf',
       '00000000-0000-4000-9900-000000000002'
from generate_series(1, 200) n
join public.contas c
  on c.id = ('00000000-0000-4000-c001-' || lpad(n::text, 12, '0'))::uuid;

insert into public.anexos (org_id, carteira_id, entidade_tipo, entidade_id, nome, caminho,
                           tamanho, tipo_mime, criado_por)
select c.org_id, c.carteira_id, 'conta', c.id, 'proposta.pdf',
       c.org_id || '/conta/' || c.id || '/proposta.pdf',
       90000, 'application/pdf',
       '00000000-0000-4000-9900-000000000001'
from public.contas c
where c.id = '00000000-0000-4000-c002-000000000001'::uuid;

-- Objetos correspondentes no bucket simulado.
insert into storage.buckets (id, name, public) values ('anexos', 'anexos', false)
on conflict (id) do nothing;

insert into storage.objects (bucket_id, name, owner)
select 'anexos', a.caminho, a.criado_por from public.anexos a
on conflict do nothing;

analyze;
