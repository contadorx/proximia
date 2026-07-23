import Link from "next/link";
import { Building2, UserCog } from "lucide-react";
import { exigirOrg } from "@/lib/auth";
import { faixaMaturidade, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { formatarValor } from "@/lib/contas";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  ORDENACOES,
  agruparPorResponsavel,
  diasSemMovimento,
  panorama,
  totaisGerais,
  type Ordenacao,
} from "@/lib/panorama";
import { responsabilidades } from "@/lib/responsabilidades";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { SeletorMultiplo } from "@/components/seletor";
import { Distribuicao, Ranking } from "@/components/graficos";
import { paraLista, paraTexto, temFiltro } from "@/lib/consulta";

export const dynamic = "force-dynamic";

export default async function PaginaPanorama({
  searchParams,
}: {
  searchParams: {
    ordem?: string | string[];
    status?: string | string[];
    carteira?: string | string[];
    responsavel?: string | string[];
    lente?: string | string[];
  };
}) {
  const org = await exigirOrg();
  const ordem = (paraTexto(searchParams.ordem) as Ordenacao) ?? "atencao";
  const lente = paraTexto(searchParams.lente) ?? "unidade";

  const supabase = criarClienteServidor();
  const [linhasTodas, pessoas, vinculos, { data: alertasBrutos }, { data: compromissosBrutos }] =
    await Promise.all([
      panorama(org.orgId, ordem),
      pessoasDaOrganizacao(org.orgId),
      responsabilidades({ orgId: org.orgId }),
      supabase
        .from("alertas")
        .select("carteira_id, dono_id, severidade")
        .eq("org_id", org.orgId)
        .eq("status", "aberto"),
      supabase
        .from("compromissos")
        .select("carteira_id, dono_id, vence_em")
        .eq("org_id", org.orgId)
        .eq("status", "aberto"),
    ]);

  const alertas = (alertasBrutos ?? []) as {
    carteira_id: string;
    dono_id: string | null;
    severidade: string;
  }[];
  const compromissos = (compromissosBrutos ?? []) as {
    carteira_id: string;
    dono_id: string | null;
    vence_em: string;
  }[];

  /* ---------- filtros ---------- */

  const filtroCarteiras = paraLista(searchParams.carteira);
  const filtroStatus = paraLista(searchParams.status);
  const filtroPessoas = paraLista(searchParams.responsavel);

  const carteirasDasPessoas = new Set(
    vinculos.filter((v) => filtroPessoas.includes(v.user_id)).map((v) => v.carteira_id),
  );

  const linhas = linhasTodas.filter((l) => {
    if (filtroCarteiras.length && !filtroCarteiras.includes(l.carteira_id)) return false;
    if (filtroStatus.length && !filtroStatus.includes(l.status)) return false;
    if (filtroPessoas.length && !carteirasDasPessoas.has(l.carteira_id)) return false;
    return true;
  });

  const t = totaisGerais(linhas);
  const nome = (id: string | null) =>
    id ? nomePessoa(pessoas.find((p) => p.id === id)) : "sem responsável definido";

  /* ---------- visão de dados ---------- */

  const porAtencao = [
    { rotulo: "Em dia", classe: "ok", quantidade: 0 },
    { rotulo: "Com janela ou atraso", classe: "atencao", quantidade: 0 },
    { rotulo: "Com contrato vencido", classe: "alerta", quantidade: 0 },
  ];
  for (const l of linhas) {
    if (Number(l.contratos_vencidos) > 0) porAtencao[2].quantidade += 1;
    else if (Number(l.contratos_janela) > 0 || Number(l.compromissos_atrasados) > 0)
      porAtencao[1].quantidade += 1;
    else porAtencao[0].quantidade += 1;
  }

  const rankingPotencial = [...linhas]
    .map((l) => ({
      rotulo: l.nome,
      valor: Number(l.frentes_potencial) + Number(l.contas_potencial),
      detalhe: `${l.contas_total} contas · ${l.frentes_abertas} frentes`,
    }))
    .filter((i) => i.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);

  const porResponsavel = agruparPorResponsavel(linhas, vinculos, alertas, compromissos);

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Comparativo</h1>
        </div>
        <div className="cabeca-acoes">
          <Link
            className={lente === "unidade" ? "botao botao-secundario ativo" : "botao botao-secundario"}
            href="/panorama?lente=unidade"
          >
            <Building2 size={15} />
            Por unidade
          </Link>
          <Link
            className={lente === "responsavel" ? "botao botao-secundario ativo" : "botao botao-secundario"}
            href="/panorama?lente=responsavel"
          >
            <UserCog size={15} />
            Por responsável
          </Link>
        </div>
      </div>

      <IntroSecao>
        A mesma operação vista de dois jeitos: <strong>por unidade</strong>, para comparar carteiras
        entre si, e <strong>por responsável</strong>, para ver a carga de cada pessoa. Os filtros e
        os totais valem para as duas.
      </IntroSecao>

      {linhas.length === 0 ? (
        <Vazio
          acao={
            <Link className="botao botao-secundario" href="/carteiras">
              Cadastrar carteira
            </Link>
          }
        >
          {temFiltro(searchParams.carteira, searchParams.responsavel, searchParams.status)
            ? "Nenhuma carteira com esses filtros."
            : "Nenhuma carteira para mostrar ainda."}
        </Vazio>
      ) : (
        <>
          <div className="cartoes">
            <div className="cartao">
              <p className="olho">Carteiras</p>
              <p className="cartao-valor">{t.carteiras}</p>
              <p className="cartao-nota">
                {t.contas} contas · {t.frentes} frentes abertas
              </p>
            </div>
            <div className="cartao">
              <p className="olho">Potencial estimado</p>
              <p className="cartao-valor teto">{formatarValor(t.potencial)}</p>
              <p className="cartao-nota">teto, com origem declarada</p>
            </div>
            {t.protecao > 0 && (
              <div className="cartao">
                <p className="olho">Em proteção</p>
                <p className="cartao-valor" style={{ color: "var(--ambar)" }}>
                  {formatarValor(t.protecao)}
                </p>
                <p className="cartao-nota">contas e frentes de defesa — fora do teto ao lado</p>
              </div>
            )}
            <div className="cartao">
              <p className="olho">Capturado</p>
              <p className="cartao-valor capturado">{formatarValor(t.capturado)}</p>
              <p className="cartao-nota">confirmado, não se soma ao teto</p>
            </div>
            <div className="cartao">
              <p className="olho">Investimento em análise</p>
              <p className="cartao-valor teto">{formatarValor(t.investimento)}</p>
              <p className="cartao-nota">
                {t.oportunidades} oportunidades · {formatarValor(t.resultadoMensal)} por mês
              </p>
            </div>
          </div>

          {(t.vencidos > 0 || t.janela > 0 || t.atrasados > 0) && (
            <div className="tira-alerta">
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
                <Link href="/pendencias">
                  <span className="dado">{t.atrasados}</span> compromissos atrasados
                </Link>
              )}
            </div>
          )}

          <form className="filtros" method="get">
            <input type="hidden" name="lente" value={lente} />
            <SeletorMultiplo
              nome="carteira"
              rotulo="Carteira"
              opcoes={linhasTodas.map((l) => ({
                valor: l.carteira_id,
                rotulo: l.nome,
                detalhe: l.codigo ?? undefined,
              }))}
              inicial={filtroCarteiras}
            />
            <SeletorMultiplo
              nome="responsavel"
              rotulo="Responsável"
              opcoes={pessoas.map((p) => ({ valor: p.id, rotulo: nomePessoa(p) }))}
              inicial={filtroPessoas}
            />
            <SeletorMultiplo
              nome="status"
              rotulo="Situação"
              opcoes={[
                { valor: "ativa", rotulo: "Ativas" },
                { valor: "pausada", rotulo: "Pausadas" },
                { valor: "encerrada", rotulo: "Encerradas" },
              ]}
              inicial={filtroStatus}
            />
            {lente === "unidade" && (
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
            )}
            <button className="botao botao-secundario" type="submit">
              Aplicar
            </button>
          </form>

          <div className="duas-colunas">
            <section className="painel">
              <h2>Onde está o potencial</h2>
              {rankingPotencial.length === 0 ? (
                <Vazio>Nenhum potencial estimado registrado ainda.</Vazio>
              ) : (
                <Ranking itens={rankingPotencial} />
              )}
            </section>

            <section className="painel">
              <h2>Como está a rede</h2>
              <Distribuicao faixas={porAtencao} />
              <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
                Uma carteira entra em vermelho quando tem contrato vencido; em âmbar quando tem
                janela aberta ou compromisso atrasado.
              </p>
            </section>
          </div>

          {lente === "unidade" ? (
            <div className="painel sem-recheio">
              <div className="tabela-rolagem">
                <table className="tabela-panorama">
                  <thead>
                    <tr>
                      <th>Carteira</th>
                      <th className="numero">Contas</th>
                      <th className="numero">Frentes</th>
                      <th className="numero">Oportunidades</th>
                      <th className="numero">Potencial</th>
                      <th className="numero">Capturado</th>
                      <th>Atenção</th>
                      <th className="numero">Parada há</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((r) => {
                      const dias = diasSemMovimento(r);
                      const faixa = faixaMaturidade(r.score_maturidade);
                      const responsaveis = vinculos
                        .filter((v) => v.carteira_id === r.carteira_id)
                        .map((v) => nome(v.user_id));
                      return (
                        <tr key={r.carteira_id}>
                          <td>
                            <Link href={`/carteiras/${r.carteira_id}`}>{r.nome}</Link>
                            <span className="celula-sub">
                              {[
                                r.codigo,
                                responsaveis.length > 0 ? responsaveis.join(", ") : "sem responsável",
                                r.score_maturidade !== null
                                  ? `maturidade ${Number(r.score_maturidade).toFixed(0)}${faixa ? ` · ${faixa.toLowerCase()}` : ""}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </td>
                          <td className="numero dado">{r.contas_total}</td>
                          <td className="numero dado">{r.frentes_abertas}</td>
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
                            {Number(r.contratos_vencidos) > 0 && (
                              <span className="selo selo-falta">
                                <span className="dado">{r.contratos_vencidos}</span> vencidos
                              </span>
                            )}
                            {Number(r.contratos_janela) > 0 && (
                              <span className="selo selo-atencao">
                                <span className="dado">{r.contratos_janela}</span> em janela
                              </span>
                            )}
                            {Number(r.compromissos_atrasados) > 0 && (
                              <span className="selo selo-falta">
                                <span className="dado">{r.compromissos_atrasados}</span> atrasados
                              </span>
                            )}
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
          ) : (
            <div className="painel sem-recheio">
              <div className="tabela-rolagem">
                <table className="tabela-panorama">
                  <thead>
                    <tr>
                      <th>Responsável</th>
                      <th className="numero">Carteiras</th>
                      <th className="numero">Alertas</th>
                      <th className="numero">Atrasados</th>
                      <th className="numero">Contratos</th>
                      <th className="numero">Potencial</th>
                      <th className="numero">Paradas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porResponsavel.map((r) => (
                      <tr key={r.userId ?? "sem-dono"}>
                        <td>
                          <strong>{nome(r.userId)}</strong>
                          <span className="celula-sub">
                            {r.carteiras.map((c) => c.codigo ?? c.nome).join(", ")}
                          </span>
                        </td>
                        <td className="numero dado">{r.carteiras.length}</td>
                        <td className="numero dado">
                          {r.alertasAbertos}
                          {r.alertasAltos > 0 && (
                            <span className="celula-sub texto-alerta">{r.alertasAltos} altos</span>
                          )}
                        </td>
                        <td className="numero dado">
                          <span className={r.compromissosAtrasados > 0 ? "texto-alerta" : undefined}>
                            {r.compromissosAtrasados}
                          </span>
                        </td>
                        <td className="numero dado">
                          {r.contratosVencidos + r.contratosJanela === 0 ? (
                            "—"
                          ) : (
                            <>
                              {r.contratosVencidos + r.contratosJanela}
                              <span className="celula-sub">
                                {r.contratosVencidos} vencidos · {r.contratosJanela} em janela
                              </span>
                            </>
                          )}
                        </td>
                        <td className="numero dado valor-teto">{formatarValor(r.potencial)}</td>
                        <td className="numero dado">
                          <span className={r.parada > 0 ? "texto-alerta" : undefined}>{r.parada}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="nota">
            {lente === "responsavel"
              ? "Uma carteira aparece na linha de cada pessoa que responde por ela — a unidade com responsável local e apoio corporativo conta para os dois. Por isso a soma de potencial por pessoa não é o total da rede: o que se compara aqui é carga, não mérito."
              : "Potencial e capturado somam contas e frentes de cada carteira, sempre em colunas separadas. Potencial é teto estimado; capturado é o que já se confirmou."}
          </p>
        </>
      )}
    </>
  );
}
