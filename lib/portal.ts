import { criarClienteServidor } from "./supabase/server";

export type Portal = {
  id: string;
  carteira_id: string;
  token: string;
  ativo: boolean;
  expira_em: string | null;
  titulo: string | null;
  mensagem: string | null;
  mostrar_valores: boolean;
  acessos: number;
  ultimo_acesso: string | null;
};

export type DadosPortal = {
  valido: boolean;
  motivo?: string;
  organizacao?: string;
  carteira?: string;
  codigo?: string | null;
  regiao?: string | null;
  titulo?: string | null;
  mensagem?: string | null;
  mostrar_valores?: boolean;
  atualizado_em?: string;
  maturidade?: number | null;
  maturidade_ciclo?: string | null;
  frentes?: {
    titulo: string;
    situacao: string;
    casos: number | null;
    proxima_etapa: string | null;
    prazo: string | null;
    potencial: number | null;
    capturado: number | null;
  }[];
  contratos?: { numero: string | null; conta: string; fim: string | null; situacao: string }[];
  entregas?: { data: string; titulo: string; corpo: string }[];
  pendencias?: { titulo: string; vence: string; atrasado: boolean }[];
  oportunidades?: {
    titulo: string;
    fase: string;
    investimento: number | null;
    payback_meses: number | null;
  }[];
};

export async function portalDaCarteira(carteiraId: string): Promise<Portal | null> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("portais")
    .select("id, carteira_id, token, ativo, expira_em, titulo, mensagem, mostrar_valores, acessos, ultimo_acesso")
    .eq("carteira_id", carteiraId)
    .maybeSingle();
  return (data as Portal) ?? null;
}

export async function lerPortal(token: string): Promise<DadosPortal> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("ver_portal", { p_token: token });

  if (error) {
    console.error("[portal] falha ao ler:", error.message);
    return { valido: false, motivo: "Não foi possível abrir este endereço agora." };
  }
  return (data as DadosPortal) ?? { valido: false, motivo: "Endereço não encontrado." };
}

export const SITUACAO_FRENTE: Record<string, string> = {
  identificada: "Identificada",
  em_analise: "Em análise",
  em_execucao: "Em execução",
};

export const FASE_OPORTUNIDADE: Record<string, string> = {
  identificacao: "Identificação",
  viabilidade: "Viabilidade",
  proposta: "Proposta",
  negociacao: "Negociação",
  aprovada: "Aprovada",
  implantacao: "Implantação",
};
