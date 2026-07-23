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
  contas_potencial_protecao: number;
  contas_capturado: number;
  frentes_abertas: number;
  frentes_casos: number;
  frentes_potencial: number;
  frentes_potencial_protecao: number;
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
      protecao:
        t.protecao +
        Number(r.frentes_potencial_protecao) +
        Number(r.contas_potencial_protecao ?? 0),
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
      protecao: 0,
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


/* ---------------- lente por responsável ---------------- */

export type LinhaResponsavel = {
  userId: string | null;
  carteiras: ResumoCarteira[];
  alertasAbertos: number;
  alertasAltos: number;
  compromissosAtrasados: number;
  contratosVencidos: number;
  contratosJanela: number;
  potencial: number;
  capturado: number;
  contas: number;
  frentes: number;
  parada: number;
};

/**
 * Agrupa o panorama por quem responde, e não por carteira.
 *
 * A carteira aparece na linha de cada pessoa que responde por ela — uma
 * unidade com responsável local e apoio corporativo conta para os dois.
 * Somar valor por pessoa, aqui, seria errado duas vezes: contaria em
 * dobro e sugeriria mérito individual sobre um número que é da carteira.
 * Por isso o que se soma é carga: quantas carteiras, quantos prazos
 * vencidos, quantos alertas na mão.
 */
export function agruparPorResponsavel(
  linhas: ResumoCarteira[],
  vinculos: { carteira_id: string; user_id: string }[],
  alertas: { carteira_id: string; dono_id: string | null; severidade: string }[],
  compromissos: { carteira_id: string; dono_id: string | null; vence_em: string }[],
): LinhaResponsavel[] {
  const hoje = new Date().toISOString().slice(0, 10);
  const porPessoa = new Map<string, ResumoCarteira[]>();

  for (const v of vinculos) {
    const carteira = linhas.find((l) => l.carteira_id === v.carteira_id);
    if (!carteira) continue;
    const lista = porPessoa.get(v.user_id) ?? [];
    if (!lista.some((c) => c.carteira_id === carteira.carteira_id)) lista.push(carteira);
    porPessoa.set(v.user_id, lista);
  }

  // Carteira sem ninguém definido não some: vira uma linha própria, que é
  // exatamente o que a coordenação precisa enxergar.
  const cobertas = new Set(vinculos.map((v) => v.carteira_id));
  const orfas = linhas.filter((l) => !cobertas.has(l.carteira_id));

  const montar = (userId: string | null, carteiras: ResumoCarteira[]): LinhaResponsavel => {
    const ids = new Set(carteiras.map((c) => c.carteira_id));
    const meusAlertas = alertas.filter((a) =>
      userId ? a.dono_id === userId : a.dono_id === null && ids.has(a.carteira_id),
    );

    return {
      userId,
      carteiras,
      alertasAbertos: meusAlertas.length,
      alertasAltos: meusAlertas.filter((a) => a.severidade === "alta").length,
      compromissosAtrasados: compromissos.filter(
        (c) =>
          c.vence_em < hoje && (userId ? c.dono_id === userId : c.dono_id === null && ids.has(c.carteira_id)),
      ).length,
      contratosVencidos: carteiras.reduce((t, c) => t + Number(c.contratos_vencidos), 0),
      contratosJanela: carteiras.reduce((t, c) => t + Number(c.contratos_janela), 0),
      potencial: carteiras.reduce(
        (t, c) => t + Number(c.frentes_potencial) + Number(c.contas_potencial),
        0,
      ),
      capturado: carteiras.reduce(
        (t, c) => t + Number(c.frentes_capturado) + Number(c.contas_capturado),
        0,
      ),
      contas: carteiras.reduce((t, c) => t + Number(c.contas_total), 0),
      frentes: carteiras.reduce((t, c) => t + Number(c.frentes_abertas), 0),
      parada: carteiras.filter((c) => diasSemMovimento(c) > 30).length,
    };
  };

  const resultado = [...porPessoa.entries()].map(([userId, carteiras]) => montar(userId, carteiras));
  if (orfas.length > 0) resultado.push(montar(null, orfas));

  return resultado.sort((a, b) => {
    const pesoA = a.contratosVencidos * 10 + a.alertasAltos * 6 + a.compromissosAtrasados * 4;
    const pesoB = b.contratosVencidos * 10 + b.alertasAltos * 6 + b.compromissosAtrasados * 4;
    if (pesoA !== pesoB) return pesoB - pesoA;
    return b.carteiras.length - a.carteiras.length;
  });
}
