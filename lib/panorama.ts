import { criarClienteServidor } from "./supabase/server";

export type ResumoCarteira = {
  carteira_id: string;
  nome: string;
  codigo: string | null;
  regiao: string | null;
  status: "ativa" | "pausada" | "encerrada";
  responsavel_id: string | null;
  score_maturidade: number | null;
  score_ciclo: string | null;
  contas_total: number;
  contas_protecao: number;
  contas_potencial: number;
  contas_capturado: number;
  frentes_abertas: number;
  frentes_casos: number;
  frentes_potencial: number;
  frentes_capturado: number;
  contratos_total: number;
  contratos_vencidos: number;
  contratos_janela: number;
  oportunidades_abertas: number;
  oportunidades_investimento: number;
  oportunidades_resultado: number;
  compromissos_abertos: number;
  compromissos_atrasados: number;
  ultima_movimentacao: string | null;
  ultimo_registro: string | null;
};

export type Ordenacao = "atencao" | "nome" | "movimentacao" | "potencial" | "maturidade";

export const ORDENACOES: { valor: Ordenacao; rotulo: string }[] = [
  { valor: "atencao", rotulo: "Quem precisa de atenção" },
  { valor: "nome", rotulo: "Nome" },
  { valor: "movimentacao", rotulo: "Movimentação mais antiga" },
  { valor: "potencial", rotulo: "Maior potencial" },
  { valor: "maturidade", rotulo: "Menor maturidade" },
];

/** Quanto maior, mais a carteira pede atenção agora. */
export function pesoAtencao(r: ResumoCarteira): number {
  return (
    r.contratos_vencidos * 10 +
    r.contratos_janela * 6 +
    r.compromissos_atrasados * 4 +
    (diasSemMovimento(r) > 30 ? 3 : 0)
  );
}

export function diasSemMovimento(r: ResumoCarteira): number {
  if (!r.ultima_movimentacao) return 999;
  const alvo = new Date(r.ultima_movimentacao);
  return Math.floor((Date.now() - alvo.getTime()) / 86_400_000);
}

export async function panorama(orgId: string, ordem: Ordenacao = "atencao"): Promise<ResumoCarteira[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("carteira_resumo")
    .select("*")
    .eq("org_id", orgId)
    .limit(200);

  if (error) {
    console.error("[panorama] falha ao consultar:", error.message);
    return [];
  }

  const linhas = (data ?? []) as ResumoCarteira[];

  return linhas.sort((a, b) => {
    switch (ordem) {
      case "nome":
        return a.nome.localeCompare(b.nome, "pt-BR");
      case "movimentacao":
        return diasSemMovimento(b) - diasSemMovimento(a);
      case "potencial":
        return (
          Number(b.frentes_potencial) + Number(b.contas_potencial) -
          (Number(a.frentes_potencial) + Number(a.contas_potencial))
        );
      case "maturidade":
        return (a.score_maturidade ?? 101) - (b.score_maturidade ?? 101);
      default: {
        const peso = pesoAtencao(b) - pesoAtencao(a);
        return peso !== 0 ? peso : a.nome.localeCompare(b.nome, "pt-BR");
      }
    }
  });
}

export function totaisGerais(linhas: ResumoCarteira[]) {
  return linhas.reduce(
    (t, r) => ({
      carteiras: t.carteiras + 1,
      contas: t.contas + Number(r.contas_total),
      frentes: t.frentes + Number(r.frentes_abertas),
      casos: t.casos + Number(r.frentes_casos),
      potencial: t.potencial + Number(r.frentes_potencial) + Number(r.contas_potencial),
      capturado: t.capturado + Number(r.frentes_capturado) + Number(r.contas_capturado),
      oportunidades: t.oportunidades + Number(r.oportunidades_abertas),
      investimento: t.investimento + Number(r.oportunidades_investimento),
      resultadoMensal: t.resultadoMensal + Number(r.oportunidades_resultado),
      vencidos: t.vencidos + Number(r.contratos_vencidos),
      janela: t.janela + Number(r.contratos_janela),
      atrasados: t.atrasados + Number(r.compromissos_atrasados),
    }),
    {
      carteiras: 0,
      contas: 0,
      frentes: 0,
      casos: 0,
      potencial: 0,
      capturado: 0,
      oportunidades: 0,
      investimento: 0,
      resultadoMensal: 0,
      vencidos: 0,
      janela: 0,
      atrasados: 0,
    },
  );
}
