import { formatarValor } from "@/lib/contas";
import type { MesCaptura } from "@/lib/captura";

/**
 * Gráficos em SVG puro, montados no servidor. Sem biblioteca e sem
 * JavaScript no navegador: são leituras, não brinquedos interativos.
 */

export function BarrasMensais({ serie }: { serie: MesCaptura[] }) {
  const maior = Math.max(1, ...serie.map((p) => p.valor));
  const largura = 720;
  const altura = 180;
  const base = altura - 26;
  const passo = largura / serie.length;
  const larguraBarra = Math.min(38, passo * 0.6);

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="grafico" role="img"
      aria-label="Valor confirmado por mês nos últimos doze meses">
      <line x1="0" y1={base} x2={largura} y2={base} stroke="var(--g200)" />

      {serie.map((p, i) => {
        const alturaBarra = p.valor === 0 ? 0 : Math.max(3, (p.valor / maior) * (base - 18));
        const x = i * passo + (passo - larguraBarra) / 2;
        const destaque = i === serie.length - 1;
        return (
          <g key={p.mes}>
            {p.valor > 0 && (
              <rect
                x={x}
                y={base - alturaBarra}
                width={larguraBarra}
                height={alturaBarra}
                rx="3"
                fill={destaque ? "var(--esmeralda)" : "var(--esmeralda-pale)"}
                stroke={destaque ? "var(--esmeralda)" : "#c4e8d7"}
              />
            )}
            <text
              x={i * passo + passo / 2}
              y={altura - 8}
              textAnchor="middle"
              className={destaque ? "rotulo-eixo forte" : "rotulo-eixo"}
            >
              {p.rotulo}
            </text>
          </g>
        );
      })}

      <text x="0" y="12" className="rotulo-eixo">
        pico {formatarValor(maior)}
      </text>
    </svg>
  );
}

export function Distribuicao({
  faixas,
}: {
  faixas: { rotulo: string; quantidade: number; classe: string }[];
}) {
  const total = faixas.reduce((t, f) => t + f.quantidade, 0);
  if (total === 0) return null;

  return (
    <>
      <div className="barra-composta" role="img" aria-label="Distribuição por faixa">
        {faixas
          .filter((f) => f.quantidade > 0)
          .map((f) => (
            <span
              key={f.rotulo}
              className={`fatia ${f.classe}`}
              style={{ width: `${(f.quantidade / total) * 100}%` }}
              title={`${f.rotulo}: ${f.quantidade}`}
            />
          ))}
      </div>
      <ul className="legenda">
        {faixas.map((f) => (
          <li key={f.rotulo}>
            <span className={`ponto ${f.classe}`} />
            {f.rotulo}
            <span className="dado">{f.quantidade}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Funil({
  etapas,
}: {
  etapas: { rotulo: string; quantidade: number; valor: number }[];
}) {
  const maior = Math.max(1, ...etapas.map((e) => e.quantidade));

  return (
    <ul className="funil">
      {etapas.map((e) => (
        <li key={e.rotulo}>
          <span className="funil-rotulo">{e.rotulo}</span>
          <span className="funil-barra">
            <span style={{ width: `${Math.max(4, (e.quantidade / maior) * 100)}%` }}>
              {e.quantidade > 0 && <em>{e.quantidade}</em>}
            </span>
          </span>
          <span className="funil-valor dado">{e.valor > 0 ? formatarValor(e.valor) : "—"}</span>
        </li>
      ))}
    </ul>
  );
}

/** Ranking horizontal. Serve para comparar carteiras ou pessoas na mesma escala. */
export function Ranking({
  itens,
  formato = "valor",
}: {
  itens: { rotulo: string; valor: number; detalhe?: string; href?: string }[];
  formato?: "valor" | "numero";
}) {
  const maior = Math.max(1, ...itens.map((i) => i.valor));

  return (
    <ul className="ranking">
      {itens.map((i) => (
        <li key={i.rotulo}>
          <span className="ranking-rotulo">
            {i.rotulo}
            {i.detalhe && <span className="celula-sub">{i.detalhe}</span>}
          </span>
          <span className="ranking-barra">
            <span style={{ width: `${Math.max(2, (i.valor / maior) * 100)}%` }} />
          </span>
          <span className="ranking-valor dado">
            {formato === "valor" ? formatarValor(i.valor) : i.valor.toLocaleString("pt-BR")}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Duas séries no mesmo eixo, uma para cima e outra para baixo.
 *
 * Serve para pares que se cancelam — alertas abertos contra resolvidos.
 * Empilhar seria pior: o que interessa é a diferença entre as duas, e
 * espelhá-las em torno da linha zero deixa isso imediato.
 */
export function BarrasEspelhadas({
  meses,
  acima,
  abaixo,
  rotuloAcima,
  rotuloAbaixo,
}: {
  meses: { rotulo: string }[];
  acima: number[];
  abaixo: number[];
  rotuloAcima: string;
  rotuloAbaixo: string;
}) {
  const maior = Math.max(1, ...acima, ...abaixo);
  const largura = 720;
  const altura = 190;
  const meio = 92;
  const passo = largura / Math.max(1, meses.length);
  const larguraBarra = Math.min(30, passo * 0.5);

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="grafico" role="img"
      aria-label={`${rotuloAcima} e ${rotuloAbaixo} por mês`}>
      <line x1="0" y1={meio} x2={largura} y2={meio} stroke="var(--g300)" />

      {meses.map((m, i) => {
        const x = i * passo + (passo - larguraBarra) / 2;
        const alturaCima = (acima[i] / maior) * (meio - 16);
        const alturaBaixo = (abaixo[i] / maior) * (meio - 30);
        return (
          <g key={i}>
            {acima[i] > 0 && (
              <rect x={x} y={meio - alturaCima} width={larguraBarra} height={alturaCima} rx="2"
                fill="var(--vermelho-pale)" stroke="#f3d5c6" />
            )}
            {abaixo[i] > 0 && (
              <rect x={x} y={meio} width={larguraBarra} height={alturaBaixo} rx="2"
                fill="var(--esmeralda-pale)" stroke="#c4e8d7" />
            )}
            <text x={i * passo + passo / 2} y={altura - 6} textAnchor="middle" className="rotulo-eixo">
              {m.rotulo}
            </text>
          </g>
        );
      })}

      <text x="0" y="12" className="rotulo-eixo" fill="var(--vermelho)">
        {rotuloAcima}
      </text>
      <text x="0" y={altura - 24} className="rotulo-eixo" fill="var(--esmeralda-forte)">
        {rotuloAbaixo}
      </text>
    </svg>
  );
}
