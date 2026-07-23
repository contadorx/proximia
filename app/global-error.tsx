"use client";

import { RelatarErro } from "@/components/relatar-erro";

/**
 * Último recurso: erro que derrubou o próprio layout, onde o error.tsx
 * comum não chega. Aqui não dá para usar nada do produto — nem menu, nem
 * folha de estilo garantida —, então a página se basta com estilo
 * embutido.
 *
 * Existe sobretudo para o relato sair: sem ele, a falha mais grave é
 * justamente a que ninguém fica sabendo.
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          padding: "48px 24px",
          background: "#f6f8fa",
          color: "#1b2a4a",
          font: "400 15px/1.6 Arial,Helvetica,sans-serif",
        }}
      >
        <RelatarErro erro={error} onde="layout" />

        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <p
            style={{
              font: "600 11px/1.4 Arial,sans-serif",
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "#64748b",
              margin: 0,
            }}
          >
            Erro
          </p>
          <h1 style={{ font: "700 24px/1.25 Arial,sans-serif", margin: "6px 0 10px" }}>
            A aplicação não conseguiu carregar
          </h1>
          <p style={{ color: "#64748b", margin: "0 0 20px" }}>
            Isto foi registrado e chega a quem opera o produto. Tente de novo; se continuar,
            avise informando o código abaixo.
          </p>

          {error.digest && (
            <p style={{ font: "400 13px/1.6 Arial,sans-serif", color: "#64748b", margin: "0 0 20px" }}>
              Código: <strong style={{ color: "#1b2a4a" }}>{error.digest}</strong>
            </p>
          )}

          <button
            onClick={() => reset()}
            style={{
              background: "#1b2a4a",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "11px 20px",
              font: "600 14px/1 Arial,sans-serif",
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
