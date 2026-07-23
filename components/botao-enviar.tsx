"use client";

import { useFormStatus } from "react-dom";

/**
 * Botão de envio com estado. Enquanto a ação roda, desabilita e avisa —
 * clique duplo (ou Enter repetido) não cria dois contatos, duas cláusulas,
 * dois lançamentos. Serve qualquer formulário com action, dentro ou fora
 * de modal.
 */
export function BotaoEnviar({
  children,
  variante = "primario",
  rotuloEnviando = "Salvando…",
  desabilitado = false,
}: {
  children: React.ReactNode;
  variante?: "primario" | "secundario" | "perigo" | "link";
  rotuloEnviando?: string;
  /** Desabilita por regra da tela, além do estado de envio. */
  desabilitado?: boolean;
}) {
  const { pending } = useFormStatus();

  const classe =
    variante === "link"
      ? "link-acao"
      : variante === "secundario"
        ? "botao botao-secundario"
        : variante === "perigo"
          ? "botao botao-perigo"
          : "botao botao-primario";

  return (
    <button
      className={classe}
      type="submit"
      disabled={pending || desabilitado}
      aria-busy={pending}
    >
      {pending && variante !== "link" ? rotuloEnviando : children}
    </button>
  );
}
