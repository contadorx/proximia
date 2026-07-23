import { criarClienteServidor } from "./supabase/server";

/**
 * Defasagem de registro: quantos dias entre o que aconteceu e o que foi
 * digitado.
 *
 * O número sozinho não decide nada — três dias é bom ou ruim? Por isso a
 * leitura vem junto, com a faixa e o que fazer. É a diferença entre um
 * indicador e um relatório que ninguém usa.
 *
 * A medida é por carteira e nunca por pessoa. Defasagem por pessoa não
 * mede qualidade do dado, mede a pessoa, e vira régua de cobrança na
 * primeira reunião difícil.
 */

export type LinhaDefasagem = {
  carteira_id: string;
  registros: number;
  registros_antecipados: number;
  no_mesmo_dia: number;
  ate_uma_semana: number;
  acima_de_uma_semana: number;
  dias_mediana: number | null;
  dias_p90: number | null;
  dias_maximo: number | null;
};

export async function defasagemPorCarteira(
  orgId: string,
  carteiras: string[] = [],
): Promise<LinhaDefasagem[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase
    .from("defasagem_registro")
    .select(
      "carteira_id, registros, registros_antecipados, no_mesmo_dia, ate_uma_semana, acima_de_uma_semana, dias_mediana, dias_p90, dias_maximo",
    )
    .eq("org_id", orgId);

  if (carteiras.length) consulta = consulta.in("carteira_id", carteiras);

  const { data, error } = await consulta;
  if (error) {
    console.error("[defasagem] falha ao ler:", error.message);
    return [];
  }
  return (data ?? []) as LinhaDefasagem[];
}

/** Amostra pequena não descreve operação nenhuma — abaixo disto, não se conclui. */
export const MINIMO_PARA_CONCLUIR = 20;

export type Faixa = "sem_base" | "no_dia" | "aceitavel" | "atencao" | "critica";

export type Leitura = {
  faixa: Faixa;
  rotulo: string;
  /** O que este número quer dizer, em uma frase. */
  significado: string;
  /** O que fazer — inclusive "nada". */
  acao: string;
  classe: string;
};

export function lerDefasagem(linha: LinhaDefasagem): Leitura {
  if (linha.registros < MINIMO_PARA_CONCLUIR || linha.dias_mediana === null) {
    return {
      faixa: "sem_base",
      rotulo: "sem base",
      significado: `${linha.registros} registro(s) nos últimos doze meses — pouco para tirar conclusão.`,
      acao: "Não decida nada por este número ainda.",
      classe: "selo selo-neutro",
    };
  }

  const m = linha.dias_mediana;

  if (m < 1) {
    return {
      faixa: "no_dia",
      rotulo: "no mesmo dia",
      significado: "O registro acontece no dia em que a conversa acontece.",
      acao: "Não há problema a resolver aqui. Aplicativo de campo seria desperdício.",
      classe: "selo selo-ok",
    };
  }

  if (m <= 2) {
    return {
      faixa: "aceitavel",
      rotulo: `${formatarDias(m)} de atraso`,
      significado: "O registro chega com um dia ou dois — a memória ainda está fresca.",
      acao: "Nada a fazer. Vale reolhar se subir.",
      classe: "selo selo-ok",
    };
  }

  if (m <= 5) {
    return {
      faixa: "atencao",
      rotulo: `${formatarDias(m)} de atraso`,
      significado:
        "O registro está sendo feito de memória, dias depois — é onde a anotação fica vaga.",
      acao: "Comece pelo caminho curto: concluir o compromisso e registrar no mesmo movimento.",
      classe: "selo selo-neutro",
    };
  }

  return {
    faixa: "critica",
    rotulo: `${formatarDias(m)} de atraso`,
    significado: "O dado está nascendo errado: uma semana depois ninguém lembra o que foi dito.",
    acao: "Vale investigar esta carteira antes de investir em ferramenta — pode ser processo, não sinal.",
    classe: "selo selo-falta",
  };
}

export function formatarDias(dias: number): string {
  if (dias < 1) return "menos de 1 dia";
  const arredondado = Math.round(dias * 10) / 10;
  return `${arredondado.toLocaleString("pt-BR")} ${arredondado === 1 ? "dia" : "dias"}`;
}

/**
 * A leitura da organização inteira, para a frase que abre o bloco.
 * Usa a mediana ponderada pelo volume de registros, não a média das
 * medianas: carteira com 3 registros não pode pesar igual a uma com 300.
 */
export function leituraGeral(linhas: LinhaDefasagem[]): {
  registros: number;
  medianaPonderada: number | null;
  carteirasCriticas: number;
  semBase: number;
} {
  const comBase = linhas.filter(
    (l) => l.registros >= MINIMO_PARA_CONCLUIR && l.dias_mediana !== null,
  );

  const registros = linhas.reduce((s, l) => s + l.registros, 0);

  const pesoTotal = comBase.reduce((s, l) => s + l.registros, 0);
  const medianaPonderada =
    pesoTotal > 0
      ? comBase.reduce((s, l) => s + (l.dias_mediana as number) * l.registros, 0) / pesoTotal
      : null;

  return {
    registros,
    medianaPonderada,
    carteirasCriticas: comBase.filter((l) => lerDefasagem(l).faixa === "critica").length,
    semBase: linhas.length - comBase.length,
  };
}
