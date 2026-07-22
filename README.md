# Proximia

Plataforma de gestão de carteiras e grandes contas para operações B2B que atendem poucas contas de alto valor por meio de estruturas regionais.

Produto multi-tenant. Nenhum dado de assinante entra no código: tudo é configuração da instância ou importação.

## Stack

Next.js 14 (App Router) · TypeScript · Supabase (Postgres, Auth, RLS, Storage) · Vercel

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha com os dados do seu projeto Supabase
npm run dev
```

Abra http://localhost:3000. A tela inicial mostra o estado da configuração e a trilha de construção.

Sem credenciais reais o aplicativo sobe assim mesmo, em modo sem conexão, e indica o que falta. Em produção, a ausência de variável obrigatória interrompe o boot de propósito.

## Verificações

```bash
npm run build       # compilação de produção
npm run typecheck   # tipos
```

Rota de saúde: `GET /api/saude` — responde se o ambiente está configurado e se o banco está acessível.

## Migrations

Ficam em `supabase/migrations`, numeradas em sequência. Regras:

- aplicar em ordem numérica, uma de cada vez, pelo editor SQL do Supabase, conferindo o resultado antes da seguinte;
- **migration aplicada nunca é editada** — correção vira arquivo novo;
- toda tabela de dado do assinante nasce com RLS habilitada e política na mesma migration que a cria;
- migrations idempotentes onde possível (`create ... if not exists`, `drop policy if exists` antes de `create policy`).

Aplicadas até aqui:

| Arquivo | Feature | O que faz |
|---|---|---|
| `0000_extensoes.sql` | F0 | Habilita pgcrypto, unaccent e pg_trgm |
| `0001_init_tenancy.sql` | F1 | Organizações, perfis, vínculos, funções de acesso e RLS |
| `0002_carteiras.sql` | F2 | Carteiras, vínculo pessoa–carteira, alcance do ponto focal e RLS |
| `0003_contas.sql` | F3 | Contas nomeadas, contatos, herança de acesso pela carteira e RLS |
| `0004_contratos.sql` | F4 | Contratos, cláusulas monitoradas, janela de renegociação e RLS |
| `0005_frentes.sql` | F5 | Catálogo de frentes, frentes agregadas por carteira e RLS |
| `0006_registros.sql` | F6 | Histórico com autor, versionamento, imutabilidade e RLS |
| `0007_compromissos.sql` | F7 | Compromissos, geração automática por contrato e cláusula, e RLS |
| `0008_panorama.sql` | F8 | Visão `carteira_resumo` consolidando as carteiras, com security_invoker |
| `0009_importacoes.sql` | F10 | Registro das cargas, com conferência antes de gravar, e RLS |
| `0010_oportunidades.sql` | F12 | Oportunidades com investimento, retorno, payback e RLS |
| `0011_extrato_automatico.sql` | F13 | Cadência do extrato por carteira, registro de envios e RLS |
| `0012_maturidade.sql` | F14 | Questionário ponderado, ciclos, avaliações, score e RLS |

Testes de banco ficam em `supabase/testes` e **não são migrations** — são scripts avulsos, para rodar no editor SQL quando quiser conferir. `0001_isolamento.sql` prova que uma organização não enxerga a outra.

## Variáveis de ambiente

| Variável | Onde | Obrigatória |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente e servidor | sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente e servidor | sim |
| `SUPABASE_SERVICE_ROLE_KEY` | somente servidor | sim, para a rotina de extratos |
| `BREVO_API_KEY`, `EMAIL_REMETENTE` | somente servidor | para enviar de verdade |
| `CRON_SECRET` | somente servidor | para a rotina diária rodar |
| `NEXT_PUBLIC_APP_NOME` | cliente e servidor | não |

Nenhum segredo no repositório. A chave service role ignora RLS e só pode ser usada em rotina de servidor.

## Acesso e papéis

| Papel | Alcance |
|---|---|
| Dono | Administra tudo e pode excluir a organização |
| Administrador | Administra a organização e as pessoas |
| Acompanhamento | Vê tudo da organização e não altera nada — perfil da gestão |
| Analista | Opera todas as carteiras |
| Ponto focal | Opera apenas as carteiras em que estiver vinculado |

Quem cria a organização vira dono. A criação passa pela função `criar_organizacao()`, que grava a organização e o vínculo de dono na mesma transação. Incluir pessoas passa por `vincular_membro()`, que só aceita chamada de administrador da própria organização — a checagem fica no banco, não na tela.

## Como o produto pensa

**Gestão por exceção.** Conta grande tem ficha individual; volume entra como frente agregada na carteira — uma linha por tema, com quantidade de casos, dono, próxima etapa e link para a base de trabalho, que continua fora do sistema. Frente descartada exige motivo: o banco recusa descarte sem justificativa, porque é o que resta de aprendizado.

**Potencial e capturado não se somam.** São campos distintos, e o banco recusa potencial sem origem declarada e sem data de apuração. Não existe campo de meta em lugar nenhum.

**Janela de renegociação é do banco.** Coluna gerada: data de fim menos o aviso prévio. É a informação que o produto existe para não deixar passar, então não depende de a tela lembrar de calcular. "Vencido" também não é status declarado: é consequência de a data ter passado com o contrato ainda vigente.

**Memória não se reescreve.** Registro tem autor e data, e o banco impede sobrescrita: editar cria uma versão nova e a anterior continua legível. A política de escrita também exige que o autor seja quem está na sessão — ninguém registra em nome de outra pessoa.

**Compromisso nasce do dado.** Contrato com vigência e cláusula monitorada geram compromisso sozinhos, por gatilho no banco: mudar o aviso prévio move a data, encerrar o contrato cancela, remarcar reabre — sempre uma linha por origem, nunca duplicada. Compromisso automático não pode ser apagado, só cancelado.

**Visão consolidada não fura a RLS.** `carteira_resumo` é criada com `security_invoker = on`: roda com as permissões de quem consulta, não com as do dono. Sem isso, uma visão viraria porta lateral — o ponto focal veria números de carteiras que não pode abrir.

**O extrato é o entregável.** A situação da carteira sai em uma página, com frentes em aberto, contratos que exigem decisão, o que foi entregue no período e as pendências. Impressão é CSS: a barra lateral e os controles somem, o conteúdo ocupa a folha inteira e nenhum bloco quebra no meio.

**Carga não grava sem conferência.** A importação acontece em duas etapas: o arquivo é lido e validado linha a linha, gerando um relatório com o motivo de cada recusa, e só então a pessoa confirma. Linhas boas entram mesmo que outras tenham sido recusadas — não é tudo ou nada. Importar é operação de quem administra carteiras.

**Formulário aparece quando é pedido.** As telas mostram o que existe; criar e editar abre em modal, disparado por botão. O que é ajuste da operação — pessoas, alcance, catálogo de tipos — fica em Configurações, fora do caminho do trabalho do dia.

**Números têm formato.** Valor, quantidade, CNPJ e score usam campos com máscara: a pessoa lê formatado e o servidor recebe o valor cru num campo oculto.

**Conta de retorno é do banco.** Payback e retorno percentual são colunas geradas a partir de investimento, retorno mensal e custo adicional. Quando o resultado mensal não cobre o custo, o payback fica nulo — não existe payback, e o sistema diz isso em vez de mostrar um número.

**Vocabulário sem setor.** Onde a operação de origem diria um termo do segmento, o produto diz oportunidade; o tipo — expansão, novo serviço, substituição de equipamento — é catálogo do assinante.

**Envio deixa rastro, inclusive quando falha.** Cada extrato enviado vira linha em `envios`, com destinatários, período e resultado. Envio simulado (sem provedor configurado) e envio com falha não marcam a carteira como atendida — são tentados de novo no ciclo seguinte. Sem esse registro, "não recebi o relatório" não tem resposta.

**A régua é do assinante.** Nenhum questionário vem embutido: dimensões e perguntas são cadastradas por quem usa, cada uma com peso. O produto entrega a mecânica — escala de 0 a 4, média ponderada, ciclos comparáveis e matriz maturidade × potencial —, não um modelo de maturidade de setor. Pergunta sem resposta fica fora do cálculo em vez de virar zero, então avaliação parcial mostra o score do que foi de fato avaliado.

**Formulário fecha quando termina.** Toda ação de servidor devolve confirmação no endereço, e o modal observa essa mudança para se fechar sozinho — com o conteúdo em estado de espera enquanto grava. Sem isso não dá para saber se algo aconteceu.

**Exclusão em duas etapas.** O primeiro clique pergunta, o segundo executa, e o aviso diz o que vai junto. Excluir carteira leva contas, contratos, frentes, oportunidades e histórico; excluir dimensão leva perguntas e respostas. Frente e oportunidade têm o descarte com motivo como caminho preferido — apagar perde o aprendizado.

**Alcance por papel.** Dono, administrador e analista enxergam todas as carteiras; acompanhamento enxerga tudo sem escrever nada; ponto focal enxerga e opera apenas as carteiras em que foi vinculado. A separação é feita nas políticas do banco, nunca só na tela.

## Rotas

| Rota | O que é |
|---|---|
| `/` | Porta de entrada: encaminha para o próximo passo que falta |
| `/entrar`, `/cadastrar` | Acesso |
| `/organizacoes` | Escolher ou criar organização |
| `/painel` | Primeiros passos, o que precisa de atenção, frentes em andamento e pessoas |
| `/carteiras`, `/carteiras/[id]` | Carteiras, contas e frentes da carteira, quem acompanha |
| `/contas`, `/contas/[id]` | Contas, busca, potencial × capturado, contratos e contatos |
| `/contratos`, `/contratos/[id]` | Contratos por urgência, prazos e cláusulas |
| `/frentes`, `/frentes/[id]` | Frentes agregadas, totais, catálogo e links da base |
| `/historico` | Tudo o que foi registrado, por dia, com filtros |
| `/compromissos` | Atrasados, meus, próximos e geração retroativa |
| `/panorama` | Todas as carteiras em uma tela, ordenadas por atenção |
| `/carteiras/[id]/situacao` | Extrato de uma página, pronto para imprimir ou salvar em PDF |
| `/importacao`, `/importacao/[id]` | Envio de CSV, conferência linha a linha e confirmação |
| `/configuracoes` | Pessoas e alcance, catálogos e dados da organização |
| `/oportunidades`, `/oportunidades/[id]` | Iniciativas com investimento, retorno e payback |
| `/maturidade`, `/maturidade/[id]` | Régua, ciclos, matriz maturidade × potencial e questionário |
| `/instalacao` | Estado da configuração e trilha de construção |
| `/diagnostico` | Testa configuração, conexão, sessão e banco |
| `/api/saude` | Verificação de saúde |

## Se algo der errado na publicação

**Erro 500 com `MIDDLEWARE_INVOCATION_FAILED`** — em geral são as variáveis de ambiente. Cadastre `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no projeto da Vercel e **refaça o deploy**: variáveis `NEXT_PUBLIC_` entram no pacote na compilação, então cadastrá-las depois de publicar não muda o que já está no ar.

**Erro de servidor com `Digest: <número>`** — abra `/diagnostico`. A página testa, em ordem, as variáveis, o formato da URL, a chave, a conexão com o projeto, a sessão e se as tabelas existem, e aponta qual item falhou. Ela não expõe chaves.

**Como achar o erro exato na Vercel** — em Deployments › a implantação atual › Functions (ou Logs), procure a linha com o mesmo digest do erro exibido na tela. É ali que está a mensagem original.

**Causas mais comuns, em ordem:** variáveis cadastradas depois do build (refaça o deploy); URL e chave de projetos diferentes; barra no fim da URL; migrations ainda não aplicadas no banco.

## Estrutura

```
app/                 rotas (App Router)
  acoes/             ações de servidor
  api/saude/         verificação de saúde
  entrar/            acesso (página e formulário)
  organizacoes/      escolha e criação de organização
  painel/            organização atual e pessoas
  instalacao/        estado da configuração
  globals.css        sistema de tokens visuais
  layout.tsx         casca do aplicativo
lib/
  auth.ts            sessão, vínculos e organização selecionada
  env.ts             leitura e validação de variáveis de ambiente
  tipos.ts           papéis e rótulos
  supabase/
    client.ts        cliente do browser (sob RLS)
    server.ts        cliente do servidor (sob RLS) e cliente administrativo
middleware.ts        renovação de sessão
supabase/
  migrations/        migrations .sql versionadas
  testes/            scripts de verificação (não são migrations)
```

## Trilha de construção

F0 esqueleto ✓ · F1 acesso, organizações e papéis ✓ · F2 carteiras ✓ · F3 contas nomeadas ✓ · F4 contratos e cláusulas ✓ · F5 frentes ✓ · F6 timeline e memória institucional ✓ · F7 compromissos e alertas ✓ · F8 painel multi-carteira ✓ · F9 situação da carteira ✓ · F10 importação ✓ · F11 camada de interface ✓ — **fatia 1 completa**.

Fase 2 em andamento: F12 oportunidades ✓ · F13 extrato automático ✓ · F14 motor de maturidade ✓ · portal da unidade · anexos · alertas proativos.

Uma feature por vez, com build passando entre cada uma.
