"use client";

import { useEffect, useRef } from "react";

/**
 * Manda o erro para /api/erro, uma vez só.
 *
 * O `useRef` existe porque o React chama o boundary de erro mais de uma
 * vez em desenvolvimento e em alguns casos de recuperação — sem a trava,
 * o mesmo erro consumiria o teto de gravação sozinho.
 *
 * Nada aqui bloqueia a tela: o relato sai em segundo plano e, se falhar,
 * falha em silêncio. Página de erro que dá erro é o pior lugar para
 * insistir.
 *
 * O que se manda é o mínimo: onde aconteceu, o tipo, a mensagem e a rota.
 * Nome de conta e valor não passam por aqui — a limpeza acontece no
 * servidor, com a mesma função que a telemetria usa, mas o navegador já
 * envia só o que é técnico.
 */
export function RelatarErro({
  erro,
  onde,
}: {
  erro: Error & { digest?: string };
  onde: string;
}) {
  const jaMandou = useRef(false);

  useEffect(() => {
    if (jaMandou.current) return;
    jaMandou.current = true;

    const corpo = JSON.stringify({
      onde,
      tipo: erro.name || "Error",
      mensagem: erro.digest ? `${erro.message} (digest ${erro.digest})` : erro.message,
      rota: window.location.pathname + window.location.search,
      pilha: (erro.stack ?? "").split("\n").slice(0, 4).join(" | "),
    });

    // keepalive para o relato sobreviver a uma navegação logo em seguida.
    fetch("/api/erro", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corpo,
      keepalive: true,
    }).catch(() => {});
  }, [erro, onde]);

  return null;
}
