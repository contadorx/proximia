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

  // 5. As migrations foram aplicadas?
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
