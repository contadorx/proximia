"""
Monta um arquivo único com os treze modelos: cada um renderizado como vai
chegar na caixa de entrada, e o código ao lado para copiar.

O preview roda dentro de <iframe srcdoc>, isolado do estilo desta página —
senão a folha do kit contaminaria o e-mail e você conferiria o que não vai
ser enviado.

As variáveis do Supabase aparecem preenchidas no preview e cruas no código.
"""

import html
import os
import re

ORIGEM = "supabase/emails"
DESTINO = "/mnt/user-data/outputs/Proximia_Modelos_Email_Supabase.html"

# Valores de exemplo só para o preview. O código entregue mantém as
# variáveis reais.
EXEMPLOS = {
    "{{ .Email }}": "ana.silva@acme.com.br",
    "{{ .NewEmail }}": "ana.silva@novodominio.com.br",
    "{{ .ConfirmationURL }}": "https://proximia.seudominio.com.br/auth/callback?code=8f2a1c9e",
    "{{ .SiteURL }}": "https://proximia.seudominio.com.br",
    "{{ .Token }}": "482913",
}

ORDEM = [
    ("Autenticação", [
        "01-confirmacao-de-cadastro.html",
        "02-redefinir-senha.html",
        "03-trocar-email.html",
        "04-convite-supabase.html",
        "05-link-de-entrada.html",
        "06-reautenticacao.html",
    ]),
    ("Segurança", [
        "07-seguranca-senha-alterada.html",
        "08-seguranca-email-alterado.html",
        "09-seguranca-telefone-alterado.html",
        "10-seguranca-metodo-vinculado.html",
        "11-seguranca-metodo-removido.html",
        "12-seguranca-mfa-adicionado.html",
        "13-seguranca-mfa-removido.html",
    ]),
]

USADOS = {
    "01-confirmacao-de-cadastro.html": ("usa", "Confirmação de cadastro do produto."),
    "02-redefinir-senha.html": ("usa", "Tela “Esqueci a senha” do produto."),
    "03-trocar-email.html": ("depende", "Só se a troca de e-mail for usada."),
    "04-convite-supabase.html": ("nao", "O convite do Proximia sai pela Brevo, não por aqui."),
    "05-link-de-entrada.html": ("nao", "Só se ligar entrada sem senha."),
    "06-reautenticacao.html": ("nao", "Só se ligar reautenticação."),
}
for _, arquivos in ORDEM:
    for a in arquivos:
        USADOS.setdefault(a, ("ligar", "Aviso de segurança — recomendado ligar."))


def ler(arquivo: str):
    caminho = os.path.join(ORIGEM, arquivo)
    bruto = open(caminho, encoding="utf-8").read()

    aba = re.search(r"Emails › (.+)", bruto)
    assunto = re.search(r"Assunto sugerido: (.+)", bruto)

    # Tira o comentário de cabeçalho: o que vai para o Supabase é só o corpo.
    corpo = re.sub(r"^<!--.*?-->\s*", "", bruto, flags=re.S)

    return {
        "arquivo": arquivo,
        "aba": aba.group(1).strip() if aba else arquivo,
        "assunto": assunto.group(1).strip() if assunto else "",
        "corpo": corpo.strip(),
    }


def preencher(corpo: str) -> str:
    saida = corpo
    for chave, valor in EXEMPLOS.items():
        saida = saida.replace(chave, valor)
    return saida


SELOS = {
    "usa": ("#157a51", "#e7f6ef", "o produto usa"),
    "depende": ("#b45309", "#fef3c7", "depende do uso"),
    "nao": ("#64748b", "#f1f5f9", "o produto não usa"),
    "ligar": ("#1b2a4a", "#e8edf5", "recomendado ligar"),
}

partes = []
indice = []
n = 0

for secao, arquivos in ORDEM:
    indice.append(f'<li class="secao-indice">{secao}</li>')
    partes.append(f'<h2 class="secao">{secao}</h2>')

    for arquivo in arquivos:
        n += 1
        m = ler(arquivo)
        chave, explicacao = USADOS[arquivo]
        cor, fundo, rotulo = SELOS[chave]

        ancora = f"m{n}"
        indice.append(f'<li><a href="#{ancora}">{m["aba"]}</a></li>')

        preview = html.escape(preencher(m["corpo"]), quote=True)
        codigo = html.escape(m["corpo"])

        partes.append(f"""
<section class="modelo" id="{ancora}">
  <div class="cabeca">
    <div>
      <p class="passo">Modelo {n} de 13 · arquivo <code>{m["arquivo"]}</code></p>
      <h3>{m["aba"]}</h3>
      <p class="onde">
        Supabase › Authentication › Emails › <strong>{m["aba"]}</strong>
      </p>
    </div>
    <span class="selo" style="color:{cor};background:{fundo};">{rotulo}</span>
  </div>

  <p class="explica">{explicacao}</p>

  <div class="campo">
    <label>Assunto</label>
    <div class="valor" onclick="copiar(this)" title="clique para copiar">{m["assunto"]}</div>
  </div>

  <div class="duas">
    <div>
      <label>Como chega</label>
      <iframe class="preview" srcdoc="{preview}" loading="lazy"></iframe>
    </div>
    <div>
      <label>Código — cole no corpo do modelo</label>
      <pre class="codigo" onclick="copiar(this)" title="clique para copiar">{codigo}</pre>
    </div>
  </div>
</section>""")

pagina = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Proximia — modelos de e-mail do Supabase</title>
<style>
  :root {{ --tinta:#1b2a4a; --cinza:#64748b; --linha:#e2e8f0; --fundo:#f6f8fa; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--fundo); color:var(--tinta);
         font:400 15px/1.6 Arial,Helvetica,sans-serif; }}
  .area {{ max-width:1180px; margin:0 auto; padding:32px 24px 80px; }}
  h1 {{ font-size:28px; margin:0 0 6px; }}
  .chamada {{ color:var(--cinza); margin:0 0 28px; max-width:70ch; }}
  .secao {{ font-size:13px; text-transform:uppercase; letter-spacing:1px;
            color:var(--cinza); margin:38px 0 14px; }}
  .indice {{ background:#fff; border:1px solid var(--linha); border-radius:10px;
             padding:18px 22px; margin-bottom:28px; }}
  .indice ul {{ list-style:none; margin:0; padding:0; columns:2; }}
  .indice li {{ padding:3px 0; break-inside:avoid; }}
  .indice .secao-indice {{ font-size:12px; text-transform:uppercase; letter-spacing:1px;
                           color:var(--cinza); margin-top:10px; }}
  .indice a {{ color:var(--tinta); text-decoration:none; }}
  .indice a:hover {{ text-decoration:underline; }}
  .modelo {{ background:#fff; border:1px solid var(--linha); border-radius:10px;
             padding:22px 24px; margin-bottom:22px; }}
  .cabeca {{ display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }}
  .cabeca h3 {{ margin:2px 0 4px; font-size:19px; }}
  .passo {{ margin:0; font-size:12px; color:var(--cinza); }}
  .onde {{ margin:0; font-size:13px; color:var(--cinza); }}
  .selo {{ font-size:12px; font-weight:700; padding:5px 11px; border-radius:999px;
           white-space:nowrap; }}
  .explica {{ font-size:13px; color:var(--cinza); margin:12px 0 16px; }}
  label {{ display:block; font-size:11px; text-transform:uppercase; letter-spacing:1px;
           color:var(--cinza); margin:0 0 6px; }}
  .campo {{ margin-bottom:16px; }}
  .valor {{ background:#f8fafc; border:1px solid var(--linha); border-radius:8px;
            padding:10px 12px; font:400 14px/1.4 Arial,sans-serif; cursor:pointer; }}
  .duas {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }}
  @media (max-width:900px) {{ .duas {{ grid-template-columns:1fr; }} .indice ul {{ columns:1; }} }}
  .preview {{ width:100%; height:420px; border:1px solid var(--linha); border-radius:8px;
              background:#fff; }}
  .codigo {{ margin:0; height:420px; overflow:auto; background:#0f172a; color:#e2e8f0;
             border-radius:8px; padding:14px; font:400 11.5px/1.55 ui-monospace,Menlo,Consolas,monospace;
             white-space:pre-wrap; word-break:break-word; cursor:pointer; }}
  .copiado {{ outline:2px solid #157a51; }}
  .aviso {{ background:#fff; border:1px solid var(--linha); border-left:4px solid #b45309;
            border-radius:8px; padding:16px 18px; margin-bottom:24px; }}
  .aviso p {{ margin:0 0 8px; font-size:14px; }}
  .aviso p:last-child {{ margin-bottom:0; }}
  code {{ font:400 12.5px ui-monospace,Menlo,Consolas,monospace; }}
</style>
</head>
<body>
<div class="area">

  <h1>Modelos de e-mail do Supabase</h1>
  <p class="chamada">
    Os treze modelos no visual dos e-mails que o Proximia já manda. Cada um mostra como
    chega na caixa de entrada e o código para colar. Clique no assunto ou no código para
    copiar.
  </p>

  <div class="aviso">
    <p><strong>Antes de colar:</strong> o preview usa valores de exemplo
    (<code>ana.silva@acme.com.br</code>, um código de seis dígitos, um endereço de retorno).
    O código à direita mantém as variáveis reais do Supabase — não substitua nada nele.</p>
    <p>O comentário de cabeçalho de cada arquivo <strong>não</strong> vai para o Supabase:
    o que se cola é só o que está no bloco de código.</p>
  </div>

  <div class="indice"><ul>{"".join(indice)}</ul></div>

  {"".join(partes)}

</div>

<script>
  function copiar(elemento) {{
    const texto = elemento.innerText;
    navigator.clipboard.writeText(texto).then(function () {{
      elemento.classList.add('copiado');
      setTimeout(function () {{ elemento.classList.remove('copiado'); }}, 900);
    }});
  }}
</script>
</body>
</html>
"""

with open(DESTINO, "w", encoding="utf-8") as f:
    f.write(pagina)

print("kit gerado:", DESTINO)
print("modelos incluídos:", n)
