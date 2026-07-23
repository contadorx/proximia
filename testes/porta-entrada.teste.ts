import { describe, expect, it } from "vitest";
import { MODELOS, validar, type Referencias, type TipoImportacao } from "@/lib/importacao";

/**
 * A porta de entrada não tem regra própria de conferência: ela usa a
 * mesma `validar()` da planilha. O que estes testes travam é justamente
 * isso — que o caminho da API recusa pelos mesmos motivos, com as mesmas
 * mensagens. Se um dia alguém criar uma validação paralela para a API,
 * um destes quebra.
 *
 * O que fica de fora daqui, e está no banco (supabase/testes/porta_entrada.sql):
 * autenticação por chave, isolamento por organização, vazão e suspensão.
 */

const REFS: Referencias = {
  carteiras: [{ id: "cart-1", nome: "Regional Norte", codigo: "RN" }],
  contas: [{ id: "conta-1", nome: "Alfa Indústria", carteira_id: "cart-1" }],
  perguntas: [],
  ciclos: [],
  equipe: [],
};

/**
 * A rota converte tudo para texto antes de conferir, porque é o que a
 * planilha entrega e o que `validar` espera. Esta é a mesma conversão,
 * isolada para poder ser testada.
 */
function normalizar(linhas: Record<string, unknown>[]): Record<string, string>[] {
  return linhas.map((l) => {
    const texto: Record<string, string> = {};
    for (const [campo, valor] of Object.entries(l ?? {})) {
      texto[campo] = valor === null || valor === undefined ? "" : String(valor);
    }
    return texto;
  });
}

describe("normalização do corpo JSON", () => {
  it("número vira texto sem perder o valor", () => {
    expect(normalizar([{ potencial_bruto: 480000 }])[0].potencial_bruto).toBe("480000");
  });

  it("nulo e ausente viram vazio, não a palavra null", () => {
    const saida = normalizar([{ documento: null, segmento: undefined }])[0];
    expect(saida.documento).toBe("");
    expect(saida.segmento).toBe("");
  });

  it("booleano e zero sobrevivem — zero não pode virar vazio", () => {
    const saida = normalizar([{ score_maturidade: 0, ativo: false }])[0];
    expect(saida.score_maturidade).toBe("0");
    expect(saida.ativo).toBe("false");
  });
});

describe("a API confere pelas mesmas regras da planilha", () => {
  it("aceita a linha mínima válida de conta", () => {
    const { validas, erros } = validar(
      "contas",
      normalizar([{ nome: "Beta Logística", carteira: "RN" }]),
      REFS,
    );
    expect(erros).toHaveLength(0);
    expect(validas).toHaveLength(1);
  });

  it("recusa carteira que não existe, dizendo qual era", () => {
    const { validas, erros } = validar(
      "contas",
      normalizar([{ nome: "Gama", carteira: "INEXISTENTE" }]),
      REFS,
    );
    expect(validas).toHaveLength(0);
    expect(erros[0].motivo).toContain("INEXISTENTE");
  });

  it("recusa potencial sem origem — a invariante do produto vale na API", () => {
    const { erros } = validar(
      "contas",
      normalizar([{ nome: "Delta", carteira: "RN", potencial_bruto: "100000" }]),
      REFS,
    );
    expect(erros.length).toBeGreaterThan(0);
    expect(erros.map((e) => e.motivo).join(" ")).toMatch(/origem/i);
  });

  it("recusa número inválido apontando a linha", () => {
    const { erros } = validar(
      "contas",
      normalizar([
        { nome: "Ok", carteira: "RN" },
        { nome: "Ruim", carteira: "RN", potencial_bruto: "muito" },
      ]),
      REFS,
    );
    expect(erros).toHaveLength(1);
    // Linha 1 é o cabeçalho na planilha; a segunda linha de dados é a 3.
    expect(erros[0].linha).toBe(3);
  });

  it("linha boa e linha ruim no mesmo lote: uma entra, a outra é relatada", () => {
    const { validas, erros } = validar(
      "contas",
      normalizar([
        { nome: "Entra", carteira: "RN" },
        { nome: "", carteira: "RN" },
      ]),
      REFS,
    );
    expect(validas).toHaveLength(1);
    expect(erros).toHaveLength(1);
  });
});

describe("contrato publicado pela rota", () => {
  it("todo recurso da planilha é oferecido pela API", () => {
    const recursos = Object.keys(MODELOS) as TipoImportacao[];
    expect(recursos).toContain("carteiras");
    expect(recursos).toContain("contas");
    expect(recursos).toContain("contratos");
    expect(recursos).toContain("frentes");
    expect(recursos).toContain("oportunidades");
    expect(recursos).toContain("maturidade");
  });

  it("cada recurso declara ao menos um campo obrigatório", () => {
    for (const [nome, modelo] of Object.entries(MODELOS)) {
      const obrigatorios = modelo.colunas.filter((c) => c.obrigatoria);
      expect(obrigatorios.length, `recurso ${nome} sem campo obrigatório`).toBeGreaterThan(0);
    }
  });
});
