"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copia um texto para a área de transferência.
 *
 * O endereço também fica visível ao lado: navegador antigo, aba sem
 * https ou permissão negada fazem a cópia falhar em silêncio, e nesse
 * caso a pessoa ainda consegue selecionar à mão.
 */
export function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  const [falhou, setFalhou] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setFalhou(false);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setFalhou(true);
    }
  }

  return (
    <button type="button" className="link-acao" onClick={copiar}>
      {copiado ? <Check size={14} /> : <Copy size={14} />}
      {falhou ? "Selecione e copie" : copiado ? "Copiado" : rotulo}
    </button>
  );
}
