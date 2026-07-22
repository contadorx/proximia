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

Testes de banco ficam em `supabase/testes` e **não são migrations** — são scripts avulsos, para rodar no editor SQL quando quiser conferir. `0001_isolamento.sql` prova que uma organização não enxerga a outra.

## Variáveis de ambiente

| Variável | Onde | Obrigatória |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente e servidor | sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente e servidor | sim |
| `SUPABASE_SERVICE_ROLE_KEY` | somente servidor | a partir da importação (F10) |
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

## Rotas

| Rota | O que é |
|---|---|
| `/` | Porta de entrada: encaminha para o próximo passo que falta |
| `/entrar`, `/cadastrar` | Acesso |
| `/organizacoes` | Escolher ou criar organização |
| `/painel` | Organização atual, pessoas e papéis |
| `/instalacao` | Estado da configuração e trilha de construção |
| `/api/saude` | Verificação de saúde |

## Se algo der errado na publicação

**Erro 500 com `MIDDLEWARE_INVOCATION_FAILED`** — em geral são as variáveis de ambiente. Cadastre `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no projeto da Vercel e **refaça o deploy**: variáveis `NEXT_PUBLIC_` entram no pacote na compilação, então cadastrá-las depois de publicar não muda o que já está no ar.

**Como conferir** — abra `/instalacao`. A página lista cada variável e diz qual está faltando, e funciona mesmo sem configuração nenhuma. Se lá estiver tudo definido e o erro continuar, o motivo é outro: veja o log da função em Deployments › Functions.

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

F0 esqueleto ✓ · F1 acesso, organizações e papéis ✓ · F2 carteiras · F3 contas nomeadas · F4 contratos e cláusulas · F5 frentes · F6 timeline · F7 compromissos e alertas · F8 painel multi-carteira · F9 situação da carteira · F10 importação.

Uma feature por vez, com build passando entre cada uma.
