"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * Formulario dentro de modal, aberto por botao. A tela mostra o que existe;
 * o formulario aparece quando a pessoa pede. Fecha no Esc, no clique fora e
 * no botao — e trava a rolagem do fundo enquanto esta aberto.
 */
export function Modal({
  rotulo,
  titulo,
  descricao,
  variante = "primario",
  largo = false,
  icone,
  children,
}: {
  rotulo: string;
  titulo: string;
  descricao?: string;
  variante?: "primario" | "secundario" | "link";
  largo?: boolean;
  icone?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

  const classe =
    variante === "link"
      ? "link-acao"
      : variante === "secundario"
        ? "botao botao-secundario"
        : "botao botao-primario";

  return (
    <>
      <button type="button" className={classe} onClick={() => setAberto(true)}>
        {icone}
        {rotulo}
      </button>

      {aberto && (
        <div className="modal-fundo" onClick={() => setAberto(false)}>
          <div
            className={largo ? "modal largo" : "modal"}
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-cabeca">
              <div>
                <h2>{titulo}</h2>
                {descricao && <p>{descricao}</p>}
              </div>
              <button
                type="button"
                className="modal-fechar"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-corpo">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
