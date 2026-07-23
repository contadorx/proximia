import { describe, expect, it } from "vitest";
import { paraCsv } from "../lib/exportacao";
import { totais, type Frente } from "../lib/frentes";

describe("CSV exportado", () => {
  it("neutraliza texto que o Excel executaria como fórmula", () => {
    // Histórico e nomes são texto livre de várias mãos: uma célula
    // começando com "=" viraria fórmula na máquina de quem exporta.
    const csv = paraCsv([{ nome: "=HYPERLINK(\"http://x\")", valor: 10 }], ["nome", "valor"]);
    expect(csv).toContain("'=HYPERLINK");
    // Número não é texto: passa sem apóstrofo.
    expect(csv).toContain(";10");
  });

  it("não toca em número negativo nem em data", () => {
    const csv = paraCsv([{ saldo: -12, dia: "2026-07-01" }], ["saldo", "dia"]);
    expect(csv).toContain("-12");
    expect(csv).not.toContain("'-12");
    expect(csv).toContain("2026-07-01");
  });

  it("continua protegendo separador e aspas", () => {
    const csv = paraCsv([{ obs: 'tem; separador e "aspas"' }], ["obs"]);
    expect(csv).toContain('"tem; separador e ""aspas"""');
  });
});

function frente(parcial: Partial<Frente>): Frente {
  return {
    id: "x",
    carteira_id: "c",
    catalogo_id: null,
    titulo: "t",
    natureza: "captura",
    prioridade: 3,
    status: "em_execucao",
    motivo_descarte: null,
    dono_id: null,
    qtd_casos: null,
    potencial_bruto: null,
    potencial_origem: null,
    potencial_data: null,
    valor_capturado: null,
    capturado_confirmado_em: null,
    proxima_etapa: null,
    prazo: null,
    links: [],
    observacoes: null,
    atualizado_em: "",
    ...parcial,
  };
}

describe("totais de frentes", () => {
  it("captura e proteção somam separadas, nunca juntas", () => {
    const t = totais([
      frente({ natureza: "captura", potencial_bruto: 100 }),
      frente({ natureza: "protecao", potencial_bruto: 40 }),
      frente({ natureza: "captura", potencial_bruto: 60, status: "descartada" }),
    ]);
    expect(t.potencial).toBe(100);
    expect(t.protecao).toBe(40);
  });

  it("capturado soma tudo, inclusive o que já encerrou", () => {
    const t = totais([
      frente({ valor_capturado: 30 }),
      frente({ valor_capturado: 20, status: "concluida" }),
    ]);
    expect(t.capturado).toBe(50);
  });
});
