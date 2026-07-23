import { describe, expect, it } from "vitest";
import {
  MINIMO_PARA_CONCLUIR,
  formatarDias,
  lerDefasagem,
  leituraGeral,
  type LinhaDefasagem,
} from "@/lib/defasagem";

/**
 * O ponto deste indicador é decidir se vale construir alguma coisa para
 * captura em campo. Um número mal lido leva a construir o que não
 * precisava — ou a não construir o que precisava. Por isso o que se testa
 * aqui é a LEITURA, não a conta.
 */

function linha(p: Partial<LinhaDefasagem> = {}): LinhaDefasagem {
  return {
    carteira_id: "cart",
    registros: 100,
    registros_antecipados: 0,
    no_mesmo_dia: 60,
    ate_uma_semana: 30,
    acima_de_uma_semana: 10,
    dias_mediana: 1,
    dias_p90: 6,
    dias_maximo: 30,
    ...p,
  };
}

describe("faixas de leitura", () => {
  it("mediana abaixo de um dia diz para não construir nada", () => {
    const l = lerDefasagem(linha({ dias_mediana: 0 }));
    expect(l.faixa).toBe("no_dia");
    expect(l.acao).toMatch(/desperdício/i);
  });

  it("um a dois dias é aceitável e não pede ação", () => {
    expect(lerDefasagem(linha({ dias_mediana: 2 })).faixa).toBe("aceitavel");
  });

  it("três a cinco dias aponta o caminho curto antes da ferramenta", () => {
    const l = lerDefasagem(linha({ dias_mediana: 4 }));
    expect(l.faixa).toBe("atencao");
    expect(l.acao).toMatch(/caminho curto/i);
  });

  it("acima de cinco dias manda investigar antes de investir", () => {
    const l = lerDefasagem(linha({ dias_mediana: 9 }));
    expect(l.faixa).toBe("critica");
    expect(l.acao).toMatch(/investigar/i);
  });

  it("as bordas caem na faixa de baixo, não na de cima", () => {
    expect(lerDefasagem(linha({ dias_mediana: 5 })).faixa).toBe("atencao");
    expect(lerDefasagem(linha({ dias_mediana: 5.1 })).faixa).toBe("critica");
  });
});

describe("amostra pequena não conclui", () => {
  it("abaixo do mínimo, a leitura recusa concluir mesmo com mediana boa", () => {
    const l = lerDefasagem(linha({ registros: MINIMO_PARA_CONCLUIR - 1, dias_mediana: 0 }));
    expect(l.faixa).toBe("sem_base");
    expect(l.acao).toMatch(/não decida/i);
  });

  it("carteira sem registro nenhum não vira 'excelente'", () => {
    const l = lerDefasagem(linha({ registros: 0, dias_mediana: null }));
    expect(l.faixa).toBe("sem_base");
  });

  it("mediana nula com volume alto também não conclui", () => {
    // Acontece quando todos os registros são antecipados: nenhum entra na
    // mediana. Volume não compensa a falta de base.
    expect(lerDefasagem(linha({ registros: 500, dias_mediana: null })).faixa).toBe("sem_base");
  });
});

describe("leitura da organização", () => {
  it("pondera pelo volume — carteira pequena não puxa a média", () => {
    const geral = leituraGeral([
      linha({ carteira_id: "grande", registros: 300, dias_mediana: 1 }),
      linha({ carteira_id: "pequena", registros: 30, dias_mediana: 11 }),
    ]);
    // Média simples daria 6; ponderada dá 1,9.
    expect(geral.medianaPonderada).toBeCloseTo(1.9, 1);
  });

  it("conta as carteiras críticas e as sem base separadamente", () => {
    const geral = leituraGeral([
      linha({ carteira_id: "a", dias_mediana: 12 }),
      linha({ carteira_id: "b", dias_mediana: 1 }),
      linha({ carteira_id: "c", registros: 3, dias_mediana: 0 }),
    ]);
    expect(geral.carteirasCriticas).toBe(1);
    expect(geral.semBase).toBe(1);
    expect(geral.registros).toBe(203);
  });

  it("sem nenhuma carteira com base, a mediana geral é nula em vez de zero", () => {
    // Zero diria "registra no mesmo dia", que é o contrário de "não sei".
    const geral = leituraGeral([linha({ registros: 2, dias_mediana: 0 })]);
    expect(geral.medianaPonderada).toBeNull();
  });

  it("lista vazia não quebra", () => {
    const geral = leituraGeral([]);
    expect(geral.registros).toBe(0);
    expect(geral.medianaPonderada).toBeNull();
  });
});

describe("formatação", () => {
  it("abaixo de um dia é dito em palavra, não em decimal", () => {
    expect(formatarDias(0.4)).toBe("menos de 1 dia");
  });

  it("singular e plural", () => {
    expect(formatarDias(1)).toBe("1 dia");
    expect(formatarDias(3.25)).toBe("3,3 dias");
  });
});
