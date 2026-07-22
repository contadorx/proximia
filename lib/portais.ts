import { criarClienteServidor } from "./supabase/server";

export type Portal = {
  id: string;
  org_id: string;
  carteira_id: string;
  titulo: string | null;
  destinatario: string | null;
  token: string;
  status: "ativo" | "revogado";
  expira_em: string;
  mostrar_valores: boolean;
  mostrar_autores: boolean;
  mostrar_contratos: boolean;
  mostrar_pendencias: boolean;
  dias_periodo: number;
  criado_em: string;
  criado_por: string | null;
  revogado_em: string | null;
};

/** O que o visitante recebe. Espelha o jsonb devolvido por portal_dados. */
export type DadosPortal = {
  valido: boolean;
  motivo?: string;
  portal_id?: string;
  titulo?: string | null;
  expira_em?: string;
  periodo_dias?: number;
  desde?: string;
  mostrar_valores?: boolean;
  organizacao?: string;
  carteira?: { nome: string; codigo: string | null; regiao: string | null };
  contas?: number;
  potencial?: number | null;
  capturado?: number | null;
  frentes?: {
    titulo: string;
    status: string;
    casos: number | null;
    proxima: string | null;
    prazo: string | null;
    potencial: number | null;
    capturado: number | null;
  }[];
  contratos?: { numero: string | null; conta: string | null; fim: string; situacao: string }[] | null;
  entregas?: { data: string; titulo: string | null; corpo: string; autor: string | null }[];
  pendencias?: { titulo: string; vence: string; atrasado: boolean }[] | null;
};

const CAMPOS =
  "id, org_id, carteira_id, titulo, destinatario, token, status, expira_em, mostrar_valores, mostrar_autores, mostrar_contratos, mostrar_pendencias, dias_periodo, criado_em, criado_por, revogado_em";

export async function listarPortais(orgId: string, carteiraId?: string): Promise<Portal[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase.from("portais").select(CAMPOS).eq("org_id", orgId);
  if (carteiraId) consulta = consulta.eq("carteira_id", carteiraId);

  const { data, error } = await consulta.order("criado_em", { ascending: false }).limit(200);
  if (error) {
    console.error("[portais] falha ao listar:", error.message);
    return [];
  }
  return (data ?? []) as Portal[];
}

/** Quantas vezes cada link foi aberto, e quando foi a última. */
export async function acessosPorPortal(
  orgId: string,
): Promise<Map<string, { total: number; ultimo: string }>> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("portal_acessos")
    .select("portal_id, criado_em")
    .eq("org_id", orgId)
    .order("criado_em", { ascending: false })
    .limit(2000);

  const mapa = new Map<string, { total: number; ultimo: string }>();
  if (error || !data) return mapa;

  for (const linha of data) {
    const id = linha.portal_id as string;
    const atual = mapa.get(id);
    if (atual) atual.total += 1;
    else mapa.set(id, { total: 1, ultimo: linha.criado_em as string });
  }
  return mapa;
}

export type SituacaoPortal = { rotulo: string; classe: string; detalhe: string };

export function situacaoPortal(p: Portal): SituacaoPortal {
  if (p.status === "revogado") {
    return { rotulo: "Encerrado", classe: "selo selo-neutro", detalhe: "o endereço não abre mais" };
  }

  const dias = Math.ceil((new Date(p.expira_em).getTime() - Date.now()) / 86400000);

  if (dias < 0) {
    return { rotulo: "Expirado", classe: "selo selo-falta", detalhe: "o prazo passou" };
  }
  if (dias <= 7) {
    return {
      rotulo: "Expira logo",
      classe: "selo selo-atencao",
      detalhe: dias === 0 ? "expira hoje" : `expira em ${dias} dia(s)`,
    };
  }
  return { rotulo: "Ativo", classe: "selo selo-ok", detalhe: `expira em ${dias} dias` };
}

/**
 * Endereço completo do portal. Vem de variável de ambiente porque o
 * servidor não sabe por qual domínio a pessoa chegou — e o link vai ser
 * colado num e-mail, onde caminho relativo não existe.
 */
export function enderecoPortal(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return `${base.replace(/\/$/, "")}/portal/${token}`;
}
