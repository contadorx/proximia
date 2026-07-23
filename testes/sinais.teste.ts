import { describe, expect, it } from "vitest";
import { sinaisDaConta } from "@/lib/sinais";
import type { Contrato } from "@/lib/contratos";
import type { Compromisso } from "@/lib/compromissos";

/**
 * Sinais são a alternativa ao "health score": fatos nomeados, sem pesos.
 * O que se testa aqui é que cada fato dispara pelo motivo certo e só
 * por ele — e que conta limpa fica com a lista vazia, sem ruído.
 */

const CONTA = "conta-1";

function contrato(parcial: Partial<Contrato>): Contrato {
  return {
    id: "ct-1",
    conta_id: CONTA,
    carteira_id: "cart-1",
    numero: "CT-001",
    tipo: null,
    modalidade: null,
    natureza_beneficio: null,
    inicio: "2025-01-01",
    fim: null,
    renovacao_automatica: false,
    aviso_previa_dias: null,
    valor_base: null,
    periodicidade: null,
    status: "vigente",
    link_documento: null,
    observacoes: null,
    janela_renegociacao: null,
    ...parcial,
  } as Contrato;
}

function compromisso(parcial: Partial<Compromisso>): Compromisso {
  return {
    id: "cp-1",
    carteira_id: "cart-1",
    entidade_tipo: "conta",
    entidade_id: CONTA,
    titulo: "Visita",
    descricao: null,
    vence_em: "2099-01-01",
    dono_id: null,
    alerta_dias: 7,
    status: "aberto",
    concluido_em: null,
    origem: "manual",
    origem_id: null,
    ...parcial,
  } as Compromisso;
}

function base() {
  return {
    contaId: CONTA,
    potencialBruto: null as number | null,
    valorCapturado: null as number | null,
    contratos: [] as Contrato[],
    avisosAbertos: [] as {
      severidade: string;
      entidade_tipo: string | null;
      entidade_id: string | null;
      titulo: string;
    }[],
    compromissosAbertos: [] as Compromisso[],
    ultimoRegistroEm: null as string | null,
  };
}

describe("sinais da conta", () => {
  it("conta limpa não tem sinal nenhum", () => {
    expect(sinaisDaConta(base())).toEqual([]);
  });

  it("contrato vencido e contrato em janela disparam; vigente longe do fim, não", () => {
    const sinais = sinaisDaConta({
      ...base(),
      contratos: [
        contrato({ id: "ct-venc", fim: "2020-01-01" }),
        contrato({ id: "ct-jan", fim: "2099-12-31", janela_renegociacao: "2020-01-01" }),
        contrato({ id: "ct-ok", fim: "2099-12-31" }),
      ],
    });
    const chaves = sinais.map((s) => s.chave);
    expect(chaves).toContain("contrato-vencido-ct-venc");
    expect(chaves).toContain("contrato-janela-ct-jan");
    expect(chaves).toHaveLength(2);
    expect(sinais[0].href).toBe("/contratos/ct-venc");
  });

  it("contrato vencido de outra conta não dispara aqui", () => {
    const sinais = sinaisDaConta({
      ...base(),
      contratos: [contrato({ id: "ct-outra", conta_id: "conta-2", fim: "2020-01-01" })],
    });
    expect(sinais).toEqual([]);
  });

  it("aviso alto conta quando aponta para a conta ou para um contrato dela; atenção não conta", () => {
    const comum = base();
    const contratos = [contrato({ id: "ct-1", fim: "2099-12-31" })];
    const alto = sinaisDaConta({
      ...comum,
      contratos,
      avisosAbertos: [
        { severidade: "alta", entidade_tipo: "contrato", entidade_id: "ct-1", titulo: "Vencido" },
        { severidade: "alta", entidade_tipo: "conta", entidade_id: CONTA, titulo: "Parada" },
        { severidade: "atencao", entidade_tipo: "conta", entidade_id: CONTA, titulo: "Leve" },
        { severidade: "alta", entidade_tipo: "conta", entidade_id: "conta-2", titulo: "De outra" },
      ],
    });
    expect(alto.map((s) => s.chave)).toEqual(["aviso-alto"]);
    expect(alto[0].rotulo).toBe("2 avisos de severidade alta");
  });

  it("compromisso atrasado com alvo na conta dispara; em dia ou de outra conta, não", () => {
    const sinais = sinaisDaConta({
      ...base(),
      compromissosAbertos: [
        compromisso({ id: "cp-atrasado", vence_em: "2020-01-01" }),
        compromisso({ id: "cp-em-dia" }),
        compromisso({ id: "cp-outra", entidade_id: "conta-2", vence_em: "2020-01-01" }),
      ],
    });
    expect(sinais.map((s) => s.chave)).toEqual(["compromisso-atrasado"]);
    expect(sinais[0].href).toBe(`/pendencias?alvo=conta:${CONTA}`);
  });

  it("potencial declarado sem captura dispara; com captura ou sem potencial, não", () => {
    expect(
      sinaisDaConta({ ...base(), potencialBruto: 480000, valorCapturado: 0 }).map((s) => s.chave),
    ).toEqual(["potencial-sem-captura"]);
    expect(sinaisDaConta({ ...base(), potencialBruto: 480000, valorCapturado: 1 })).toEqual([]);
    expect(sinaisDaConta({ ...base(), potencialBruto: null, valorCapturado: 0 })).toEqual([]);
  });

  it("registro velho dispara com a contagem de dias; recente ou inexistente, não", () => {
    const hoje = new Date("2026-07-23T12:00:00Z");
    const velho = sinaisDaConta({ ...base(), ultimoRegistroEm: "2026-03-01", hoje });
    expect(velho).toHaveLength(1);
    expect(velho[0].rotulo).toMatch(/^\d+ dias sem registro$/);

    expect(sinaisDaConta({ ...base(), ultimoRegistroEm: "2026-07-01", hoje })).toEqual([]);
    expect(sinaisDaConta({ ...base(), ultimoRegistroEm: null, hoje })).toEqual([]);
  });
});
