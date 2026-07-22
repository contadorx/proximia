"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

/**
 * Exclusao em duas etapas: o primeiro clique pergunta, o segundo executa.
 * Sem caixa do navegador e sem exclusao por engano.
 */
export function BotaoExcluir({
  rotulo = "Excluir",
  aviso,
  compacto = false,
}: {
  rotulo?: string;
  aviso?: string;
  compacto?: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <button
        type="button"
        className={compacto ? "link-acao link-perigo" : "botao botao-perigo"}
        onClick={() => setConfirmando(true)}
      >
        {!compacto && <Trash2 size={15} />}
        {rotulo}
      </button>
    );
  }

  return (
    <span className="confirmacao">
      {aviso && <span className="confirmacao-aviso">{aviso}</span>}
      <button type="submit" className={compacto ? "link-acao link-perigo" : "botao botao-perigo"}>
        Confirmar
      </button>
      <button type="button" className="link-acao" onClick={() => setConfirmando(false)}>
        Cancelar
      </button>
    </span>
  );
}
