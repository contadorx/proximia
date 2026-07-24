import { criarClienteServidor } from "./supabase/server";

/**
 * Cobertura: contas × tipos de iniciativa.
 *
 * Responde a pergunta que o mercado chama de whitespace, mas com o
 * vocabulário do assinante: em vez de "quais produtos esta conta não
 * comprou", é "quais iniciativas que a nossa operação sabe fazer nunca
 * foram tentadas nesta conta".
 *
 * TRÊS COISAS QUE ESTE MÓDULO NÃO FAZ, DE PROPÓSITO
 *
 * 1. Não multiplica lacuna por valor. Somar "potencial não explorado"
 *    produziria uma cifra grande e inventada — o tipo de número que o
 *    produto recusa. Lacuna é pergunta a fazer, não receita a projetar.
 *
 * 2. Não chama lacuna de oportunidade. Pode não haver nada ali: a conta
 *    pode não ter o perfil, ou já ter dito não por outro caminho.
 *
 * 3. Não trata descarte como espaço em branco. Se já se tentou e perdeu,
 *    aquilo é assunto encerrado — e insistir sem saber disso é como se
 *    queima relacionamento.
 */

export type CelulaCobertura = {
  conta_id: string;
  conta: string;
  carteira_id: string;
  criticidade: string | null;
  catalogo_id: string;
  tipo: string;
  iniciativas: number;
  ganhas: number;
  descartadas: number;
  em_andamento: number;
  ultima_em: string | null;
};

export type ResumoCarteira = {
  carteira_id: string;
  contas: number;
  tipos: number;
  celulas: number;
  celulas_com_iniciativa: number;
  lacunas: number;
  cobertura_pct: number | null;
};

export async function coberturaDaOrg(
  orgId: string,
  carteiras: string[] = [],
): Promise<CelulaCobertura[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase
    .from("cobertura_conta")
    .select(
      "conta_id, conta, carteira_id, criticidade, catalogo_id, tipo, iniciativas, ganhas, descartadas, em_andamento, ultima_em",
    )
    .eq("org_id", orgId);

  if (carteiras.length) consulta = consulta.in("carteira_id", carteiras);

  const { data, error } = await consulta;
  if (error) {
    console.error("[cobertura] falha ao ler a matriz:", error.message);
    return [];
  }
  return (data ?? []) as CelulaCobertura[];
}

export async function resumoPorCarteira(orgId: string): Promise<ResumoCarteira[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("cobertura_carteira")
    .select("carteira_id, contas, tipos, celulas, celulas_com_iniciativa, lacunas, cobertura_pct")
    .eq("org_id", orgId);

  if (error) {
    console.error("[cobertura] falha ao ler o resumo:", error.message);
    return [];
  }
  return (data ?? []) as ResumoCarteira[];
}

/* ------------------------------------------------------------------ */
/* Montagem da matriz para a tela                                      */
/* ------------------------------------------------------------------ */

export type EstadoCelula = "ganha" | "andamento" | "descartada" | "lacuna";

export type LinhaMatriz = {
  contaId: string;
  conta: string;
  criticidade: string | null;
  celulas: { catalogoId: string; tipo: string; estado: EstadoCelula; detalhe: string }[];
  lacunas: number;
};

/**
 * Vira a lista plana em linhas por conta, na ordem dos tipos.
 *
 * O estado de cada célula segue uma ordem de precedência que importa:
 * ganha manda sobre em andamento, e em andamento manda sobre descartada.
 * Uma conta onde já se ganhou e depois se perdeu outra tentativa do mesmo
 * tipo não é "perdida" — é atendida.
 */
export function montarMatriz(
  celulas: CelulaCobertura[],
  ordemTipos: { id: string; nome: string }[],
): LinhaMatriz[] {
  const porConta = new Map<string, CelulaCobertura[]>();
  for (const c of celulas) {
    const lista = porConta.get(c.conta_id) ?? [];
    lista.push(c);
    porConta.set(c.conta_id, lista);
  }

  const linhas: LinhaMatriz[] = [];

  for (const [contaId, lista] of porConta) {
    const porTipo = new Map(lista.map((c) => [c.catalogo_id, c]));
    const primeira = lista[0];

    const cels = ordemTipos.map((t) => {
      const c = porTipo.get(t.id);
      const estado: EstadoCelula = !c || c.iniciativas === 0
        ? "lacuna"
        : c.ganhas > 0
          ? "ganha"
          : c.em_andamento > 0
            ? "andamento"
            : "descartada";

      const detalhe =
        estado === "lacuna"
          ? "nunca houve iniciativa deste tipo nesta conta"
          : estado === "ganha"
            ? `${c!.ganhas} concluída(s)`
            : estado === "andamento"
              ? `${c!.em_andamento} em andamento`
              : `${c!.descartadas} descartada(s) — assunto já tratado`;

      return { catalogoId: t.id, tipo: t.nome, estado, detalhe };
    });

    linhas.push({
      contaId,
      conta: primeira.conta,
      criticidade: primeira.criticidade,
      celulas: cels,
      lacunas: cels.filter((c) => c.estado === "lacuna").length,
    });
  }

  // Mais lacunas primeiro: é onde há mais pergunta a fazer. Empate
  // desempata por criticidade, porque conta alta com lacuna pesa mais.
  const peso = (c: string | null) => (c === "alta" ? 0 : c === "media" ? 1 : 2);
  return linhas.sort(
    (a, b) => b.lacunas - a.lacunas || peso(a.criticidade) - peso(b.criticidade) ||
      a.conta.localeCompare(b.conta),
  );
}

export function classeEstado(estado: EstadoCelula): string {
  if (estado === "ganha") return "selo selo-ok";
  if (estado === "andamento") return "selo selo-neutro";
  if (estado === "descartada") return "selo selo-falta";
  return "cobertura-lacuna";
}

export function simboloEstado(estado: EstadoCelula): string {
  if (estado === "ganha") return "✓";
  if (estado === "andamento") return "•";
  if (estado === "descartada") return "×";
  return "";
}
