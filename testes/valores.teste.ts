import { describe, expect, it } from "vitest";
import { formatarDocumento, formatarValor, formatarData } from "@/lib/contas";

/**
 * Formatação de valores. Parece detalhe, mas é onde o produto ganha ou
 * perde credibilidade: número torto na tela derruba a confiança no dado
 * mesmo quando o dado está certo.
 */
describe("formatação de valores", () => {
  it("mostra travessão quando não há valor, em vez de zero ou de erro", () => {
    // Zero e ausência são coisas diferentes: "R$ 0,00" afirma que nada foi
    // capturado; travessão diz que ninguém registrou.
    expect(formatarValor(null)).toBe("—");
    expect(formatarValor(undefined)).toBe("—");
    expect(formatarValor("")).toBe("—");
    expect(formatarValor("não é número")).toBe("—");
    expect(formatarValor(0)).not.toBe("—");
  });

  it("formata em real brasileiro, arredondando os centavos", () => {
    // Sem casas decimais de propósito: em tela de comparação, centavo é
    // ruído. 1.234.567,89 vira 1.234.568.
    const texto = formatarValor(1234567.89);
    expect(texto).toContain("R$");
    expect(texto).toContain("1.234.568");
  });

  it("aceita valor vindo como texto do banco", () => {
    // O Postgres devolve numeric como string no cliente JavaScript.
    expect(formatarValor("48000")).toContain("48.000");
  });
});

describe("documento", () => {
  it("formata CNPJ com pontuação", () => {
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("devolve o que veio quando não tem catorze dígitos", () => {
    expect(formatarDocumento("123")).toBe("123");
  });

  it("mostra travessão quando não há documento", () => {
    expect(formatarDocumento(null)).toBe("—");
  });
});

describe("data", () => {
  it("formata no padrão brasileiro sem deslocar o dia", () => {
    // Data pura não tem fuso. Interpretar "2026-03-01" como UTC e exibir
    // no fuso local devolve 28/02 — erro clássico e difícil de perceber.
    expect(formatarData("2026-03-01")).toBe("01/03/2026");
  });

  it("mostra travessão quando não há data", () => {
    expect(formatarData(null)).toBe("—");
  });
});
