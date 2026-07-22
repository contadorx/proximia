import { criarClienteServidor } from "./supabase/server";

export type Mes = { mes: string; rotulo: string };

/** Doze meses a partir de N meses atrás, com rótulo curto. */
export function janela(meses: number, deslocamento = 0): Mes[] {
  const inicio = new Date();
  inicio.setDate(1);
  inicio.setMonth(inicio.getMonth() - (meses - 1) + deslocamento);

  const lista: Mes[] = [];
  for (let i = 0; i < meses; i++) {
    lista.push({
      mes: inicio.toISOString().slice(0, 7),
      rotulo: inicio.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    });
    inicio.setMonth(inicio.getMonth() + 1);
  }
  return lista;
}

async function consultar<T>(
  tabela: string,
  colunas: string,
  orgId: string,
  carteiras?: string[],
): Promise<T[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase.from(tabela).select(colunas).eq("org_id", orgId);
  if (carteiras?.length) consulta = consulta.in("carteira_id", carteiras);

  const { data, error } = await consulta.limit(2000);
  if (error) {
    console.error(`[relatorios] ${tabela}:`, error.message);
    return [];
  }
  return (data ?? []) as T[];
}

export type LinhaAlerta = { mes: string; abertos: number; resolvidos: number };
export type LinhaEsforco = { mes: string; tipo: string; quantidade: number; pessoas: number };
export type LinhaVencimento = {
  mes: string;
  contratos: number;
  valor_base: number | null;
  ja_vencidos: number;
  com_renovacao_automatica: number;
};
export type LinhaConversaoCarteira = {
  carteira_id: string;
  total: number;
  em_andamento: number;
  ganhas: number;
  perdidas: number;
  investimento_ganho: number | null;
  investimento_em_jogo: number | null;
};
export type LinhaEtapa = {
  fase: string;
  passagens: number;
  dias_medio: number | null;
  dias_mediana: number | null;
  dias_maximo: number | null;
};
export type LinhaFoto = {
  carteira_id: string;
  referencia: string;
  contas_potencial: number;
  frentes_potencial: number;
  contas_capturado: number;
  frentes_capturado: number;
  alertas_abertos: number;
  contratos_vencidos: number;
};

export const alertasMensais = (org: string, c?: string[]) =>
  consultar<LinhaAlerta>("alertas_mensais", "mes, abertos, resolvidos", org, c);

export const esforcoMensal = (org: string, c?: string[]) =>
  consultar<LinhaEsforco>("esforco_mensal", "mes, tipo, quantidade, pessoas", org, c);

export const vencimentosMensais = (org: string, c?: string[]) =>
  consultar<LinhaVencimento>(
    "vencimentos_mensais",
    "mes, contratos, valor_base, ja_vencidos, com_renovacao_automatica",
    org,
    c,
  );

export const conversaoPorCarteira = (org: string, c?: string[]) =>
  consultar<LinhaConversaoCarteira>(
    "conversao_carteira",
    "carteira_id, total, em_andamento, ganhas, perdidas, investimento_ganho, investimento_em_jogo",
    org,
    c,
  );

export const fotosMensais = (org: string, c?: string[]) =>
  consultar<LinhaFoto>(
    "fotos_carteira",
    "carteira_id, referencia, contas_potencial, frentes_potencial, contas_capturado, frentes_capturado, alertas_abertos, contratos_vencidos",
    org,
    c,
  );

export async function temposPorEtapa(orgId: string): Promise<LinhaEtapa[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("tempo_por_etapa")
    .select("fase, passagens, dias_medio, dias_mediana, dias_maximo")
    .eq("org_id", orgId);
  return (data ?? []) as LinhaEtapa[];
}

/** Soma uma série mensal na janela pedida, preenchendo mês vazio com zero. */
export function alinhar<T extends { mes: string }>(
  linhas: T[],
  meses: Mes[],
  valor: (l: T) => number,
): number[] {
  const soma = new Map<string, number>();
  for (const l of linhas) {
    const chave = String(l.mes).slice(0, 7);
    soma.set(chave, (soma.get(chave) ?? 0) + valor(l));
  }
  return meses.map((m) => soma.get(m.mes) ?? 0);
}
