import type { Metadata } from "next";
import Link from "next/link";
import { nomeApp } from "@/lib/env";
import { orgAtual } from "@/lib/auth";
import { sair, trocarOrganizacao } from "@/app/acoes/organizacoes";
import "./globals.css";

export const metadata: Metadata = {
  title: `${nomeApp} — gestão de carteiras e grandes contas`,
  description:
    "Onde ficam registrados os compromissos, os contratos e o valor entregue a cada carteira.",
};

const SECOES = [
  { href: "/painel", rotulo: "Painel" },
  { href: "/panorama", rotulo: "Panorama" },
  { href: "/carteiras", rotulo: "Carteiras" },
  { href: "/contas", rotulo: "Contas" },
  { href: "/frentes", rotulo: "Frentes" },
  { href: "/contratos", rotulo: "Contratos" },
  { href: "/compromissos", rotulo: "Compromissos" },
  { href: "/historico", rotulo: "Histórico" },
  { href: "/importacao", rotulo: "Importação" },
];

export default async function LayoutRaiz({ children }: { children: React.ReactNode }) {
  const ano = new Date().getFullYear();
  const org = await orgAtual();

  // Sem organização escolhida (login, cadastro, instalação) o app fica sem
  // barra lateral: nada para navegar ainda.
  if (!org) {
    return (
      <html lang="pt-BR">
        <body>
          <div className="casca">
            <header className="topo">
              <div className="topo-interno">
                <Link className="marca" href="/">
                  {nomeApp}
                </Link>
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

  return (
    <html lang="pt-BR">
      <body>
        <div className="com-lateral">
          <aside className="lateral">
            <Link className="marca" href="/painel">
              {nomeApp}
            </Link>

            <nav className="lateral-nav">
              {SECOES.map((s) => (
                <Link key={s.href} href={s.href}>
                  {s.rotulo}
                </Link>
              ))}
            </nav>

            <div className="lateral-rodape">
              <p className="lateral-org">{org.nome}</p>
              <form action={trocarOrganizacao}>
                <button className="link-acao" type="submit">
                  Trocar de organização
                </button>
              </form>
              <form action={sair}>
                <button className="link-acao" type="submit">
                  Sair
                </button>
              </form>
            </div>
          </aside>

          <div className="area">
            <main className="conteudo">{children}</main>
            <footer className="rodape">
              {nomeApp} · versão 0.1 · {ano}
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
