import { describe, expect, it } from "vitest";
import { interpretarNumero, inteiroDe, numeroDe } from "../lib/formulario";

function form(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

describe("interpretação de números de formulário", () => {
  it("lê o valor cru da máscara sem multiplicar por cem", () => {
    // Era o defeito: "1234.56" virava 123456 porque o ponto era tratado
    // como milhar. R$ 1.234,56 digitados viravam R$ 123.456 no banco.
    expect(interpretarNumero("1234.56")).toBe(1234.56);
    expect(interpretarNumero("500.00")).toBe(500);
    expect(interpretarNumero("0.01")).toBe(0.01);
  });

  it("lê o formato brasileiro completo", () => {
    expect(interpretarNumero("1.234,56")).toBe(1234.56);
    expect(interpretarNumero("R$ 1.234,56")).toBe(1234.56);
    expect(interpretarNumero("2,5")).toBe(2.5);
  });

  it("trata ponto em grupos de três como milhar digitado à mão", () => {
    expect(interpretarNumero("1.234")).toBe(1234);
    expect(interpretarNumero("1.234.567")).toBe(1234567);
  });

  it("aceita inteiro puro e negativo", () => {
    expect(interpretarNumero("1500000")).toBe(1500000);
    expect(interpretarNumero("-12")).toBe(-12);
  });

  it("devolve null para vazio e para lixo", () => {
    expect(interpretarNumero("")).toBeNull();
    expect(interpretarNumero("abc")).toBeNull();
  });

  it("o valor que a máscara envia sobrevive à ida e volta da edição", () => {
    // Edição carrega o valor do banco na máscara e reenvia: o número tem
    // de voltar idêntico, não multiplicado a cada salvamento.
    const banco = 150000;
    const digitos = String(Math.round(banco * 100)); // o que a máscara guarda
    const enviado = (Number(digitos) / 100).toFixed(2); // o que o hidden manda
    expect(interpretarNumero(enviado)).toBe(banco);
  });
});

describe("numeroDe e inteiroDe", () => {
  it("numeroDe devolve null para campo ausente ou vazio", () => {
    expect(numeroDe(form({}), "valor")).toBeNull();
    expect(numeroDe(form({ valor: "  " }), "valor")).toBeNull();
  });

  it("inteiroDe respeita o zero em vez de engolir com o padrão", () => {
    // "Avisar 0 dias antes" tem de ficar 0 — antes virava 7.
    expect(inteiroDe(form({ alerta_dias: "0" }), "alerta_dias", 7, 0, 365)).toBe(0);
  });

  it("inteiroDe aplica padrão e faixa", () => {
    expect(inteiroDe(form({}), "alerta_dias", 7, 0, 365)).toBe(7);
    expect(inteiroDe(form({ alerta_dias: "900" }), "alerta_dias", 7, 0, 365)).toBe(365);
    expect(inteiroDe(form({ alerta_dias: "-3" }), "alerta_dias", 7, 0, 365)).toBe(0);
    expect(inteiroDe(form({ alerta_dias: "lixo" }), "alerta_dias", 7, 0, 365)).toBe(7);
  });
});
