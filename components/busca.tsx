"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type Resultado = {
  tipo: string;
  id: string;
  titulo: string;
  detalhe: string | null;
  carteira_id: string;
};

const CAMINHOS: Record<string, string> = {
  carteira: "/carteiras",
  conta: "/contas",
  contrato: "/contratos",
  frente: "/frentes",
  oportunidade: "/oportunidades",
  compromisso: "/compromissos",
};

const ROTULOS: Record<string, string> = {
  carteira: "Carteira",
  conta: "Conta",
  contrato: "Contrato",
  frente: "Frente",
  oportunidade: "Oportunidade",
  compromisso: "Compromisso",
};

/**
 * Busca global. Quem usa não pensa em qual tela a informação mora: pensa
 * no nome do cliente, no número do contrato, no CNPJ. Abre por atalho
 * (barra ou Ctrl+K) porque a mão já está no teclado.
 */
export function Busca() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const escrevendo =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;

      if ((e.key === "/" && !escrevendo) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setAberto(true);
      }
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, []);

  useEffect(() => {
    if (aberto) setTimeout(() => campo.current?.focus(), 30);
    else {
      setTermo("");
      setResultados([]);
      setMarcado(0);
    }
  }, [aberto]);

  useEffect(() => {
    if (termo.trim().length < 2) {
      setResultados([]);
      return;
    }

    // Espera a pessoa parar de digitar: uma consulta por tecla castiga o
    // banco e devolve resultado de um termo que já mudou.
    const tempo = setTimeout(async () => {
      setBuscando(true);
      try {
        const resposta = await fetch(`/api/buscar?q=${encodeURIComponent(termo.trim())}`);
        const dados = await resposta.json();
        setResultados(dados.resultados ?? []);
        setMarcado(0);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 220);

    return () => clearTimeout(tempo);
  }, [termo]);

  function abrir(r: Resultado) {
    setAberto(false);
    router.push(
      r.tipo === "compromisso"
        ? `/compromissos?alvo=${r.tipo}:${r.id}`
        : `${CAMINHOS[r.tipo] ?? "/painel"}/${r.id}`,
    );
  }

  function navegar(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMarcado((m) => Math.min(m + 1, resultados.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setMarcado((m) => Math.max(m - 1, 0));
    }
    if (e.key === "Enter" && resultados[marcado]) {
      e.preventDefault();
      abrir(resultados[marcado]);
    }
  }

  return (
    <>
      <button type="button" className="busca-gatilho" onClick={() => setAberto(true)}>
        <Search size={15} />
        <span>Buscar</span>
        <kbd>/</kbd>
      </button>

      {aberto && (
        <div className="busca-fundo" onClick={() => setAberto(false)}>
          <div className="busca-caixa" onClick={(e) => e.stopPropagation()}>
            <div className="busca-campo">
              <Search size={16} />
              <input
                ref={campo}
                type="text"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                onKeyDown={navegar}
                placeholder="Conta, contrato, CNPJ, frente, oportunidade…"
                aria-label="Buscar"
              />
              {buscando && <span className="busca-estado">buscando…</span>}
            </div>

            {termo.trim().length >= 2 && resultados.length === 0 && !buscando && (
              <p className="busca-vazio">
                Nada encontrado para <strong>{termo}</strong>. A busca alcança apenas o que você tem
                acesso.
              </p>
            )}

            {resultados.length > 0 && (
              <ul className="busca-lista">
                {resultados.map((r, i) => (
                  <li key={`${r.tipo}-${r.id}`}>
                    <button
                      type="button"
                      className={i === marcado ? "busca-item marcado" : "busca-item"}
                      onMouseEnter={() => setMarcado(i)}
                      onClick={() => abrir(r)}
                    >
                      <span className="busca-tipo">{ROTULOS[r.tipo] ?? r.tipo}</span>
                      <span className="busca-titulo">{r.titulo}</span>
                      {r.detalhe && <span className="busca-detalhe">{r.detalhe}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="busca-rodape">
              <kbd>↑</kbd> <kbd>↓</kbd> para navegar · <kbd>Enter</kbd> para abrir ·{" "}
              <kbd>Esc</kbd> para fechar
            </p>
          </div>
        </div>
      )}
    </>
  );
}
