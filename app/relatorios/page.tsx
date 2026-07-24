import Link from "next/link";
import { Printer } from "lucide-react";
import { exigirOrg } from "@/lib/auth";
import { listarCarteiras } from "@/lib/carteiras";
import { formatarValor } from "@/lib/contas";
import { capturaMensal, capturaSemData } from "@/lib/captura";
import { rotuloTipo as rotuloRegistro, TIPOS_REGISTRO } from "@/lib/registros";
import { fasesConfiguradas } from "@/lib/pipeline";
import { panorama, totaisGerais } from "@/lib/panorama";
import {
  alertasMensais,
  alinhar,
  conversaoPorCarteira,
  esforcoMensal,
  fotosMensais,
  janela,
  temposPorEtapa,
  vencimentosMensais,
} from "@/lib/relatorios";
import {
  MINIMO_FECHADAS,
  agregarPorFase,
  conversaoPorFase,
  formatarIntervalo,
  formatarTaxa,
} from "@/lib/conversao";
import {
  MINIMO_PARA_CONCLUIR,
  defasagemPorCarteira,
  formatarDias,
  lerDefasagem,
  leituraGeral,
} from "@/lib/defasagem";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { SeletorMultiplo } from "@/components/seletor";
import { BarrasEspelhadas, BarrasMensais, Ranking } from "@/components/graficos";
import { paraLista } from "@/lib/consulta";

export const dynamic = "force-dynamic";

export default async function PaginaRelatorios({
  searchParams,
}: {
  searchParams: { carteira?: string | string[] };
}) {
  const org = await exigirOrg();
  const filtro = paraLista(searchParams.carteira);

  // O filtro de carteira vale para TODAS as seções. Antes, captura e
  // tempo por etapa ignoravam o recorte em silêncio — quem filtrava uma
  // carteira lia dois números da rede inteira sem aviso.
  const [carteiras, serie, semData, alertas, esforco, defasagem, conversaoFases, resumoCarteiras, vencimentos, conversao, etapas, fotos, fases] =
    await Promise.all([
      listarCarteiras(org.orgId),
      capturaMensal(org.orgId, 12, filtro),
      capturaSemData(org.orgId, filtro),
      alertasMensais(org.orgId, filtro),
      esforcoMensal(org.orgId, filtro),
      defasagemPorCarteira(org.orgId, filtro),
      conversaoPorFase(org.orgId, filtro),
      panorama(org.orgId, "nome"),
      vencimentosMensais(org.orgId, filtro),
      conversaoPorCarteira(org.orgId, filtro),
      temposPorEtapa(org.orgId, filtro),
      fotosMensais(org.orgId, filtro),
      fasesConfiguradas(org.orgId),
    ]);

  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";
  const nomeFase = (f: string) => fases.find((x) => x.fase === f)?.rotulo ?? f;

  const doze = janela(12);
  const proximos = janela(13, 6); // seis meses atrás até seis à frente

  const abertos = alinhar(alertas, doze, (l) => Number(l.abertos));
  const resolvidos = alinhar(alertas, doze, (l) => Number(l.resolvidos));

  const porTipo = TIPOS_REGISTRO.map((t) => ({
    rotulo: t.rotulo,
    valor: esforco
      .filter((e) => e.tipo === t.valor)
      .reduce((soma, e) => soma + Number(e.quantidade), 0),
  })).filter((t) => t.valor > 0);

  const esforcoPorMes = alinhar(esforco, doze, (l) => Number(l.quantidade));
  const geral = leituraGeral(defasagem);
  const taxasPorFase = agregarPorFase(conversaoFases, fases.map((f) => f.fase));
  const totais = totaisGerais(resumoCarteiras);
  const totalEsforco = esforcoPorMes.reduce((a, b) => a + b, 0);

  const calendario = proximos.map((m) => {
    const linha = vencimentos.find((v) => String(v.mes).slice(0, 7) === m.mes);
    return {
      ...m,
      contratos: Number(linha?.contratos ?? 0),
      valor: Number(linha?.valor_base ?? 0),
      vencidos: Number(linha?.ja_vencidos ?? 0),
      automaticos: Number(linha?.com_renovacao_automatica ?? 0),
    };
  });

  const totalConversao = conversao.reduce(
    (t, c) => ({
      ganhas: t.ganhas + Number(c.ganhas),
      perdidas: t.perdidas + Number(c.perdidas),
      andamento: t.andamento + Number(c.em_andamento),
    }),
    { ganhas: 0, perdidas: 0, andamento: 0 },
  );
  const encerradas = totalConversao.ganhas + totalConversao.perdidas;

  const mesesComFoto = new Set(fotos.map((f) => String(f.referencia).slice(0, 7))).size;

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Relatórios</h1>
        </div>
        <div className="cabeca-acoes nao-imprimir">
          <Link className="botao botao-secundario" href="/panorama">
            Ver comparativo
          </Link>
          <Link className="botao botao-secundario" href="/relatorios/exportacao">
            Exportar dados
          </Link>
          <Link className="botao botao-secundario" href="/relatorios/cobertura">
            Cobertura por conta
          </Link>
          <Link className="botao botao-secundario" href="/historico">
            Histórico completo
          </Link>
        </div>
      </div>

      <IntroSecao>
        Aqui é para <strong>entender</strong>, não para trabalhar — o que pede ação está em Pendências.
        Os números saem do que já foi registrado; nenhum deles pede digitação nova.
      </IntroSecao>

      <form className="filtros nao-imprimir" method="get">
        <SeletorMultiplo
          nome="carteira"
          rotulo="Carteira"
          opcoes={carteiras.map((c) => ({
            valor: c.id,
            rotulo: c.nome,
            detalhe: c.codigo ?? undefined,
          }))}
          inicial={filtro}
        />
        <button className="botao botao-secundario" type="submit">
          Aplicar
        </button>
        <span className="passos-contagem">
          <Printer size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />
          use a impressão do navegador para gerar PDF
        </span>
      </form>

      {/* ---------- vencimentos ---------- */}
      <section className="painel">
        <div className="linha-titulo">
          <h2>Calendário de vencimentos</h2>
          <span className="passos-contagem">seis meses atrás e seis à frente</span>
        </div>

        {calendario.every((m) => m.contratos === 0) ? (
          <Vazio>Nenhum contrato com data de fim nessa janela.</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela-panorama">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="numero">Contratos</th>
                  <th className="numero">Valor base</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {calendario
                  .filter((m) => m.contratos > 0)
                  .map((m) => (
                    <tr key={m.mes}>
                      <td>
                        <strong>{m.rotulo}</strong>
                        <span className="celula-sub">{m.mes}</span>
                      </td>
                      <td className="numero dado">{m.contratos}</td>
                      <td className="numero dado valor-teto">{formatarValor(m.valor)}</td>
                      <td className="celula-sinais">
                        {m.vencidos > 0 && (
                          <span className="selo selo-falta">
                            <span className="dado">{m.vencidos}</span> já vencidos
                          </span>
                        )}
                        {m.automaticos > 0 && (
                          <span className="selo selo-neutro">
                            <span className="dado">{m.automaticos}</span> renovam sozinhos
                          </span>
                        )}
                        {m.vencidos === 0 && m.automaticos === 0 && (
                          <span className="selo selo-atencao">exige decisão</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
          Contrato vencido e não tratado continua no calendário de propósito: sumir da vista é como
          decisão pendente vira decisão tomada por esquecimento.
        </p>
      </section>

      {/* ---------- captura ---------- */}
      <section className="painel">
        <h2>Captura confirmada por mês</h2>
        {serie.every((p) => p.valor === 0) ? (
          <Vazio>Nada confirmado com data ainda.</Vazio>
        ) : (
          <BarrasMensais serie={serie} />
        )}
        {semData > 0 && (
          <p className="nota" style={{ marginTop: 12, marginBottom: 0 }}>
            <span className="dado">{formatarValor(semData)}</span> de captura sem data de confirmação
            não entra nesta curva.
          </p>
        )}
      </section>

      {/* ---------- alertas ---------- */}
      <section className="painel">
        <div className="linha-titulo">
          <h2>A operação drena ou acumula?</h2>
          <span className="passos-contagem">
            {abertos.reduce((a, b) => a + b, 0)} abertos · {resolvidos.reduce((a, b) => a + b, 0)}{" "}
            resolvidos no período
          </span>
        </div>

        {abertos.every((n) => n === 0) && resolvidos.every((n) => n === 0) ? (
          <Vazio>Nenhum alerta registrado no período.</Vazio>
        ) : (
          <>
            <BarrasEspelhadas
              meses={doze}
              acima={abertos}
              abaixo={resolvidos}
              rotuloAcima="ABERTOS"
              rotuloAbaixo="RESOLVIDOS"
            />
            <p className="nota" style={{ marginTop: 12, marginBottom: 0 }}>
              Vinte alertas abertos tendo resolvido trinta é uma situação; vinte tendo resolvido dois
              é outra. É a diferença entre as duas barras que conta, não a altura de uma delas.
            </p>
          </>
        )}
      </section>

      {/* ---------- esforço ---------- */}
      <div className="duas-colunas">
        <section className="painel">
          <div className="linha-titulo">
            <h2>Esforço registrado</h2>
            <span className="passos-contagem">{totalEsforco} registros em 12 meses</span>
          </div>
          {porTipo.length === 0 ? (
            <Vazio>Nada registrado no período.</Vazio>
          ) : (
            <>
              <Ranking itens={porTipo} formato="numero" />
              <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
                É a prova de trabalho da equipe — e vinha sendo guardada sem nunca ser somada.
              </p>
            </>
          )}
        </section>

        <section className="painel">
          <div className="linha-titulo">
            <h2>Onde o funil trava</h2>
            <span className="passos-contagem">tempo médio por etapa encerrada</span>
          </div>
          {etapas.length === 0 ? (
            <Vazio>
              Ainda não há passagem de etapa encerrada. A medição começou agora — cada avanço de
              oportunidade passa a alimentar esta leitura.
            </Vazio>
          ) : (
            <Ranking
              itens={etapas
                .filter((e) => e.dias_medio !== null)
                .sort((a, b) => Number(b.dias_medio) - Number(a.dias_medio))
                .map((e) => ({
                  rotulo: nomeFase(e.fase),
                  valor: Number(e.dias_medio),
                  detalhe: `${e.passagens} passagens · mediana ${e.dias_mediana ?? "—"} d · máximo ${e.dias_maximo ?? "—"} d`,
                }))}
              formato="numero"
            />
          )}
        </section>
      </div>

      {/* ---------- base sob gestão ---------- */}
      {totais.base > 0 && (
        <section className="painel">
          <div className="linha-titulo">
            <h2>Base sob gestão</h2>
            <span className="passos-contagem">
              {totais.contasComReceita} conta(s) com receita informada
            </span>
          </div>

          <div className="cartoes">
            <div className="cartao">
              <p className="olho">O que os clientes já pagam</p>
              <p className="cartao-valor">{formatarValor(totais.base)}</p>
              <p className="cartao-nota">soma das contas ativas com receita informada</p>
            </div>
            <div className="cartao">
              <p className="olho">Confirmado no período</p>
              <p className="cartao-valor capturado">{formatarValor(totais.capturado)}</p>
              <p className="cartao-nota">captura de iniciativas — número à parte da base</p>
            </div>
          </div>

          <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
            {/* O produto mostra os dois e não divide um pelo outro. A razão
                seria fácil de calcular e viraria placar por unidade — que é
                meta com outro nome, e é o que este produto recusa. */}
            Manter o que já existe é trabalho de gestão tanto quanto capturar valor novo: contrato
            que vence sem renegociação e cliente que migra para fonte própria são perdas que não
            aparecem em lugar nenhum se a base não estiver à vista.{" "}
            <strong>Os dois números não se somam e não se dividem</strong> — a base é o que se
            defende, a captura é o que se conquistou, e comparar as duas é leitura de quem lê, não
            conta do sistema.
          </p>
        </section>
      )}

      {/* ---------- conversão observada por fase ---------- */}
      <section className="painel">
        <div className="linha-titulo">
          <h2>Onde as oportunidades fecham</h2>
          <span className="passos-contagem">conversão observada, não estimada</span>
        </div>

        {taxasPorFase.length === 0 ? (
          <Vazio>
            Nenhuma oportunidade passou por uma fase ainda. A medição começa com o uso — cada
            avanço e cada encerramento alimenta esta leitura.
          </Vazio>
        ) : (
          <>
            <ul className="lista-estado">
              {taxasPorFase.map((t) => (
                <li key={t.fase}>
                  <span className="rotulo">
                    {nomeFase(t.fase)}
                    <span className="dica">
                      {[
                        t.frase,
                        t.intervalo ? formatarIntervalo(t.intervalo) : null,
                        t.emJogo > 0 ? `${t.emJogo} ainda em jogo` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span
                    className={
                      t.confianca === "medida"
                        ? "selo selo-ok"
                        : t.confianca === "indicio"
                          ? "selo selo-neutro"
                          : "selo selo-falta"
                    }
                  >
                    {t.taxa === null ? "sem base" : formatarTaxa(t.taxa)}
                  </span>
                </li>
              ))}
            </ul>

            <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
              De quantas oportunidades que passaram por cada fase e <strong>já fecharam</strong>,
              quantas terminaram ganhas — na história desta organização, não em percentual digitado
              por alguém. Oportunidade viva não é vitória nem derrota: fica contada à parte. Abaixo
              de {MINIMO_FECHADAS} encerramentos a leitura não afirma taxa, e entre 10 e 29 ela é
              indício, não medida — daí o intervalo ao lado, que é o quanto o número pode variar
              com essa amostra.{" "}
              <strong>Não multiplicamos isto por valor</strong>: cifra ponderada única é o começo
              de uma meta com outro nome.
            </p>
          </>
        )}
      </section>

      {/* ---------- defasagem de registro ---------- */}
      <section className="painel">
        <div className="linha-titulo">
          <h2>Do que aconteceu até o que foi digitado</h2>
          <span className="passos-contagem">
            {geral.registros} registro(s) em 12 meses
          </span>
        </div>

        {geral.medianaPonderada === null ? (
          <Vazio>
            Ainda não há registro suficiente para medir. Abaixo de {MINIMO_PARA_CONCLUIR} registros
            numa carteira, qualquer número aqui seria anedota.
          </Vazio>
        ) : (
          <>
            <p className="chamada">
              Na média da operação, o registro chega{" "}
              <strong>{formatarDias(geral.medianaPonderada)}</strong> depois de a conversa
              acontecer.
              {geral.carteirasCriticas > 0
                ? ` ${geral.carteirasCriticas} carteira(s) passam de cinco dias.`
                : " Nenhuma carteira passa de cinco dias."}
            </p>

            <ul className="lista-estado">
              {defasagem
                .slice()
                .sort((a, b) => Number(b.dias_mediana ?? -1) - Number(a.dias_mediana ?? -1))
                .map((d) => {
                  const leitura = lerDefasagem(d);
                  return (
                    <li key={d.carteira_id}>
                      <span className="rotulo">
                        {nomeCarteira(d.carteira_id)}
                        <span className="dica">
                          {[
                            `${d.registros} registro(s)`,
                            `${d.no_mesmo_dia} no mesmo dia`,
                            d.acima_de_uma_semana > 0
                              ? `${d.acima_de_uma_semana} acima de uma semana`
                              : null,
                            d.dias_p90 !== null ? `9 em 10 até ${formatarDias(d.dias_p90)}` : null,
                            d.registros_antecipados > 0
                              ? `${d.registros_antecipados} anotado(s) antes de acontecer`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className={leitura.classe}>{leitura.rotulo}</span>
                    </li>
                  );
                })}
            </ul>

            <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
              A conta é a distância entre <strong>quando aconteceu</strong> e{" "}
              <strong>quando foi digitado</strong> — duas datas que o produto já guardava e nunca
              tinha somado. Serve para decidir se registro em campo é problema de verdade antes de
              construir qualquer coisa para resolvê-lo: até dois dias não há o que fazer; de três a
              cinco, o caminho curto é concluir o compromisso e registrar no mesmo movimento; acima
              disso, vale olhar a carteira antes de investir em ferramenta. A medida é por carteira
              e não por pessoa, de propósito — ela diz onde olhar, não em quem.
            </p>
          </>
        )}
      </section>

      {/* ---------- conversão ---------- */}
      <section className="painel">
        <div className="linha-titulo">
          <h2>Conversão por carteira</h2>
          <span className="passos-contagem">
            {encerradas === 0
              ? "nada encerrado ainda"
              : `${Math.round((totalConversao.ganhas / encerradas) * 100)}% de aproveitamento geral`}
          </span>
        </div>

        {conversao.length === 0 ? (
          <Vazio>Nenhuma oportunidade registrada.</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela-panorama">
              <thead>
                <tr>
                  <th>Carteira</th>
                  <th className="numero">Em andamento</th>
                  <th className="numero">Ganhas</th>
                  <th className="numero">Perdidas</th>
                  <th className="numero">Aproveitamento</th>
                  <th className="numero">Em jogo</th>
                </tr>
              </thead>
              <tbody>
                {conversao.map((c) => {
                  const enc = Number(c.ganhas) + Number(c.perdidas);
                  return (
                    <tr key={c.carteira_id}>
                      <td>
                        <Link href={`/carteiras/${c.carteira_id}`}>
                          {nomeCarteira(c.carteira_id)}
                        </Link>
                      </td>
                      <td className="numero dado">{c.em_andamento}</td>
                      <td className="numero dado valor-capturado">{c.ganhas}</td>
                      <td className="numero dado">{c.perdidas}</td>
                      <td className="numero dado">
                        {enc === 0 ? (
                          <span className="celula-sub" style={{ marginTop: 0 }}>
                            sem encerradas
                          </span>
                        ) : (
                          `${Math.round((Number(c.ganhas) / enc) * 100)}%`
                        )}
                      </td>
                      <td className="numero dado valor-teto">
                        {formatarValor(c.investimento_em_jogo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
          O aproveitamento considera apenas o que saiu do funil. Carteira sem nenhuma encerrada
          aparece como &ldquo;sem encerradas&rdquo; em vez de zero — zero afirmaria que tudo se
          perdeu.
        </p>
      </section>

      {/* ---------- evolução ---------- */}
      <section className="painel">
        <div className="linha-titulo">
          <h2>Evolução das carteiras</h2>
          <span className="passos-contagem">{mesesComFoto} mês(es) com foto</span>
        </div>

        {fotos.length === 0 ? (
          <Vazio>
            A primeira foto será tirada pela rotina diária. Até aqui o sistema guardava só o estado
            de agora, e por isso não há passado para mostrar — daqui para frente, cada mês fica
            registrado.
          </Vazio>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela-panorama">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Carteira</th>
                  <th className="numero">Potencial</th>
                  <th className="numero">Capturado</th>
                  <th className="numero">Alertas</th>
                  <th className="numero">Vencidos</th>
                </tr>
              </thead>
              <tbody>
                {fotos
                  .sort((a, b) => String(b.referencia).localeCompare(String(a.referencia)))
                  .slice(0, 40)
                  .map((f) => (
                    <tr key={`${f.carteira_id}-${f.referencia}`}>
                      <td className="dado">{String(f.referencia).slice(0, 7)}</td>
                      <td>{nomeCarteira(f.carteira_id)}</td>
                      <td className="numero dado valor-teto">
                        {formatarValor(Number(f.contas_potencial) + Number(f.frentes_potencial))}
                      </td>
                      <td className="numero dado valor-capturado">
                        {formatarValor(Number(f.contas_capturado) + Number(f.frentes_capturado))}
                      </td>
                      <td className="numero dado">{f.alertas_abertos}</td>
                      <td className="numero dado">
                        <span className={Number(f.contratos_vencidos) > 0 ? "texto-alerta" : undefined}>
                          {f.contratos_vencidos}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="nota nao-imprimir">
        Todos os números vêm de registro, não de digitação avulsa. Para levar embora em planilha, use{" "}
        <Link href="/configuracoes/exportacao">a exportação</Link>.
      </p>
    </>
  );
}
