import type { Captura } from "./capturas";
import type { Compromisso } from "./compromissos";
import { situacao } from "./compromissos";
import type { Contrato } from "./contratos";
import { urgencia } from "./contratos";
import type { Registro } from "./registros";

/**
 * Dossiê de reunião — o resumo determinístico.
 *
 * É a resposta à pergunta "resumir o histórico da conta antes da
 * reunião" sem mandar histórico nenhum para fora. Quem entra numa
 * reunião não quer um parágrafo bem escrito: quer fatos com data. Tudo
 * aqui sai do que o produto já registrou, e cada número continua dizendo
 * de onde veio.
 *
 * A regra que organiza o dossiê é o RECORTE DE PERÍODO. A ficha da conta
 * mostra tudo; o dossiê mostra o que mudou desde a última conversa — que
 * é a pergunta real de quem vai sentar com o cliente.
 *
 * Nada aqui consulta banco: recebe o que as libs já leram (com RLS
 * aplicada) e organiza. Assim dá para testar a regra sem subir nada.
 */

export type PeriodoDossie = { inicio: string; fim: string; dias: number };

export function periodoDe(dias: number, hoje = new Date()): PeriodoDossie {
  const fim = new Date(hoje);
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - dias);
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
    dias,
  };
}

const dentro = (data: string | null | undefined, p: PeriodoDossie): boolean => {
  if (!data) return false;
  const d = data.slice(0, 10);
  return d >= p.inicio && d <= p.fim;
};

export type Dossie = {
  periodo: PeriodoDossie;

  /** O que mudou no período. */
  registrosNoPeriodo: Registro[];
  compromissosConcluidos: Compromisso[];
  capturasNoPeriodo: Captura[];
  capturadoNoPeriodo: number;

  /** O que está pendente agora. */
  compromissosAtrasados: Compromisso[];
  compromissosProximos: Compromisso[];
  contratosEmDecisao: { contrato: Contrato; motivo: string }[];

  /** Silêncio: o oposto de movimento, e igualmente informativo. */
  diasSemRegistro: number | null;
  semMovimento: boolean;
};

export function montarDossie(entrada: {
  periodo: PeriodoDossie;
  registros: Registro[];
  compromissos: Compromisso[];
  capturas: Captura[];
  contratos: Contrato[];
  hoje?: Date;
}): Dossie {
  const { periodo, registros, compromissos, capturas, contratos } = entrada;
  const hoje = entrada.hoje ?? new Date();

  const registrosNoPeriodo = registros.filter((r) => dentro(r.ocorrido_em, periodo));

  const compromissosConcluidos = compromissos.filter(
    (c) => c.status === "concluido" && dentro(c.concluido_em, periodo),
  );

  // Estorno entra na lista — esconder correção é o começo de número que
  // ninguém confere — e entra com sinal negativo na soma.
  const capturasNoPeriodo = capturas.filter((c) => dentro(c.confirmado_em, periodo));
  const capturadoNoPeriodo = capturasNoPeriodo.reduce(
    (soma, c) => soma + (c.tipo === "estorno" ? -Number(c.valor) : Number(c.valor)),
    0,
  );

  const abertos = compromissos.filter((c) => c.status === "aberto");
  const compromissosAtrasados = abertos.filter((c) => situacao(c).chave === "vencido");
  const compromissosProximos = abertos.filter((c) => {
    const chave = situacao(c).chave;
    return chave === "hoje" || chave === "alerta";
  });

  const contratosEmDecisao = contratos
    .map((c) => ({ contrato: c, u: urgencia(c) }))
    .filter(({ u }) => u.chave === "vencido" || u.chave === "janela" || u.chave === "sem_prazo")
    .map(({ contrato, u }) => ({ contrato, motivo: u.detalhe || u.rotulo }));

  const ultimo = registros
    .map((r) => r.ocorrido_em)
    .filter(Boolean)
    .sort()
    .at(-1);

  const diasSemRegistro = ultimo
    ? Math.floor((hoje.getTime() - new Date(ultimo).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    periodo,
    registrosNoPeriodo,
    compromissosConcluidos,
    capturasNoPeriodo,
    capturadoNoPeriodo,
    compromissosAtrasados,
    compromissosProximos,
    contratosEmDecisao,
    diasSemRegistro,
    // Silêncio no período é achado, não ausência de achado: a reunião
    // precisa saber que não houve conversa nenhuma desde a última vez.
    semMovimento:
      registrosNoPeriodo.length === 0 &&
      compromissosConcluidos.length === 0 &&
      capturasNoPeriodo.length === 0,
  };
}

/** Agrupa os registros do período por tipo, preservando a ordem de leitura. */
export function porTipo(registros: Registro[]): { tipo: string; itens: Registro[] }[] {
  const mapa = new Map<string, Registro[]>();
  for (const r of registros) {
    const lista = mapa.get(r.tipo) ?? [];
    lista.push(r);
    mapa.set(r.tipo, lista);
  }
  return [...mapa.entries()].map(([tipo, itens]) => ({ tipo, itens }));
}
