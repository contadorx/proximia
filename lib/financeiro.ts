import { criarClienteServidor } from "./supabase/server";

export type Financeiro = {
  oportunidade_id: string;
  carteira_id: string;
  titulo: string;
  fase: string;
  investimento: number | null;
  retorno_mensal: number | null;
  custo_mensal: number;
  horizonte_meses: number;
  resultado_mensal: number;
  payback_simples: number | null;
  retorno_percentual: number | null;
  taxa_anual: number;
  taxa_mes: number;
  vpl: number | null;
  payback_descontado: number | null;
  paga_no_horizonte: boolean;
  tir_mes: number | null;
  tir_anual_pct: number | null;
  indice_lucratividade: number | null;
  custo_total_horizonte: number | null;
  retorno_bruto_horizonte: number | null;
};

export async function financeiroDa(oportunidadeId: string): Promise<Financeiro | null> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("oportunidade_financeiro")
    .select("*")
    .eq("oportunidade_id", oportunidadeId)
    .maybeSingle();
  return (data as Financeiro) ?? null;
}

export async function financeiroDaOrganizacao(
  orgId: string,
  carteiras?: string[],
): Promise<Financeiro[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase.from("oportunidade_financeiro").select("*").eq("org_id", orgId);
  if (carteiras?.length) consulta = consulta.in("carteira_id", carteiras);

  const { data, error } = await consulta.limit(500);
  if (error) {
    console.error("[financeiro] falha ao consultar:", error.message);
    return [];
  }
  return (data ?? []) as Financeiro[];
}

export async function taxaDaOrganizacao(orgId: string): Promise<number> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("parametros_financeiros")
    .select("taxa_desconto_anual")
    .eq("org_id", orgId)
    .maybeSingle();
  return Number((data as { taxa_desconto_anual: number } | null)?.taxa_desconto_anual ?? 0.12);
}

export function formatarTaxa(fracao: number | null | undefined): string {
  if (fracao === null || fracao === undefined) return "—";
  return `${(Number(fracao) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% a.a.`;
}

export function formatarMeses(meses: number | null): string {
  if (meses === null) return "não se paga";
  const inteiro = Math.round(Number(meses));
  if (inteiro < 12) return `${inteiro} meses`;
  const anos = Math.floor(inteiro / 12);
  const resto = inteiro % 12;
  return resto === 0 ? `${anos} ${anos === 1 ? "ano" : "anos"}` : `${anos}a ${resto}m`;
}

/**
 * Leitura em uma frase. O número sozinho não decide nada — e quem lê nem
 * sempre trabalha com análise de investimento todo dia.
 */
export function leitura(f: Financeiro): { texto: string; tom: "ok" | "atencao" | "alerta" } {
  if (f.investimento === null || f.resultado_mensal === null) {
    return { texto: "Faltam investimento e retorno para a análise.", tom: "atencao" };
  }
  if (f.vpl === null) {
    return { texto: "Sem dados suficientes para o valor presente.", tom: "atencao" };
  }
  if (Number(f.vpl) <= 0) {
    return {
      texto: `Não cobre o custo de capital de ${formatarTaxa(f.taxa_anual)}: o valor presente é negativo.`,
      tom: "alerta",
    };
  }
  if (!f.paga_no_horizonte) {
    return {
      texto: `Cria valor, mas só se paga depois dos ${f.horizonte_meses} meses declarados.`,
      tom: "atencao",
    };
  }
  return {
    texto: `Cria valor acima do custo de capital e se paga em ${formatarMeses(f.payback_descontado)}.`,
    tom: "ok",
  };
}
