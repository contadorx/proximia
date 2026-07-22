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
| `0013_panorama_oportunidades_convites.sql` | F17/F18 | Panorama com oportunidades e convites por e-mail |
| `0014_alertas.sql` | F19 | Alertas proativos gerados pelo banco, com silenciar e reabrir |
| `0015_anexos.sql` | F20 | Bucket privado, registro de anexos e políticas de storage |
| `0016_auditoria.sql` | F21 | Trilha de alterações escrita só por gatilho |
| `0017_portal.sql` | F22 | Portal público da carteira, com token revogável |
| `0018_responsabilidades.sql` | B24 | Papéis operacionais, responsáveis por carteira e dono nos alertas |
| `0019_captura_mensal.sql` | B25 | Série mensal de captura e o que ficou sem data |
| `0020_atribuir_compromissos.sql` | B27 | Distribuição de compromissos sem dono pela cadeia de responsabilidade |
| `0021_gestao_acesso.sql` | B28 | Travas de acesso e visão consolidada de quem vê, responde e carrega |
| `0022_capturas.sql` | B29 | Captura como evento, com estorno, e o campo virando soma |
| `0023_pipeline.sql` | B30 | Etapas com prazo esperado, motivos de perda e leitura de conversão |
| `0024_playbooks.sql` | B31 | Cadência: compromissos que nascem da mudança de etapa |
| `0025_resumo_diario.sql` | B32 | Resumo diário por pessoa e preferência de aviso |
| `0026_exportacoes.sql` | B33 | Trilha de extrações de dados |
| `0027_historico_estado.sql` | B36 | Fotos mensais das carteiras e histórico de etapas |
| `0028_financeiro.sql` | B37 | VPL, TIR, payback descontado e custo de capital |

## Verificação

```bash
npm run teste       # testes de unidade
npm run verificar   # tipos + testes + compilação
```

Os testes de banco exigem um Postgres — instruções em `supabase/testes/README.md`.

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

**Busca sempre; múltipla onde faz sentido.** Todo seletor tem busca. Filtro aceita vários — três carteiras ao mesmo tempo. Campo de vínculo continua único: a conta pertence a uma carteira, e permitir marcar várias criaria ambiguidade na hora de gravar.

**Alerta some sozinho.** A varredura diária abre alerta para o que saiu do trilho e fecha o que deixou de valer — contrato renovado, compromisso concluído. Cada situação tem uma chave, então o mesmo problema nunca vira dez alertas. O que a pessoa silenciar não volta a insistir enquanto a situação for a mesma.

**Convite em vez de cadastro prévio.** O link vale 14 dias, só para o e-mail convidado, e uma vez só. Vincular quem já tem acesso continua existindo, para quando não houver espera.

**Ninguém escreve na auditoria.** A trilha de alterações não tem política de escrita: as linhas nascem por gatilho no banco. Registro que a própria pessoa pode forjar não serve de auditoria. Guarda só os campos que mudaram — copiar a linha inteira encheria o banco de repetição e espalharia dado pessoal por mais um lugar.

**O caminho do anexo carrega o dono.** O arquivo é gravado em `{org_id}/{entidade}/{uuid}-{nome}`, e a política do storage decide o acesso lendo o próprio nome do objeto. Nada é público: o download sai por link assinado que vale um minuto.

**O portal é um segredo revogável.** O token no endereço é a credencial: pode ser trocado a qualquer momento, pode expirar, conta acessos, e nunca devolve dado pessoal — sem contatos, sem e-mails, sem nome de quem escreveu. Valores podem ser escondidos por carteira.

**O primeiro acesso lê o estado, não a URL.** O passo mostrado vem do que existe no banco — nome preenchido, organização criada, primeira carteira. Quem fecha o navegador no meio volta de onde parou; quem já terminou não vê a tela de novo.

**Redefinição não confirma cadastro.** O pedido de redefinição responde a mesma coisa exista ou não a conta. Dizer "esse e-mail não está cadastrado" entrega a terceiros quem usa o sistema.

**Responder é diferente de enxergar.** `carteira_membros` diz quem vê (alimenta a RLS); `responsabilidades` diz quem responde, e em que papel. Os papéis são catálogo do assinante — o produto só sabe que existem e qual é o primário. Alerta e compromisso derivam o dono por uma cadeia: dono explícito, responsável da entidade, responsável primário da carteira. Os demais responsáveis entram como observadores: um responde, os outros acompanham.

**A curva não inventa histórico.** A série de captura sai da data de confirmação que já existe em contas, frentes e oportunidades — não há tabela de fatos nem carimbo automático. A consequência é honesta e fica dita na tela: valor capturado sem data de confirmação não entra na curva, e o painel mostra quanto ficou de fora em vez de somar tudo no mês corrente e criar um pico falso.

**Duas lentes sobre a mesma operação.** O panorama lê por unidade, para comparar carteiras entre si, e por responsável, para ver a carga de cada pessoa. Uma carteira com responsável local e apoio corporativo aparece na linha dos dois — então a soma por pessoa é maior que o total da rede, de propósito: ali se compara carga, não mérito, e valor por pessoa seria dupla contagem disfarçada de desempenho. Carteira sem ninguém definido vira uma linha própria, que é justamente o que a coordenação precisa enxergar.

**Varredura não desfaz decisão de gente.** A distribuição automática só toca em compromisso sem dono. Quem foi reatribuído à mão fica como está — se a máquina pudesse reverter uma escolha humana toda noite, ninguém confiaria na atribuição.

**Ninguém se tranca para fora, e a organização não fica sem dono.** As travas de acesso vivem no banco, não na tela: não dá para alterar o próprio papel, se desativar, se remover, rebaixar o único dono ou promover alguém a dono sem ser dono. Suspender preserva o histórico — o que a pessoa registrou continua onde está, com o nome dela.

**Capturado é registrado, não digitado.** Cada captura é um evento com valor, data de confirmação, autor e comprovação — e `valor_capturado` deixou de ser campo editável para virar a soma desses eventos, mantida por gatilho. Não há política de UPDATE: lançamento não se reescreve. Errou o valor? Lança um estorno, que corrige o saldo sem apagar o que aconteceu. A série mensal do painel passou a ler os eventos, então a curva é consequência do trabalho e não de alguém lembrar de preencher uma data.

**A forma do funil é do produto; o ritmo é do assinante.** As etapas continuam sendo as mesmas — identificação até concluída ou descartada —, porque essa é a forma de uma conversão em qualquer setor e deixá-las livres faria cada cliente inventar um significado próprio para "ganhou". O que o assinante define é o nome de cada etapa, o prazo esperado e quais estão em uso. Esse prazo é o mesmo limite do alerta de parada: etapa sem prazo não gera alerta, o que é proposital para etapas que dependem de obra e não de ritmo comercial.

**Taxa de conversão só conta o que saiu do funil.** Oportunidade em andamento não é perda. Incluí-la achata a taxa e faz a equipe parecer pior do que é — e é o erro mais comum nesse número.

**O dono do playbook é uma regra, não uma pessoa.** Cravar nome faria a cadência quebrar na primeira troca de equipe. As regras — responsável da oportunidade, quem responde pela carteira, quem moveu a etapa — sobrevivem à rotatividade, que é o problema que o produto existe para resolver.

**Cadência não enche fila.** Só um playbook ativo por etapa; a tarefa não é recriada enquanto o compromisso dela estiver aberto; concluída, uma nova passagem recria, porque aí é volta de verdade.

**Silêncio é informação.** O resumo diário sai por pessoa, com o que está na mão dela, e **só quando há algo para agir**. Resumo que chega todo dia dizendo "está tudo bem" vira ruído, e em duas semanas ninguém abre — inclusive no dia em que não estava tudo bem. Um e-mail por pessoa, não um por alerta: e-mail por alerta é como se ensina alguém a criar filtro para o seu domínio.

**A preferência é de quem recebe.** Cada pessoa liga, desliga e escolhe receber só severidade alta. Ninguém edita a preferência de outro — aviso que um terceiro liga por você é spam com autorização.

**A exportação não tem filtro próprio.** A consulta roda sob a sessão de quem pede, então a RLS decide o que sai — ponto focal exporta só as carteiras dele pelo mesmo mecanismo que protege as telas, e não por um filtro paralelo que alguém pode esquecer de aplicar. A rota também não aceita identificador de organização: recebê-lo abriria a porta para tentar exportar a de outro.

**Guardamos o registro do ato, nunca a cópia.** Toda extração fica com autor, recurso, formato e contagem de linhas. Guardar o conteúdo exportado dobraria a exposição em vez de reduzi-la.

**A suíte roda no repositório, não só na minha máquina.** `npm run verificar` encadeia tipos, testes e compilação; `npm run teste` roda só os testes. Os de banco ficam em `supabase/testes`, em SQL, porque as regras que mais importam — políticas de acesso, gatilhos, colunas geradas — vivem lá e não dá para verificá-las por fora.

**Foto não se retoca.** O histórico mensal é escrito só pela rotina — não há política de escrita para usuário. Foto que alguém pode ajustar depois não serve de série histórica.

**As contas financeiras descontam o tempo.** Payback simples e retorno percentual ignoram que mil reais daqui a cinco anos valem menos que mil hoje, e decidir por eles favorece sistematicamente projeto longo. Entram valor presente líquido, taxa interna de retorno e payback descontado, sobre um custo de capital que é do assinante. O modelo assume fluxo constante, que é a forma do dado coletado: supor mais precisão seria falso rigor.

**Compromisso mora onde a conversa aconteceu.** Ele aparece nas cinco fichas — carteira, conta, contrato, frente e oportunidade — no mesmo tratamento que histórico e anexos, com criação já vinculada ao registro aberto. Antes existia só na tela geral, e o formulário prendia tudo à carteira: nenhum compromisso manual conseguia apontar para uma conta ou um contrato.

**A entidade viaja num campo só, como `tipo:id`.** Dois seletores dependentes seriam pior — o segundo teria de recarregar quando o primeiro muda, e a pessoa erraria a combinação.

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
| `/configuracoes` | Catálogos, dados da organização e atalhos administrativos |
| `/configuracoes/acesso` | Quem vê, quem edita, quem responde e quanto carrega |
| `/oportunidades`, `/oportunidades/[id]` | Iniciativas com investimento, retorno e payback |
| `/oportunidades/quadro` | Quadro por etapa, taxa de conversão e por que perdemos |
| `/configuracoes/pipeline` | Nome e ritmo de cada etapa, catálogo de motivos de perda |
| `/configuracoes/playbooks` | Cadência por etapa: o que criar, com que prazo e para quem |
| `/configuracoes/exportacao` | Dados em CSV por recurso ou pacote completo em JSON |
| `/maturidade`, `/maturidade/[id]` | Régua, ciclos, matriz maturidade × potencial e questionário |
| `/alertas` | O que saiu do trilho, com silenciar e varredura sob demanda |
| `/convite/[token]` | Aceite de convite de acesso |
| `/comecar` | Primeiro acesso guiado: nome, organização e primeira carteira |
| `/esqueci`, `/redefinir` | Redefinição de senha por e-mail |
| `/auth/callback` | Troca o código do link de e-mail por sessão |
| `/auditoria` | Quem alterou o quê, com filtros |
| `/portal/[token]` | Página pública da carteira, somente leitura |
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

Fase 2 completa: F12 oportunidades ✓ · F13 extrato automático ✓ · F14 maturidade ✓ · F16 seletor com busca ✓ · F17 panorama com oportunidades ✓ · F18 convite por e-mail ✓ · F19 alertas ✓ · F20 anexos ✓ · F21 registro de alterações ✓ · F22 portal da unidade ✓.

Uma feature por vez, com build passando entre cada uma.
