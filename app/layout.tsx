import type { Metadata } from "next";
import Link from "next/link";
import { nomeApp } from "@/lib/env";
import { orgAtual } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: `${nomeApp} — gestão de carteiras e grandes contas`,
  description:
    "Onde ficam registrados os compromissos, os contratos e o valor entregue a cada carteira.",
};

export default async function LayoutRaiz({ children }: { children: React.ReactNode }) {
  const ano = new Date().getFullYear();
  const org = await orgAtual();

  return (
    <html lang="pt-BR">
      <body>
        <div className="casca">
          <header className="topo">
            <div className="topo-interno">
              <Link className="marca" href="/">
                {nomeApp}
              </Link>
              {org ? (
                <nav className="navegacao">
                  <Link href="/painel">Painel</Link>
                  <Link href="/carteiras">Carteiras</Link>
                  <Link href="/contas">Contas</Link>
                  <span className="org-atual">{org.nome}</span>
                </nav>
              ) : (
                <span className="marca-sub">carteiras e grandes contas</span>
              )}
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
