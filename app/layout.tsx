import type { Metadata } from "next";
import { nomeApp } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: `${nomeApp} — gestão de carteiras e grandes contas`,
  description:
    "Onde ficam registrados os compromissos, os contratos e o valor entregue a cada carteira.",
};

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  const ano = new Date().getFullYear();

  return (
    <html lang="pt-BR">
      <body>
        <div className="casca">
          <header className="topo">
            <div className="topo-interno">
              <span className="marca">{nomeApp}</span>
              <span className="marca-sub">carteiras e grandes contas</span>
            </div>
          </header>

          <main className="conteudo">{children}</main>

          <footer className="rodape">
            {nomeApp} · versão 0.1 · {ano}
          </footer>
        </div>
      </body>
    </html>
  );
}
