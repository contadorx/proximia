import Link from "next/link";
import { Printer } from "lucide-react";
import { exigirOrg } from "@/lib/auth";
import { listarCarteiras } from "@/lib/carteiras";
import { formatarValor } from "@/lib/contas";
import { capturaMensal, capturaSemData } from "@/lib/captura";
import { rotuloTipo as rotuloRegistro, TIPOS_REGISTRO } from "@/lib/registros";
import { fasesConfiguradas } from "@/lib/pipeline";
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
  const [carteiras, serie, semData, alertas, esforco, vencimentos, conversao, etapas, fotos, fases] =
    await Promise.all([
      listarCarteiras(org.orgId),
      capturaMensal(org.orgId, 12, filtro),
      capturaSemData(org.orgId, filtro),
      alertasMensais(org.orgId, filtro),
      esforcoMensal(org.orgId, filtro),
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
