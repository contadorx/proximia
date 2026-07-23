# E-mail de acesso — SMTP e modelos no Supabase

Este diretório resolve o e-mail que o **Supabase Auth** manda: confirmação de
cadastro e redefinição de senha. É outro caminho, com outra configuração, do
e-mail que o **produto** manda (extrato, resumo, convite), que sai pela Brevo
por `lib/email.ts`.

Confundir os dois custa tempo: o diagnóstico em Configurações testa a Brevo e
fica verde mesmo com o e-mail de cadastro sem sair, porque ele não passa por ali.

| E-mail | Quem envia | Onde se configura |
|---|---|---|
| Confirmação de cadastro | Supabase Auth | Painel do Supabase (este guia) |
| Redefinição de senha | Supabase Auth | Painel do Supabase (este guia) |
| Convite para a organização | Produto, via Brevo | `BREVO_API_KEY` no deploy |
| Extrato e resumo diário | Produto, via Brevo | `BREVO_API_KEY` no deploy |

---

## Por que o e-mail não chegou

O Supabase manda os e-mails de autenticação por um SMTP embutido que existe para
teste, não para produção. Ele é limitado a poucos envios por hora no projeto
inteiro, entrega mal e frequentemente cai em spam ou simplesmente não sai. Não é
defeito da instalação — é o comportamento esperado dele.

A correção é apontar o Supabase para um SMTP de verdade. Como o produto já usa
Brevo, dá para usar a mesma conta.

---

## 1. Destravar agora, sem depender de e-mail

O cadastro já existe no banco; falta o carimbo de confirmado.

No painel do Supabase: **Authentication › Users**, ache o usuário e use
**Confirm user**. Ou crie direto por **Add user**, marcando *Auto Confirm User*.

Serve para hoje. O resto deste guia é para não precisar fazer isso de novo.

---

## 2. SMTP próprio (Brevo)

**Project Settings › Authentication › SMTP Settings** — ligue *Enable Custom SMTP*:

| Campo | Valor |
|---|---|
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | o **login SMTP** da Brevo (parece um e-mail, ex.: `8a1b2c001@smtp-brevo.com`) |
| Password | a **senha SMTP** da Brevo |
| Sender email | o mesmo de `EMAIL_REMETENTE`, em domínio verificado |
| Sender name | Proximia |

Onde achar login e senha: Brevo › **SMTP & API › SMTP**.

### As três armadilhas, em ordem de frequência

**A senha SMTP não é a chave de API.** São credenciais diferentes, na mesma tela
da Brevo. A chave de API (`xkeysib-…`) serve para `BREVO_API_KEY`, que é o que o
produto usa; ela **não** funciona como senha SMTP. É o erro mais comum aqui.

**O remetente precisa estar em domínio verificado.** Sem a verificação de domínio
na Brevo (registros DKIM e SPF), ela aceita o envio e não entrega — e o log do
Supabase mostra sucesso. Verifique em Brevo › *Senders, Domains & Dedicated IPs*.

**A URL de retorno precisa estar na lista.** Em **Authentication › URL
Configuration**, o *Site URL* deve ser o endereço público da aplicação, e as
*Redirect URLs* precisam conter `https://SEU-ENDERECO/auth/callback**`. Sem isso
o link do e-mail funciona, mas devolve a pessoa para a raiz em vez da tela certa —
sintoma clássico de "confirmei e não aconteceu nada".

### Depois de configurar

Ainda em **Authentication › Rate Limits**, confira o limite de e-mails por hora:
o padrão é baixo e, num dia de cadastro em lote, ele silenciosamente para de
mandar.

Teste com um endereço que você controla e que **não** seja o de nenhum usuário
existente — o Supabase não reenvia confirmação para conta já confirmada.

---

## 3. Modelos

**Authentication › Emails**, uma aba por modelo. Cole o conteúdo do arquivo no
corpo e ajuste o assunto.

| Arquivo | Aba no Supabase | Assunto sugerido | O produto usa? |
|---|---|---|---|
| `01-confirmacao-de-cadastro.html` | Confirm signup | Confirme seu acesso ao Proximia | sim |
| `02-redefinir-senha.html` | Reset Password | Redefinir a senha do Proximia | sim |
| `03-trocar-email.html` | Change Email Address | Confirme o novo e-mail do seu acesso | só se a troca de e-mail for usada |

**Magic Link, Invite user e Reauthentication ficam como estão.** O produto não os
usa: o convite para a organização é do próprio produto e sai pela Brevo, com o
token de `public.convites` e a tela `/convite/[token]`. Se alguém usar o botão
*Invite* do painel do Supabase, a pessoa recebe um e-mail que cria acesso mas não
vincula a organização nenhuma — o caminho certo é convidar pela tela do produto.

### O que os modelos assumem

Os três usam `{{ .ConfirmationURL }}`, que é o link completo já com o código de
uso único e o retorno para `/auth/callback`. Não substitua por `{{ .Token }}`: o
produto não tem tela de digitar código, então o token sozinho não leva a lugar
nenhum.

O visual segue o dos e-mails que o produto já manda — fundo `#f6f8fa`, cartão
branco de 640px com borda `#e2e8f0`, tinta `#1b2a4a`, Arial. Tudo com estilo
embutido e em tabela, porque cliente de e-mail ignora folha de estilo externa.

O texto segue a mesma regra das telas: diz o que aconteceu, o que fazer e o que
significa não fazer nada. E a confirmação avisa uma coisa que evita chamado:
confirmar o e-mail cria o acesso, mas **não** dá acesso a organização nenhuma —
isso continua dependendo de convite ou vínculo.
