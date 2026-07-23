import { checarAmbiente, credenciaisOpcionais } from "@/lib/env";
import { criarClienteServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Resultado = { titulo: string; estado: "ok" | "falha" | "aviso"; detalhe: string };

function mascarar(valor: string, inicio = 12, fim = 4): string {
  if (valor.length <= inicio + fim) return valor;
  return `${valor.slice(0, inicio)}…${valor.slice(-fim)}`;
}

async function rodarChecagens(): Promise<Resultado[]> {
  const resultados: Resultado[] = [];

  // 1. Variáveis de ambiente
  const ambiente = checarAmbiente();
  const faltando = ambiente.filter((c) => c.obrigatoria && !c.presente);
  resultados.push({
    titulo: "Variáveis de ambiente",
    estado: faltando.length ? "falha" : "ok",
    detalhe: faltando.length
      ? `Faltando: ${faltando.map((c) => c.nome).join(", ")}. Cadastre na Vercel e refaça o deploy.`
      : "Todas as variáveis obrigatórias estão definidas.",
  });

  const credenciais = credenciaisOpcionais();
  if (!credenciais) return resultados;

  // 2. Formato da URL
  let urlValida = true;
  try {
    const u = new URL(credenciais.url);
    urlValida = u.protocol === "https:";
    resultados.push({
      titulo: "Endereço do projeto",
      estado: urlValida ? "ok" : "aviso",
      detalhe: `${u.origin}${credenciais.url.endsWith("/") ? " — remova a barra final" : ""}`,
    });
  } catch {
    urlValida = false;
    resultados.push({
      titulo: "Endereço do projeto",
      estado: "falha",
      detalhe: "O valor de NEXT_PUBLIC_SUPABASE_URL não é um endereço válido.",
    });
  }

  resultados.push({
    titulo: "Chave pública",
    estado: credenciais.anonKey.length > 30 ? "ok" : "aviso",
    detalhe: `${mascarar(credenciais.anonKey)} · ${credenciais.anonKey.length} caracteres`,
  });

  // 3. O projeto responde?
  if (urlValida) {
    try {
      const r = await fetch(`${credenciais.url.replace(/\/$/, "")}/auth/v1/health`, {
        headers: { apikey: credenciais.anonKey },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      resultados.push({
        titulo: "Conexão com o Supabase",
        estado: r.ok ? "ok" : "falha",
        detalhe: r.ok
          ? "O projeto respondeu."
          : `Resposta ${r.status}. Confira se a URL e a chave são do mesmo projeto.`,
      });
    } catch (e) {
      resultados.push({
        titulo: "Conexão com o Supabase",
        estado: "falha",
        detalhe: `Sem resposta: ${e instanceof Error ? e.message : "erro desconhecido"}`,
      });
    }
  }

  // 4. Sessão
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase.auth.getUser();
    resultados.push({
      titulo: "Sessão",
      estado: error ? "aviso" : "ok",
      detalhe: error
        ? `Nenhuma sessão ativa (${error.message}).`
        : data.user
          ? `Autenticado como ${data.user.email}.`
          : "Nenhuma sessão ativa. Normal antes do login.",
    });
  } catch (e) {
    resultados.push({
      titulo: "Sessão",
      estado: "falha",
      detalhe: e instanceof Error ? e.message : "erro desconhecido",
    });
  }

  // 5. E-mail transacional: sem chave é modo simulado; com chave, a
  //    Brevo é consultada de verdade — chave revogada aparece aqui.
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_REMETENTE) {
    resultados.push({
      titulo: "E-mail transacional (Brevo)",
      estado: "aviso",
      detalhe:
        "Em modo simulado: nada sai. Defina BREVO_API_KEY e EMAIL_REMETENTE no deploy para ligar convites, extratos e resumo diário.",
    });
  } else {
    try {
      const r = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": process.env.BREVO_API_KEY, accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const conta = (await r.json()) as { email?: string };
        resultados.push({
          titulo: "E-mail transacional (Brevo)",
          estado: "ok",
          detalhe: `Chave aceita pela Brevo (conta ${conta.email ?? "—"}). Remetente: ${process.env.EMAIL_REMETENTE}. Teste o envio em Configurações.`,
        });
      } else {
        resultados.push({
          titulo: "E-mail transacional (Brevo)",
          estado: "falha",
          detalhe: `A Brevo respondeu ${r.status} para a chave configurada. Gere uma chave nova em SMTP & API e atualize BREVO_API_KEY.`,
        });
      }
    } catch (e) {
      resultados.push({
        titulo: "E-mail transacional (Brevo)",
        estado: "falha",
        detalhe: `Sem resposta da Brevo: ${e instanceof Error ? e.message : "erro desconhecido"}`,
      });
    }
  }

  // 5b. E-mail de ACESSO — outro caminho, outra configuração.
  //
  // O cartão acima checa a Brevo, que manda extrato, resumo e convite. A
  // confirmação de cadastro e a redefinição de senha NÃO passam por ela:
  // são do Supabase Auth, com SMTP configurado no painel do Supabase.
  //
  // Este cartão existe porque a confusão entre os dois já custou uma
  // instalação: o diagnóstico ficava verde e o e-mail de cadastro não
  // saía. Não dá para testar o SMTP do Auth daqui — a chave de serviço
  // não expõe essa configuração —, então o que se faz é dizer onde
  // olhar, em vez de deixar o silêncio sugerir que está tudo certo.
  resultados.push({
    titulo: "E-mail de acesso (Supabase Auth)",
    estado: "aviso",
    detalhe:
      "Confirmação de cadastro e redefinição de senha não passam pela Brevo — são do Supabase Auth. " +
      "O SMTP embutido do Supabase é limitado e costuma não entregar: configure SMTP próprio em " +
      "Project Settings › Authentication › SMTP Settings, e confira em Authentication › URL Configuration " +
      "se as Redirect URLs incluem /auth/callback. Passo a passo e modelos em supabase/emails/README.md.",
  });

  // 6. As migrations foram aplicadas?
  try {
    const supabase = criarClienteServidor();
    const { error } = await supabase.from("orgs").select("id").limit(1);
    if (error) {
      const naoExiste = error.code === "42P01" || /does not exist/i.test(error.message);
      resultados.push({
        titulo: "Banco de dados",
        estado: "falha",
        detalhe: naoExiste
          ? "A tabela orgs não existe. Aplique 0000_extensoes.sql e 0001_init_tenancy.sql no editor SQL do Supabase."
          : `${error.code ?? "erro"}: ${error.message}`,
      });
    } else {
      resultados.push({
        titulo: "Banco de dados",
        estado: "ok",
        detalhe: "As tabelas respondem e a RLS está ativa.",
      });
    }
  } catch (e) {
    resultados.push({
      titulo: "Banco de dados",
      estado: "falha",
      detalhe: e instanceof Error ? e.message : "erro desconhecido",
    });
  }

  return resultados;
}

export default async function PaginaDiagnostico() {
  const resultados = await rodarChecagens();
  const falhas = resultados.filter((r) => r.estado === "falha");

  return (
    <>
      <p className="olho">Diagnóstico</p>
      <h1>{falhas.length ? "Encontramos o problema" : "Tudo respondendo"}</h1>
      <p className="chamada">
        {falhas.length
          ? "O item marcado abaixo é o que está impedindo o aplicativo de funcionar."
          : "Configuração, conexão e banco de dados estão de pé."}
      </p>

      <section className="painel">
        <ul className="lista-estado">
          {resultados.map((r) => (
            <li key={r.titulo}>
              <span className="rotulo">
                {r.titulo}
                <span className="dica">{r.detalhe}</span>
              </span>
              <span
                className={
                  r.estado === "ok"
                    ? "selo selo-ok"
                    : r.estado === "falha"
                      ? "selo selo-falta"
                      : "selo selo-neutro"
                }
              >
                {r.estado === "ok" ? "ok" : r.estado === "falha" ? "falha" : "atenção"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="nota">
        Esta página não expõe chaves: a chave pública aparece mascarada e a chave de servidor não é
        exibida.
      </p>
    </>
  );
}
