"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Formulario dentro de modal, aberto por botao.
 *
 * O modal fecha sozinho quando a acao termina com sucesso. Erro de
 * validacao nao fecha — a mensagem aparece dentro do formulario e o
 * preenchimento fica (ver FormAcao).
 *
 * COMO O SUCESSO E DETECTADO, E POR QUE NAO E SO O ENDERECO
 *
 * A versao anterior comparava o endereco: toda acao redireciona ao final,
 * entao mudanca de endereco significava sucesso. Funcionava na primeira
 * vez e falhava na segunda — salvar duas pessoas seguidas produz a MESMA
 * URL (mesma rota, mesma mensagem de ok), o endereco nao muda, e o modal
 * ficava aberto dando a impressao de que nada aconteceu.
 *
 * Agora o sinal e outro: quando a acao do servidor conclui, o React
 * re-renderiza o modal com `children` novos (a arvore vem do componente
 * de servidor, revalidada). Guardamos a identidade dos filhos no momento
 * do envio; se ela mudar, a acao terminou. Endereco diferente continua
 * fechando tambem — os dois sinais somados cobrem os dois casos.
 *
 * Foco gerenciado de verdade: ao abrir, entra no dialogo; Tab circula
 * dentro dele; ao fechar, volta para o botao que abriu. Sem isso,
 * role="dialog" e promessa que o teclado nao consegue cobrar.
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

  const caminho = usePathname();
  const busca = useSearchParams().toString();
  const enderecoAtual = `${caminho}?${busca}`;
  const [enderecoAoAbrir, setEnderecoAoAbrir] = useState<string | null>(null);

  const gatilho = useRef<HTMLButtonElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  // Identidade dos filhos no instante do envio. Muda quando o servidor
  // responde e a arvore e recriada.
  const [filhosAoEnviar, setFilhosAoEnviar] = useState<React.ReactNode | null>(null);

  useEffect(() => {
    if (aberto) setEnderecoAoAbrir(enderecoAtual);
    // Registrado só na abertura: é a referência de comparação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  useEffect(() => {
    if (aberto && enderecoAoAbrir !== null && enderecoAtual !== enderecoAoAbrir) {
      setAberto(false);
      setFilhosAoEnviar(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enderecoAtual]);

  // Segundo sinal: a arvore do servidor foi recriada depois do envio.
  useEffect(() => {
    if (aberto && filhosAoEnviar !== null && children !== filhosAoEnviar) {
      setAberto(false);
      setFilhosAoEnviar(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  // Erro de validacao volta sem recriar a arvore, entao o modal segue
  // aberto com a mensagem — que e o comportamento desejado.
  useEffect(() => {
    if (!aberto) {
      setFilhosAoEnviar(null);
      return;
    }
    const caixaAtual = caixa.current;
    if (!caixaAtual) return;

    const aoEnviar = () => setFilhosAoEnviar(children);
    caixaAtual.addEventListener("submit", aoEnviar);
    return () => caixaAtual.removeEventListener("submit", aoEnviar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, children]);

  useEffect(() => {
    if (!aberto) return;

    // Foco entra no diálogo: primeiro campo, ou o que houver de focável.
    const focaveis = () =>
      Array.from(caixa.current?.querySelectorAll<HTMLElement>(FOCAVEIS) ?? []);
    const primeiroCampo = caixa.current?.querySelector<HTMLElement>(
      "input:not([type='hidden']), select, textarea",
    );
    (primeiroCampo ?? focaveis()[0])?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        return;
      }
      if (e.key !== "Tab") return;

      // Tab circula dentro do diálogo, sem vazar para a página coberta.
      const lista = focaveis();
      if (lista.length === 0) return;
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      const ativo = document.activeElement;

      if (e.shiftKey && (ativo === primeiro || !caixa.current?.contains(ativo as Node))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", aoTeclar);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = anterior;
      // Devolve o foco a quem abriu — a pessoa continua de onde estava.
      gatilho.current?.focus();
    };
  }, [aberto]);

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
      <button ref={gatilho} type="button" className={classe} onClick={() => setAberto(true)}>
        {icone}
        {rotulo}
      </button>

      {aberto && (
        <div className="modal-fundo" onClick={() => setAberto(false)}>
          <div
            ref={caixa}
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
