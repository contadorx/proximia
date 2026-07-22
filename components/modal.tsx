"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

/**
 * Formulario dentro de modal, aberto por botao.
 *
 * O modal fecha sozinho quando a acao termina. Como toda acao de servidor
 * redireciona ao final, basta observar a mudanca de endereco: mudou, a
 * gravacao aconteceu e o modal sai da frente para a pessoa ver o aviso.
 * Enquanto isso, o conteudo fica em estado de espera — sem isso, nao da
 * para saber se algo aconteceu.
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
  variante?: "primario" | "secundario" | "link" | "perigo";
  largo?: boolean;
  icone?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const caminho = usePathname();
  const busca = useSearchParams().toString();
  const enderecoAtual = `${caminho}?${busca}`;
  const [enderecoAoAbrir, setEnderecoAoAbrir] = useState<string | null>(null);

  useEffect(() => {
    if (aberto) setEnderecoAoAbrir(enderecoAtual);
    // Registrado só na abertura: é a referência de comparação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  useEffect(() => {
    if (aberto && enderecoAoAbrir !== null && enderecoAtual !== enderecoAoAbrir) {
      setAberto(false);
      setEnviando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enderecoAtual]);

  useEffect(() => {
    if (!aberto) {
      setEnviando(false);
      return;
    }
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !enviando) setAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = anterior;
    };
  }, [aberto, enviando]);

  const classe =
    variante === "link"
      ? "link-acao"
      : variante === "secundario"
        ? "botao botao-secundario"
        : variante === "perigo"
          ? "botao botao-perigo"
          : "botao botao-primario";

  return (
    <>
      <button type="button" className={classe} onClick={() => setAberto(true)}>
        {icone}
        {rotulo}
      </button>

      {aberto && (
        <div className="modal-fundo" onClick={() => !enviando && setAberto(false)}>
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
                disabled={enviando}
              >
                <X size={18} />
              </button>
            </div>

            <div
              className={enviando ? "modal-corpo enviando" : "modal-corpo"}
              onSubmit={() => setEnviando(true)}
            >
              {children}
              {enviando && <p className="modal-espera">Salvando…</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
