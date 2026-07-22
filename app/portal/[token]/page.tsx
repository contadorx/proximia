import { headers } from "next/headers";
import type { Metadata } from "next";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ambienteCompleto } from "@/lib/env";
import { formatarData, formatarValor } from "@/lib/contas";
import type { DadosPortal } from "@/lib/portais";
import { BotaoImprimir } from "@/components/botao-imprimir";

export const dynamic = "force-dynamic";

// Endereço com segredo não entra em índice de busca. O robots.txt não
// alcança rota dinâmica, então a instrução vai na própria página.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

const ROTULO_STATUS: Record<string, string> = {
  identificada: "Identificada",
  em_analise: "Em análise",
  em_execucao: "Em execução",
};

async function carregar(token: string): Promise<DadosPortal | null> {
  if (!ambienteCompleto()) return null;

  try {
    const supabase = criarClienteServidor();
    const agente = headers().get("user-agent");

    const { data, error } = await supabase.rpc("portal_dados", { p_token: token });
    if (error) {
      console.error("[portal] falha ao carregar:", error.message);
      return null;
    }

    const dados = data as DadosPortal;

    // A visita só é marcada depois de o link se provar válido — link
    // errado ou expirado não é visita, é tentativa.
    if (dados?.valido) {
      await supabase.rpc("portal_visita", { p_token: token, p_agente: agente });
    }

    return dados;
  } catch (e) {
    console.error("[portal] falha ao carregar:", e);
    return null;
  }
}

function Recusa({ motivo }: { motivo: string }) {
  return (
    <div className="extrato-pagina">
      <article className="folha">
        <header className="folha-cabeca">
          <div>
            <p className="olho">Acesso por link</p>
            <h1>Este endereço não está disponível</h1>
          </div>
        </header>
        <section className="folha-bloco">
          <p>{motivo}</p>
          <p className="folha-nota">
            Se você deveria ter acesso a este material, peça um endereço novo a quem enviou o
            original. Links têm prazo de propósito.
          </p>
        </section>
      </article>
    </div>
  );
}

export default async function PaginaPortal({ params }: { params: { token: string } }) {
  const dados = await carregar(params.token);

  if (!dados) {
    return <Recusa motivo="Não foi possível carregar este endereço agora. Tente de novo em alguns minutos." />;
  }
  if (!dados.valido) {
    return <Recusa motivo={dados.motivo ?? "Endereço inválido."} />;
  }

  const frentes = dados.frentes ?? [];
  const contratos = dados.contratos;
  const entregas = dados.entregas ?? [];
  const pendencias = dados.pendencias;
  const hoje = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="extrato-pagina">
      <div className="barra-extrato nao-imprimir">
        <span className="olho">
          Acompanhamento · {dados.organizacao} · somente leitura
        </span>
        <BotaoImprimir />
      </div>

      <article className="folha">
        <header className="folha-cabeca">
          <div>
            <p className="olho">{dados.organizacao} · situação da carteira</p>
            <h1>{dados.titulo ?? dados.carteira?.nome}</h1>
            <p className="folha-sub">
              {[dados.carteira?.nome !== dados.titulo ? dados.carteira?.nome : null, dados.carteira?.codigo, dados.carteira?.regiao]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="folha-periodo dado">
            últimos {dados.periodo_dias} dias
            <span className="celula-sub">atualizado em {hoje}</span>
          </div>
        </header>

        <section className="folha-numeros">
          <div>
            <p className="olho">Contas acompanhadas</p>
            <p className="dado numero-folha">{dados.contas ?? 0}</p>
          </div>
          <div>
            <p className="olho">Frentes em aberto</p>
            <p className="dado numero-folha">{frentes.length}</p>
          </div>
          {dados.mostrar_valores && (
            <>
              <div>
                <p className="olho">Potencial estimado</p>
                <p className="dado numero-folha valor-teto">{formatarValor(dados.potencial ?? 0)}</p>
              </div>
              <div>
                <p className="olho">Capturado</p>
                <p className="dado numero-folha valor-capturado">
                  {formatarValor(dados.capturado ?? 0)}
                </p>
              </div>
            </>
          )}
        </section>

        <section className="folha-bloco">
          <h2>Frentes em aberto</h2>
          {frentes.length === 0 ? (
            <p className="folha-vazio">Nenhuma frente em aberto no momento.</p>
          ) : (
            <table className="folha-tabela">
              <thead>
                <tr>
                  <th>Frente</th>
                  <th className="numero">Casos</th>
                  <th>Situação</th>
                  <th>Próxima etapa</th>
                  {dados.mostrar_valores && <th className="numero">Teto</th>}
                  {dados.mostrar_valores && <th className="numero">Capturado</th>}
                </tr>
              </thead>
              <tbody>
                {frentes.map((f, i) => (
                  <tr key={i}>
                    <td>{f.titulo}</td>
                    <td className="numero dado">
                      {f.casos !== null ? f.casos.toLocaleString("pt-BR") : "—"}
                    </td>
                    <td>{ROTULO_STATUS[f.status] ?? f.status}</td>
                    <td>
                      {f.proxima ?? "—"}
                      {f.prazo && <span className="celula-sub">até {formatarData(f.prazo)}</span>}
                    </td>
                    {dados.mostrar_valores && (
                      <td className="numero dado valor-teto">{formatarValor(f.potencial)}</td>
                    )}
                    {dados.mostrar_valores && (
                      <td className="numero dado valor-capturado">{formatarValor(f.capturado)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {contratos !== null && contratos !== undefined && (
          <section className="folha-bloco">
            <h2>Contratos que exigem decisão</h2>
            {contratos.length === 0 ? (
              <p className="folha-vazio">Nenhum contrato vencido ou com janela aberta.</p>
            ) : (
              <table className="folha-tabela">
                <thead>
                  <tr>
                    <th>Contrato</th>
                    <th>Conta</th>
                    <th>Vence</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {contratos.map((c, i) => (
                    <tr key={i}>
                      <td>{c.numero ?? "sem número"}</td>
                      <td>{c.conta ?? "—"}</td>
                      <td className="dado">{formatarData(c.fim)}</td>
                      <td>{c.situacao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        <section className="folha-bloco">
          <h2>Entregue no período</h2>
          {entregas.length === 0 ? (
            <p className="folha-vazio">Nada registrado como entrega ou decisão neste período.</p>
          ) : (
            <ul className="folha-lista">
              {entregas.map((r, i) => (
                <li key={i}>
                  <span className="dado folha-data">{formatarData(r.data)}</span>
                  <span>
                    <strong>{r.titulo ?? "Entrega"}</strong> — {r.corpo}
                    {r.autor && <span className="celula-sub">{r.autor}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {pendencias !== null && pendencias !== undefined && (
          <section className="folha-bloco">
            <h2>Pendências</h2>
            {pendencias.length === 0 ? (
              <p className="folha-vazio">Nenhum compromisso em aberto.</p>
            ) : (
              <ul className="folha-lista">
                {pendencias.map((c, i) => (
                  <li key={i}>
                    <span className="dado folha-data">{formatarData(c.vence)}</span>
                    <span>
                      {c.titulo}
                      {c.atrasado && <span className="celula-sub">prazo passou</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <footer className="folha-rodape">
          {dados.mostrar_valores && (
            <p>
              Potencial é teto estimado, apurado a partir do que se conhece hoje — não é receita
              contratada nem compromisso de resultado. Capturado é o que já se confirmou. Os dois
              números têm naturezas diferentes e não se somam.
            </p>
          )}
          <p>
            Esta página é somente leitura e reflete o estado do sistema no momento em que foi
            aberta. Ela não substitui os documentos formais do relacionamento.
          </p>
          <p className="dado">
            {dados.organizacao} · {dados.carteira?.nome} · aberto em {hoje}
          </p>
        </footer>
      </article>
    </div>
  );
}
