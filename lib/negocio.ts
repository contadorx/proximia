import { criarClienteServidor } from "./supabase/server";

export type Assinante = {
  id: string;
  nome: string;
  slug: string;
  status: "avaliacao" | "ativa" | "suspensa" | "encerrada";
  plano: string | null;
  plano_id: string | null;
  valor_mensal: number;
  ciclo: string;
  avaliacao_ate: string | null;
  proximo_vencimento: string | null;
  conta_teste: boolean;
  observacao_interna: string | null;
  criado_em: string;
  carteiras: number;
  pessoas: number;
  ultimo_registro: string | null;
};

export type PainelNegocio = {
  receita_recorrente: number;
  receita_em_avaliacao: number;
  assinantes: {
    total: number;
    ativa: number;
    avaliacao: number;
    suspensa: number;
    encerrada: number;
    teste: number;
  };
  novos_30d: number;
  avaliacoes_vencendo: number;
  serie: { mes: string; novos: number }[];
  lista: Assinante[];
};

export type Plano = {
  id: string;
  nome: string;
  descricao: string | null;
  valor_mensal: number;
  limite_carteiras: number | null;
  limite_pessoas: number | null;
  ativo: boolean;
};

export const STATUS_ASSINATURA = [
  { valor: "avaliacao", rotulo: "Em avaliação", classe: "selo selo-atencao" },
  { valor: "ativa", rotulo: "Ativa", classe: "selo selo-ok" },
  { valor: "suspensa", rotulo: "Suspensa", classe: "selo selo-falta" },
  { valor: "encerrada", rotulo: "Encerrada", classe: "selo selo-neutro" },
];

export function seloStatus(status: string) {
  return STATUS_ASSINATURA.find((s) => s.valor === status) ?? STATUS_ASSINATURA[0];
}

export async function souOperador(): Promise<boolean> {
  const supabase = criarClienteServidor();
  const { data } = await supabase.rpc("e_admin_plataforma");
  return Boolean(data);
}

export async function painelNegocio(): Promise<PainelNegocio | null> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("painel_negocio");

  if (error) {
    // Sem acesso é resposta legítima, não falha: quem não opera a
    // plataforma simplesmente não tem essa tela.
    if (!/sem acesso/i.test(error.message)) console.error("[negocio] falha:", error.message);
    return null;
  }
  return data as PainelNegocio;
}

export async function planos(): Promise<Plano[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("planos")
    .select("id, nome, descricao, valor_mensal, limite_carteiras, limite_pessoas, ativo")
    .order("ordem");
  return (data ?? []) as Plano[];
}

/** Assinante que não usa é churn que ainda não avisou. */
export function diasSemUso(a: Assinante): number | null {
  if (!a.ultimo_registro) return null;
  const dias = Math.floor(
    (Date.now() - new Date(a.ultimo_registro).getTime()) / (1000 * 60 * 60 * 24),
  );
  return dias;
}
