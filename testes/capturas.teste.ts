import { describe, expect, it } from "vitest";
import { saldo, type Captura } from "@/lib/capturas";
import { cnpjValido } from "@/lib/contas";

function lancamento(p: Partial<Captura>): Captura {
  return {
    id: "l",
    entidade_tipo: "conta",
    entidade_id: "e",
    valor: 0,
    tipo: "captura",
    confirmado_em: "2026-01-01",
    descricao: null,
    comprovacao: null,
    origem: "registro",
    autor_id: null,
    criado_em: "2026-01-01T00:00:00Z",
    ...p,
  };
}

describe("saldo de captura", () => {
  it("soma capturas e subtrai estornos", () => {
    expect(
      saldo([
        lancamento({ valor: 50000 }),
        lancamento({ valor: 30000 }),
        lancamento({ valor: 30000, tipo: "estorno" }),
      ]),
    ).toBe(50000);
  });

  it("estorno integral zera, e isso é diferente de não ter lançamento", () => {
    expect(saldo([lancamento({ valor: 10000 }), lancamento({ valor: 10000, tipo: "estorno" })])).toBe(0);
    expect(saldo([])).toBe(0);
  });

  it("estorno isolado fica negativo, para o erro de lançamento aparecer", () => {
    // Números feios são melhores que números escondidos: saldo negativo
    // denuncia um estorno lançado sem a captura correspondente.
    expect(saldo([lancamento({ valor: 5000, tipo: "estorno" })])).toBe(-5000);
  });

  it("aceita valor em texto, como vem do banco", () => {
    expect(saldo([lancamento({ valor: "1500" as unknown as number })])).toBe(1500);
  });
});

describe("CNPJ", () => {
  it("aceita dígitos verificadores corretos", () => {
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
  });

  it("recusa dígito errado, tamanho errado e sequência repetida", () => {
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("112223330001")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
  });
});
