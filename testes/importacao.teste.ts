import { describe, expect, it } from "vitest";
import { MODELOS, tabelaDestino, validar, type Referencias } from "@/lib/importacao";

const refs: Referencias = {
  carteiras: [{ id: "c1", nome: "Regional Norte", codigo: "RN" }],
  contas: [{ id: "a1", nome: "Alfa Indústria", carteira_id: "c1" }],
  perguntas: [
    { id: "p1", texto: "Existe rotina definida?", dimensao: "d1" },
    { id: "p2", texto: "A rotina é seguida?", dimensao: "d1" },
  ],
  ciclos: [{ id: "k1", nome: "2026-1" }],
};

describe("importação de oportunidades", () => {
  it("aceita linha completa e resolve carteira pelo código", () => {
    const r = validar(
      "oportunidades",
      [
        {
          titulo: "Ampliação",
          carteira: "RN",
          conta: "Alfa Indústria",
          fase: "proposta",
          investimento: "600000",
          retorno_mensal: "40000",
          custo_mensal: "10000",
          estimativa_origem: "estudo de viabilidade",
        },
      ],
      refs,
    );

    expect(r.erros).toHaveLength(0);
    expect(r.validas[0]).toMatchObject({
      carteira_id: "c1",
      conta_id: "a1",
      fase: "proposta",
      investimento: 600000,
    });
  });

  it("recusa estimativa sem procedência, como a tela faz", () => {
    // A mesma regra do banco: número estimado entra com origem. Se o
    // importador deixasse passar, a carga viraria a porta dos fundos.
    const r = validar(
      "oportunidades",
      [{ titulo: "Sem origem", carteira: "RN", investimento: "100000" }],
      refs,
    );
    expect(r.validas).toHaveLength(0);
    expect(r.erros[0].motivo).toContain("procedência");
  });

  it("recusa carteira inexistente com o motivo na linha certa", () => {
    const r = validar(
      "oportunidades",
      [
        { titulo: "Boa", carteira: "RN" },
        { titulo: "Órfã", carteira: "XX" },
      ],
      refs,
    );
    expect(r.validas).toHaveLength(1);
    expect(r.erros[0].linha).toBe(3); // 1 é o cabeçalho
    expect(r.erros[0].motivo).toContain('carteira "XX" não existe');
  });

  it("não aceita descarte por planilha", () => {
    // Descarte exige motivo, e motivo é conversa — não coluna de arquivo.
    const r = validar("oportunidades", [{ titulo: "X", carteira: "RN", fase: "descartada" }], refs);
    expect(r.erros[0].motivo).toContain("Descarte exige motivo");
  });
});

describe("importação de maturidade", () => {
  it("resolve carteira, ciclo e pergunta pelo texto", () => {
    const r = validar(
      "maturidade",
      [{ carteira: "RN", ciclo: "2026-1", pergunta: "Existe rotina definida?", nota: "3" }],
      refs,
    );
    expect(r.erros).toHaveLength(0);
    expect(r.validas[0]).toMatchObject({ carteira_id: "c1", ciclo_id: "k1", pergunta_id: "p1", nota: 3 });
  });

  it("recusa nota fora da escala", () => {
    const r = validar(
      "maturidade",
      [{ carteira: "RN", ciclo: "2026-1", pergunta: "A rotina é seguida?", nota: "7" }],
      refs,
    );
    expect(r.erros[0].motivo).toContain("escala vai de 0 a 4");
  });

  it("recusa pergunta que não está na régua", () => {
    const r = validar(
      "maturidade",
      [{ carteira: "RN", ciclo: "2026-1", pergunta: "Pergunta inventada", nota: "2" }],
      refs,
    );
    expect(r.erros[0].motivo).toContain("não está na régua");
  });

  it("recusa ciclo inexistente, apontando onde criar", () => {
    const r = validar(
      "maturidade",
      [{ carteira: "RN", ciclo: "2030-9", pergunta: "Existe rotina definida?", nota: "2" }],
      refs,
    );
    expect(r.erros[0].motivo).toContain("Crie-o em Maturidade antes");
  });
});

describe("modelos de importação", () => {
  it("todo tipo tem modelo e destino", () => {
    for (const tipo of Object.keys(MODELOS)) {
      expect(MODELOS[tipo as keyof typeof MODELOS].colunas.length).toBeGreaterThan(0);
      expect(tabelaDestino(tipo as keyof typeof MODELOS)).toBeTruthy();
    }
  });

  it("toda coluna obrigatória tem rótulo", () => {
    for (const modelo of Object.values(MODELOS)) {
      for (const c of modelo.colunas.filter((x) => x.obrigatoria)) {
        expect(c.rotulo.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("responsável na importação (equipe)", () => {
  const comEquipe: Referencias = {
    ...refs,
    equipe: [
      { id: "e1", nome: "Marina Souza", email: "marina@exemplo.com" },
      { id: "e2", nome: "Marina", email: null },
      { id: "e3", nome: "Marina", email: "outra@exemplo.com" },
    ],
  };

  it("resolve pelo nome ou pelo e-mail de quem já está na equipe", () => {
    const r = validar(
      "carteiras",
      [
        { nome: "Nova A", responsavel: "Marina Souza" },
        { nome: "Nova B", responsavel: "marina@exemplo.com" },
      ],
      comEquipe,
    );
    expect(r.erros).toHaveLength(0);
    expect(r.validas[0]).toMatchObject({ responsavel_id: "e1", responsavel_nome: null });
    expect(r.validas[1]).toMatchObject({ responsavel_id: "e1" });
  });

  it("quem não existe não recusa a linha: fica marcado para criar", () => {
    // A planilha chega antes dos convites — o dado precisa nascer com
    // dono, e a pessoa é criada na confirmação.
    const r = validar("frentes", [{ titulo: "Frente X", carteira: "RN", dono: "Paulo" }], comEquipe);
    expect(r.erros).toHaveLength(0);
    expect(r.validas[0]).toMatchObject({ dono_id: null, dono_nome: "Paulo" });
  });

  it("nome ambíguo recusa a linha e pede o e-mail", () => {
    const r = validar("carteiras", [{ nome: "Nova C", responsavel: "Marina" }], comEquipe);
    expect(r.validas).toHaveLength(0);
    expect(r.erros[0].motivo).toContain("mais de uma pessoa");
  });
});
