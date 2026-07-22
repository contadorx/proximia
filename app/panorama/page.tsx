import Link from "next/link";
import { exigirOrg } from "@/lib/auth";
import { faixaMaturidade, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { formatarValor } from "@/lib/contas";
import {
  ORDENACOES,
  diasSemMovimento,
  panorama,
  totaisGerais,
  type Ordenacao,
} from "@/lib/panorama";
import { IntroSecao, Vazio } from "@/components/intro-secao";

export const dynamic = "force-dynamic";

function Sinal({ valor, rotulo }: { valor: number; rotulo: string }) {
  if (valor === 0) return null;
  return (
    <span className="selo selo-falta" title={rotulo}>
      <span className="dado">{valor}</span> {rotulo}
    </span>
  );
}

export default async function PaginaPanorama({
  searchParams,
}: {
  searchParams: { ordem?: string; status?: string };
}) {
  const org = await exigirOrg();
  const ordem = (searchParams.ordem as Ordenacao) ?? "atencao";

  const [linhas, pessoas] = await Promise.all([
    panorama(org.orgId, ordem),
    pessoasDaOrganizacao(org.orgId),
  ]);

  const filtradas = searchParams.status
    ? linhas.filter((l) => l.status === searchParams.status)
    : linhas;
  const t = totaisGerais(filtradas);

  return (
    <>
      <p className="olho">{org.nome}</p>
      <h1>Panorama</h1>

      <IntroSecao>
        Todas as carteiras em uma tela, ordenadas por <strong>quem precisa de atenção</strong> —
        contrato vencido pesa mais que janela aberta, que pesa mais que compromisso atrasado, e
        carteira parada há mais de 30 dias entra na conta. É a resposta a &quot;como está a
        operação?&quot; sem pedir status a ninguém.
      </IntroSecao>

      {filtradas.length === 0 ? (
        <Vazio
          acao={
            <Link className="botao botao-secundario" href="/carteiras">
              Cadastrar carteira
            </Link>
          }
        >
          Nenhuma carteira para mostrar ainda.
        </Vazio>
      ) : (
        <>
          <section className="painel">
            <div className="grade-prazos">
              <div>
                <p className="olho">Carteiras</p>
                <p className="dado destaque-dado">{t.carteiras}</p>
                <p className="nota">
                  {t.contas} contas · {t.frentes} frentes abertas
                </p>
              </div>
              <div>
                <p className="olho">Casos em frentes</p>
                <p className="dado destaque-dado">{t.casos.toLocaleString("pt-BR")}</p>
              </div>
              <div>
                <p className="olho">Potencial estimado</p>
                <p className="dado destaque-dado valor-teto" style={{ fontSize: 16 }}>
                  {formatarValor(t.potencial)}
                </p>
              </div>
              <div>
                <p className="olho">Capturado</p>
                <p className="dado destaque-dado valor-capturado" style={{ fontSize: 16 }}>
                  {formatarValor(t.capturado)}
                </p>
              </div>
              <div>
                <p className="olho">Investimento em análise</p>
                <p className="dado destaque-dado valor-teto" style={{ fontSize: 16 }}>
                  {formatarValor(t.investimento)}
                </p>
                <p className="nota">
                  {t.oportunidades} oportunidades · {formatarValor(t.resultadoMensal)} por mês
                  esperados
                </p>
              </div>
            </div>

            {(t.vencidos > 0 || t.janela > 0 || t.atrasados > 0) && (
              <div className="tira-alerta" style={{ marginTop: 18, marginBottom: 0 }}>
                {t.vencidos > 0 && (
                  <Link href="/contratos?situacao=vencido">
                    <span className="dado">{t.vencidos}</span> contratos vencidos
                  </Link>
                )}
                {t.janela > 0 && (
                  <Link href="/contratos?situacao=janela">
                    <span className="dado">{t.janela}</span> em janela de renegociação
                  </Link>
                )}
                {t.atrasados > 0 && (
                  <Link href="/compromissos">
                    <span className="dado">{t.atrasados}</span> compromissos atrasados
                  </Link>
                )}
              </div>
            )}
          </section>

          <form className="filtros" method="get">
            <label className="campo">
              <span>Ordenar por</span>
              <select name="ordem" defaultValue={ordem}>
                {ORDENACOES.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Situação</span>
              <select name="status" defaultValue={searchParams.status ?? ""}>
                <option value="">Todas</option>
                <option value="ativa">Ativas</option>
                <option value="pausada">Pausadas</option>
                <option value="encerrada">Encerradas</option>
              </select>
            </label>
            <button className="botao botao-secundario" type="submit">
              Aplicar
            </button>
          </form>

          <div className="painel sem-recheio">
            <div className="tabela-rolagem">
              <table className="tabela-panorama">
                <thead>
                  <tr>
                    <th>Carteira</th>
                    <th className="numero">Contas</th>
                    <th className="numero">Frentes</th>
                    <th className="numero">Casos</th>
                    <th className="numero">Oportunidades</th>
                    <th className="numero">Potencial</th>
                    <th className="numero">Capturado</th>
                    <th>Atenção</th>
                    <th className="numero">Parada há</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((r) => {
                    const dias = diasSemMovimento(r);
                    const faixa = faixaMaturidade(r.score_maturidade);
                    return (
                      <tr key={r.carteira_id}>
                        <td>
                          <Link href={`/carteiras/${r.carteira_id}`}>{r.nome}</Link>
                          <span className="celula-sub">
                            {[
                              r.codigo,
                              r.regiao,
                              r.responsavel_id
                                ? nomePessoa(pessoas.find((p) => p.id === r.responsavel_id))
                                : null,
                              r.score_maturidade !== null
                                ? `maturidade ${Number(r.score_maturidade).toFixed(0)}${faixa ? ` · ${faixa.toLowerCase()}` : ""}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </td>
                        <td className="numero dado">
                          {r.contas_total}
                          {r.contas_protecao > 0 && (
                            <span className="celula-sub">{r.contas_protecao} em proteção</span>
                          )}
                        </td>
                        <td className="numero dado">{r.frentes_abertas}</td>
                        <td className="numero dado">
                          {Number(r.frentes_casos ?? 0).toLocaleString("pt-BR")}
                        </td>
                        <td className="numero dado">
                          {Number(r.oportunidades_abertas) > 0 ? (
                            <>
                              {r.oportunidades_abertas}
                              <span className="celula-sub">
                                {formatarValor(Number(r.oportunidades_investimento))} a investir
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="numero dado valor-teto">
                          {formatarValor(Number(r.frentes_potencial) + Number(r.contas_potencial))}
                        </td>
                        <td className="numero dado valor-capturado">
                          {formatarValor(Number(r.frentes_capturado) + Number(r.contas_capturado))}
                        </td>
                        <td className="celula-sinais">
                          <Sinal valor={Number(r.contratos_vencidos)} rotulo="vencidos" />
                          <Sinal valor={Number(r.contratos_janela)} rotulo="em janela" />
                          <Sinal valor={Number(r.compromissos_atrasados)} rotulo="atrasados" />
                          {Number(r.contratos_vencidos) +
                            Number(r.contratos_janela) +
                            Number(r.compromissos_atrasados) ===
                            0 && <span className="selo selo-ok">em dia</span>}
                        </td>
                        <td className="numero dado">
                          {dias > 900 ? (
                            <span className="selo selo-neutro">sem registro</span>
                          ) : (
                            <span className={dias > 30 ? "texto-alerta" : undefined}>{dias} d</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="nota">
            Potencial e capturado somam contas e frentes de cada carteira, sempre em colunas
            separadas. Potencial é teto estimado; capturado é o que já se confirmou.
          </p>
        </>
      )}
    </>
  );
}
