import { criarClienteServidor } from "./supabase/server";

export type StatusFrente =
  | "identificada"
  | "em_analise"
  | "em_execucao"
  | "concluida"
  | "descartada";

export const STATUS_FRENTE: {
  valor: StatusFrente;
  rotulo: string;
  explicacao: string;
  tom: "ok" | "neutro" | "atencao";
}[] = [
  {
    valor: "identificada",
    rotulo: "Identificada",
    explicacao: "Existe o tema, ainda não há análise.",
    tom: "neutro",
  },
  {
    valor: "em_analise",
    rotulo: "Em análise",
    explicacao: "Levantando os casos e o tamanho.",
    tom: "neutro",
  },
  {
    valor: "em_execucao",
    rotulo: "Em execução",
    explicacao: "Trabalho em campo, com dono e prazo.",
    tom: "ok",
  },
  { valor: "concluida", rotulo: "Concluída", explicacao: "Encerrada com resultado.", tom: "ok" },
  {
    valor: "descartada",
    rotulo: "Descartada",
    explicacao: "Não se sustenta — e o motivo fica registrado.",
    tom: "atencao",
  },
];

export type Frente = {
  id: string;
  carteira_id: string;
  catalogo_id: string | null;
  titulo: string;
  status: StatusFrente;
  motivo_descarte: string | null;
  dono_id: string | null;
  qtd_casos: number | null;
  potencial_bruto: number | null;
  potencial_origem: string | null;
  potencial_data: string | null;
  valor_capturado: number | null;
  capturado_confirmado_em: string | null;
  proxima_etapa: string | null;
  prazo: string | null;
  links: { rotulo: string; url: string }[];
  observacoes: string | null;
  atualizado_em: string;
};

export type TipoFrente = { id: string; nome: string; descricao: string | null; ativo: boolean };

const CAMPOS =
  "id, carteira_id, catalogo_id, titulo, status, motivo_descarte, dono_id, qtd_casos, potencial_bruto, potencial_origem, potencial_data, valor_capturado, capturado_confirmado_em, proxima_etapa, prazo, links, observacoes, atualizado_em";

const ORDEM: Record<StatusFrente, number> = {
  em_execucao: 0,
  em_analise: 1,
  identificada: 2,
  concluida: 3,
  descartada: 4,
};

export async function listarFrentes(opcoes: {
  orgId: string;
  carteiraId?: string;
  carteiras?: string[];
  status?: string[];
}): Promise<Frente[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase.from("frentes").select(CAMPOS).eq("org_id", opcoes.orgId);

  if (opcoes.carteiraId) consulta = consulta.eq("carteira_id", opcoes.carteiraId);
  if (opcoes.carteiras?.length) consulta = consulta.in("carteira_id", opcoes.carteiras);
  if (opcoes.status?.length) consulta = consulta.in("status", opcoes.status);

  const { data, error } = await consulta.limit(300);
  if (error) {
    console.error("[frentes] falha ao listar:", error.message);
    return [];
  }

  // Em execução primeiro; dentro do mesmo status, prazo mais próximo antes.
  return ((data ?? []) as Frente[]).sort((a, b) => {
    const porStatus = ORDEM[a.status] - ORDEM[b.status];
    if (porStatus !== 0) return porStatus;
    if (a.prazo && b.prazo) return a.prazo.localeCompare(b.prazo);
    if (a.prazo) return -1;
    if (b.prazo) return 1;
    return a.titulo.localeCompare(b.titulo, "pt-BR");
  });
}

export async function obterFrente(id: string): Promise<Frente | null> {
  const supabase = criarClienteServidor();
  const { data } = await supabase.from("frentes").select(CAMPOS).eq("id", id).maybeSingle();
  return (data as Frente) ?? null;
}

export async function tiposDeFrente(orgId: string): Promise<TipoFrente[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("frente_catalogo")
    .select("id, nome, descricao, ativo")
    .eq("org_id", orgId)
    .order("nome");
  return (data ?? []) as TipoFrente[];
}

export function rotuloStatus(status: StatusFrente): string {
  return STATUS_FRENTE.find((s) => s.valor === status)?.rotulo ?? status;
}

export function classeStatus(status: StatusFrente): string {
  const tom = STATUS_FRENTE.find((s) => s.valor === status)?.tom ?? "neutro";
  if (tom === "ok") return "selo selo-ok";
  if (tom === "atencao") return "selo selo-falta";
  return "selo selo-neutro";
}

/** Totais de uma lista. Potencial e capturado somam separados, nunca juntos. */
export function totais(frentes: Frente[]) {
  const ativas = frentes.filter((f) => f.status !== "descartada" && f.status !== "concluida");
  return {
    ativas: ativas.length,
    casos: ativas.reduce((t, f) => t + (f.qtd_casos ?? 0), 0),
    potencial: ativas.reduce((t, f) => t + Number(f.potencial_bruto ?? 0), 0),
    capturado: frentes.reduce((t, f) => t + Number(f.valor_capturado ?? 0), 0),
  };
}
