# Segurança do acesso — o que ligar no Supabase

Ordenado por risco, não por onde fica na tela. O primeiro item é para hoje.

---

## 1. URGENTE — cadastro aberto + operador da plataforma vago

Duas coisas verdadeiras ao mesmo tempo formam um buraco:

- **Qualquer pessoa pode criar conta.** A tela `/cadastrar` chama `signUp`
  direto; não há lista de convidados na porta.
- **`promover_admin_plataforma` tem uma janela de bootstrap.** Enquanto a tabela
  `plataforma_admins` estiver **vazia**, o primeiro usuário autenticado que
  chamar a função vira operador da plataforma — e passa a enxergar e escrever em
  **todas as organizações**. Isso é deliberado (está descrito em
  `supabase/testes/negocio.sql` como o bootstrap do primeiro operador), mas o
  bootstrap pressupõe que quem publicou promova a si mesmo antes de alguém
  chegar.

Enquanto a tabela estiver vazia e o cadastro aberto, a janela está de pé.

**O que fazer agora, nesta ordem:**

1. Confira se já existe operador:
   ```sql
   select count(*) from public.plataforma_admins;
   ```
2. Se for `0`, promova você mesmo **pelo SQL Editor** (que roda com privilégio de
   serviço), não pela aplicação:
   ```sql
   select public.promover_admin_plataforma('seu-email@seudominio.com.br');
   ```
   O e-mail precisa já ter cadastro criado.
3. Confirme:
   ```sql
   select u.email from public.plataforma_admins pa
     join auth.users u on u.id = pa.user_id;
   ```

Com a tabela preenchida, a função volta a exigir que só um operador promova
outro. A correção definitiva — revogar a execução do papel da aplicação e passar
a promover só por provisionamento — está escrita e comentada no fim da migration
`0035`, e exige atualizar `negocio.sql` junto, porque hoje o teste descreve o
bootstrap como comportamento esperado.

---

## 2. Fechar o cadastro aberto (decisão, não recomendação automática)

**Authentication › Sign In / Providers › Email**, opção *Allow new users to sign
up*.

Desligar significa que ninguém cria conta sozinho: o acesso passa a nascer só
por convite do produto (`/convite/[token]`) ou por SSO com provisionamento
(migration `0039`). É mais seguro e é coerente com o produto — que é de
coordenação central, não de autoatendimento.

O custo: a tela `/cadastrar` passa a devolver erro. Se desligar, ajuste o texto
dela para explicar que o acesso é por convite, senão a pessoa fica sem entender.

Enquanto estiver ligado, vale ao menos:

- **Confirm email: ligado** (depois que o SMTP funcionar), senão qualquer um cria
  conta com o e-mail de outra pessoa;
- **CAPTCHA** em Authentication › Attack Protection — hCaptcha ou Turnstile.
  Sem ele, cadastro aberto é convite a robô consumir sua cota de e-mail.

---

## 3. Senha

**Authentication › Sign In / Providers › Email**:

- **Minimum password length: 8.** O padrão do Supabase é 6, mas a tela de
  cadastro do produto já exige 8 (`app/entrar/formulario.tsx`) — deixar o
  servidor em 6 é a trava valendo só no navegador, que é onde ela não vale.
- **Leaked password protection: ligado.** O Supabase confere a senha contra a
  base do Have I Been Pwned, sem enviar a senha. É a proteção de maior efeito por
  menos trabalho: a maioria das invasões de conta é senha reaproveitada.
- **Password requirements**: exigir ao menos letras e números. Não exagere —
  regra complicada demais produz senha anotada em papel.

---

## 4. Avisos de segurança: ligue todos

A seção **Security** dos modelos existe para uma coisa só: a pessoa descobrir que
mexeram na conta dela. Senha alterada, e-mail alterado, telefone alterado, forma
de entrar vinculada ou removida, verificação em duas etapas adicionada ou
removida.

São sete avisos, todos com modelo pronto neste diretório (arquivos `07` a `13`).
Ligue os sete. É a detecção mais barata que existe de conta tomada — quem invade
troca a senha e o e-mail, e sem o aviso o dono só descobre quando tenta entrar.

**Por que esses modelos não têm botão:** quem invadiu a conta receberia o mesmo
e-mail e clicaria no "não fui eu" antes do dono. O texto manda ir direto ao
endereço conhecido e usar "esqueci a senha" — caminho que o invasor não
controla.

---

## 5. Verificação em duas etapas

**Authentication › Multi-Factor Authentication**, ative TOTP.

Não precisa ser obrigatório para todo mundo agora. Mas quem for **operador da
plataforma** — as pessoas em `plataforma_admins`, que enxergam todas as
organizações — deveria ter, e isso é conversa de política interna, não de
configuração: o Supabase permite exigir por política de aplicação.

---

## 6. Sessões e tokens

**Authentication › Sessions**:

- **Refresh token rotation: ligado**, com **reuse detection**. Se um token de
  atualização for usado duas vezes, a sessão inteira cai — é como um roubo de
  token vira sessão morta em vez de acesso permanente.
- **Time-box user sessions**: defina um teto (30 dias é razoável para uso
  interno). Sessão eterna é acesso eterno de quem saiu da empresa.
- **JWT expiry**: 3600 segundos serve. Diminuir aumenta a troca de tokens sem
  ganho real.

---

## 7. URLs de retorno

**Authentication › URL Configuration**:

- **Site URL**: o endereço público da aplicação.
- **Redirect URLs**: adicione `https://SEU-ENDERECO/auth/callback**`.
  Sem isso o link do e-mail devolve a pessoa para a raiz — sintoma de "confirmei
  e não aconteceu nada".
- **Não use `*` sozinho.** Curinga amplo transforma qualquer site em destino
  válido de retorno com o código de sessão na URL.
- Se usa pré-visualização da Vercel, cadastre o padrão de domínio de
  pré-visualização em vez de liberar tudo.

---

## 8. Limites de vazão

**Authentication › Rate Limits**. Os padrões são baixos e o de e-mail é o que
mais surpreende: numa carga de cadastro em lote, o envio para em silêncio.
Ajuste **depois** de o SMTP próprio estar funcionando — antes, aumentar o limite
só faz falhar mais rápido.

---

## 9. Chaves

- A **service role key** existe só no servidor: `SUPABASE_SERVICE_ROLE_KEY` nas
  variáveis da Vercel, nunca em `NEXT_PUBLIC_*`, nunca no navegador. Ela ignora
  RLS por definição — quem a tem lê tudo de todos os assinantes.
- A **anon key** é pública por natureza e vai no pacote do navegador. Ela sozinha
  não dá acesso a dado nenhum: quem protege é a RLS.
- O **identificador do projeto** que aparece na URL do painel não é segredo.
- Se a service role vazar, gire em **Project Settings › API › Rotate**, e lembre
  de atualizar a variável na Vercel e refazer o deploy.

---

## Ordem sugerida

1. Promover o operador da plataforma (item 1) — hoje.
2. SMTP próprio funcionando (`README.md` deste diretório).
3. Ligar os sete avisos de segurança e colar os modelos.
4. Senha: tamanho 8 e proteção contra senha vazada.
5. URLs de retorno sem curinga.
6. Decidir sobre cadastro aberto.
7. Rotação de token e teto de sessão.
8. Duas etapas para quem opera a plataforma.
