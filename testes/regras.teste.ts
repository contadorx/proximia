import { describe, expect, it } from "vitest";
import { variacao } from "@/lib/captura";
import { taxaConversao, perdasPorMotivo, type LinhaConversao } from "@/lib/pipeline";
import { formatarPayback, formatarPercentual, totaisOportunidades, type Oportunidade } from "@/lib/oportunidades";
import { faixa, quadrante } from "@/lib/maturidade";

/**
 * As regras que carregam a tese do produto. Se alguma delas mudar sem
 * querer, o número na tela continua aparecendo — e é isso que torna o
 * erro caro. Estes testes existem para essa mudança doer aqui, primeiro.
 */

describe("variação de captura", () => {
  it("não inventa comparação quando não houve nada nos dois meses", () => {
    expect(variacao(0, 0)).toBeNull();
  });

  it("trata o primeiro mês com captura como início, não como alta infinita", () => {
    expect(variacao(20000, 0)?.texto).toBe("primeiro mês com captura");
  });

  it("marca queda como alerta e alta como captura", () => {
    expect(variacao(32000, 80000)).toEqual({ texto: "-60% sobre o mês anterior", tom: "alerta" });
    expect(variacao(80000, 32000)).toEqual({ texto: "+150% sobre o mês anterior", tom: "capturado" });
  });

  it("queda a zero é -100%, não ausência de dado", () => {
    expect(variacao(0, 40000)?.texto).toBe("-100% sobre o mês anterior");
  });
});

function linha(p: Partial<LinhaConversao>): LinhaConversao {
  return {
    oportunidade_id: "x",
    carteira_id: "c",
    fase: "proposta",
    motivo_id: null,
    titulo: "Oportunidade",
    investimento: null,
    resultado_mensal: 0,
    dias_na_fase: 0,
    prazo_esperado_dias: null,
    atrasada: false,
    encerrada: false,
    ganha: false,
    ...p,
  };
}

describe("taxa de conversão", () => {
  it("conta apenas o que saiu do funil", () => {
    // O erro clássico: incluir o que está em andamento como perda achata a
    // taxa e faz a equipe parecer pior do que é.
    const t = taxaConversao([
      linha({ encerrada: true, ganha: true }),
      linha({ encerrada: false }),
      linha({ encerrada: false }),
    ]);
    expect(t.taxa).toBe(100);
    expect(t.emAndamento).toBe(2);
  });

  it("devolve indefinida — e não zero — quando nada foi encerrado", () => {
    // Zero afirmaria que tudo foi perdido. Indefinida diz a verdade:
    // ainda não dá para saber.
    expect(taxaConversao([linha({ encerrada: false })]).taxa).toBeNull();
  });

  it("calcula metade quando metade se perdeu", () => {
    const t = taxaConversao([
      linha({ encerrada: true, ganha: true }),
      linha({ encerrada: true, ganha: false }),
    ]);
    expect(t.taxa).toBe(50);
    expect(t.perdidas).toBe(1);
  });
});

describe("perdas por motivo", () => {
  it("agrupa e separa o que não foi classificado", () => {
    const motivos = [
      { id: "m1", nome: "Preço", descricao: null, ordem: 1, ativo: true },
    ];
    const r = perdasPorMotivo(
      [
        linha({ encerrada: true, ganha: false, motivo_id: "m1", investimento: 1000 }),
        linha({ encerrada: true, ganha: false, motivo_id: "m1", investimento: 500 }),
        linha({ encerrada: true, ganha: false, motivo_id: null }),
        linha({ encerrada: true, ganha: true, motivo_id: "m1" }),
      ],
      motivos,
    );

    expect(r[0]).toEqual({ rotulo: "Preço", quantidade: 2, valor: 1500 });
    expect(r.find((x) => x.rotulo === "sem motivo classificado")?.quantidade).toBe(1);
  });
});

describe("payback", () => {
  it("diz que não existe payback em vez de mostrar número", () => {
    // Quando o resultado mensal não cobre o custo, dividir daria número
    // negativo ou infinito. Nenhum dos dois significa alguma coisa.
    expect(formatarPayback(null)).toBe("sem payback");
  });

  it("escreve em anos quando passa de doze meses", () => {
    expect(formatarPayback(24)).toBe("2 anos");
    expect(formatarPayback(20)).toBe("1a 8m");
    expect(formatarPayback(8)).toBe("8 meses");
  });

  it("mostra travessão quando não há retorno percentual", () => {
    expect(formatarPercentual(null)).toBe("—");
    expect(formatarPercentual(-166.67)).toBe("-167%");
  });
});

function oportunidade(p: Partial<Oportunidade>): Oportunidade {
  return {
    id: "o",
    carteira_id: "c",
    conta_id: null,
    catalogo_id: null,
    titulo: "Oportunidade",
    descricao: null,
    fase: "viabilidade",
    fase_desde: "2026-01-01",
    motivo_descarte: null,
    responsavel_id: null,
    proxima_etapa: null,
    prazo: null,
    investimento: null,
    retorno_mensal: null,
    custo_mensal: 0,
    horizonte_meses: 60,
    estimativa_origem: null,
    estimativa_data: null,
    investimento_realizado: null,
    retorno_confirmado: null,
    confirmado_em: null,
    links: [],
    observacoes: null,
    resultado_mensal: 0,
    payback_meses: null,
    retorno_percentual: null,
    ...p,
  };
}

describe("totais de oportunidade", () => {
  it("não soma o que já foi concluído ou descartado ao que está em jogo", () => {
    const t = totaisOportunidades([
      oportunidade({ investimento: 100, fase: "negociacao" }),
      oportunidade({ investimento: 900, fase: "descartada" }),
      oportunidade({ investimento: 500, fase: "concluida" }),
    ]);
    expect(t.emAndamento).toBe(1);
    expect(t.investimento).toBe(100);
  });

  it("calcula o payback médio só de quem tem payback", () => {
    const t = totaisOportunidades([
      oportunidade({ payback_meses: 10, fase: "proposta" }),
      oportunidade({ payback_meses: 20, fase: "proposta" }),
      oportunidade({ payback_meses: null, fase: "proposta" }),
    ]);
    expect(t.paybackMedio).toBe(15);
  });
});

describe("maturidade", () => {
  it("separa as faixas nos cortes definidos", () => {
    expect(faixa(null).rotulo).toBe("sem avaliação");
    expect(faixa(39.9).rotulo).toBe("Inicial");
    expect(faixa(40).rotulo).toBe("Em estruturação");
    expect(faixa(60).rotulo).toBe("Intermediária");
    expect(faixa(80).rotulo).toBe("Avançada");
  });

  it("posiciona no quadrante certo pelo corte de potencial", () => {
    expect(quadrante(70, 1000, 500).nome).toBe("Acelerar");
    expect(quadrante(30, 1000, 500).nome).toBe("Estruturar");
    expect(quadrante(70, 100, 500).nome).toBe("Sustentar");
    expect(quadrante(30, 100, 500).nome).toBe("Observar");
  });

  it("trata carteira sem avaliação como maturidade baixa, não como alta", () => {
    // Assumir maturidade alta na ausência de dado esconderia justamente
    // quem nunca foi avaliado.
    expect(quadrante(null, 1000, 500).nome).toBe("Estruturar");
  });
});
