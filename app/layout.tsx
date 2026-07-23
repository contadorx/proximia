import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { Lateral, type GrupoMenu } from "@/components/lateral";
import { souOperador } from "@/lib/negocio";
import {
  Building2,
  Bell,
  Briefcase,
  Gauge,
  ClipboardList,
  Coins,
  FileText,
  Layers,
  LayoutGrid,
  PieChart,
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
//
// Três movimentos desta versão:
//
//   · Alertas + Compromissos viram PENDÊNCIAS. Eram duas telas para o
//     mesmo estado mental ("o que eu preciso resolver"), separadas por
//     como o item nasce e não por como a pessoa trabalha. As entidades
//     seguem distintas dentro da tela; o que se fundiu foi a entrada.
//   · Panorama vira COMPARATIVO. "Painel" e "Panorama" competiam como
//     palavras e ninguém novo sabia qual abria o quê; o conteúdo da tela
//     é comparação entre unidades e responsáveis, então o nome diz isso.
//     A rota /panorama continua a mesma.
//   · HISTÓRICO sai do primeiro nível. Cada ficha já carrega o seu, que é
//     onde ele é consultado de fato; a vista global vira link nomeado em
//     Relatórios. Não é esconder: a rota /historico continua, a busca
//     continua achando, e a tela de Relatórios diz para onde foi.
const GRUPOS: GrupoMenu[] = [
  {
    titulo: "Acompanhar",
    itens: [
      { href: "/painel", rotulo: "Painel", icone: <LayoutGrid size={TAMANHO} /> },
      { href: "/pendencias", rotulo: "Pendências", icone: <Bell size={TAMANHO} /> },
      { href: "/panorama", rotulo: "Comparativo", icone: <Building2 size={TAMANHO} /> },
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
