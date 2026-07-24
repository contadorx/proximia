import { criarClienteServidor } from "./supabase/server";

/**
 * Índice de cuidado da conta.
 *
 * Mede quanto do checklist que a PRÓPRIA operação definiu está verdadeiro
 * numa conta. Não prevê perda, não estima risco, não é nota de crédito.
 *
 * A distinção não é preciosismo. "Risco de churn 40%" convida a
 * desconfiar do número e a discutir o modelo; "faltam 4 dos 12 itens que
 * vocês mesmos definiram, e são estes" convida a resolver. A segunda
 * leitura é a única que vira trabalho.
 *
 * Por isso a regra de exibição: o número nunca aparece sozinho. Onde
 * houver índice, tem que haver a lista do que falta.
 */

export type CriterioAvaliado = {
  conta_id: string;
  criterio_id: string;
  chave: string;
  rotulo: string;
  descricao: string | null;
  peso: number;
  ordem: number;
  parametro: number | null;
  cumprido: boolean | null;
};

export type Cuidado = {
  conta_id: string;
  carteira_id: string;
  criterios: number;
  cumpridos: number;
  peso_total: number;
  peso_cumprido: number;
  indice: number;
};

export type Criterio = {
  id: string;
  chave: string;
  rotulo: string;
  descricao: string | null;
  peso: number;
  parametro: number | null;
  ativo: boolean;
  ordem: number;
};

export async function reguaDaOrg(orgId: string): Promise<Criterio[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("conta_criterios")
    .select("id, chave, rotulo, descricao, peso, parametro, ativo, ordem")
    .eq("org_id", orgId)
    .order("ordem");

  if (error) {
    console.error("[cuidado] falha ao ler a régua:", error.message);
    return [];
  }
  return (data ?? []) as Criterio[];
}

export async function cuidadoDaConta(contaId: string): Promise<Cuidado | null> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("conta_cuidado")
    .select("conta_id, carteira_id, criterios, cumpridos, peso_total, peso_cumprido, indice")
    .eq("conta_id", contaId)
    .maybeSingle();
  return (data as Cuidado) ?? null;
}

export async function itensDaConta(contaId: string): Promise<CriterioAvaliado[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("conta_criterio_avaliado")
    .select("conta_id, criterio_id, chave, rotulo, descricao, peso, ordem, parametro, cumprido")
    .eq("conta_id", contaId)
    .order("ordem");

  if (error) {
    console.error("[cuidado] falha ao ler os itens:", error.message);
    return [];
  }
  return (data ?? []) as CriterioAvaliado[];
}

export async function cuidadoDaOrg(orgId: string): Promise<Cuidado[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("conta_cuidado")
    .select("conta_id, carteira_id, criterios, cumpridos, peso_total, peso_cumprido, indice")
    .eq("org_id", orgId)
    .limit(500);
  return (data ?? []) as Cuidado[];
}

/**
 * A leitura em palavra. Faixas largas de propósito: precisão maior seria
 * falsa, já que o índice depende de uma régua que cada operação ajusta.
 */
export function lerCuidado(indice: number | null | undefined): {
  faixa: "completo" | "bom" | "atencao" | "critico" | "sem_regua";
  rotulo: string;
  classe: string;
} {
  if (indice === null || indice === undefined) {
    return { faixa: "sem_regua", rotulo: "sem régua", classe: "selo selo-neutro" };
  }
  if (indice >= 90) return { faixa: "completo", rotulo: `${indice}%`, classe: "selo selo-ok" };
  if (indice >= 70) return { faixa: "bom", rotulo: `${indice}%`, classe: "selo selo-ok" };
  if (indice >= 40) return { faixa: "atencao", rotulo: `${indice}%`, classe: "selo selo-neutro" };
  return { faixa: "critico", rotulo: `${indice}%`, classe: "selo selo-falta" };
}
