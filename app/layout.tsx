import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { Lateral, type GrupoMenu } from "@/components/lateral";
import { souOperador } from "@/lib/negocio";
import {
  Building2,
  Bell,
  Briefcase,
  CalendarClock,
  Gauge,
  ClipboardList,
  Coins,
  FileText,
  Layers,
  LayoutGrid,
  PieChart,
  ScrollText,
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

// Onze destinos num nível só não cabiam na tela. Agora são três grupos
// curtos, e o que é administração — importação, trilha de alterações,
// pessoas, catálogos — vive dentro de Configurações.
const GRUPOS: GrupoMenu[] = [
  {
    titulo: "Acompanhar",
    itens: [
      { href: "/painel", rotulo: "Painel", icone: <LayoutGrid size={TAMANHO} /> },
      { href: "/alertas", rotulo: "Alertas", icone: <Bell size={TAMANHO} /> },
      { href: "/compromissos", rotulo: "Compromissos", icone: <CalendarClock size={TAMANHO} /> },
      { href: "/panorama", rotulo: "Panorama", icone: <Building2 size={TAMANHO} /> },
      { href: "/relatorios", rotulo: "Relatórios", icone: <PieChart size={TAMANHO} /> },
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
      { href: "/historico", rotulo: "Histórico", icone: <ScrollText size={TAMANHO} /> },
      { href: "/maturidade", rotulo: "Maturidade", icone: <Gauge size={TAMANHO} /> },
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
  const caminho = headers().get("x-caminho") ?? "";

  // Portal da unidade: página pública, sem barra lateral e sem a nossa
  // marca. Quem assina o conteúdo ali é o assinante, não o produto.
  if (caminho.startsWith("/portal/")) {
    return (
      <html lang="pt-BR">
        <head>
          <Fontes />
        </head>
        <body>{children}</body>
      </html>
    );
  }

  const org = await orgAtual();
  const operador = await souOperador();

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
          <Lateral
            grupos={
              operador
                ? [
                    ...GRUPOS,
                    {
                      titulo: "Plataforma",
                      itens: [
                        { href: "/negocio", rotulo: "Negócio", icone: <Briefcase size={TAMANHO} /> },
                      ],
                    },
                  ]
                : GRUPOS
            }
            recolhidaInicial={cookies().get("proximia_menu")?.value === "1"}
            marca={
              <Link className="marca" href="/painel">
                <span className="marca-ponto" />
                {nomeApp}
              </Link>
            }
            rodape={
              <>
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
              </>
            }
          />

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
