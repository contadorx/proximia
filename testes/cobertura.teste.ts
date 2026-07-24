import { describe, expect, it } from "vitest";
import { montarMatriz, type CelulaCobertura } from "@/lib/cobertura";

/**
 * A matriz é o que a pessoa lê para decidir onde perguntar. Se o estado
 * de uma célula estiver errado, ela vai insistir num assunto encerrado
 * ou deixar de tentar onde nunca se tentou — os dois custam caro.
 */

const TIPOS = [
  { id: "t1", nome: "Extensão de rede" },
  { id: "t2", nome: "Água de reúso" },
];

function celula(p: Partial<CelulaCobertura> & { conta_id: string; catalogo_id: string }): CelulaCobertura {
  return {
    conta: "Alfa",
    carteira_id: "cart",
    criticidade: "media",
    tipo: "tipo",
    iniciativas: 0,
    ganhas: 0,
    descartadas: 0,
    em_andamento: 0,
    ultima_em: null,
    ...p,
  };
}

describe("estado de cada célula", () => {
  it("sem iniciativa é lacuna, e diz isso em vez de chamar de oportunidade", () => {
    const [linha] = montarMatriz([celula({ conta_id: "a", catalogo_id: "t1" })], TIPOS);
    expect(linha.celulas[0].estado).toBe("lacuna");
    expect(linha.celulas[0].detalhe).toMatch(/nunca houve iniciativa/);
  });

  it("descartada não é lacuna — é assunto já tratado", () => {
    const [linha] = montarMatriz(
      [celula({ conta_id: "a", catalogo_id: "t1", iniciativas: 1, descartadas: 1 })],
      TIPOS,
    );
    expect(linha.celulas[0].estado).toBe("descartada");
    expect(linha.celulas[0].detalhe).toMatch(/já tratado/);
    expect(linha.lacunas).toBe(1); // a outra coluna, t2, continua lacuna
  });

  it("ganha manda sobre em andamento e sobre descartada", () => {
    // Conta onde já se ganhou uma e perdeu outra do mesmo tipo não é
    // "perdida": é atendida.
    const [linha] = montarMatriz(
      [celula({ conta_id: "a", catalogo_id: "t1", iniciativas: 3, ganhas: 1, descartadas: 1, em_andamento: 1 })],
      TIPOS,
    );
    expect(linha.celulas[0].estado).toBe("ganha");
  });

  it("em andamento manda sobre descartada", () => {
    const [linha] = montarMatriz(
      [celula({ conta_id: "a", catalogo_id: "t1", iniciativas: 2, descartadas: 1, em_andamento: 1 })],
      TIPOS,
    );
    expect(linha.celulas[0].estado).toBe("andamento");
  });

  it("tipo ausente na lista vira lacuna, não some da linha", () => {
    const [linha] = montarMatriz([celula({ conta_id: "a", catalogo_id: "t1", iniciativas: 1, ganhas: 1 })], TIPOS);
    expect(linha.celulas).toHaveLength(2);
    expect(linha.celulas[1].estado).toBe("lacuna");
  });
});

describe("ordem das linhas", () => {
  it("mais lacunas primeiro — é onde há mais pergunta a fazer", () => {
    const linhas = montarMatriz(
      [
        celula({ conta_id: "cheia", conta: "Cheia", catalogo_id: "t1", iniciativas: 1, ganhas: 1 }),
        celula({ conta_id: "cheia", conta: "Cheia", catalogo_id: "t2", iniciativas: 1, ganhas: 1 }),
        celula({ conta_id: "vazia", conta: "Vazia", catalogo_id: "t1" }),
        celula({ conta_id: "vazia", conta: "Vazia", catalogo_id: "t2" }),
      ],
      TIPOS,
    );
    expect(linhas[0].conta).toBe("Vazia");
    expect(linhas[0].lacunas).toBe(2);
    expect(linhas[1].lacunas).toBe(0);
  });

  it("empate em lacunas desempata pela criticidade", () => {
    const linhas = montarMatriz(
      [
        celula({ conta_id: "b", conta: "Baixa", criticidade: "baixa", catalogo_id: "t1" }),
        celula({ conta_id: "a", conta: "Alta", criticidade: "alta", catalogo_id: "t1" }),
      ],
      TIPOS,
    );
    expect(linhas[0].conta).toBe("Alta");
  });

  it("lista vazia não quebra", () => {
    expect(montarMatriz([], TIPOS)).toEqual([]);
  });
});
