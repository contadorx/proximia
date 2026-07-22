import { criarClienteServidor } from "./supabase/server";
import type { Fase } from "./oportunidades";

export type FaseConfig = {
  id: string;
  fase: Fase;
  rotulo: string;
  prazo_esperado_dias: number | null;
  ordem: number;
  ativa: boolean;
};

export type MotivoDescarte = {
  id: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
};

export type LinhaConversao = {
  oportunidade_id: string;
  carteira_id: string;
  fase: Fase;
  motivo_id: string | null;
  titulo: string;
  investimento: number | null;
  resultado_mensal: number;
  dias_na_fase: number;
  prazo_esperado_dias: number | null;
  atrasada: boolean;
  encerrada: boolean;
  ganha: boolean;
};

export async function fasesConfiguradas(orgId: string): Promise<FaseConfig[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("oportunidade_fases")
    .select("id, fase, rotulo, prazo_esperado_dias, ordem, ativa")
    .eq("org_id", orgId)
    .order("ordem");
  return (data ?? []) as FaseConfig[];
}

export async function motivosDescarte(orgId: string): Promise<MotivoDescarte[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("motivos_descarte")
    .select("id, nome, descricao, ordem, ativo")
    .eq("org_id", orgId)
    .order("ordem")
    .order("nome");
  return (data ?? []) as MotivoDescarte[];
}

export async function conversao(orgId: string, carteiras?: string[]): Promise<LinhaConversao[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase.from("oportunidade_conversao").select("*").eq("org_id", orgId);
  if (carteiras?.length) consulta = consulta.in("carteira_id", carteiras);

  const { data, error } = await consulta.limit(500);
  if (error) {
    console.error("[pipeline] falha ao consultar:", error.message);
    return [];
  }
  return (data ?? []) as LinhaConversao[];
}

/**
 * Taxa de conversão sobre o que **saiu** do funil.
 *
 * Contar oportunidade em andamento como perda é o erro clássico: enquanto
 * ela anda, não deu nem ganho nem perda, e incluí-la achata a taxa e faz
 * a equipe parecer pior do que é.
 */
export function taxaConversao(linhas: LinhaConversao[]) {
  const encerradas = linhas.filter((l) => l.encerrada);
  const ganhas = encerradas.filter((l) => l.ganha);

  return {
    emAndamento: linhas.filter((l) => !l.encerrada).length,
    encerradas: encerradas.length,
    ganhas: ganhas.length,
    perdidas: encerradas.length - ganhas.length,
    taxa: encerradas.length === 0 ? null : (ganhas.length / encerradas.length) * 100,
    atrasadas: linhas.filter((l) => !l.encerrada && l.atrasada).length,
  };
}

export function perdasPorMotivo(
  linhas: LinhaConversao[],
  motivos: MotivoDescarte[],
): { rotulo: string; quantidade: number; valor: number }[] {
  const perdidas = linhas.filter((l) => l.encerrada && !l.ganha);
  const mapa = new Map<string, { quantidade: number; valor: number }>();

  for (const l of perdidas) {
    const chave = l.motivo_id
      ? (motivos.find((m) => m.id === l.motivo_id)?.nome ?? "motivo removido")
      : "sem motivo classificado";
    const atual = mapa.get(chave) ?? { quantidade: 0, valor: 0 };
    mapa.set(chave, {
      quantidade: atual.quantidade + 1,
      valor: atual.valor + Number(l.investimento ?? 0),
    });
  }

  return [...mapa.entries()]
    .map(([rotulo, v]) => ({ rotulo, ...v }))
    .sort((a, b) => b.quantidade - a.quantidade);
}
