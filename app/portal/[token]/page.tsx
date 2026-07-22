import { lerPortal, FASE_OPORTUNIDADE, SITUACAO_FRENTE } from "@/lib/portal";
import { formatarValor } from "@/lib/contas";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { token: string } }) {
  const dados = await lerPortal(params.token);
  return {
    title: dados.valido ? `${dados.carteira} — acompanhamento` : "Acompanhamento",
    robots: { index: false, follow: false },
  };
}

export default async function PaginaPortal({ params }: { params: { token: string } }) {
  const d = await lerPortal(params.token);

  if (!d.valido) {
    return (
      <div className="portal">
        <div className="folha">
          <h1>Endereço indisponível</h1>
          <p className="folha-sub">{d.motivo}</p>
        </div>
      </div>
    );
  }

  const valores = d.mostrar_valores !== false;

  return (
    <div className="portal">
      <article className="folha">
        <header className="folha-cabeca">
          <div>
            <p className="olho">{d.organizacao} · acompanhamento</p>
            <h1>{d.titulo ?? d.carteira}</h1>
            <p className="folha-sub">
              {[d.carteira !== d.titulo ? d.carteira : null, d.codigo, d.regiao]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="folha-periodo dado">atualizado em {d.atualizado_em}</div>
        </header>

        {d.mensagem && <p className="intro-secao">{d.mensagem}</p>}

        {d.maturidade !== null && d.maturidade !== undefined && (
          <section className="folha-bloco">
            <h2>Maturidade</h2>
            <p className="dado numero-folha">
              {Number(d.maturidade).toFixed(0)}
              <span style={{ fontSize: 13, color: "var(--g400)" }}>
                {d.maturidade_ciclo ? ` · ciclo ${d.maturidade_ciclo}` : ""}
              </span>
            </p>
          </section>
        )}

        <section className="folha-bloco">
          <h2>Frentes em aberto</h2>
          {(d.frentes ?? []).length === 0 ? (
            <p className="folha-vazio">Nenhuma frente em aberto.</p>
          ) : (
            <table className="folha-tabela">
              <thead>
                <tr>
                  <th>Frente</th>
                  <th className="numero">Casos</th>
                  <th>Situação</th>
                  <th>Próxima etapa</th>
                  {valores && <th className="numero">Teto</th>}
                  {valores && <th className="numero">Capturado</th>}
                </tr>
              </thead>
              <tbody>
                {(d.frentes ?? []).map((f, i) => (
                  <tr key={i}>
                    <td>{f.titulo}</td>
                    <td className="numero dado">
                      {f.casos !== null ? f.casos.toLocaleString("pt-BR") : "—"}
                    </td>
                    <td>{SITUACAO_FRENTE[f.situacao] ?? f.situacao}</td>
                    <td>
                      {f.proxima_etapa ?? "—"}
                      {f.prazo && <span className="celula-sub">até {f.prazo}</span>}
                    </td>
                    {valores && (
                      <td className="numero dado valor-teto">{formatarValor(f.potencial)}</td>
                    )}
                    {valores && (
                      <td className="numero dado valor-capturado">{formatarValor(f.capturado)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {(d.oportunidades ?? []).length > 0 && (
          <section className="folha-bloco">
            <h2>Oportunidades em análise</h2>
            <table className="folha-tabela">
              <thead>
                <tr>
                  <th>Oportunidade</th>
                  <th>Fase</th>
                  {valores && <th className="numero">Investimento</th>}
                  {valores && <th className="numero">Payback</th>}
                </tr>
              </thead>
              <tbody>
                {(d.oportunidades ?? []).map((o, i) => (
                  <tr key={i}>
                    <td>{o.titulo}</td>
                    <td>{FASE_OPORTUNIDADE[o.fase] ?? o.fase}</td>
                    {valores && (
                      <td className="numero dado valor-teto">{formatarValor(o.investimento)}</td>
                    )}
                    {valores && (
                      <td className="numero dado">
                        {o.payback_meses === null
                          ? "sem payback"
                          : `${Math.round(Number(o.payback_meses))} meses`}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="folha-bloco">
          <h2>Contratos que exigem decisão</h2>
          {(d.contratos ?? []).length === 0 ? (
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
                {(d.contratos ?? []).map((c, i) => (
                  <tr key={i}>
                    <td>{c.numero ?? "sem número"}</td>
                    <td>{c.conta}</td>
                    <td className="dado">{c.fim ?? "—"}</td>
                    <td>{c.situacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="folha-bloco">
          <h2>Entregue nos últimos 90 dias</h2>
          {(d.entregas ?? []).length === 0 ? (
            <p className="folha-vazio">Nada registrado como entrega ou decisão no período.</p>
          ) : (
            <ul className="folha-lista">
              {(d.entregas ?? []).map((e, i) => (
                <li key={i}>
                  <span className="dado folha-data">{e.data}</span>
                  <span>
                    <strong>{e.titulo}</strong> — {e.corpo}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="folha-bloco">
          <h2>Pendências</h2>
          {(d.pendencias ?? []).length === 0 ? (
            <p className="folha-vazio">Nenhum compromisso em aberto.</p>
          ) : (
            <ul className="folha-lista">
              {(d.pendencias ?? []).map((p, i) => (
                <li key={i}>
                  <span className="dado folha-data">{p.vence}</span>
                  <span>
                    {p.titulo}
                    {p.atrasado && <span className="selo selo-falta" style={{ marginLeft: 8 }}>atrasado</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="folha-rodape">
          {valores && (
            <p>
              Potencial é teto estimado, com origem e data registradas em cada item; capturado é o
              que já se confirmou. Os dois números têm naturezas diferentes e não se somam.
            </p>
          )}
          <p className="dado">
            {d.organizacao} · {d.carteira} · página de acompanhamento, somente leitura
          </p>
        </footer>
      </article>
    </div>
  );
}
