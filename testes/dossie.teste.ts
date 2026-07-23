import { describe, expect, it } from "vitest";
import { montarDossie, periodoDe, porTipo, type PeriodoDossie } from "@/lib/dossie";
import type { Registro } from "@/lib/registros";
import type { Compromisso } from "@/lib/compromissos";
import type { Captura } from "@/lib/capturas";
import type { Contrato } from "@/lib/contratos";

/**
 * O dossiê é a alternativa ao resumo por modelo de terceiro. Se ele
 * errar o recorte de período, entrega para a reunião um retrato de outro
 * mês — o que é pior que não entregar nada. Por isso as bordas são o que
 * mais se testa aqui.
 */

const HOJE = new Date("2026-07-23T12:00:00Z");
const P: PeriodoDossie = { inicio: "2026-04-24", fim: "2026-07-23", dias: 90 };

function registro(p: Partial<Registro> & { id: string; ocorrido_em: string }): Registro {
  return {
    carteira_id: "cart",
    entidade_tipo: "conta",
    entidade_id: "conta-1",
    tipo: "reuniao",
    titulo: null,
    corpo: "conversa",
    autor_id: "a",
    versao: 1,
    substitui_id: null,
    ativo: true,
    criado_em: `${p.ocorrido_em}T10:00:00Z`,
    ...p,
  } as Registro;
}

function compromisso(p: Partial<Compromisso> & { id: string }): Compromisso {
  return {
    carteira_id: "cart",
    entidade_tipo: "conta",
    entidade_id: "conta-1",
    titulo: "combinado",
    descricao: null,
    vence_em: "2026-07-30",
    dono_id: null,
    alerta_dias: 7,
    status: "aberto",
    concluido_em: null,
    origem: "manual",
    origem_id: null,
    ...p,
  } as Compromisso;
}

function captura(p: Partial<Captura> & { id: string; valor: number }): Captura {
  return {
    entidade_tipo: "conta",
    entidade_id: "conta-1",
    tipo: "captura",
    confirmado_em: "2026-06-10",
    descricao: null,
    comprovacao: null,
    origem: "registro",
    autor_id: "a",
    criado_em: "2026-06-10T10:00:00Z",
    ...p,
  } as Captura;
}

function contrato(p: Partial<Contrato> & { id: string }): Contrato {
  return {
    conta_id: "conta-1",
    carteira_id: "cart",
    org_id: "org",
    numero: "CT-1",
    tipo: null,
    modalidade: null,
    natureza_beneficio: null,
    inicio: "2024-01-01",
    fim: "2027-01-01",
    renovacao_automatica: false,
    aviso_previa_dias: 90,
    valor_base: null,
    periodicidade: null,
    status: "vigente",
    link_documento: null,
    observacoes: null,
    janela_renegociacao: null,
    ...p,
  } as Contrato;
}

const base = {
  periodo: P,
  registros: [] as Registro[],
  compromissos: [] as Compromisso[],
  capturas: [] as Captura[],
  contratos: [] as Contrato[],
  hoje: HOJE,
};

describe("período", () => {
  it("conta os dias para trás a partir de hoje", () => {
    const p = periodoDe(90, HOJE);
    expect(p.fim).toBe("2026-07-23");
    expect(p.inicio).toBe("2026-04-24");
    expect(p.dias).toBe(90);
  });
});

describe("recorte de período — as bordas", () => {
  it("inclui o que aconteceu no primeiro e no último dia", () => {
    const d = montarDossie({
      ...base,
      registros: [
        registro({ id: "borda-inicio", ocorrido_em: P.inicio }),
        registro({ id: "borda-fim", ocorrido_em: P.fim }),
      ],
    });
    expect(d.registrosNoPeriodo.map((r) => r.id).sort()).toEqual(["borda-fim", "borda-inicio"]);
  });

  it("exclui o dia anterior ao início — um dia fora é fora", () => {
    const d = montarDossie({
      ...base,
      registros: [registro({ id: "antes", ocorrido_em: "2026-04-23" })],
    });
    expect(d.registrosNoPeriodo).toHaveLength(0);
  });

  it("data com hora não confunde o recorte", () => {
    const d = montarDossie({
      ...base,
      registros: [registro({ id: "com-hora", ocorrido_em: "2026-05-02T23:59:00Z" })],
    });
    expect(d.registrosNoPeriodo).toHaveLength(1);
  });
});

describe("o que mudou no período", () => {
  it("compromisso concluído no período entra; concluído antes, não", () => {
    const d = montarDossie({
      ...base,
      compromissos: [
        compromisso({ id: "dentro", status: "concluido", concluido_em: "2026-05-10" }),
        compromisso({ id: "fora", status: "concluido", concluido_em: "2026-01-10" }),
        compromisso({ id: "aberto" }),
      ],
    });
    expect(d.compromissosConcluidos.map((c) => c.id)).toEqual(["dentro"]);
  });

  it("estorno aparece na lista e desconta da soma", () => {
    const d = montarDossie({
      ...base,
      capturas: [
        captura({ id: "c1", valor: 50000 }),
        captura({ id: "c2", valor: 12000, tipo: "estorno" }),
      ],
    });
    expect(d.capturasNoPeriodo).toHaveLength(2);
    expect(d.capturadoNoPeriodo).toBe(38000);
  });

  it("captura sem data de confirmação fica fora da curva do período", () => {
    const d = montarDossie({
      ...base,
      capturas: [captura({ id: "legado", valor: 99000, confirmado_em: null, origem: "legado" })],
    });
    expect(d.capturasNoPeriodo).toHaveLength(0);
    expect(d.capturadoNoPeriodo).toBe(0);
  });
});

describe("o que está pendente agora", () => {
  it("separa atrasado de próximo", () => {
    const d = montarDossie({
      ...base,
      compromissos: [
        compromisso({ id: "atrasado", vence_em: "2026-06-01" }),
        compromisso({ id: "adiante", vence_em: "2027-01-01" }),
      ],
    });
    expect(d.compromissosAtrasados.map((c) => c.id)).toEqual(["atrasado"]);
    expect(d.compromissosProximos.map((c) => c.id)).not.toContain("atrasado");
  });

  it("contrato vencido e em janela entram na decisão; vigente longe, não", () => {
    const d = montarDossie({
      ...base,
      contratos: [
        contrato({ id: "vencido", fim: "2026-01-01" }),
        contrato({ id: "tranquilo", fim: "2029-01-01", janela_renegociacao: "2028-10-01" }),
      ],
    });
    const ids = d.contratosEmDecisao.map((c) => c.contrato.id);
    expect(ids).toContain("vencido");
    expect(ids).not.toContain("tranquilo");
  });
});

describe("silêncio é achado", () => {
  it("período sem nada é marcado como sem movimento", () => {
    const d = montarDossie(base);
    expect(d.semMovimento).toBe(true);
  });

  it("um registro só já tira do silêncio", () => {
    const d = montarDossie({
      ...base,
      registros: [registro({ id: "r", ocorrido_em: "2026-06-01" })],
    });
    expect(d.semMovimento).toBe(false);
  });

  it("conta os dias desde o último registro, inclusive fora do período", () => {
    const d = montarDossie({
      ...base,
      registros: [registro({ id: "antigo", ocorrido_em: "2026-07-03" })],
    });
    expect(d.diasSemRegistro).toBe(20);
  });

  it("conta sem registro nenhum devolve nulo, não zero", () => {
    // Zero diria "registrado hoje", que é o contrário do que aconteceu.
    expect(montarDossie(base).diasSemRegistro).toBeNull();
  });
});

describe("agrupamento por tipo", () => {
  it("junta os do mesmo tipo preservando a ordem de chegada", () => {
    const grupos = porTipo([
      registro({ id: "1", ocorrido_em: "2026-06-01", tipo: "reuniao" }),
      registro({ id: "2", ocorrido_em: "2026-06-02", tipo: "nota" }),
      registro({ id: "3", ocorrido_em: "2026-06-03", tipo: "reuniao" }),
    ]);
    expect(grupos.map((g) => g.tipo)).toEqual(["reuniao", "nota"]);
    expect(grupos[0].itens.map((r) => r.id)).toEqual(["1", "3"]);
  });
});
