import { criarClienteServidor } from "./supabase/server";

export type Fase =
  | "identificacao"
  | "viabilidade"
  | "proposta"
  | "negociacao"
  | "aprovada"
  | "implantacao"
  | "concluida"
  | "descartada";

export const FASES: {
  valor: Fase;
  rotulo: string;
  explicacao: string;
  tom: "neutro" | "ok" | "atencao";
}[] = [
  {
    valor: "identificacao",
    rotulo: "Identificação",
    explicacao: "Existe a ideia; ninguém dimensionou ainda.",
    tom: "neutro",
  },
  {
    valor: "viabilidade",
    rotulo: "Viabilidade",
    explicacao: "Levantando investimento, retorno e restrições.",
    tom: "neutro",
  },
  { valor: "proposta", rotulo: "Proposta", explicacao: "Números fechados, proposta na mesa.", tom: "neutro" },
  { valor: "negociacao", rotulo: "Negociação", explicacao: "Ajustando condições com o cliente.", tom: "neutro" },
  { valor: "aprovada", rotulo: "Aprovada", explicacao: "Decisão tomada, execução por começar.", tom: "ok" },
  { valor: "implantacao", rotulo: "Implantação", explicacao: "Investimento em curso.", tom: "ok" },
  { valor: "concluida", rotulo: "Concluída", explicacao: "Em operação e gerando retorno.", tom: "ok" },
  {
    valor: "descartada",
    rotulo: "Descartada",
    explicacao: "Não se sustenta — e o motivo fica registrado.",
    tom: "atencao",
  },
];

export type Oportunidade = {
  id: string;
  carteira_id: string;
  conta_id: string | null;
  catalogo_id: string | null;
  titulo: string;
  descricao: string | null;
  natureza: "captura" | "protecao";
  prioridade: number;
  fase: Fase;
  fase_desde: string;
  motivo_descarte: string | null;
  responsavel_id: string | null;
  proxima_etapa: string | null;
  prazo: string | null;
  investimento: number | null;
  retorno_mensal: number | null;
  custo_mensal: number;
  horizonte_meses: number;
  estimativa_origem: string | null;
  estimativa_data: string | null;
  investimento_realizado: number | null;
  retorno_confirmado: number | null;
  confirmado_em: string | null;
  links: { rotulo: string; url: string }[];
  observacoes: string | null;
  resultado_mensal: number;
  payback_meses: number | null;
  retorno_percentual: number | null;
};

export type TipoOportunidade = { id: string; nome: string; descricao: string | null; ativo: boolean };

const CAMPOS =
  "id, carteira_id, conta_id, catalogo_id, titulo, descricao, natureza, prioridade, fase, fase_desde, motivo_descarte, responsavel_id, proxima_etapa, prazo, investimento, retorno_mensal, custo_mensal, horizonte_meses, estimativa_origem, estimativa_data, investimento_realizado, retorno_confirmado, confirmado_em, links, observacoes, resultado_mensal, payback_meses, retorno_percentual";

const ORDEM: Record<Fase, number> = {
  negociacao: 0,
  proposta: 1,
  aprovada: 2,
  implantacao: 3,
  viabilidade: 4,
  identificacao: 5,
  concluida: 6,
  descartada: 7,
};

/** Teto de linhas por consulta. Quando a lista bate nele, a tela avisa. */
export const LIMITE_OPORTUNIDADES = 300;

export async function listarOportunidades(opcoes: {
  orgId: string;
  carteiraId?: string;
  carteiras?: string[];
  contaId?: string;
  fases?: string[];
}): Promise<Oportunidade[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase.from("oportunidades").select(CAMPOS).eq("org_id", opcoes.orgId);

  if (opcoes.carteiraId) consulta = consulta.eq("carteira_id", opcoes.carteiraId);
  if (opcoes.carteiras?.length) consulta = consulta.in("carteira_id", opcoes.carteiras);
  if (opcoes.contaId) consulta = consulta.eq("conta_id", opcoes.contaId);
  if (opcoes.fases?.length) consulta = consulta.in("fase", opcoes.fases);

  const { data, error } = await consulta.limit(LIMITE_OPORTUNIDADES);
  if (error) {
    console.error("[oportunidades] falha ao listar:", error.message);
    return [];
  }

  return ((data ?? []) as Oportunidade[]).sort((a, b) => {
    const porFase = ORDEM[a.fase] - ORDEM[b.fase];
    if (porFase !== 0) return porFase;
    return Number(b.investimento ?? 0) - Number(a.investimento ?? 0);
  });
}

export async function obterOportunidade(id: string): Promise<Oportunidade | null> {
  const supabase = criarClienteServidor();
  const { data } = await supabase.from("oportunidades").select(CAMPOS).eq("id", id).maybeSingle();
  return (data as Oportunidade) ?? null;
}

export async function tiposDeOportunidade(orgId: string): Promise<TipoOportunidade[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("oportunidade_catalogo")
    .select("id, nome, descricao, ativo")
    .eq("org_id", orgId)
    .order("nome");
  return (data ?? []) as TipoOportunidade[];
}

export function rotuloFase(fase: Fase): string {
  return FASES.find((f) => f.valor === fase)?.rotulo ?? fase;
}

export function classeFase(fase: Fase): string {
  const tom = FASES.find((f) => f.valor === fase)?.tom ?? "neutro";
  if (tom === "ok") return "selo selo-ok";
  if (tom === "atencao") return "selo selo-falta";
  return "selo selo-neutro";
}

export function diasNaFase(o: Oportunidade): number {
  const desde = new Date(`${o.fase_desde}T00:00:00`);
  return Math.floor((Date.now() - desde.getTime()) / 86_400_000);
}

export function formatarPayback(meses: number | null): string {
  if (meses === null) return "sem payback";
  if (meses < 1) return "menos de um mês";
  const anos = Math.floor(meses / 12);
  const resto = Math.round(meses % 12);
  if (anos === 0) return `${Math.round(meses)} meses`;
  return resto === 0 ? `${anos} ${anos === 1 ? "ano" : "anos"}` : `${anos}a ${resto}m`;
}

export function formatarPercentual(valor: number | null): string {
  if (valor === null) return "—";
  return `${Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
}

/** Totais da carteira de oportunidades. Estimado e realizado nunca se somam. */
export function totaisOportunidades(lista: Oportunidade[]) {
  const emAndamento = lista.filter((o) => o.fase !== "descartada" && o.fase !== "concluida");
  const comPayback = emAndamento.filter((o) => o.payback_meses !== null);

  return {
    emAndamento: emAndamento.length,
    investimento: emAndamento.reduce((t, o) => t + Number(o.investimento ?? 0), 0),
    resultadoMensal: emAndamento.reduce((t, o) => t + Number(o.resultado_mensal ?? 0), 0),
    paybackMedio:
      comPayback.length === 0
        ? null
        : comPayback.reduce((t, o) => t + Number(o.payback_meses), 0) / comPayback.length,
    investimentoRealizado: lista.reduce((t, o) => t + Number(o.investimento_realizado ?? 0), 0),
    retornoConfirmado: lista.reduce((t, o) => t + Number(o.retorno_confirmado ?? 0), 0),
  };
}
