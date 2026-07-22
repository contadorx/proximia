"use client";

export function BotaoImprimir() {
  return (
    <button className="botao botao-secundario nao-imprimir" onClick={() => window.print()}>
      Imprimir ou salvar em PDF
    </button>
  );
}
