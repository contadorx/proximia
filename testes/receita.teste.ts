import { describe, expect, it } from "vitest";
import { mapearResposta, respostaVazia } from "@/lib/receita";

/**
 * A consulta em si depende de rede e de um serviço de terceiro — o que
 * se testa aqui é a tradução da resposta, que é onde mora a regra. Um
 * provedor muda o nome de um campo e o produto para de preencher em
 * silêncio; estes testes quebram antes disso chegar ao cliente.
 */

describe("tradução da resposta pública", () => {
  it("lê o formato atual da BrasilAPI", () => {
    const d = mapearResposta({
      razao_social: "ALFA INDUSTRIA LTDA",
      nome_fantasia: "Alfa",
      cnae_fiscal_descricao: "Fabricação de produtos químicos",
      descricao_situacao_cadastral: "ATIVA",
      municipio: "LIMEIRA",
      uf: "SP",
    });

    expect(d.razaoSocial).toBe("ALFA INDUSTRIA LTDA");
    expect(d.nomeFantasia).toBe("Alfa");
    expect(d.segmento).toBe("Fabricação de produtos químicos");
    expect(d.situacao).toBe("ATIVA");
    expect(d.municipio).toBe("LIMEIRA");
  });

  it("aceita o formato antigo, com nome e atividade em lista", () => {
    // Provedores mudam de formato sem avisar; ler os dois evita que o
    // produto pare de preencher no dia da mudança.
    const d = mapearResposta({
      nome: "BETA LOGISTICA SA",
      fantasia: "Beta",
      atividade_principal: [{ text: "Transporte rodoviário de carga" }],
      situacao: "ATIVA",
    });

    expect(d.razaoSocial).toBe("BETA LOGISTICA SA");
    expect(d.nomeFantasia).toBe("Beta");
    expect(d.segmento).toBe("Transporte rodoviário de carga");
  });

  it("campo em branco vira nulo, não string vazia", () => {
    // String vazia passaria pelo coalesce do banco e sobrescreveria o
    // que já existia com nada.
    const d = mapearResposta({ razao_social: "   ", nome_fantasia: "" });
    expect(d.razaoSocial).toBeNull();
    expect(d.nomeFantasia).toBeNull();
  });

  it("resposta inesperada não quebra nem inventa dado", () => {
    expect(mapearResposta(null).razaoSocial).toBeNull();
    expect(mapearResposta("erro").razaoSocial).toBeNull();
    expect(mapearResposta({ razao_social: 42 }).razaoSocial).toBeNull();
  });

  it("reconhece quando não veio nada aproveitável", () => {
    expect(respostaVazia(mapearResposta({ municipio: "LIMEIRA" }))).toBe(true);
    expect(respostaVazia(mapearResposta({ razao_social: "ALFA" }))).toBe(false);
  });
});
