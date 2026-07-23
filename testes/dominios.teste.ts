import { describe, expect, it } from "vitest";
import { dominioDoEmail, normalizarDominio } from "@/lib/dominios";

/**
 * O banco recusa domínio com arroba ou maiúscula (check em org_dominios).
 * Se a normalização falhar, o cadastro morre com erro de constraint em
 * vez de uma mensagem útil — por isso ela é testada aqui, e não confiada
 * ao formulário.
 */
describe("normalização de domínio", () => {
  it("tira a arroba que a pessoa cola junto", () => {
    expect(normalizarDominio("@acme.com.br")).toBe("acme.com.br");
  });

  it("baixa a caixa e corta espaço", () => {
    expect(normalizarDominio("  ACME.Com.BR ")).toBe("acme.com.br");
  });

  it("aceita quem cola a URL inteira", () => {
    expect(normalizarDominio("https://acme.com.br/entrar")).toBe("acme.com.br");
  });

  it("não inventa domínio a partir de texto solto", () => {
    expect(normalizarDominio("acme")).toBe("acme");
  });
});

describe("domínio a partir do e-mail", () => {
  it("pega o que vem depois da arroba", () => {
    expect(dominioDoEmail("Ana.Silva@Acme.COM.br")).toBe("acme.com.br");
  });

  it("sem arroba, devolve vazio em vez de chutar", () => {
    expect(dominioDoEmail("ana.silva")).toBe("");
  });

  it("e-mail com duas arrobas não vira domínio", () => {
    expect(dominioDoEmail("a@b@c.com")).toBe("");
  });
});
