"""
Gera os modelos de e-mail que faltavam, no mesmo visual dos que o produto
já manda: fundo #f6f8fa, cartão branco de 640px, tinta #1b2a4a, Arial,
tudo com estilo embutido porque cliente de e-mail ignora folha externa.

Dois formatos:

  · AÇÃO — pede que a pessoa clique. Tem botão e endereço de reserva.
  · AVISO DE SEGURANÇA — não pede nada; comunica que algo mudou. Nunca
    tem botão de "desfazer", porque quem invadiu a conta clicaria nele.
    O caminho de socorro é redefinir a senha por fora, pelo endereço que
    a pessoa já conhece.
"""

TINTA = "#1b2a4a"
CINZA = "#64748b"
LINHA = "#e2e8f0"
ALERTA = "#b91c1c"

CABECALHO = """<!-- =====================================================================
     Supabase › Authentication › Emails › {aba}
     Assunto sugerido: {assunto}
     {nota}
     ===================================================================== -->"""


def moldura(olho: str, titulo: str, sub: str, corpo: str, rodape: str) -> str:
    return f"""<div style="margin:0;padding:24px;background:#f6f8fa;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid {LINHA};border-radius:10px;">

    <tr><td style="padding:28px 30px 0;">
      <div style="font:600 11px/1.4 Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:{CINZA};">
        {olho}
      </div>
      <h1 style="font:700 22px/1.25 Arial,sans-serif;color:{TINTA};margin:6px 0 4px;">
        {titulo}
      </h1>
      <div style="font:400 13px/1.5 Arial,sans-serif;color:{CINZA};">
        {sub}
      </div>
    </td></tr>

    <tr><td style="padding:20px 30px 0;">
{corpo}
    </td></tr>

    <tr><td style="padding:0 30px 26px;">
      <div style="border-top:1px solid {LINHA};padding-top:14px;">
{rodape}
      </div>
    </td></tr>

  </table>
</div>
"""


def botao(texto: str) -> str:
    return f"""      <table cellpadding="0" cellspacing="0" style="margin:8px 0 18px;">
        <tr><td style="background:{TINTA};border-radius:8px;">
          <a href="{{{{ .ConfirmationURL }}}}"
             style="display:inline-block;padding:12px 22px;font:600 14px/1 Arial,sans-serif;color:#ffffff;text-decoration:none;">
            {texto}
          </a>
        </td></tr>
      </table>

      <p style="font:400 12px/1.6 Arial,sans-serif;color:{CINZA};margin:0 0 6px;">
        Se o botão não abrir, copie este endereço no navegador:
      </p>
      <p style="font:400 12px/1.6 Arial,sans-serif;color:{TINTA};word-break:break-all;margin:0 0 18px;">
        {{{{ .ConfirmationURL }}}}
      </p>"""


def paragrafo(texto: str) -> str:
    return f"""      <p style="font:400 14px/1.6 Arial,sans-serif;color:{TINTA};margin:0 0 16px;">
        {texto}
      </p>"""


def nota(texto: str) -> str:
    return f"""        <p style="font:400 12px/1.6 Arial,sans-serif;color:{CINZA};margin:0;">
          {texto}
        </p>"""


def codigo(rotulo: str) -> str:
    return f"""      <p style="font:400 12px/1.6 Arial,sans-serif;color:{CINZA};margin:0 0 6px;">
        {rotulo}
      </p>
      <p style="font:700 30px/1.2 Arial,sans-serif;color:{TINTA};letter-spacing:6px;margin:0 0 18px;">
        {{{{ .Token }}}}
      </p>"""


MODELOS = {}

# ------------------------------------------------------------ ação
MODELOS["04-convite-supabase.html"] = (
    "Invite user",
    "Você recebeu um convite de acesso",
    "ATENÇÃO: o convite normal do Proximia NÃO usa este modelo — ele sai pelo\n     próprio produto, com a tela /convite/[token]. Este aqui só é disparado se\n     alguém usar o botão Invite do painel do Supabase, o que cria acesso sem\n     vincular a organização nenhuma. Ver supabase/emails/README.md.",
    moldura(
        "Proximia · acesso",
        "Convite para criar acesso",
        "{{ .Email }}",
        paragrafo(
            "Alguém do time criou um acesso ao Proximia para este endereço. Clique para "
            "definir sua senha e entrar. O link vale por uma hora e serve uma vez só."
        )
        + "\n"
        + botao("Definir senha e entrar"),
        nota(
            f'<strong style="color:{TINTA};">Depois de entrar, você pode não ver nada ainda.</strong> '
            "Criar o acesso e ter acesso a uma organização são coisas diferentes: peça a quem "
            "administra que inclua você — ou entre pelo convite que o próprio Proximia envia, "
            "que já vincula tudo de uma vez."
        ),
    ),
)

MODELOS["05-link-de-entrada.html"] = (
    "Magic link or OTP",
    "Seu link de entrada no Proximia",
    "Só é usado se você ligar entrada sem senha em Authentication › Providers.\n     Hoje a tela de entrada do Proximia pede e-mail e senha.",
    moldura(
        "Proximia · acesso",
        "Entrar sem senha",
        "{{ .Email }}",
        paragrafo(
            "Use o botão abaixo para entrar sem digitar senha. O link vale por uma hora, "
            "serve uma vez só e não deve ser encaminhado para ninguém — quem tiver este "
            "endereço entra como você."
        )
        + "\n"
        + botao("Entrar no Proximia")
        + "\n"
        + codigo("Se preferir digitar o código:"),
        nota(
            f'<strong style="color:{TINTA};">Não pediu para entrar?</strong> Ignore esta '
            "mensagem e troque sua senha. Um pedido que você não fez pode significar que "
            "alguém sabe o seu endereço e está tentando."
        ),
    ),
)

MODELOS["06-reautenticacao.html"] = (
    "Reauthentication",
    "Código para confirmar sua identidade",
    "Usado antes de operação sensível, quando ativado. O produto não pede\n     reautenticação hoje.",
    moldura(
        "Proximia · acesso",
        "Confirme que é você",
        "{{ .Email }}",
        paragrafo(
            "Uma operação sensível foi pedida na sua conta. Digite o código abaixo na tela "
            "para confirmar. Ele expira em poucos minutos."
        )
        + "\n"
        + codigo("Seu código:"),
        nota(
            f'<strong style="color:{TINTA};">Ninguém do suporte vai pedir este código.</strong> '
            "Se alguém pedir por telefone, mensagem ou e-mail, é golpe. Se você não pediu "
            "nada, troque sua senha agora."
        ),
    ),
)

# ------------------------------------------------- avisos de segurança
AVISOS = {
    "07-seguranca-senha-alterada.html": (
        "Password changed",
        "Sua senha do Proximia foi alterada",
        "Senha alterada",
        "A senha desta conta acabou de ser alterada.",
    ),
    "08-seguranca-email-alterado.html": (
        "Email address changed",
        "O e-mail do seu acesso foi alterado",
        "E-mail de acesso alterado",
        "O endereço de e-mail desta conta acabou de ser alterado. A partir de agora, "
        "a entrada acontece pelo endereço novo.",
    ),
    "09-seguranca-telefone-alterado.html": (
        "Phone number changed",
        "O telefone do seu acesso foi alterado",
        "Telefone alterado",
        "O telefone desta conta acabou de ser alterado.",
    ),
    "10-seguranca-metodo-vinculado.html": (
        "Sign-in method linked",
        "Uma nova forma de entrar foi vinculada",
        "Nova forma de entrar",
        "Uma nova forma de entrar acabou de ser vinculada a esta conta — por exemplo, "
        "acesso corporativo ou outro provedor. Quem tiver essa forma passa a entrar como você.",
    ),
    "11-seguranca-metodo-removido.html": (
        "Sign-in method removed",
        "Uma forma de entrar foi removida",
        "Forma de entrar removida",
        "Uma das formas de entrar foi removida desta conta. Se era a que você usava, "
        "a entrada passa a ser pelas que sobraram.",
    ),
    "12-seguranca-mfa-adicionado.html": (
        "MFA method added",
        "Verificação em duas etapas ativada",
        "Verificação em duas etapas ativada",
        "Uma verificação em duas etapas acabou de ser adicionada a esta conta. "
        "A partir de agora, entrar exige o segundo fator.",
    ),
    "13-seguranca-mfa-removido.html": (
        "MFA method removed",
        "Verificação em duas etapas removida",
        "Verificação em duas etapas removida",
        "Uma verificação em duas etapas acabou de ser removida desta conta. "
        "A proteção extra deixou de valer.",
    ),
}

for arquivo, (aba, assunto, titulo, frase) in AVISOS.items():
    MODELOS[arquivo] = (
        aba,
        assunto,
        "Aviso de segurança. Não pede clique: quem invadiu a conta clicaria também.",
        moldura(
            "Proximia · segurança",
            titulo,
            "{{ .Email }}",
            paragrafo(frase)
            + "\n"
            + f"""      <p style="font:400 14px/1.6 Arial,sans-serif;color:{TINTA};margin:0 0 16px;">
        <strong>Foi você?</strong> Não precisa fazer nada — este aviso existe só para
        você ficar sabendo.
      </p>""",
            f"""        <p style="font:400 13px/1.6 Arial,sans-serif;color:{ALERTA};margin:0 0 10px;">
          <strong>Não foi você?</strong> Redefina a senha imediatamente e avise quem
          administra a sua organização.
        </p>
        <p style="font:400 12px/1.6 Arial,sans-serif;color:{CINZA};margin:0;">
          Faça isso indo direto a {{{{ .SiteURL }}}} e usando &ldquo;Esqueci a senha&rdquo; —
          <strong style="color:{TINTA};">não</strong> por link recebido em e-mail. Nenhuma
          mensagem legítima do Proximia pede senha, código ou confirmação por telefone.
        </p>""",
        ),
    )

import os

destino = "supabase/emails"
os.makedirs(destino, exist_ok=True)

for arquivo, (aba, assunto, nota_topo, corpo) in MODELOS.items():
    cabecalho = CABECALHO.format(aba=aba, assunto=assunto, nota=nota_topo)
    with open(os.path.join(destino, arquivo), "w", encoding="utf-8") as f:
        f.write(cabecalho + "\n" + corpo)

print(f"{len(MODELOS)} modelos gerados em {destino}")
