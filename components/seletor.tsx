"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type Opcao = { valor: string; rotulo: string; detalhe?: string };

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function useFechaFora(aberto: boolean, fechar: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fechar();
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto, fechar]);

  return ref;
}

/**
 * Escolha única, com busca. Usado onde o vínculo é único por natureza:
 * a conta pertence a uma carteira, o contrato a uma conta. Permitir marcar
 * vários aqui não daria liberdade, daria ambiguidade — na hora de gravar
 * alguém teria que escolher por você.
 */
export function Seletor({
  nome,
  rotulo,
  opcoes,
  inicial,
  vazio = "Não definido",
  obrigatorio = false,
  ajuda,
}: {
  nome: string;
  rotulo: string;
  opcoes: Opcao[];
  inicial?: string | null;
  vazio?: string | null;
  obrigatorio?: boolean;
  ajuda?: string;
}) {
  const [valor, setValor] = useState(inicial ?? "");
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useFechaFora(aberto, () => {
    setAberto(false);
    setBusca("");
  });

  const filtradas = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return opcoes;
    return opcoes.filter(
      (o) => normalizar(o.rotulo).includes(q) || normalizar(o.detalhe ?? "").includes(q),
    );
  }, [busca, opcoes]);

  const escolhida = opcoes.find((o) => o.valor === valor);

  return (
    <label className="campo" ref={ref as never}>
      <span>{rotulo}</span>

      <div className="seletor">
        <button
          type="button"
          className={escolhida ? "seletor-botao ativo" : "seletor-botao"}
          onClick={() => setAberto((a) => !a)}
          aria-haspopup="listbox"
          aria-expanded={aberto}
        >
          <span className="seletor-texto">{escolhida?.rotulo ?? vazio ?? "Escolha"}</span>
          <ChevronDown size={15} />
        </button>

        {aberto && (
          <div className="seletor-menu" role="listbox">
            <div className="seletor-busca">
              <Search size={14} />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar…"
                autoFocus
              />
            </div>

            <div className="seletor-lista">
              {vazio !== null && !obrigatorio && (
                <button
                  type="button"
                  className={valor === "" ? "seletor-item marcado" : "seletor-item"}
                  onClick={() => {
                    setValor("");
                    setAberto(false);
                    setBusca("");
                  }}
                >
                  <span>{vazio}</span>
                  {valor === "" && <Check size={14} />}
                </button>
              )}

              {filtradas.length === 0 && <p className="seletor-vazio">Nada encontrado.</p>}

              {filtradas.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  className={o.valor === valor ? "seletor-item marcado" : "seletor-item"}
                  onClick={() => {
                    setValor(o.valor);
                    setAberto(false);
                    setBusca("");
                  }}
                >
                  <span>
                    {o.rotulo}
                    {o.detalhe && <small>{o.detalhe}</small>}
                  </span>
                  {o.valor === valor && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <input type="hidden" name={nome} value={valor} />
      {obrigatorio && valor === "" && <small className="texto-alerta">Escolha uma opção.</small>}
      {ajuda && <small>{ajuda}</small>}
    </label>
  );
}

/**
 * Escolha múltipla, com busca. Usado em filtro, onde marcar três carteiras
 * ao mesmo tempo é exatamente o que se quer. Envia um campo por item
 * marcado; nenhum marcado significa "todas".
 */
export function SeletorMultiplo({
  nome,
  rotulo,
  opcoes,
  inicial = [],
  rotuloTodas = "Todas",
}: {
  nome: string;
  rotulo: string;
  opcoes: Opcao[];
  inicial?: string[];
  rotuloTodas?: string;
}) {
  const [marcados, setMarcados] = useState<string[]>(inicial);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useFechaFora(aberto, () => {
    setAberto(false);
    setBusca("");
  });

  const filtradas = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return opcoes;
    return opcoes.filter(
      (o) => normalizar(o.rotulo).includes(q) || normalizar(o.detalhe ?? "").includes(q),
    );
  }, [busca, opcoes]);

  function alternar(v: string) {
    setMarcados((atual) =>
      atual.includes(v) ? atual.filter((x) => x !== v) : [...atual, v],
    );
  }

  const texto =
    marcados.length === 0
      ? rotuloTodas
      : marcados.length === 1
        ? (opcoes.find((o) => o.valor === marcados[0])?.rotulo ?? "1 selecionada")
        : `${marcados.length} selecionadas`;

  return (
    <label className="campo" ref={ref as never}>
      <span>{rotulo}</span>

      <div className="seletor">
        <button
          type="button"
          className={marcados.length ? "seletor-botao ativo" : "seletor-botao"}
          onClick={() => setAberto((a) => !a)}
          aria-haspopup="listbox"
          aria-expanded={aberto}
        >
          <span className="seletor-texto">{texto}</span>
          {marcados.length > 0 ? (
            <span
              className="seletor-limpar"
              role="button"
              tabIndex={0}
              aria-label="Limpar seleção"
              onClick={(e) => {
                e.stopPropagation();
                setMarcados([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  setMarcados([]);
                }
              }}
            >
              <X size={13} />
            </span>
          ) : (
            <ChevronDown size={15} />
          )}
        </button>

        {aberto && (
          <div className="seletor-menu" role="listbox">
            <div className="seletor-busca">
              <Search size={14} />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar…"
                autoFocus
              />
            </div>

            <div className="seletor-lista">
              <button
                type="button"
                className={marcados.length === 0 ? "seletor-item marcado" : "seletor-item"}
                onClick={() => setMarcados([])}
              >
                <span>{rotuloTodas}</span>
                {marcados.length === 0 && <Check size={14} />}
              </button>

              {filtradas.length === 0 && <p className="seletor-vazio">Nada encontrado.</p>}

              {filtradas.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  className={marcados.includes(o.valor) ? "seletor-item marcado" : "seletor-item"}
                  onClick={() => alternar(o.valor)}
                >
                  <span>
                    {o.rotulo}
                    {o.detalhe && <small>{o.detalhe}</small>}
                  </span>
                  {marcados.includes(o.valor) && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {marcados.map((v) => (
        <input key={v} type="hidden" name={nome} value={v} />
      ))}
    </label>
  );
}
