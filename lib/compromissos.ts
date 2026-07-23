import { criarClienteServidor } from "./supabase/server";
import { diasAte } from "./contratos";
import type { EntidadeTipo } from "./registros";

export type StatusCompromisso = "aberto" | "concluido" | "cancelado";
export type OrigemCompromisso = "manual" | "contrato" | "clausula";

export type Compromisso = {
  id: string;
  carteira_id: string;
  entidade_tipo: EntidadeTipo;
  entidade_id: string;
  titulo: string;
  descricao: string | null;
  vence_em: string;
  dono_id: string | null;
  alerta_dias: number;
  status: StatusCompromisso;
  concluido_em: string | null;
  origem: OrigemCompromisso;
  origem_id: string | null;
};

const CAMPOS =
  "id, carteira_id, entidade_tipo, entidade_id, titulo, descricao, vence_em, dono_id, alerta_dias, status, concluido_em, origem, origem_id";

/** Teto de linhas por consulta. Quando a lista bate nele, a tela avisa. */
export const LIMITE_COMPROMISSOS = 300;

export async function listarCompromissos(opcoes: {
  orgId: string;
  carteiraId?: string;
  carteiras?: string[];
  donoId?: string;
  status?: string;
  entidadeTipo?: EntidadeTipo;
  entidadeId?: string;
  /** "recentes" ordena do mais novo para o mais velho — para concluídos. */
  ordem?: "vencimento" | "recentes";
}): Promise<Compromisso[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase.from("compromissos").select(CAMPOS);

  // Sem organização informada, o alcance vem inteiro da RLS — é o caso de
  // quem já está dentro de uma ficha e filtra pela entidade.
  if (opcoes.orgId) consulta = consulta.eq("org_id", opcoes.orgId);

  if (opcoes.carteiraId) consulta = consulta.eq("carteira_id", opcoes.carteiraId);
  if (opcoes.carteiras?.length) consulta = consulta.in("carteira_id", opcoes.carteiras);
  if (opcoes.donoId) consulta = consulta.eq("dono_id", opcoes.donoId);
  if (opcoes.status) consulta = consulta.eq("status", opcoes.status);
  if (opcoes.entidadeTipo) consulta = consulta.eq("entidade_tipo", opcoes.entidadeTipo);
  if (opcoes.entidadeId) consulta = consulta.eq("entidade_id", opcoes.entidadeId);

  // Concluídos interessam do mais recente para trás; abertos, pelo prazo.
  // Antes era tudo por vencimento crescente com um teto de linhas: os 300
  // mais antigos ganhavam a vaga e compromissos futuros sumiam primeiro.
  const ordenada =
    opcoes.ordem === "recentes"
      ? consulta.order("vence_em", { ascending: false })
      : consulta.order("vence_em");

  const { data, error } = await ordenada.limit(LIMITE_COMPROMISSOS);
  if (error) {
    console.error("[compromissos] falha ao listar:", error.message);
    return [];
  }
  return (data ?? []) as Compromisso[];
}

export type Situacao = {
  chave: "vencido" | "hoje" | "alerta" | "adiante" | "concluido" | "cancelado";
  rotulo: string;
  detalhe: string;
  tom: "alerta" | "atencao" | "ok" | "neutro";
};

/** O alerta abre alerta_dias antes do vencimento — é o aviso, não o prazo. */
export function situacao(c: Compromisso): Situacao {
  if (c.status === "concluido") {
    return { chave: "concluido", rotulo: "Concluído", detalhe: "", tom: "ok" };
  }
  if (c.status === "cancelado") {
    return { chave: "cancelado", rotulo: "Cancelado", detalhe: "", tom: "neutro" };
  }

  const dias = diasAte(c.vence_em) ?? 0;

  if (dias < 0) {
    const n = Math.abs(dias);
    return {
      chave: "vencido",
      rotulo: "Vencido",
      detalhe: `há ${n} ${n === 1 ? "dia" : "dias"}`,
      tom: "alerta",
    };
  }
  if (dias === 0) {
    return { chave: "hoje", rotulo: "Hoje", detalhe: "vence hoje", tom: "alerta" };
  }
  if (dias <= c.alerta_dias) {
    return {
      chave: "alerta",
      rotulo: "Nos próximos dias",
      detalhe: `faltam ${dias} ${dias === 1 ? "dia" : "dias"}`,
      tom: "atencao",
    };
  }
  return {
    chave: "adiante",
    rotulo: "Adiante",
    detalhe: `faltam ${dias} dias`,
    tom: "neutro",
  };
}

export function classeSituacao(tom: Situacao["tom"]): string {
  if (tom === "alerta") return "selo selo-falta";
  if (tom === "atencao") return "selo selo-atencao";
  if (tom === "ok") return "selo selo-ok";
  return "selo selo-neutro";
}

export function precisaAtencao(c: Compromisso): boolean {
  const s = situacao(c);
  return s.chave === "vencido" || s.chave === "hoje" || s.chave === "alerta";
}

export function rotuloOrigem(origem: OrigemCompromisso): string {
  if (origem === "contrato") return "Gerado pela vigência";
  if (origem === "clausula") return "Gerado por cláusula";
  return "Manual";
}
