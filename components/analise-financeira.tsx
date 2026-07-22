import Link from "next/link";
import { formatarValor } from "@/lib/contas";
import { financeiroDa, formatarMeses, formatarTaxa, leitura } from "@/lib/financeiro";

/**
 * Análise financeira de uma oportunidade.
 *
 * Mostra as duas leituras lado a lado — a que ignora o tempo e a que
 * desconta — porque a diferença entre elas é a informação. Payback
 * simples de 20 meses e descontado de 22 não muda decisão; simples de 30
 * e descontado que não chega dentro do horizonte muda.
 */
export async function AnaliseFinanceira({ oportunidadeId }: { oportunidadeId: string }) {
  const f = await financeiroDa(oportunidadeId);

  if (!f || f.investimento === null) {
    return (
      <section className="painel">
        <h2>Análise financeira</h2>
        <p className="nota" style={{ marginBottom: 0 }}>
          Informe investimento e retorno mensal na ficha para o sistema calcular valor presente,
          taxa de retorno e payback descontado.
        </p>
      </section>
    );
  }

  const l = leitura(f);
  const vplPositivo = f.vpl !== null && Number(f.vpl) > 0;

  return (
    <section className="painel">
      <div className="linha-titulo">
        <h2>Análise financeira</h2>
        <span className="passos-contagem">
          custo de capital {formatarTaxa(f.taxa_anual)} ·{" "}
          <Link className="link-acao" href="/configuracoes/pipeline">
            ajustar
          </Link>
        </span>
      </div>

      <p className={l.tom === "alerta" ? "aviso aviso-erro" : l.tom === "ok" ? "aviso aviso-ok" : "aviso"}>
        {l.texto}
      </p>

      <div className="cartoes">
        <div className="cartao">
          <p className="olho">Valor presente líquido</p>
          <p className={vplPositivo ? "cartao-valor capturado" : "cartao-valor alerta"}>
            {formatarValor(f.vpl)}
          </p>
          <p className="cartao-nota">quanto vale hoje, já descontado o tempo</p>
        </div>
        <div className="cartao">
          <p className="olho">Taxa interna de retorno</p>
          <p className="cartao-valor">
            {f.tir_anual_pct === null
              ? "não tem"
              : `${Number(f.tir_anual_pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
          </p>
          <p className="cartao-nota">
            {f.tir_anual_pct === null
              ? "o fluxo não cobre o investimento"
              : `contra ${formatarTaxa(f.taxa_anual)} exigidos`}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Payback descontado</p>
          <p className={f.paga_no_horizonte ? "cartao-valor" : "cartao-valor alerta"}>
            {formatarMeses(f.payback_descontado)}
          </p>
          <p className="cartao-nota">
            {f.payback_descontado === null
              ? "não se paga em nenhum prazo"
              : f.paga_no_horizonte
                ? `simples: ${formatarMeses(f.payback_simples)}`
                : `depois dos ${f.horizonte_meses} meses declarados`}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Índice de lucratividade</p>
          <p className="cartao-valor">
            {f.indice_lucratividade === null
              ? "—"
              : Number(f.indice_lucratividade).toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
          </p>
          <p className="cartao-nota">valor presente devolvido por real investido</p>
        </div>
      </div>

      <div className="tabela-rolagem">
        <table className="folha-tabela">
          <thead>
            <tr>
              <th>No horizonte de {f.horizonte_meses} meses</th>
              <th className="numero">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Investimento na entrada</td>
              <td className="numero dado">{formatarValor(f.investimento)}</td>
            </tr>
            <tr>
              <td>Custo operacional acumulado</td>
              <td className="numero dado">
                {formatarValor(Number(f.custo_mensal) * f.horizonte_meses)}
              </td>
            </tr>
            <tr>
              <td>
                <strong>Custo total</strong>
              </td>
              <td className="numero dado">
                <strong>{formatarValor(f.custo_total_horizonte)}</strong>
              </td>
            </tr>
            <tr>
              <td>Retorno bruto acumulado</td>
              <td className="numero dado valor-capturado">
                {formatarValor(f.retorno_bruto_horizonte)}
              </td>
            </tr>
            <tr>
              <td>Resultado mensal líquido</td>
              <td className="numero dado">{formatarValor(f.resultado_mensal)}</td>
            </tr>
            <tr>
              <td>Retorno simples sobre o investimento</td>
              <td className="numero dado">
                {f.retorno_percentual === null
                  ? "—"
                  : `${Number(f.retorno_percentual).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="nota" style={{ marginTop: 16, marginBottom: 0 }}>
        As contas assumem <strong>fluxo constante</strong>: o investimento na entrada e o mesmo
        resultado líquido todo mês, pelo horizonte declarado. É a forma do dado que o produto
        coleta — supor mais precisão do que isso seria falso rigor. Os números são apoio à decisão,
        não decisão.
      </p>
    </section>
  );
}
