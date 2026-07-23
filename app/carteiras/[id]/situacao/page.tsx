import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirOrg } from "@/lib/auth";
import { nomePessoa, obterCarteira, pessoasDaOrganizacao, faixaMaturidade } from "@/lib/carteiras";
import { formatarData, formatarValor, listarContas } from "@/lib/contas";
import { listarContratos, urgencia } from "@/lib/contratos";
import { listarFrentes, rotuloStatus } from "@/lib/frentes";
import { listarCompromissos, situacao } from "@/lib/compromissos";
import { historico, rotuloTipo } from "@/lib/registros";
import { acharPeriodo, periodos } from "@/lib/periodo";
import { BotaoImprimir } from "@/components/botao-imprimir";

export const dynamic = "force-dynamic";

export default async function PaginaSituacao({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { periodo?: string };
}) {
  const org = await exigirOrg();
  const carteira = await obterCarteira(params.id);
  if (!carteira) notFound();

  const periodo = acharPeriodo(searchParams.periodo);

  const [contas, frentes, contratos, compromissos, registros, pessoas] = await Promise.all([
    listarContas({ orgId: org.orgId, carteiraId: carteira.id }),
    listarFrentes({ orgId: org.orgId, carteiraId: carteira.id }),
    listarContratos({ orgId: org.orgId, carteiraId: carteira.id }),
    listarCompromissos({ orgId: org.orgId, carteiraId: carteira.id, status: "aberto" }),
    historico({ orgId: org.orgId, carteiraId: carteira.id, desde: periodo.inicio }),
    pessoasDaOrganizacao(org.orgId),
  ]);

  const frentesAbertas = frentes.filter(
    (f) => f.status === "identificada" || f.status === "em_analise" || f.status === "em_execucao",
  );
  const contratosAtencao = contratos.filter((c) => {
    const chave = urgencia(c).chave;
    return chave === "vencido" || chave === "janela";
  });
  const entregas = registros.filter(
    (r) => r.ocorrido_em <= periodo.fim && (r.tipo === "entrega" || r.tipo === "decisao"),
  );
  const outrosRegistros = registros.filter(
    (r) => r.ocorrido_em <= periodo.fim && r.tipo !== "entrega" && r.tipo !== "decisao",
  );

  // Captura e proteção não se somam: o teto do extrato é só o que há
  // para conquistar; o que há para defender sai em número próprio.
  const potencial =
    frentesAbertas
      .filter((f) => f.natureza !== "protecao")
      .reduce((t, f) => t + Number(f.potencial_bruto ?? 0), 0) +
    contas
      .filter((c) => c.relacao !== "protecao")
      .reduce((t, c) => t + Number(c.potencial_bruto ?? 0), 0);
  const protecao =
    frentesAbertas
      .filter((f) => f.natureza === "protecao")
      .reduce((t, f) => t + Number(f.potencial_bruto ?? 0), 0) +
    contas
      .filter((c) => c.relacao === "protecao")
      .reduce((t, c) => t + Number(c.potencial_bruto ?? 0), 0);
  const capturado =
    frentes.reduce((t, f) => t + Number(f.valor_capturado ?? 0), 0) +
    contas.reduce((t, c) => t + Number(c.valor_capturado ?? 0), 0);

  const responsavel = pessoas.find((p) => p.id === carteira.responsavel_id);
  const autor = (id: string) => nomePessoa(pessoas.find((p) => p.id === id));
  const nomeConta = (id: string) => contas.find((c) => c.id === id)?.nome ?? "conta";
  const faixa = faixaMaturidade(carteira.score_maturidade);
  const geradoEm = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="extrato-pagina">
      <div className="barra-extrato nao-imprimir">
        <Link className="link-acao" href={`/carteiras/${carteira.id}`}>
          Voltar para a carteira
        </Link>
        <form method="get" className="filtros" style={{ margin: 0 }}>
          <label className="campo">
            <span>Período</span>
            <select name="periodo" defaultValue={periodo.chave}>
              {periodos().map((p) => (
                <option key={p.chave} value={p.chave}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </label>
          <button className="botao botao-secundario" type="submit">
            Atualizar
          </button>
        </form>
        <BotaoImprimir />
      </div>

      <article className="folha">
        <header className="folha-cabeca">
          <div>
            <p className="olho">{org.nome} · situação da carteira</p>
            <h1>{carteira.nome}</h1>
            <p className="folha-sub">
              {[
                carteira.codigo,
                carteira.regiao,
                responsavel ? `responsável: ${nomePessoa(responsavel)}` : null,
                carteira.score_maturidade !== null
                  ? `maturidade ${carteira.score_maturidade.toFixed(0)}${faixa ? ` (${faixa.toLowerCase()})` : ""}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="folha-periodo dado">
            {formatarData(periodo.inicio)} a {formatarData(periodo.fim)}
          </div>
        </header>

        <section className="folha-numeros">
          <div>
            <p className="olho">Contas</p>
            <p className="dado numero-folha">{contas.length}</p>
          </div>
          <div>
            <p className="olho">Frentes abertas</p>
            <p className="dado numero-folha">{frentesAbertas.length}</p>
          </div>
          <div>
            <p className="olho">Potencial estimado (captura)</p>
            <p className="dado numero-folha valor-teto">{formatarValor(potencial)}</p>
          </div>
          {protecao > 0 && (
            <div>
              <p className="olho">Em proteção</p>
              <p className="dado numero-folha" style={{ color: "var(--ambar)" }}>
                {formatarValor(protecao)}
              </p>
            </div>
          )}
          <div>
            <p className="olho">Capturado</p>
            <p className="dado numero-folha valor-capturado">{formatarValor(capturado)}</p>
          </div>
        </section>

        <section className="folha-bloco">
          <h2>Frentes em aberto</h2>
          {frentesAbertas.length === 0 ? (
            <p className="folha-vazio">Nenhuma frente em aberto no período.</p>
          ) : (
            <table className="folha-tabela">
              <thead>
                <tr>
                  <th>Frente</th>
                  <th className="numero">Casos</th>
                  <th>Situação</th>
                  <th>Próxima etapa</th>
                  <th className="numero">Teto</th>
                  <th className="numero">Capturado</th>
                </tr>
              </thead>
              <tbody>
                {frentesAbertas.map((f) => (
                  <tr key={f.id}>
                    <td>{f.titulo}</td>
                    <td className="numero dado">
                      {f.qtd_casos !== null ? f.qtd_casos.toLocaleString("pt-BR") : "—"}
                    </td>
                    <td>{rotuloStatus(f.status)}</td>
                    <td>
                      {f.proxima_etapa ?? "—"}
                      {f.prazo && <span className="celula-sub">até {formatarData(f.prazo)}</span>}
                    </td>
                    <td className="numero dado valor-teto">{formatarValor(f.potencial_bruto)}</td>
                    <td className="numero dado valor-capturado">
                      {formatarValor(f.valor_capturado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="folha-bloco">
          <h2>Contratos que exigem decisão</h2>
          {contratosAtencao.length === 0 ? (
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
                {contratosAtencao.map((c) => {
                  const u = urgencia(c);
                  return (
                    <tr key={c.id}>
                      <td>{c.numero ?? "sem número"}</td>
                      <td>{nomeConta(c.conta_id)}</td>
                      <td className="dado">{formatarData(c.fim)}</td>
                      <td>
                        {u.rotulo}
                        <span className="celula-sub">{u.detalhe}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="folha-bloco">
          <h2>Entregue no período</h2>
          {entregas.length === 0 ? (
            <p className="folha-vazio">
              Nada registrado como entrega ou decisão neste período.
            </p>
          ) : (
            <ul className="folha-lista">
              {entregas.map((r) => (
                <li key={r.id}>
                  <span className="dado folha-data">{formatarData(r.ocorrido_em)}</span>
                  <span>
                    <strong>{r.titulo ?? rotuloTipo(r.tipo)}</strong> — {r.corpo}
                    <span className="celula-sub">{autor(r.autor_id)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {outrosRegistros.length > 0 && (
            <p className="folha-nota">
              Mais {outrosRegistros.length}{" "}
              {outrosRegistros.length === 1 ? "registro" : "registros"} de reunião, nota ou envio no
              período.
            </p>
          )}
        </section>

        <section className="folha-bloco">
          <h2>Pendências</h2>
          {compromissos.length === 0 ? (
            <p className="folha-vazio">Nenhum compromisso em aberto.</p>
          ) : (
            <ul className="folha-lista">
              {compromissos.slice(0, 12).map((c) => {
                const s = situacao(c);
                return (
                  <li key={c.id}>
                    <span className="dado folha-data">{formatarData(c.vence_em)}</span>
                    <span>
                      {c.titulo}
                      <span className="celula-sub">
                        {[s.rotulo, s.detalhe, c.dono_id ? autor(c.dono_id) : "sem dono"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="folha-rodape">
          <p>
            Potencial é teto estimado, com origem e data registradas em cada item; capturado é o que
            já se confirmou. Captura é receita a conquistar; proteção, receita a defender. Nenhum
            desses números se soma a outro.
          </p>
          <p className="dado">
            {org.nome} · {carteira.nome} · gerado em {geradoEm}
          </p>
        </footer>
      </article>
    </div>
  );
}
