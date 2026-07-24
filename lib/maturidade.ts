import { criarClienteServidor } from "./supabase/server";

export const ESCALA = [
  { nota: 0, rotulo: "Não existe", explicacao: "Não há nada estruturado sobre isso." },
  { nota: 1, rotulo: "Inicial", explicacao: "Acontece de forma isolada, dependendo de pessoas." },
  { nota: 2, rotulo: "Em estruturação", explicacao: "Existe um jeito de fazer, ainda irregular." },
  { nota: 3, rotulo: "Estabelecido", explicacao: "Rotina definida e seguida na maior parte do tempo." },
  { nota: 4, rotulo: "Maduro", explicacao: "Rotina seguida, medida e melhorada." },
];

export type Dimensao = {
  id: string;
  nome: string;
  descricao: string | null;
  peso: number;
  ordem: number;
  ativo: boolean;
};

export type Pergunta = {
  id: string;
  dimensao_id: string;
  texto: string;
  ajuda: string | null;
  peso: number;
  ordem: number;
  ativo: boolean;
};

export type Ciclo = {
  id: string;
  nome: string;
  referencia: string;
  status: "aberto" | "fechado";
};

export type Resultado = {
  avaliacao_id: string;
  carteira_id: string;
  ciclo_id: string;
  status: "rascunho" | "concluida";
  concluida_em: string | null;
  ciclo_nome: string;
  ciclo_referencia: string;
  carteira_nome: string;
  respondidas: number;
  total_perguntas: number;
  score: number | null;
};

export type ScoreDimensao = {
  avaliacao_id: string;
  carteira_id: string;
  dimensao_id: string;
  dimensao: string;
  ordem: number;
  respondidas: number;
  score: number | null;
};

export type Resposta = { pergunta_id: string; nota: number; observacao: string | null };

export async function dimensoes(orgId: string): Promise<Dimensao[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("maturidade_dimensoes")
    .select("id, nome, descricao, peso, ordem, ativo")
    .eq("org_id", orgId)
    .order("ordem")
    .order("nome");
  return (data ?? []) as Dimensao[];
}

export async function perguntas(orgId: string): Promise<Pergunta[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("maturidade_perguntas")
    .select("id, dimensao_id, texto, ajuda, peso, ordem, ativo")
    .eq("org_id", orgId)
    .order("ordem");
  return (data ?? []) as Pergunta[];
}

export async function ciclos(orgId: string): Promise<Ciclo[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("maturidade_ciclos")
    .select("id, nome, referencia, status")
    .eq("org_id", orgId)
    .order("referencia", { ascending: false });
  return (data ?? []) as Ciclo[];
}

export async function resultados(orgId: string, cicloId?: string): Promise<Resultado[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase.from("maturidade_resultado").select("*").eq("org_id", orgId);
  if (cicloId) consulta = consulta.eq("ciclo_id", cicloId);
  const { data, error } = await consulta.limit(300);
  if (error) {
    console.error("[maturidade] falha ao consultar:", error.message);
    return [];
  }
  return (data ?? []) as Resultado[];
}

export async function scoresPorDimensao(avaliacaoId: string): Promise<ScoreDimensao[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("maturidade_por_dimensao")
    .select("*")
    .eq("avaliacao_id", avaliacaoId)
    .order("ordem");
  return (data ?? []) as ScoreDimensao[];
}

export async function respostasDaAvaliacao(avaliacaoId: string): Promise<Resposta[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("maturidade_respostas")
    .select("pergunta_id, nota, observacao")
    .eq("avaliacao_id", avaliacaoId);
  return (data ?? []) as Resposta[];
}

export async function obterAvaliacao(id: string) {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("maturidade_resultado")
    .select("*")
    .eq("avaliacao_id", id)
    .maybeSingle();
  return (data as Resultado) ?? null;
}

/** Faixas usadas em todo o produto para ler um score. */
export function faixa(score: number | null): { rotulo: string; classe: string } {
  if (score === null) return { rotulo: "sem avaliação", classe: "selo selo-neutro" };
  if (score < 40) return { rotulo: "Inicial", classe: "selo selo-falta" };
  if (score < 60) return { rotulo: "Em estruturação", classe: "selo selo-atencao" };
  if (score < 80) return { rotulo: "Intermediária", classe: "selo selo-neutro" };
  return { rotulo: "Avançada", classe: "selo selo-ok" };
}

/** Quadrante da matriz maturidade × potencial. */
export function quadrante(score: number | null, potencial: number, medianaPotencial: number) {
  const alta = (score ?? 0) >= 60;
  const muito = potencial >= medianaPotencial;

  if (alta && muito) return { nome: "Acelerar", explicacao: "Base pronta e muito a capturar." };
  if (!alta && muito) return { nome: "Estruturar", explicacao: "Muito a capturar, base ainda frágil." };
  if (alta && !muito) return { nome: "Sustentar", explicacao: "Base boa, potencial menor." };
  return { nome: "Observar", explicacao: "Pouco potencial e base frágil." };
}

/* ------------------------------------------------------------------ */
/* Plano de avanço                                                     */
/* ------------------------------------------------------------------ */

/**
 * Lacunas de uma avaliação, com quanto cada uma devolve ao score.
 *
 * A ordenação é por `pontos_recuperaveis`, e isso é o ponto: a pergunta
 * que rende mais não é a de nota mais baixa, é a que combina nota baixa
 * com peso alto. A conta usa a régua que o próprio assinante montou.
 */
export type Lacuna = {
  avaliacao_id: string;
  carteira_id: string;
  pergunta_id: string;
  pergunta: string;
  dimensao: string;
  nota: number;
  peso_combinado: number;
  pontos_recuperaveis: number;
};

export async function lacunasDaAvaliacao(avaliacaoId: string): Promise<Lacuna[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("maturidade_lacuna")
    .select(
      "avaliacao_id, carteira_id, pergunta_id, pergunta, dimensao, nota, peso_combinado, pontos_recuperaveis",
    )
    .eq("avaliacao_id", avaliacaoId)
    .order("pontos_recuperaveis", { ascending: false });

  if (error) {
    console.error("[maturidade] falha ao ler lacunas:", error.message);
    return [];
  }
  return (data ?? []) as Lacuna[];
}

export type ItemPlano = {
  id: string;
  pergunta_id: string;
  pergunta: string;
  dimensao: string;
  acao: string;
  dono_id: string | null;
  prazo: string | null;
  status: string;
  nota_origem: number;
  nota_atual: number | null;
  ciclo_atual: string | null;
  movimento: string;
  compromisso_id: string | null;
};

export async function planoDaCarteira(carteiraId: string): Promise<ItemPlano[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("maturidade_plano_situacao")
    .select(
      "id, pergunta_id, pergunta, dimensao, acao, dono_id, prazo, status, nota_origem, nota_atual, ciclo_atual, movimento, compromisso_id",
    )
    .eq("carteira_id", carteiraId)
    .order("criado_em", { ascending: false });

  if (error) {
    console.error("[maturidade] falha ao ler o plano:", error.message);
    return [];
  }
  return (data ?? []) as ItemPlano[];
}
