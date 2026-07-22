import Link from "next/link";

export type Passo = {
  chave: string;
  titulo: string;
  descricao: string;
  cta: string;
  href: string;
  feito: boolean;
  opcional?: boolean;
};

/**
 * Primeiros passos com deteccao real: cada etapa aparece concluida porque o
 * dado existe, nunca porque alguem marcou. Some quando tudo essencial estiver
 * feito — nao fica ocupando espaco para sempre.
 */
export function PrimeirosPassos({ passos }: { passos: Passo[] }) {
  const essenciais = passos.filter((p) => !p.opcional);
  if (essenciais.every((p) => p.feito)) return null;

  const feitos = passos.filter((p) => p.feito).length;
  const proximo = passos.find((p) => !p.feito);

  return (
    <section className="painel painel-destaque">
      <div className="passos-cabeca">
        <h2>Primeiros passos</h2>
        <span className="dado passos-contagem">
          {feitos} de {passos.length}
        </span>
      </div>

      <ul className="lista-passos">
        {passos.map((p) => (
          <li key={p.chave} className={p.feito ? "passo feito" : "passo"}>
            <span className="passo-marca" aria-hidden="true">
              {p.feito ? "✓" : "○"}
            </span>
            <span className="passo-texto">
              <strong>{p.titulo}</strong>
              {p.opcional && <span className="passo-opcional">opcional</span>}
              {!p.feito && p.chave === proximo?.chave && (
                <span className="passo-descricao">{p.descricao}</span>
              )}
            </span>
            {!p.feito && p.chave === proximo?.chave && (
              <Link className="botao botao-secundario" href={p.href}>
                {p.cta}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
