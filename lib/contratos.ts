import { criarClienteServidor } from "./supabase/server";

export type StatusContrato = "vigente" | "em_renegociacao" | "encerrado";
export type TipoClausula =
  | "compromisso_volume"
  | "fidelidade"
  | "reajuste"
  | "condicionante"
  | "rescisao"
  | "outra";

export const STATUS_CONTRATO: { valor: StatusContrato; rotulo: string }[] = [
  { valor: "vigente", rotulo: "Vigente" },
  { valor: "em_renegociacao", rotulo: "Em renegociação" },
  { valor: "encerrado", rotulo: "Encerrado" },
];

export const PERIODICIDADES = [
  { valor: "mensal", rotulo: "Mensal" },
  { valor: "trimestral", rotulo: "Trimestral" },
  { valor: "anual", rotulo: "Anual" },
  { valor: "unico", rotulo: "Pagamento único" },
];

export const TIPOS_CLAUSULA: { valor: TipoClausula; rotulo: string; explicacao: string }[] = [
  {
    valor: "compromisso_volume",
    rotulo: "Compromisso de volume",
    explicacao: "Quantidade mínima contratada, com ou sem cobrança do não consumido.",
  },
  { valor: "fidelidade", rotulo: "Fidelidade", explicacao: "Prazo mínimo de permanência." },
  { valor: "reajuste", rotulo: "Reajuste", explicacao: "Índice e data-base da correção." },
  {
    valor: "condicionante",
    rotulo: "Condicionante",
    explicacao: "Obrigação que sustenta o benefício concedido.",
  },
  { valor: "rescisao", rotulo: "Rescisão", explicacao: "Condições e custo de encerrar antes." },
  { valor: "outra", rotulo: "Outra", explicacao: "Qualquer condição que precise de acompanhamento." },
];

export type Contrato = {
  id: string;
  conta_id: string;
  carteira_id: string;
  numero: string | null;
  tipo: string | null;
  modalidade: string | null;
  natureza_beneficio: string | null;
  inicio: string | null;
  fim: string | null;
  renovacao_automatica: boolean;
  aviso_previa_dias: number;
  valor_base: number | null;
  periodicidade: string | null;
  status: StatusContrato;
  link_documento: string | null;
  observacoes: string | null;
  janela_renegociacao: string | null;
};

export type Clausula = {
  id: string;
  contrato_id: string;
  tipo: TipoClausula;
  descricao: string;
  parametros: Record<string, unknown>;
  monitorada: boolean;
  antecedencia_dias: number;
  data_referencia: string | null;
};

const CAMPOS =
  "id, conta_id, carteira_id, numero, tipo, modalidade, natureza_beneficio, inicio, fim, renovacao_automatica, aviso_previa_dias, valor_base, periodicidade, status, link_documento, observacoes, janela_renegociacao";

export async function listarContratos(opcoes: {
  orgId: string;
  contaId?: string;
  carteiraId?: string;
  situacao?: string;
}): Promise<Contrato[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase.from("contratos").select(CAMPOS).eq("org_id", opcoes.orgId);

  if (opcoes.contaId) consulta = consulta.eq("conta_id", opcoes.contaId);
  if (opcoes.carteiraId) consulta = consulta.eq("carteira_id", opcoes.carteiraId);

  const { data, error } = await consulta.order("fim", { nullsFirst: false }).limit(300);
  if (error) {
    console.error("[contratos] falha ao listar:", error.message);
    return [];
  }

  const contratos = (data ?? []) as Contrato[];
  const filtrados = opcoes.situacao
    ? contratos.filter((c) => urgencia(c).chave === opcoes.situacao)
    : contratos;

  // Mais urgente primeiro: vencido, depois janela aberta, depois o resto.
  return filtrados.sort((a, b) => urgencia(a).ordem - urgencia(b).ordem);
}

export async function obterContrato(id: string): Promise<Contrato | null> {
  const supabase = criarClienteServidor();
  const { data } = await supabase.from("contratos").select(CAMPOS).eq("id", id).maybeSingle();
  return (data as Contrato) ?? null;
}

export async function clausulasDoContrato(contratoId: string): Promise<Clausula[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("contrato_clausulas")
    .select("id, contrato_id, tipo, descricao, parametros, monitorada, antecedencia_dias, data_referencia")
    .eq("contrato_id", contratoId)
    .order("monitorada", { ascending: false })
    .order("data_referencia", { nullsFirst: false });
  return (data ?? []) as Clausula[];
}

/* ---------- urgência ---------- */

export type Urgencia = {
  chave: "vencido" | "janela" | "acompanhar" | "encerrado" | "sem_prazo";
  rotulo: string;
  detalhe: string;
  ordem: number;
  tom: "alerta" | "atencao" | "neutro" | "ok";
};

export function diasAte(data: string | null): number | null {
  if (!data) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${data.slice(0, 10)}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

/**
 * "Vencido" não é status declarado: é consequência da data de fim ter passado
 * com o contrato ainda vigente. O sistema mostra isso sozinho.
 */
export function urgencia(contrato: Contrato): Urgencia {
  if (contrato.status === "encerrado") {
    return { chave: "encerrado", rotulo: "Encerrado", detalhe: "", ordem: 5, tom: "neutro" };
  }

  const diasFim = diasAte(contrato.fim);
  if (diasFim === null) {
    return {
      chave: "sem_prazo",
      rotulo: "Sem prazo",
      detalhe: "Data de fim não registrada",
      ordem: 4,
      tom: "atencao",
    };
  }

  if (diasFim < 0) {
    const dias = Math.abs(diasFim);
    return {
      chave: "vencido",
      rotulo: "Vencido",
      detalhe: contrato.renovacao_automatica
        ? `Venceu há ${dias} ${dias === 1 ? "dia" : "dias"} · renovação automática`
        : `Venceu há ${dias} ${dias === 1 ? "dia" : "dias"} · sem renovação automática`,
      ordem: 0,
      tom: "alerta",
    };
  }

  const diasJanela = diasAte(contrato.janela_renegociacao);
  if (diasJanela !== null && diasJanela <= 0) {
    return {
      chave: "janela",
      rotulo: "Janela aberta",
      detalhe: `Vence em ${diasFim} ${diasFim === 1 ? "dia" : "dias"} · a conversa já deveria ter começado`,
      ordem: 1,
      tom: "alerta",
    };
  }

  if (diasJanela !== null && diasJanela <= 60) {
    return {
      chave: "acompanhar",
      rotulo: "Janela próxima",
      detalhe: `Abre em ${diasJanela} ${diasJanela === 1 ? "dia" : "dias"} · vence em ${diasFim}`,
      ordem: 2,
      tom: "atencao",
    };
  }

  return {
    chave: "acompanhar",
    rotulo: "Em dia",
    detalhe: `Vence em ${diasFim} dias`,
    ordem: 3,
    tom: "ok",
  };
}

export function clausulasEmAlerta(clausulas: Clausula[]): Clausula[] {
  return clausulas.filter((c) => {
    if (!c.monitorada || !c.data_referencia) return false;
    const dias = diasAte(c.data_referencia);
    return dias !== null && dias <= c.antecedencia_dias;
  });
}

export function classeSelo(tom: Urgencia["tom"]): string {
  if (tom === "alerta") return "selo selo-falta";
  if (tom === "ok") return "selo selo-ok";
  return "selo selo-neutro";
}
