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
### Autenticação

| Arquivo | Aba no Supabase | O produto usa? |
|---|---|---|
| `01-confirmacao-de-cadastro.html` | Confirm sign up | **sim** |
| `02-redefinir-senha.html` | Reset password | **sim** |
| `03-trocar-email.html` | Change email address | só se a troca de e-mail for usada |
| `04-convite-supabase.html` | Invite user | **não** — ver aviso abaixo |
| `05-link-de-entrada.html` | Magic link or OTP | não — só se ligar entrada sem senha |
| `06-reautenticacao.html` | Reauthentication | não — só se ligar reautenticação |

**Sobre o Invite user:** o convite do Proximia **não** passa por ele. O produto
envia o convite pela Brevo, com o token de `public.convites` e a tela
`/convite/[token]`, que já vincula a pessoa à organização. Se alguém usar o botão
*Invite* do painel do Supabase, a pessoa recebe um e-mail, cria acesso e **não
enxerga nada** — porque não há vínculo. O modelo `04` existe para esse caso não
virar chamado: ele avisa, no próprio e-mail, que falta o vínculo e qual é o
caminho certo.

### Segurança

Sete avisos que comunicam mudança na conta. **Ligue todos** — é a detecção mais
barata de conta tomada. Nenhum tem botão, de propósito: quem invadiu receberia o
mesmo e-mail e clicaria antes do dono.

| Arquivo | Aba no Supabase |
|---|---|
| `07-seguranca-senha-alterada.html` | Password changed |
| `08-seguranca-email-alterado.html` | Email address changed |
| `09-seguranca-telefone-alterado.html` | Phone number changed |
| `10-seguranca-metodo-vinculado.html` | Sign-in method linked |
| `11-seguranca-metodo-removido.html` | Sign-in method removed |
| `12-seguranca-mfa-adicionado.html` | MFA method added |
| `13-seguranca-mfa-removido.html` | MFA method removed |

> Os avisos de segurança usam apenas `{{ .Email }}` e `{{ .SiteURL }}`, que são
> as variáveis seguras em todos eles. Cada tela do Supabase lista as variáveis
> disponíveis naquele modelo — se a sua mostrar data, dispositivo ou endereço de
> origem, vale acrescentar: quanto mais concreto o aviso, mais fácil a pessoa
> reconhecer o que não foi ela.

**A configuração de segurança do projeto está em `SEGURANCA.md`, neste mesmo
diretório** — e o primeiro item de lá é para hoje.

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
