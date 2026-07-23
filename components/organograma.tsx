import type { ContatoMapa, NoHierarquia, PapelDecisao, PosturaContato } from "@/lib/decisores";
import { achatar, rotuloInfluencia } from "@/lib/decisores";

/**
 * Organograma da conta, em SVG puro montado no servidor — mesmo padrão
 * dos outros gráficos do produto: sem biblioteca, sem JavaScript no
 * navegador. É leitura, não brinquedo interativo.
 *
 * O desenho é uma árvore deitada: profundidade vai para a direita, uma
 * linha por pessoa. Escolha deliberada — organograma de caixinhas
 * centralizadas fica ilegível com nome comprido e cargo, que é
 * exatamente o que se quer ler aqui. Deitado, o nome tem espaço e a
 * hierarquia continua óbvia pela indentação e pelas linhas.
 */

const LINHA = 34;
const RECUO = 26;
const LARGURA = 720;

export function Organograma({
  arvore,
  papeis,
  posturas,
}: {
  arvore: NoHierarquia[];
  papeis: PapelDecisao[];
  posturas: PosturaContato[];
}) {
  const linhas = achatar(arvore);
  if (linhas.length === 0) return null;

  const papelDe = new Map(papeis.map((p) => [p.id, p]));
  const posturaDe = new Map(posturas.map((p) => [p.id, p]));

  const altura = linhas.length * LINHA + 16;
  const posicaoDe = new Map(linhas.map((n, i) => [n.contato.id, i]));

  const corDoTom = (c: ContatoMapa) => {
    const tom = c.postura_id ? posturaDe.get(c.postura_id)?.tom : undefined;
    if (tom === "favoravel") return "var(--esmeralda-forte)";
    if (tom === "contrario") return "var(--vermelho)";
    return "var(--g300)";
  };

  const descricao = linhas
    .map((n) => {
      const p = n.contato.papel_id ? papelDe.get(n.contato.papel_id)?.rotulo : null;
      return `${n.contato.nome}${p ? `, ${p}` : ""}`;
    })
    .join("; ");

  return (
    <svg
      viewBox={`0 0 ${LARGURA} ${altura}`}
      className="grafico"
      role="img"
      aria-label={`Hierarquia de contatos: ${descricao}`}
    >
      {linhas.map((no, i) => {
        const y = i * LINHA + 20;
        const x = 12 + no.profundidade * RECUO;
        const papel = no.contato.papel_id ? papelDe.get(no.contato.papel_id) : undefined;
        const postura = no.contato.postura_id ? posturaDe.get(no.contato.postura_id) : undefined;

        // Linha de ligação até o chefe: sobe do nó até a altura dele.
        const chefe = no.contato.reporta_a;
        const linhaChefe =
          chefe !== null && posicaoDe.has(chefe) ? posicaoDe.get(chefe)! : null;
        const yChefe = linhaChefe !== null ? linhaChefe * LINHA + 20 : null;

        const detalhe = [
          papel?.rotulo,
          no.contato.cargo,
          no.contato.area,
          postura?.rotulo,
          no.contato.influencia ? rotuloInfluencia(no.contato.influencia) : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <g key={no.contato.id}>
            {yChefe !== null && (
              <path
                d={`M ${x - RECUO + 5} ${yChefe + 4} V ${y} H ${x - 4}`}
                fill="none"
                stroke="var(--g200)"
              />
            )}

            <circle
              cx={x}
              cy={y}
              r={papel?.decide ? 6 : 4}
              fill={corDoTom(no.contato)}
              stroke="var(--branco)"
              strokeWidth="2"
            />

            <text x={x + 14} y={y + 5} className="rotulo-eixo forte">
              {no.contato.nome}
              {papel?.decide && <tspan fill="var(--esmeralda-forte)"> · decide</tspan>}
            </text>

            {detalhe && (
              <text x={x + 14} y={y + 5} dx={medirNome(no.contato.nome, !!papel?.decide)} className="rotulo-eixo">
                {detalhe}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Deslocamento do texto secundário. SVG no servidor não mede texto, então
 * a conta é aproximada pelo número de caracteres — é o suficiente para o
 * detalhe não colar no nome, e um pouco de folga não estraga a leitura.
 */
function medirNome(nome: string, temSelo: boolean): number {
  return nome.length * 7.2 + (temSelo ? 56 : 0) + 14;
}
