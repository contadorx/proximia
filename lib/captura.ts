import { criarClienteServidor } from "./supabase/server";

export type PontoCaptura = { mes: string; valor: number; origem: string };
export type MesCaptura = { mes: string; rotulo: string; valor: number };

/** Série dos últimos N meses, com os meses vazios preenchidos com zero. */
export async function capturaMensal(orgId: string, meses = 12): Promise<MesCaptura[]> {
  const supabase = criarClienteServidor();

  const inicio = new Date();
  inicio.setDate(1);
  inicio.setMonth(inicio.getMonth() - (meses - 1));
  const desde = inicio.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("captura_mensal")
    .select("mes, valor, origem")
    .eq("org_id", orgId)
    .gte("mes", desde);

  if (error) {
    console.error("[captura] falha ao consultar:", error.message);
    return [];
  }

  const soma = new Map<string, number>();
  for (const p of (data ?? []) as PontoCaptura[]) {
    const chave = String(p.mes).slice(0, 7);
    soma.set(chave, (soma.get(chave) ?? 0) + Number(p.valor));
  }

  // Mês sem captura é informação: precisa aparecer como zero, não sumir.
  const serie: MesCaptura[] = [];
  const cursor = new Date(inicio);
  for (let i = 0; i < meses; i++) {
    const chave = cursor.toISOString().slice(0, 7);
    serie.push({
      mes: chave,
      rotulo: cursor.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      valor: soma.get(chave) ?? 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return serie;
}

export async function capturaSemData(orgId: string): Promise<number> {
  const supabase = criarClienteServidor();
  const { data } = await supabase.rpc("captura_sem_data", { p_org: orgId });
  return Number(data ?? 0);
}

export function variacao(atual: number, anterior: number): { texto: string; tom: string } | null {
  if (anterior === 0 && atual === 0) return null;
  if (anterior === 0) return { texto: "primeiro mês com captura", tom: "capturado" };

  const pct = ((atual - anterior) / anterior) * 100;
  const sinal = pct >= 0 ? "+" : "";
  return {
    texto: `${sinal}${pct.toFixed(0)}% sobre o mês anterior`,
    tom: pct >= 0 ? "capturado" : "alerta",
  };
}
