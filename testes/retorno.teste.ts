import { describe, expect, it } from "vitest";
import { destinoSeguro, lerFragmento } from "@/lib/retorno";

/**
 * O destino do link de e-mail é o caminho clássico de redirecionamento
 * aberto: a pessoa clica num link legítimo, é autenticada, e cai em
 * outro site já logada. Cada caso abaixo é uma forma conhecida de
 * disfarçar endereço externo de caminho interno.
 */
describe("destino do retorno", () => {
  it("caminho interno passa como está", () => {
    expect(destinoSeguro("/comecar")).toBe("/comecar");
    expect(destinoSeguro("/contas/123?aba=mapa")).toBe("/contas/123?aba=mapa");
  });

  it("endereço absoluto é recusado", () => {
    expect(destinoSeguro("https://site-falso.com")).toBe("/");
    expect(destinoSeguro("http://site-falso.com")).toBe("/");
  });

  it("duas barras é endereço absoluto disfarçado", () => {
    // O navegador completa o protocolo sozinho em "//site-falso.com".
    expect(destinoSeguro("//site-falso.com")).toBe("/");
  });

  it("barra invertida também separa em alguns navegadores", () => {
    expect(destinoSeguro("/\\site-falso.com")).toBe("/");
    expect(destinoSeguro("\\\\site-falso.com")).toBe("/");
  });

  it("espaço em volta não engana", () => {
    expect(destinoSeguro("  //site-falso.com  ")).toBe("/");
  });

  it("vazio, nulo e indefinido caem na raiz", () => {
    expect(destinoSeguro("")).toBe("/");
    expect(destinoSeguro(null)).toBe("/");
    expect(destinoSeguro(undefined)).toBe("/");
  });
});

describe("leitura do fragmento", () => {
  it("encontra os tokens do fluxo implícito", () => {
    const f = lerFragmento("#access_token=abc&refresh_token=def&token_type=bearer");
    expect(f.accessToken).toBe("abc");
    expect(f.refreshToken).toBe("def");
    expect(f.erro).toBeNull();
  });

  it("funciona sem a cerquilha", () => {
    expect(lerFragmento("access_token=abc&refresh_token=def").accessToken).toBe("abc");
  });

  it("reconhece o erro que o provedor devolve no fragmento", () => {
    const f = lerFragmento("#error=access_denied&error_description=Email+link+is+invalid");
    expect(f.erro).toBe("Email link is invalid");
    expect(f.accessToken).toBeNull();
  });

  it("fragmento vazio não inventa token", () => {
    const f = lerFragmento("");
    expect(f.accessToken).toBeNull();
    expect(f.refreshToken).toBeNull();
    expect(f.erro).toBeNull();
  });
});
