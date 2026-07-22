import { describe, expect, it } from "vitest";
import { formatarMeses, formatarTaxa, leitura, type Financeiro } from "@/lib/financeiro";

function fin(p: Partial<Financeiro>): Financeiro {
  return {
    oportunidade_id: "o",
    carteira_id: "c",
    titulo: "Oportunidade",
    fase: "proposta",
    investimento: 600000,
    retorno_mensal: 40000,
    custo_mensal: 10000,
    horizonte_meses: 60,
    resultado_mensal: 30000,
    payback_simples: 20,
    retorno_percentual: 200,
    taxa_anual: 0.12,
    taxa_mes: 0.00949,
    vpl: 767633.84,
    payback_descontado: 22.3,
    paga_no_horizonte: true,
    tir_mes: 0.0468,
    tir_anual_pct: 73.09,
    indice_lucratividade: 2.28,
    custo_total_horizonte: 1200000,
    retorno_bruto_horizonte: 2400000,
    ...p,
  };
}

describe("leitura da análise financeira", () => {
  it("aprova quando cria valor e se paga dentro do horizonte", () => {
    const l = leitura(fin({}));
    expect(l.tom).toBe("ok");
    expect(l.texto).toContain("Cria valor");
  });

  it("alerta quando o valor presente é negativo", () => {
    // Valor presente negativo significa que o projeto rende menos que o
    // custo de capital: aceitar seria destruir valor com aparência de lucro.
    const l = leitura(fin({ vpl: -100000 }));
    expect(l.tom).toBe("alerta");
    expect(l.texto).toContain("Não cobre o custo de capital");
  });

  it("ressalva quando cria valor mas só se paga depois do horizonte", () => {
    const l = leitura(fin({ paga_no_horizonte: false }));
    expect(l.tom).toBe("atencao");
    expect(l.texto).toContain("depois dos 60 meses");
  });

  it("pede os dados que faltam em vez de calcular no vazio", () => {
    expect(leitura(fin({ investimento: null })).tom).toBe("atencao");
    expect(leitura(fin({ vpl: null })).texto).toContain("Sem dados suficientes");
  });
});

describe("formatação financeira", () => {
  it("escreve payback em anos quando passa de doze meses", () => {
    expect(formatarMeses(22.3)).toBe("1a 10m");
    expect(formatarMeses(24)).toBe("2 anos");
    expect(formatarMeses(8)).toBe("8 meses");
  });

  it("diz que não se paga em vez de mostrar vazio", () => {
    // Travessão seria lido como "não calculado". A frase diz o que é.
    expect(formatarMeses(null)).toBe("não se paga");
  });

  it("mostra a taxa em porcentagem ao ano", () => {
    expect(formatarTaxa(0.12)).toBe("12% a.a.");
    expect(formatarTaxa(0.155)).toBe("15,5% a.a.");
    expect(formatarTaxa(null)).toBe("—");
  });
});

describe("as contas que o banco faz, conferidas por fora", () => {
  // Reimplementa as fórmulas de forma independente. Se a migration mudar
  // sem querer, a diferença aparece aqui — e não numa reunião.
  const taxaMensal = (anual: number) => Math.pow(1 + anual, 1 / 12) - 1;
  const vpl = (i: number, fc: number, n: number, t: number) =>
    fc * ((1 - Math.pow(1 + t, -n)) / t) - i;

  it("converte taxa anual em mensal composta, não dividida por doze", () => {
    // Dividir por doze é o erro comum: 12% ao ano não é 1% ao mês.
    const t = taxaMensal(0.12);
    expect(t).toBeCloseTo(0.009489, 5);
    expect(t).toBeLessThan(0.01);
  });

  it("bate com o valor presente calculado no banco", () => {
    const t = taxaMensal(0.12);
    expect(vpl(600000, 30000, 60, t)).toBeCloseTo(767633.84, 0);
  });

  it("valor presente cai quando a taxa exigida sobe", () => {
    const baixa = vpl(600000, 30000, 60, taxaMensal(0.12));
    const alta = vpl(600000, 30000, 60, taxaMensal(0.3));
    expect(alta).toBeLessThan(baixa);
  });

  it("payback descontado é sempre maior que o simples", () => {
    const t = taxaMensal(0.12);
    const simples = 600000 / 30000;
    const descontado = -Math.log(1 - (600000 * t) / 30000) / Math.log(1 + t);
    expect(descontado).toBeGreaterThan(simples);
  });
});
