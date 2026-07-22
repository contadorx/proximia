"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Busca } from "@/components/busca";

export type ItemMenu = { href: string; rotulo: string; icone: React.ReactNode };
export type GrupoMenu = { titulo: string; itens: ItemMenu[] };

/**
 * Barra lateral. Dois motivos para ela ser de cliente:
 *
 *   1. Marcar a seção atual — sem isso, com onze destinos, a pessoa perde
 *      a referência de onde está.
 *   2. Recolher para só os ícones. Em tela baixa, a lista inteira não
 *      cabia e o rodapé com organização e saída ficava fora do alcance.
 *      A preferência é lembrada em cookie, então não se perde ao navegar.
 */
export function Lateral({
  grupos,
  rodape,
  marca,
  recolhidaInicial,
}: {
  grupos: GrupoMenu[];
  rodape: React.ReactNode;
  marca: React.ReactNode;
  recolhidaInicial: boolean;
}) {
  const [recolhida, setRecolhida] = useState(recolhidaInicial);
  const caminho = usePathname();

  function alternar() {
    setRecolhida((atual) => {
      const nova = !atual;
      document.cookie = `proximia_menu=${nova ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      return nova;
    });
  }

  const ativo = (href: string) => caminho === href || caminho.startsWith(`${href}/`);

  return (
    <aside className={recolhida ? "lateral recolhida" : "lateral"}>
      <div className="lateral-topo">
        {!recolhida && marca}
        <button
          type="button"
          className="lateral-alternar"
          onClick={alternar}
          aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
          title={recolhida ? "Expandir menu" : "Recolher menu"}
        >
          {recolhida ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {!recolhida && <Busca />}

      <div className="lateral-rolagem">
        {grupos.map((g) => (
          <div className="lateral-grupo" key={g.titulo}>
            {!recolhida && <p className="lateral-titulo">{g.titulo}</p>}
            <nav className="lateral-nav">
              {g.itens.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  title={i.rotulo}
                  className={ativo(i.href) ? "ativo" : undefined}
                >
                  {i.icone}
                  {!recolhida && <span>{i.rotulo}</span>}
                </Link>
              ))}
            </nav>
          </div>
        ))}
      </div>

      {!recolhida && <div className="lateral-rodape">{rodape}</div>}
    </aside>
  );
}
