import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  Bell,
  CalendarClock,
  Gauge,
  ClipboardList,
  Coins,
  FileText,
  Layers,
  LayoutGrid,
  Settings,
  Upload,
  Users,
} from "lucide-react";
import { nomeApp } from "@/lib/env";
import { orgAtual } from "@/lib/auth";
import { rotuloPapel } from "@/lib/tipos";
import { sair, trocarOrganizacao } from "@/app/acoes/organizacoes";
import "./globals.css";

export const metadata: Metadata = {
  title: `${nomeApp} — gestão de carteiras e grandes contas`,
  description:
    "Onde ficam registrados os compromissos, os contratos e o valor entregue a cada carteira.",
};

const TAMANHO = 16;

const GRUPOS = [
  {
    titulo: "Acompanhar",
    itens: [
      { href: "/painel", rotulo: "Painel", icone: <LayoutGrid size={TAMANHO} /> },
      { href: "/alertas", rotulo: "Alertas", icone: <Bell size={TAMANHO} /> },
      { href: "/panorama", rotulo: "Panorama", icone: <Building2 size={TAMANHO} /> },
      { href: "/compromissos", rotulo: "Compromissos", icone: <CalendarClock size={TAMANHO} /> },
      { href: "/maturidade", rotulo: "Maturidade", icone: <Gauge size={TAMANHO} /> },
    ],
  },
  {
    titulo: "Operar",
    itens: [
      { href: "/carteiras", rotulo: "Carteiras", icone: <Layers size={TAMANHO} /> },
      { href: "/contas", rotulo: "Contas", icone: <Users size={TAMANHO} /> },
      { href: "/contratos", rotulo: "Contratos", icone: <FileText size={TAMANHO} /> },
      { href: "/frentes", rotulo: "Frentes", icone: <ClipboardList size={TAMANHO} /> },
      { href: "/oportunidades", rotulo: "Oportunidades", icone: <Coins size={TAMANHO} /> },
    ],
  },
  {
    titulo: "Registrar",
    itens: [
      { href: "/historico", rotulo: "Histórico", icone: <ClipboardList size={TAMANHO} /> },
      { href: "/importacao", rotulo: "Importação", icone: <Upload size={TAMANHO} /> },
      { href: "/configuracoes", rotulo: "Configurações", icone: <Settings size={TAMANHO} /> },
    ],
  },
];

function Fontes() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
    </>
  );
}

export default async function LayoutRaiz({ children }: { children: React.ReactNode }) {
  const ano = new Date().getFullYear();
  const org = await orgAtual();

  if (!org) {
    return (
      <html lang="pt-BR">
        <head>
          <Fontes />
        </head>
        <body>
          <div className="casca">
            <header className="topo">
              <div className="topo-interno">
                <Link className="marca" href="/">
                  <span className="marca-ponto" />
                  {nomeApp}
                </Link>
                <span className="marca-sub">carteiras e grandes contas</span>
              </div>
            </header>
            <main className="conteudo">{children}</main>
            <footer className="rodape">
              {nomeApp} · {ano}
            </footer>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="pt-BR">
      <head>
        <Fontes />
      </head>
      <body>
        <div className="com-lateral">
          <aside className="lateral">
            <Link className="marca" href="/painel">
              <span className="marca-ponto" />
              {nomeApp}
            </Link>

            <div>
              {GRUPOS.map((g) => (
                <div className="lateral-grupo" key={g.titulo}>
                  <p className="lateral-titulo">{g.titulo}</p>
                  <nav className="lateral-nav">
                    {g.itens.map((i) => (
                      <Link key={i.href} href={i.href} title={i.rotulo}>
                        {i.icone}
                        <span>{i.rotulo}</span>
                      </Link>
                    ))}
                  </nav>
                </div>
              ))}
            </div>

            <div className="lateral-rodape">
              <p className="lateral-org">{org.nome}</p>
              <p className="lateral-papel">{rotuloPapel(org.papel)}</p>
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
              {nomeApp} · {ano}
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
