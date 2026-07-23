import { criarClienteServidor } from "./supabase/server";

/**
 * Conversão observada por fase.
 *
 * É a alternativa honesta à "probabilidade por etapa" que todo CRM tem.
 * Aqui ninguém digita percentual: a taxa sai da história da própria
 * organização, e vem sempre acompanhada de quantos casos a sustentam.
 *
 * DUAS REGRAS QUE ESTE MÓDULO EXISTE PARA GARANTIR
 *
 * 1. Soma-se CONTAGEM, nunca média de taxas. Uma carteira com 3 casos
 *    fechados não pode pesar igual a uma com 300 — e é exatamente isso
 *    que a média de percentuais faz.
 *
 * 2. Amostra pequena não vira número. Quatro de dez fecharam é 40%, e
 *    também é compatível com qualquer coisa entre 17% e 69%. Exibir "40%"
 *    sozinho é falsa precisão; por isso a leitura carrega o intervalo e,
 *    abaixo do piso, se recusa a afirmar taxa nenhuma.
 *
 * O que NÃO existe aqui, de propósito: multiplicação por valor. Cifra
 * ponderada única é o que vira meta na segunda-feira.
 */

export type LinhaConversao = {
  carteira_id: string;
  fase: string;
  fechadas: number;
  ganhas: number;
  perdidas: number;
  em_jogo: number;
};

export async function conversaoPorFase(
  orgId: string,
  carteiras: string[] = [],
): Promise<LinhaConversao[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase
    .from("conversao_por_fase")
    .select("carteira_id, fase, fechadas, ganhas, perdidas, em_jogo")
    .eq("org_id", orgId);

  if (carteiras.length) consulta = consulta.in("carteira_id", carteiras);

  const { data, error } = await consulta;
  if (error) {
    console.error("[conversao] falha ao ler:", error.message);
    return [];
  }
  return (data ?? []) as LinhaConversao[];
}

/** Abaixo disto não se afirma taxa — só se conta o que aconteceu. */
export const MINIMO_FECHADAS = 10;

export type TaxaFase = {
  fase: string;
  fechadas: number;
  ganhas: number;
  perdidas: number;
  emJogo: number;
  /** Fração de 0 a 1, ou null quando não há base para afirmar. */
  taxa: number | null;
  /** Intervalo de Wilson a 95%, na mesma escala. */
  intervalo: { min: number; max: number } | null;
  /** O que dá para dizer com esta amostra. */
  confianca: "sem_base" | "indicio" | "medida";
  /** A frase que a tela mostra — o fato antes do percentual. */
  frase: string;
};

/**
 * Agrega por fase somando contagens de todas as carteiras.
 *
 * Recebe a ordem das fases de fora (o catálogo é do assinante) para não
 * inventar sequência que não é do cliente.
 */
export function agregarPorFase(
  linhas: LinhaConversao[],
  ordemDasFases: string[] = [],
): TaxaFase[] {
  const soma = new Map<string, { fechadas: number; ganhas: number; perdidas: number; emJogo: number }>();

  for (const l of linhas) {
    const atual = soma.get(l.fase) ?? { fechadas: 0, ganhas: 0, perdidas: 0, emJogo: 0 };
    atual.fechadas += Number(l.fechadas);
    atual.ganhas += Number(l.ganhas);
    atual.perdidas += Number(l.perdidas);
    atual.emJogo += Number(l.em_jogo);
    soma.set(l.fase, atual);
  }

  const saida = [...soma.entries()].map(([fase, c]) => montarTaxa(fase, c));

  return saida.sort((a, b) => {
    const ia = ordemDasFases.indexOf(a.fase);
    const ib = ordemDasFases.indexOf(b.fase);
    if (ia === -1 && ib === -1) return a.fase.localeCompare(b.fase);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function montarTaxa(
  fase: string,
  c: { fechadas: number; ganhas: number; perdidas: number; emJogo: number },
): TaxaFase {
  const base = {
    fase,
    fechadas: c.fechadas,
    ganhas: c.ganhas,
    perdidas: c.perdidas,
    emJogo: c.emJogo,
  };

  if (c.fechadas < MINIMO_FECHADAS) {
    return {
      ...base,
      taxa: null,
      intervalo: null,
      confianca: "sem_base",
      frase:
        c.fechadas === 0
          ? "nada fechou ainda depois desta fase"
          : `só ${c.fechadas} fecharam — pouco para falar em taxa`,
    };
  }

  const taxa = c.ganhas / c.fechadas;
  const intervalo = wilson(c.ganhas, c.fechadas);

  return {
    ...base,
    taxa,
    intervalo,
    confianca: c.fechadas >= 30 ? "medida" : "indicio",
    frase: `${c.ganhas} de ${c.fechadas} que fecharam terminaram ganhas`,
  };
}

/**
 * Intervalo de Wilson a 95%.
 *
 * Escolhido no lugar do intervalo normal simples porque com amostra
 * pequena — que é o caso aqui — o normal produz limites fora de [0,1] e
 * mente com cara de estatística. Wilson se comporta na borda.
 */
export function wilson(sucessos: number, total: number): { min: number; max: number } {
  if (total <= 0) return { min: 0, max: 1 };

  const z = 1.96;
  const p = sucessos / total;
  const z2 = z * z;
  const denominador = 1 + z2 / total;
  const centro = (p + z2 / (2 * total)) / denominador;
  const margem =
    (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denominador;

  return {
    min: Math.max(0, centro - margem),
    max: Math.min(1, centro + margem),
  };
}

export function formatarTaxa(fracao: number | null): string {
  if (fracao === null) return "—";
  return `${Math.round(fracao * 100)}%`;
}

export function formatarIntervalo(i: { min: number; max: number } | null): string {
  if (!i) return "";
  return `entre ${Math.round(i.min * 100)}% e ${Math.round(i.max * 100)}%`;
}
