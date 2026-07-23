# Proximia — carga, falha e ataque

Relatório da rodada. Tudo aqui foi executado contra um Postgres 16 com as
migrations reais e massa gerada; nenhum número é estimado quando podia ser
medido, e onde é estimativa está dito. Onde eu errei no meio do caminho, o erro
está registrado — método sem rastro de erro não é método, é propaganda.

---

## Placar por severidade

**Impede venda**

1. Usuário anônimo virava admin de qualquer organização (lógica de três valores). **Corrigido e comprovado.**
2. Bootstrap do operador de plataforma aberto a qualquer autenticado. **Relatado; é decisão de projeto, não corrigi.**

**Impede escala**

3. Escrita cruzada entre organizações por funções SECURITY DEFINER. **Corrigido e comprovado.**
4. Rotina diária falhando em silêncio e respondendo HTTP 200. **Corrigido.**
5. Tetos fixos escondendo até 14.800 linhas sem avisar. **Medido; exige decisão de produto.**
6. Política de RLS avaliada linha a linha: 1.545 ms onde a mesma regra roda em 8,5 ms. **Medido, com protótipo equivalente validado.**
7. Migrations não atômicas. **Corrigido.**
8. Resumo diário reenviado se a rotina rodar duas vezes. **Corrigido.**

**Aceitável por ora**

9. 49 das 53 funções SECURITY DEFINER executáveis por PUBLIC. Auditado; as perigosas foram fechadas, o resto é superfície a reduzir.
10. Anexo órfão no Storage quando a remoção falha depois do banco. Vaza arquivo, não dado.
11. Cron pode estourar os 60 s se o provedor de e-mail engasgar. Cálculo abaixo.

---

## Entrega 1 — Carga e desempenho

### A massa

20 organizações, uma no volume-alvo: 25 carteiras, 800 contas, 400 contratos,
300 frentes, 150 oportunidades, 15.000 registros, 7.200 capturas e 930 alertas
gerados pela varredura real do produto. As outras 19 existem para dar vizinhança
— RLS filtra linha a linha, e medir com uma organização só esconde o custo do
filtro. Banco resultante: 45 MB, gerado em 5 s (`qa/carga/01_massa.sql`).

### Erro de método, corrigido

A primeira rodada de medições saiu como superusuário: `set local role` fora de
transação explícita não sobrevive à instrução seguinte no psql, e superusuário
ignora RLS. Os números vinham lindos e falsos (sub-milissegundo). A versão final
(`qa/carga/02_bench.sql`) roda tudo numa transação, **prova** que a RLS está de
pé antes de medir (aborta se enxergar linha de fora) e usa o `Execution Time` do
EXPLAIN ANALYZE, que conta a execução completa e não o atalho do `count()`.

### Tempo por tela, com RLS ativa

Mediana de 5 passadas. Só o banco: rede, PostgREST e renderização estão fora.

| Tela | Mediana | Pior | Linhas |
|---|---:|---:|---:|
| Comparativo (`carteira_resumo`) | 1.681 ms | 1.754 ms | 25 |
| Acesso/pessoas (`acesso_pessoas`) | 1.386 ms | 1.417 ms | 5 |
| Relatórios — esforço | 1.314 ms | 1.377 ms | 925 |
| Painel — captura mensal | 623 ms | 734 ms | 1.832 |
| Busca — ponto focal | 545 ms | 593 ms | 8 |
| Busca por CNPJ | 512 ms | 540 ms | 1 |
| Histórico — ponto focal | 432 ms | 613 ms | 200 |
| Exportar registros | 398 ms | 424 ms | 5.000 |
| Exportar capturas | 388 ms | 425 ms | 5.000 |
| Busca (`/api/buscar`) | 298 ms | 320 ms | 12 |
| Pendências — compromissos | 129 ms | 130 ms | 300 |
| Contas (lista) | 66 ms | 68 ms | 300 |
| Contratos | 33 ms | 36 ms | 300 |
| Histórico (global) | 18 ms | 18 ms | 200 |
| Ficha da conta | 1,9 ms | 2,2 ms | 18 |

O ponto focal é o perfil que paga mais caro: a política precisa provar o vínculo
de carteira a cada linha. Busca dele: 545 ms contra 298 ms do dono.

### O índice que faltava não era o problema

`compromissos` não tinha índice por `carteira_id`, e o Comparativo varria a
tabela inteira uma vez por carteira — 76 mil linhas lidas para devolver 25. O
índice removeu a varredura do plano. O ganho total: **2%**, de 1.571 ms para
1.544 ms. Dentro do ruído.

Porque o gargalo é outro: a política de `registros` chama
`tem_acesso_carteira(carteira_id)` para **cada uma das 18.800 linhas**. As
funções auxiliares já estão corretamente marcadas STABLE (isso o produto acertou);
o custo é de formulação, não de descuido.

Protótipo com a mesma regra escrita como lista resolvida uma vez:

```
using (carteira_id in (select public.carteiras_visiveis()))
```

**1.545 ms → 8,5 ms. Cento e oitenta vezes.** Equivalência verificada nos quatro
perfis contra a política atual: dono 15.000=15.000, ponto focal 600=600, atacante
de outra org 0=0, anônimo sem permissão nos dois. Não afrouxa nada — é a mesma
pergunta, feita uma vez em vez de dezoito mil. Está em
`qa/carga/06_recomendacao_politicas.sql`, com o passo a passo e a exigência de
reverificar a equivalência antes de publicar.

Os índices ficam recomendados mesmo assim (`qa/carga/03_indices_candidatos.sql`):
removem trabalho inútil e seguram o crescimento. Só não esperem deles o ganho.

### Onde o teto esconde dado sem avisar

Este é o achado que mais incomoda, porque o usuário não tem como saber.

| Tela | Teto | Real | Escondido |
|---|---:|---:|---:|
| Histórico | 200 | 15.000 | **14.800** |
| Exportar registros | 5.000 | 15.000 | **10.000** |
| Pendências — compromissos | 300 | 1.583 | 1.283 |
| Exportar capturas | 5.000 | 7.200 | 2.200 |
| Pendências — avisos | 200 | 752 | 552 |
| Contas | 300 | 800 | 500 |
| Contratos | 300 | 400 | 100 |

A exportação é o caso grave: quem baixa o CSV acredita estar levando tudo, e leva
um terço. Não é lentidão, é dado faltando em silêncio num arquivo que vai virar
anexo de e-mail e base de decisão.

**Onde paginar:** Histórico, Pendências (as duas seções), Contas e a exportação.
**Onde não paginar:** Contratos (400 linhas), Frentes, Oportunidades, Comparativo,
Relatórios e Maturidade — o volume-alvo cabe, e paginar aí seria complicar de
graça. **O mínimo inegociável**, mesmo sem paginação: quando a consulta bate no
teto, dizer na tela. "Mostrando 300 de 800" resolve o pior do problema por uma
linha de texto.

### Custo real

Medido: a organização no volume-alvo ocupa **~19 MB**; as 20 juntas, 45 MB. Uma
exportação de registros no teto pesa ~1 MB.

Preços verificados agora (julho/2026 — confirme antes de decidir, isso muda):
Supabase Pro <cite index="11-1">custa US$ 25/mês, com cobrança de banda em US$ 0,09/GB e créditos de computação de US$ 10 inclusos</cite>; <cite index="15-1">as instâncias vão de Micro (US$ 10) e Small (US$ 15) a Medium (US$ 60) e acima</cite>. Vercel Pro <cite index="18-1">custa US$ 20 por assento com US$ 20 de crédito de uso, 1 TB de transferência e 10 M de requisições de borda inclusos</cite>.

- **1 assinante:** Supabase Pro US$ 25 (Micro coberto pelo crédito) + Vercel Pro
  US$ 20 = **~US$ 45/mês**. O banco (19 MB) e a banda são ruído.
- **20 assinantes no mesmo volume:** ~400 MB de banco, ainda dentro do incluso. O
  que muda é computação: as consultas de 1,4 s do Comparativo em Micro (1 GB RAM)
  não sustentam 20 organizações com gente simultânea. Realista: **Small a Medium,
  US$ 40 a US$ 85 no Supabase**, mais Vercel US$ 20–60 conforme assentos =
  **~US$ 60 a 145/mês**. Banda continua irrelevante nesse volume.

O gargalo de custo é computação, e computação aqui é consequência direta do
achado nº 6: com a reformulação das políticas, esse mesmo cenário provavelmente
cabe em Micro. A correção de desempenho é também a correção de custo.

---

## Entrega 2 — Ataque à RLS

Papel: admin da organização 02, credencial válida da própria casa, atacando a
organização 01. Cada tentativa com efeito verificado por privilégio de serviço —
"não levantou exceção" não é prova de nada.

### O que resistiu (e é a boa notícia)

| Tentativa | Resultado |
|---|---|
| SELECT direto em contas da org alheia | zero linhas |
| SELECT em 7 tabelas sensíveis (contratos, registros, capturas, oportunidades, alertas, anexos, auditoria) | zero em todas |
| INSERT forjando `org_id` alheio | recusado pela política |
| UPDATE em massa na org alheia | zero linhas afetadas |
| `reatribuir_alerta` com id de fora | recusado |
| Ponto focal listando carteiras | 1 de 25 |
| Ponto focal lendo contas de carteira não vinculada | zero |
| Ponto focal buscando conta alheia | não retorna |
| Leitura de objeto no bucket de outra org | zero |
| INSERT de objeto no bucket de outra org | recusado (42501) |

A aposta arquitetural — isolamento inteiro por RLS — **resiste ao ataque direto**.

### Falha crítica: anônimo virava admin

Um usuário **anônimo**, com a chave pública que vai no bundle do navegador,
chamava `vincular_membro(org_alheia, e-mail_dele, 'admin')` e **se tornava admin
da organização da vítima**. A partir daí lia tudo legitimamente, porque a RLS
passava a reconhecê-lo como membro. Comprovado: o vínculo apareceu na tabela.

Causa-raiz — lógica de três valores:

```
papel_na_org(org)  → NULL   (não é membro)
e_admin(org)       → NULL   (NULL in (...) é NULL)
if not e_admin(org) then raise ...   → not NULL é NULL → o IF NÃO DISPARA
```

A guarda parece correta e nunca protege contra exatamente quem deveria barrar.
Sete funções usam esse padrão. Corrigido na raiz (`coalesce(..., false)` em
`e_admin`, `pode_escrever`, `pode_gerir_carteiras`). Pós-correção: anônimo e
atacante autenticado recusados, efeito zero.

### Escrita cruzada por SECURITY DEFINER

`gerar_alertas` e `tirar_foto` recebem `p_org` de fora, rodam como dono e não
checavam participação: o atacante plantou **752 alertas e 25 fotos** na
organização da vítima. Não vaza dado de negócio (escrita cega; o retorno é uma
contagem), mas suja histórico alheio e serve de vandalismo.

Duas tentativas minhas falharam antes de acertar, e as duas ensinam algo:

1. **Dar política de INSERT às tabelas não resolve.** A função roda como dono, que
   tem `bypassrls`; a política nem é consultada.
2. **`current_user` não serve de discriminador dentro de SECURITY DEFINER** — ele
   já virou o dono. Minha segunda versão liberava o anônimo por isso.

A versão correta usa `session_user` (que preserva o papel de login: todo tráfego
da API do Supabase chega como `authenticator`) mais a claim `role` do JWT. Testada
nos quatro perfis com o papel `authenticator` criado para o teste: anônimo
recusado, atacante cross-org recusado, dono varrendo a própria organização
(752 alertas), cron varrendo todas.

### Bootstrap do operador de plataforma — relatado, não corrigido

Com `plataforma_admins` vazia — o estado de fábrica de toda instância nova —
qualquer autenticado chama `promover_admin_plataforma` e vira operador de tudo.

Mas isto é **deliberado**: o teste `supabase/testes/negocio.sql` descreve o
comportamento como o bootstrap do primeiro operador ("criado sem ninguém
autorizar"). Corrigir mudaria regra de negócio, o que está fora do escopo desta
rodada — então fica relatado. O risco é uma corrida entre o deploy e a promoção do
operador legítimo, com página de cadastro aberta. A correção recomendada (revogar
de PUBLIC **e** de `authenticated`, promovendo o primeiro por provisionamento)
está escrita na migration 0033, comentada, junto com o aviso de que exige
atualizar o teste.

### Suspensão de assinatura — e um falso positivo meu

Relatei antes que a suspensão não bloqueava escrita. **Era falso positivo**: eu
atacava a organização de id terminado em `013` (g=13, ativa) pensando ser a
suspensa (g=19) — os ids da massa são decimais, não hexadecimais. Com o id certo:

| Porta | Resultado |
|---|---|
| contas INSERT | recusado 42501 |
| registros INSERT | recusado 42501 |
| capturas INSERT | recusado 42501 |
| compromissos INSERT | recusado 42501 |
| contas UPDATE | 0 linhas |
| RPC gerar_compromissos | recusado |
| LEITURA (contraprova) | 40 contas visíveis |

**A suspensão funciona em todas as portas**, exatamente como os Termos prometem.
A lição ficou gravada no cabeçalho de `qa/carga/05_suspensao.sql`.

### Superfície: 49 de 53

Auditoria por `aclexplode`: **49 das 53 funções SECURITY DEFINER são executáveis
por PUBLIC**, inclusive por `anon`. Toda função em Postgres nasce assim — foi por
isso que meu primeiro `revoke ... from authenticated` não fechou nada. As quatro
protegidas são `carteiras_para_enviar` e `resumo_do_dia` (o produto já conhecia o
padrão certo, `from public`) mais as duas que corrigi. As perigosas foram fechadas;
o restante é superfície a reduzir com calma, função a função.

---

## Entrega 3 — Observabilidade

### O que estava quebrado

Nenhuma das cinco chamadas RPC da rotina diária verificava `error`. A rotina podia
falhar em **todas** as organizações e ainda responder **HTTP 200** — o agendador
da Vercel marcaria sucesso e ninguém saberia. Comprovado em laboratório: a
organização suspensa ficou com **zero fotos mensais** enquanto as ativas tinham
três. Buraco permanente no histórico, invisível.

### O que foi implementado

**Diário da rotina** (`0034_observabilidade.sql`): tabela `rotina_execucoes` com
início, fim, duração, contagem por organização e a lista de falhas — identificador
e mensagem técnica, sem dado de negócio. Mora no próprio Postgres: custo fixo zero,
nada saindo de casa.

**Detecção do silêncio** — a parte difícil, porque nada falha quando nada roda.
`rotina_saude()` responde `nunca_rodou`, `atrasada` (mais de 26 h — folga
deliberada para não dar alarme falso por fila ou horário de verão), `falhou`,
`parcial` ou `ok`. Testado nos três primeiros estados.

**Cron reescrito**: verifica o erro de cada RPC, isola falha por organização
(antes, uma exceção abortava o laço e as organizações seguintes ficavam sem
varredura e sem foto), grava o diário e responde **207** em falha parcial ou
**500** em falha total.

**Rota de saúde** (`/api/saude`): antes só perguntava ao endpoint de autenticação
do Supabase se estava vivo — um monitor apontado para lá marcaria "no ar" com o
banco fora. Agora checa ambiente, banco com consulta real (com tempo) e, em
`?detalhado=1`, a rotina. Devolve 503 quando degradado, que é o contrato que o
monitor externo entende.

**Rastreamento de erro** (`lib/telemetria.ts`): leva identificador de organização e
usuário, nunca conteúdo. Não confia na disciplina de quem escreve: tudo passa por
uma limpeza que corta valores de chave duplicada do Postgres (`Key (documento)=(...)`),
e-mails, sequências longas de dígitos e literais entre aspas — que é onde nome de
conta costuma vazar. **Seis testes travam isso**, cada um com uma mensagem de erro
realista carregando dado de cliente.

### Os 99,5% dos Termos: defensáveis, com uma condição

`disponibilidade_periodo()` calcula o número a partir de pings de um minuto. E é
honesta sobre o que não sabe: `sustenta_995` só devolve verdadeiro se a
disponibilidade for ≥ 99,5% **e a cobertura de medição for ≥ 95%**. Sem a segunda
condição o primeiro número não defende nada — é fácil ter 100% medindo só quando
está no ar.

**Resposta direta à pergunta do briefing:** os 99,5% *passam* a ser defensáveis
com o que foi implementado, mas **não são defensáveis hoje nem retroativamente**.
Não há histórico: o período começa a contar quando o monitor externo começar a
pingar. Enquanto isso, a cláusula promete o que ninguém mede. Recomendo uma de
duas: ligar o monitor antes de assinar o próximo contrato, ou ajustar os Termos
para prometer a partir de uma data declarada.

---

## Entrega 4 — Resiliência

### Backup e restauração, medidos

| Etapa | Tempo real |
|---|---:|
| `pg_dump -Fc` (banco de 45 MB) | **887 ms** |
| Arquivo gerado | 2,0 MB |
| `pg_restore` em banco novo | **2.585 ms** |

Integridade conferida item a item: 1.560 contas, 18.800 registros, soma das
capturas em R$ 327.903.075,00, **121 políticas** e **53 funções SECURITY DEFINER**
— idênticos antes e depois. Restauração íntegra, incluindo a RLS. O tempo escala
com o volume; para 20 assinantes neste volume, ordem de um minuto.

Ressalva honesta: isto mede `pg_dump`/`pg_restore` local. O backup do Supabase é
outro mecanismo (PITR nos planos pagos) e **não foi testado** — não tenho projeto
real. O procedimento acima serve como backup independente, e recomendo rodá-lo
semanalmente para fora da plataforma: depender só do backup do fornecedor é
depender do fornecedor também no dia em que o problema é ele.

### Cenários de falha

**Provedor de e-mail cai:** bem tratado. Timeout de 15 s, exceção capturada, envio
marcado como `falhou` no registro, e o reenvio acontece no ciclo seguinte porque
`extrato_ultimo_envio` só é marcado quando saiu de verdade. **Ressalva:** com
`maxDuration = 60 s`, cinco envios em timeout (75 s) estouram o limite e a Vercel
mata a função no meio. Com o diário implementado isso deixa de ser invisível — a
execução fica sem `concluida_em` e vira `atrasada` em 26 h.

**Storage indisponível:** o upload já faz compensação — se o registro no banco
falha depois do arquivo subir, o arquivo é removido. Na remoção é o inverso: apaga
a linha e depois o arquivo; se o Storage falhar, sobra **arquivo órfão**. Vaza
espaço, não dado. Aceitável, com uma rotina de varredura de órfãos no futuro.

**Migration falha no meio:** era um problema real. Nem os arquivos nem o script
usavam transação — o psql confirmava instrução a instrução, e uma falha no meio
deixava o banco meio migrado, sem caminho de volta que não fosse manual.
**Corrigido:** `scripts/testes-banco.sh` passa a aplicar cada migration com `-1`.
Verificado que **as 34 migrations aplicam em transação única sem erro** (nenhuma
usa `CREATE INDEX CONCURRENTLY`, que é o que impediria).

### Idempotência

Rodei a rotina inteira **duas vezes seguidas** em todas as 20 organizações:

```
ANTES  | alertas=1166 fotos=54 compromissos=1868 capturas=327903075 etapas=302
DEPOIS | alertas=1166 fotos=54 compromissos=1868 capturas=327903075 etapas=302
```

Nenhuma duplicação. A chave única por situação nos alertas e o `on conflict` das
fotos seguram bem.

**Menos o e-mail.** `carteiras_para_enviar` se protege (`extrato_ultimo_envio <
hoje`), mas o **resumo diário não tinha trava**: rodar a rotina duas vezes no
mesmo dia mandava dois e-mails para cada pessoa — coisa banal num reprocessamento
manual. **Corrigido**: o cron lê quem já recebeu resumo hoje e pula.

---

## Arquivos

**Migrations** (aplicam em ordem; a suíte de 15 testes SQL passa do zero com elas)
- `supabase/migrations/0033_correcao_rls_escrita_cruzada.sql` — gate de participação, correção do NULL nas guardas, e o bootstrap documentado como decisão pendente
- `supabase/migrations/0034_observabilidade.sql` — diário da rotina, saúde, disponibilidade

**Aplicação**
- `app/api/cron/extratos/route.ts` — verificação de erro por RPC, isolamento por organização, diário, 207/500, trava de resumo duplicado
- `app/api/saude/route.ts` — ambiente + banco + rotina, 503 quando degradado
- `lib/telemetria.ts` — erro com identificador, sem dado de negócio
- `testes/telemetria.teste.ts` — 6 testes travando o vazamento
- `scripts/testes-banco.sh` — migrations atômicas

**Carga e ataque** (`qa/carga/`)
- `01_massa.sql` · `02_bench.sql` · `03_indices_candidatos.sql` · `04_ataque_rls.sql` · `05_suspensao.sql` · `06_recomendacao_politicas.sql`

Validação final: **87 testes de unidade**, **15/15 arquivos SQL do zero**,
typecheck limpo.

---

## O que eu não consegui testar, e por quê

**Nada rodou contra Supabase ou Vercel de verdade.** Todo o teste é Postgres local
com as migrations reais e um stub dos esquemas `auth` e `storage`. Consequências:
a RLS, os gatilhos, as funções e as políticas foram exercitados de verdade; o
PostgREST, o GoTrue, o Storage real, a latência de rede e o comportamento sob
concorrência real **não**. Os tempos são o piso — a rede e a serialização somam
por cima.

**Concorrência não foi testada.** Todas as medições são de uma sessão por vez. Não
sei o que acontece com 20 pessoas no Comparativo simultaneamente, e é exatamente
aí que 1,4 s vira fila. Falta um teste com `pgbench` ou k6.

**Os limites da Vercel não foram exercitados.** O estouro de 60 s no cron é
cálculo (15 s × 5 timeouts), não observação. Idem o custo: derivei de volumes
medidos e preços publicados, mas não vi uma fatura.

**O backup do Supabase (PITR) não foi testado** — só o `pg_dump` independente.

**O rastreamento de erro no navegador não foi implementado.** A biblioteca serve
aos dois lados, mas falta o *error boundary* do React e a rota que recebe o relato
do cliente. Está na metade.

**As 49 funções abertas a PUBLIC não foram fechadas uma a uma.** Fechei as que o
ataque provou perigosas. As outras precisam de revisão caso a caso — várias são
auxiliares inofensivas, mas "provavelmente inofensiva" não é auditoria.

**A reformulação das políticas não foi aplicada.** Está medida e validada em
protótipo, com o roteiro escrito. Aplicar mexe em nove políticas e exige
reverificar equivalência perfil a perfil — é trabalho de uma rodada própria, com
revisão, não de um apêndice.

---

## Adendo — porte para a build b44

O trabalho acima foi feito sobre a b42. Ao receber a b44, refiz a verificação
contra ela em vez de presumir que valia igual. O que mudou:

**A b44 é outra linhagem.** Tem `equipe` (migration 0034 e `lib/equipe.ts`), a
migration `0033_correcoes_auditoria` e 17 arquivos de teste SQL. **Não** tem a
reforma de Pendências nem os Sinais — as telas continuam sendo `alertas` e
`compromissos`. Nada aqui depende disso.

**Numeração.** A b44 já usa 0033 e 0034, então as correções entram como
**0035** (RLS) e **0036** (observabilidade).

**A b44 corrigiu por conta própria** um ponto que eu também tinha visto:
`captura_sem_data` era SECURITY DEFINER filtrando só por organização, e o ponto
focal via o agregado inteiro. Na b44 virou invoker, com recorte por carteira.

**Os três achados críticos continuam valendo na b44**, verificados nela:

| Achado | Estado na b44 |
|---|---|
| `e_admin`/`pode_escrever`/`pode_gerir_carteiras` devolvem NULL | confirmado |
| Anônimo vira **admin** da organização alheia por `vincular_membro` | confirmado, com efeito |
| `gerar_alertas`/`tirar_foto` escrevem em organização alheia | confirmado |

Pós-0035, na b44, pelo caminho real (papel `authenticator`): anônimo recusado nas
três, forasteiro recusado, dono e serviço funcionando.

**Defeito preexistente encontrado na b44:** `supabase/testes/captura_mensal.sql`
**falha na b44 pura**, sem nenhuma alteração minha — verifiquei justamente para
não atribuir a mim uma regressão. O teste grava `valor_capturado` direto na
frente, mas a view lê da tabela de eventos `capturas` desde a 0022. É o mesmo
teste desatualizado que eu já havia reescrito antes; a versão corrigida passa na
b44 sem ajuste e vai no pacote. Com ela: **17/17**.

**Ressalva de arnês.** A bateria `04_ataque_rls.sql` roda via psql como
`postgres`, e o gate libera conexão direta de propósito — então nela os dois
itens de RPC cross-org aparecem como se ainda vazassem. A prova que vale está em
`07_gate_perfis.sql`, que exige conexão pelo papel `authenticator`, o mesmo
caminho de toda a API do Supabase.

**Validação na b44:** 17/17 testes SQL do zero · 97 testes de unidade · typecheck
limpo · `next build` compilando.

**Números de carga não foram refeitos na b44.** Os tempos da Entrega 1 são da
b42. As tabelas e políticas envolvidas são as mesmas, então a ordem de grandeza
vale — mas se for decidir com base neles, rode `qa/carga/01_massa.sql` e
`02_bench.sql` na b44 antes.

---

## Correção da própria 0035 — cirurgia de texto não sobrevive à produção

A primeira versão da 0035 lia `pg_get_functiondef` e injetava o gate procurando o
texto `begin` do corpo. Falhou na instância real:

```
ERROR: P0001: Não encontrei o begin do corpo de gerar_alertas — blindagem abortada
```

**Causa reproduzida:** basta o corpo estar gravado com quebra de linha CRLF —
arquivo salvo no Windows, ou colado no editor SQL a partir de um arquivo CRLF —
para `position(E'\nbegin\n' in def)` devolver zero. Confirmei em laboratório
criando a função com corpo CRLF: a busca retorna 0, exatamente o erro relatado.
Maiúscula (`BEGIN`), espaço à esquerda ou comentário no meio dariam no mesmo.

Eu havia sinalizado esse risco antes de embarcar e embarquei assim mesmo. A lição
não é "melhorar a busca" — é não depender dela.

**A versão nova não manipula texto nenhum.** Cada função original é **renomeada**
para `<nome>__nucleo` (DDL puro; o corpo permanece intacto byte a byte) e um
invólucro com o nome original é criado à mão, com o gate na entrada e a delegação
ao núcleo. Sem parsing, sem sensibilidade a espaço, caixa ou fim de linha.

**Um segundo defeito, pego pela verificação da própria migration.** Depois do
rename, o núcleo herdava o `grant execute ... to authenticated` das migrations
originais (0014, 0018, 0027, 0031) — dava para chamar o núcleo direto e contornar
o gate. O bloco de verificação no fim do arquivo detectou e abortou a migration,
como devia. Corrigido revogando de `public` **e** de `authenticated`.

**Ganho colateral:** com o núcleo fora do alcance e o invólucro sem grant para
`anon`, o anônimo agora é barrado no privilégio antes mesmo de chegar ao gate —
`permission denied for function gerar_alertas`. Defesa em profundidade.

**Validação da versão final, na b44:**

| Verificação | Resultado |
|---|---|
| Migration aplicada em arquivo LF | ok |
| Migration aplicada em arquivo **CRLF** (o cenário que falhou) | ok |
| Rodar a migration duas vezes (idempotência) | ok |
| Gate pelos 4 perfis via `authenticator` | anônimo e forasteiro recusados; dono (752 alertas) e serviço funcionando |
| Suíte SQL do zero | 17/17 |
| Testes de unidade | 97/97 |
| typecheck · `next build` | limpos |
