import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirOrg } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { MODELOS, type TipoImportacao } from "@/lib/importacao";
import { confirmarImportacao, descartarImportacao } from "@/app/acoes/importacao";
import { Vazio } from "@/components/intro-secao";
import { BotaoEnviar } from "@/components/botao-enviar";

export const dynamic = "force-dynamic";

type Erro = { linha: number; motivo: string; conteudo: string };

type Importacao = {
  id: string;
  tipo: TipoImportacao;
  arquivo_nome: string | null;
  status: "conferida" | "concluida" | "descartada";
  linhas_total: number;
  linhas_ok: number;
  linhas_erro: number;
  linhas_gravadas: number;
  payload: Record<string, unknown>[];
  relatorio: Erro[];
};

export default async function PaginaRelatorio({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string; ok?: string };
}) {


  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("importacoes")
    .select(
      "id, tipo, arquivo_nome, status, linhas_total, linhas_ok, linhas_erro, linhas_gravadas, payload, relatorio",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!data) notFound();
  const imp = data as Importacao;
  const modelo = MODELOS[imp.tipo];
  const amostra = (imp.payload ?? []).slice(0, 5);

  // A conferência existe para uma pessoa OLHAR e reconhecer o que vai
  // entrar. O payload já vem com os identificadores resolvidos, e uma
  // tabela de UUIDs não deixa ninguém reconhecer nada — a tela pedia
  // conferência e entregava ruído. Aqui os identificadores voltam a ser
  // nomes, e as colunas técnicas saem da amostra.
  const org = await exigirOrg();
  const [{ data: carteirasRef }, { data: perguntasRef }, { data: ciclosRef }, { data: equipeRef }] =
    await Promise.all([
      supabase.from("carteiras").select("id, nome, codigo").eq("org_id", org.orgId),
      supabase.from("maturidade_perguntas").select("id, texto").eq("org_id", org.orgId),
      supabase.from("maturidade_ciclos").select("id, nome").eq("org_id", org.orgId),
      supabase.from("equipe").select("id, nome").eq("org_id", org.orgId),
    ]);

  const nomes = new Map<string, string>();
  for (const c of (carteirasRef ?? []) as { id: string; nome: string; codigo: string | null }[]) {
    nomes.set(c.id, c.codigo ? `${c.nome} (${c.codigo})` : c.nome);
  }
  for (const p of (perguntasRef ?? []) as { id: string; texto: string }[]) {
    nomes.set(p.id, p.texto);
  }
  for (const c of (ciclosRef ?? []) as { id: string; nome: string }[]) nomes.set(c.id, c.nome);
  for (const p of (equipeRef ?? []) as { id: string; nome: string }[]) nomes.set(p.id, p.nome);

  const ROTULO: Record<string, string> = {
    carteira_id: "carteira",
    pergunta_id: "pergunta",
    ciclo_id: "ciclo",
    conta_id: "conta",
    dono_id: "dono",
    responsavel_id: "responsável",
    catalogo_id: "tipo",
  };

  // org_id e criado_por não dizem nada a quem confere.
  const TECNICAS = new Set(["org_id", "criado_por", "avaliacao_id"]);

  const colunasAmostra =
    amostra.length > 0
      ? Object.keys(amostra[0])
          .filter((c) => !TECNICAS.has(c))
          .slice(0, 6)
      : [];

  const mostrar = (chave: string, valor: unknown): string => {
    if (valor === null || valor === undefined || valor === "") return "—";
    const texto = String(valor);
    // Identificador vira nome; o que não for identificador conhecido
    // aparece como está.
    return chave.endsWith("_id") ? (nomes.get(texto) ?? texto) : texto;
  };

  return (
    <>
      <p className="olho">
        <Link href="/importacao">Importação</Link> · {imp.arquivo_nome ?? "sem nome"}
      </p>
      <h1>Conferência: {modelo?.rotulo ?? imp.tipo}</h1>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <section className="painel">
        <div className="grade-prazos">
          <div>
            <p className="olho">Linhas lidas</p>
            <p className="dado destaque-dado">{imp.linhas_total}</p>
          </div>
          <div>
            <p className="olho">Entram</p>
            <p className="dado destaque-dado" style={{ color: "var(--sinal)" }}>
              {imp.linhas_ok}
            </p>
          </div>
          <div>
            <p className="olho">Recusadas</p>
            <p className="dado destaque-dado" style={{ color: imp.linhas_erro ? "var(--alerta)" : undefined }}>
              {imp.linhas_erro}
            </p>
          </div>
          <div>
            <p className="olho">Situação</p>
            <p className="dado destaque-dado" style={{ fontSize: 15 }}>
              {imp.status === "concluida"
                ? `${imp.linhas_gravadas} gravadas`
                : imp.status === "descartada"
                  ? "descartada"
                  : "aguardando"}
            </p>
          </div>
        </div>

        {imp.status === "conferida" && (
          <div className="acoes-rodape" style={{ marginTop: 22 }}>
            <form action={confirmarImportacao}>
              <input type="hidden" name="id" value={imp.id} />
              <BotaoEnviar desabilitado={imp.linhas_ok === 0} rotuloEnviando="Gravando…">
                Gravar {imp.linhas_ok} {imp.linhas_ok === 1 ? "registro" : "registros"}
              </BotaoEnviar>
            </form>
            <form action={descartarImportacao}>
              <input type="hidden" name="id" value={imp.id} />
              <button className="link-acao" type="submit">
                Descartar
              </button>
            </form>
          </div>
        )}
      </section>

      {imp.linhas_erro > 0 && (
        <section className="painel painel-alerta">
          <h2>Linhas recusadas</h2>
          <p className="nota" style={{ marginBottom: 14 }}>
            Corrija estas linhas na sua planilha e envie de novo só elas. As válidas podem ser
            gravadas agora — não é preciso esperar.
          </p>
          <table className="folha-tabela">
            <thead>
              <tr>
                <th className="numero">Linha</th>
                <th>Motivo</th>
                <th>Conteúdo</th>
              </tr>
            </thead>
            <tbody>
              {(imp.relatorio ?? []).slice(0, 100).map((e, i) => (
                <tr key={`${e.linha}-${i}`}>
                  <td className="numero dado">{e.linha}</td>
                  <td>{e.motivo}</td>
                  <td className="celula-sub" style={{ marginTop: 0 }}>
                    {e.conteudo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(imp.relatorio ?? []).length > 100 && (
            <p className="nota">Mostrando as 100 primeiras de {imp.relatorio.length}.</p>
          )}
        </section>
      )}

      <section className="painel">
        <h2>Amostra do que entra</h2>
        {amostra.length === 0 ? (
          <Vazio>Nenhuma linha válida neste arquivo.</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <table className="folha-tabela">
              <thead>
                <tr>
                  {colunasAmostra.map((c) => (
                    <th key={c}>{ROTULO[c] ?? c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {amostra.map((linha, i) => (
                  <tr key={i}>
                    {colunasAmostra.map((c) => (
                      <td key={c}>{mostrar(c, linha[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {imp.linhas_ok > amostra.length && (
          <p className="nota">
            Mostrando {amostra.length} de {imp.linhas_ok} linhas válidas.
          </p>
        )}
      </section>
    </>
  );
}
