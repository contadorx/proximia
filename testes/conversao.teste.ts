import { describe, expect, it } from "vitest";
import {
  MINIMO_FECHADAS,
  agregarPorFase,
  formatarIntervalo,
  formatarTaxa,
  wilson,
  type LinhaConversao,
} from "@/lib/conversao";

/**
 * Este módulo existe para impedir dois erros que fazem número honesto
 * virar número enganoso: média de taxas (que dá a uma carteira de três
 * casos o mesmo peso de uma com trezentos) e percentual sobre amostra
 * minúscula. Os testes abaixo são, em boa parte, sobre isso.
 */

function linha(p: Partial<LinhaConversao> & { fase: string }): LinhaConversao {
  return {
    carteira_id: "cart",
    fechadas: 0,
    ganhas: 0,
    perdidas: 0,
    em_jogo: 0,
    ...p,
  };
}

describe("agregação soma contagens, não médias de taxa", () => {
  it("carteira pequena não pesa igual à grande", () => {
    const [proposta] = agregarPorFase([
      // 300 fechadas, 30 ganhas → 10%
      linha({ carteira_id: "grande", fase: "proposta", fechadas: 300, ganhas: 30, perdidas: 270 }),
      // 10 fechadas, 9 ganhas → 90%
      linha({ carteira_id: "pequena", fase: "proposta", fechadas: 10, ganhas: 9, perdidas: 1 }),
    ]);

    // Média de taxas daria 50%. A soma correta dá 39/310 ≈ 12,6%.
    expect(proposta.taxa).toBeCloseTo(0.126, 2);
    expect(proposta.fechadas).toBe(310);
  });

  it("junta as carteiras da mesma fase e mantém as fases separadas", () => {
    const saida = agregarPorFase([
      linha({ carteira_id: "a", fase: "proposta", fechadas: 20, ganhas: 10, perdidas: 10 }),
      linha({ carteira_id: "b", fase: "proposta", fechadas: 20, ganhas: 6, perdidas: 14 }),
      linha({ carteira_id: "a", fase: "negociacao", fechadas: 15, ganhas: 12, perdidas: 3 }),
    ]);
    expect(saida).toHaveLength(2);
    const proposta = saida.find((s) => s.fase === "proposta")!;
    expect(proposta.fechadas).toBe(40);
    expect(proposta.ganhas).toBe(16);
  });

  it("respeita a ordem de fases do assinante, e joga o desconhecido para o fim", () => {
    const saida = agregarPorFase(
      [
        linha({ fase: "negociacao", fechadas: 10, ganhas: 5, perdidas: 5 }),
        linha({ fase: "fase_esquisita_do_cliente", fechadas: 10, ganhas: 5, perdidas: 5 }),
        linha({ fase: "proposta", fechadas: 10, ganhas: 5, perdidas: 5 }),
      ],
      ["proposta", "negociacao"],
    );
    expect(saida.map((s) => s.fase)).toEqual([
      "proposta",
      "negociacao",
      "fase_esquisita_do_cliente",
    ]);
  });
});

describe("amostra pequena não vira taxa", () => {
  it("abaixo do piso não afirma percentual", () => {
    const [f] = agregarPorFase([
      linha({ fase: "proposta", fechadas: MINIMO_FECHADAS - 1, ganhas: 8, perdidas: 1 }),
    ]);
    expect(f.taxa).toBeNull();
    expect(f.confianca).toBe("sem_base");
    expect(f.frase).toMatch(/pouco para falar em taxa/);
  });

  it("nada fechado diz isso, em vez de mostrar zero por cento", () => {
    const [f] = agregarPorFase([linha({ fase: "proposta", em_jogo: 12 })]);
    expect(f.taxa).toBeNull();
    expect(f.frase).toMatch(/nada fechou ainda/);
    expect(f.emJogo).toBe(12);
  });

  it("de 10 a 29 fechadas é indício; de 30 em diante é medida", () => {
    const [indicio] = agregarPorFase([
      linha({ fase: "p", fechadas: 12, ganhas: 5, perdidas: 7 }),
    ]);
    const [medida] = agregarPorFase([
      linha({ fase: "p", fechadas: 40, ganhas: 16, perdidas: 24 }),
    ]);
    expect(indicio.confianca).toBe("indicio");
    expect(medida.confianca).toBe("medida");
  });

  it("a frase mostra o fato antes do percentual", () => {
    const [f] = agregarPorFase([linha({ fase: "p", fechadas: 40, ganhas: 16, perdidas: 24 })]);
    expect(f.frase).toBe("16 de 40 que fecharam terminaram ganhas");
  });
});

describe("oportunidade viva não é vitória nem derrota", () => {
  it("em jogo fica fora da taxa e aparece à parte", () => {
    const [f] = agregarPorFase([
      linha({ fase: "proposta", fechadas: 20, ganhas: 10, perdidas: 10, em_jogo: 50 }),
    ]);
    expect(f.taxa).toBe(0.5);
    expect(f.emJogo).toBe(50);
  });
});

describe("intervalo de Wilson", () => {
  it("com amostra pequena o intervalo é largo — que é o ponto", () => {
    const i = wilson(4, 10);
    expect(i.min).toBeGreaterThan(0.1);
    expect(i.max).toBeLessThan(0.75);
    expect(i.max - i.min).toBeGreaterThan(0.4);
  });

  it("com amostra grande o intervalo aperta em torno da taxa", () => {
    const i = wilson(400, 1000);
    expect(i.min).toBeGreaterThan(0.36);
    expect(i.max).toBeLessThan(0.44);
  });

  it("nunca sai de zero a um, nem no extremo", () => {
    const tudo = wilson(10, 10);
    const nada = wilson(0, 10);
    expect(tudo.max).toBeLessThanOrEqual(1);
    expect(nada.min).toBeGreaterThanOrEqual(0);
  });

  it("total zero devolve o intervalo inteiro em vez de dividir por zero", () => {
    expect(wilson(0, 0)).toEqual({ min: 0, max: 1 });
  });
});

describe("formatação", () => {
  it("taxa nula vira travessão, não 0%", () => {
    expect(formatarTaxa(null)).toBe("—");
    expect(formatarTaxa(0.4)).toBe("40%");
  });

  it("o intervalo é escrito em palavra, para não parecer outra métrica", () => {
    expect(formatarIntervalo({ min: 0.17, max: 0.69 })).toBe("entre 17% e 69%");
    expect(formatarIntervalo(null)).toBe("");
  });
});
