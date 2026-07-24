import { describe, expect, it } from "vitest";
import { validar, type Referencias } from "@/lib/importacao";

/**
 * Receita atual é a terceira quantidade de dinheiro numa conta, e a que
 * mais convida ao erro: é grande, está à mão numa base de faturamento, e
 * cabe em qualquer campo numérico. Estes testes existem para ela não
 * virar potencial por descuido.
 */
const REFS: Referencias = {
  carteiras: [{ id: "c1", nome: "Regional Norte", codigo: "RN" }],
  contas: [], perguntas: [], ciclos: [], equipe: [],
};

const linha = (extra: Record<string, string>) => [
  { nome: "Alfa Indústria", carteira: "RN", ...extra },
];

describe("receita atual", () => {
  it("entra quando vem com procedência", () => {
    const r = validar("contas", linha({
      receita_atual: "6.680.158,46",
      receita_origem: "base de faturamento 03/2026",
      receita_data: "01/04/2026",
    }), REFS);
    expect(r.erros).toHaveLength(0);
    expect(r.validas[0].receita_atual).toBe(6680158.46);
    expect(r.validas[0].receita_data).toBe("2026-04-01");
  });

  it("é recusada sem origem — a mesma regra do potencial", () => {
    const r = validar("contas", linha({ receita_atual: "500000" }), REFS);
    expect(r.validas).toHaveLength(0);
    expect(r.erros[0].motivo).toMatch(/receita_origem/);
  });

  it("não contamina potencial nem capturado", () => {
    // O risco real: alguém joga faturamento no campo de potencial. Aqui
    // os três convivem e cada um guarda o seu.
    const r = validar("contas", linha({
      receita_atual: "1000000", receita_origem: "faturamento 12m",
      potencial_bruto: "80000", potencial_origem: "estudo tarifário",
      valor_capturado: "15000",
    }), REFS);
    expect(r.erros).toHaveLength(0);
    const c = r.validas[0];
    expect(c.receita_atual).toBe(1000000);
    expect(c.potencial_bruto).toBe(80000);
    expect(c.valor_capturado).toBe(15000);
  });

  it("conta sem receita continua entrando, com os campos nulos", () => {
    const r = validar("contas", linha({}), REFS);
    expect(r.erros).toHaveLength(0);
    expect(r.validas[0].receita_atual).toBeNull();
    expect(r.validas[0].receita_origem).toBeNull();
  });

  it("valor inválido é recusado com o motivo", () => {
    const r = validar("contas", linha({
      receita_atual: "muito dinheiro", receita_origem: "base",
    }), REFS);
    expect(r.validas).toHaveLength(0);
    expect(r.erros[0].motivo).toMatch(/receita_atual/);
  });
});
