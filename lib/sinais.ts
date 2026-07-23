import type { Compromisso } from "@/lib/compromissos";
import { situacao } from "@/lib/compromissos";
import type { Contrato } from "@/lib/contratos";
import { urgencia } from "@/lib/contratos";

/**
 * Sinais por conta — a alternativa deliberada a um "health score".
 *
 * Uma nota composta exigiria pesos, e peso é opinião disfarçada de
 * número: quebraria a regra da casa de que todo valor diz de onde veio,
 * e competiria com a maturidade, que é o score do produto — por
 * carteira, com régua do assinante. Aqui não há fórmula: cada sinal é
 * um fato que o produto já calcula, nomeado, com origem clicável. A
 * lista substitui a ideia do score; não convive com ela.
 */

export type Sinal = {
  chave: string;
  rotulo: string;
  detalhe?: string;
  href?: string;
};

export const DIAS_SEM_REGISTRO = 60;

type AvisoMinimo = {
  severidade: string;
  entidade_tipo: string | null;
  entidade_id: string | null;
  titulo: string;
};

export function sinaisDaConta(opcoes: {
  contaId: string;
  potencialBruto: number | null;
  valorCapturado: number | null;
  contratos: Contrato[];
  avisosAbertos: AvisoMinimo[];
  compromissosAbertos: Compromisso[];
  ultimoRegistroEm?: string | null;
  hoje?: Date;
}): Sinal[] {
  const {
    contaId,
    potencialBruto,
    valorCapturado,
    contratos,
    avisosAbertos,
    compromissosAbertos,
    ultimoRegistroEm,
  } = opcoes;
  const hoje = opcoes.hoje ?? new Date();
  const sinais: Sinal[] = [];

  const daConta = contratos.filter((c) => c.conta_id === contaId);
  const idsContratos = new Set(daConta.map((c) => c.id));

  for (const c of daConta) {
    const u = urgencia(c);
    if (u.chave === "vencido") {
      sinais.push({
        chave: `contrato-vencido-${c.id}`,
        rotulo: "Contrato vencido",
        detalhe: c.numero ?? undefined,
        href: `/contratos/${c.id}`,
      });
    } else if (u.chave === "janela") {
      sinais.push({
        chave: `contrato-janela-${c.id}`,
        rotulo: "Contrato em janela de renegociação",
        detalhe: c.numero ?? undefined,
        href: `/contratos/${c.id}`,
      });
    }
  }

  const altos = avisosAbertos.filter(
    (a) =>
      a.severidade === "alta" &&
      ((a.entidade_tipo === "conta" && a.entidade_id === contaId) ||
        (a.entidade_tipo === "contrato" && a.entidade_id && idsContratos.has(a.entidade_id))),
  );
  if (altos.length > 0) {
    sinais.push({
      chave: "aviso-alto",
      rotulo:
        altos.length === 1 ? "Aviso de severidade alta" : `${altos.length} avisos de severidade alta`,
      detalhe: altos[0].titulo,
      href: "/pendencias#avisos",
    });
  }

  const atrasados = compromissosAbertos.filter(
    (c) =>
      c.status === "aberto" &&
      c.entidade_tipo === "conta" &&
      c.entidade_id === contaId &&
      situacao(c).chave === "vencido",
  );
  if (atrasados.length > 0) {
    sinais.push({
      chave: "compromisso-atrasado",
      rotulo:
        atrasados.length === 1
          ? "Compromisso atrasado"
          : `${atrasados.length} compromissos atrasados`,
      detalhe: atrasados[0].titulo,
      href: `/pendencias?alvo=conta:${contaId}`,
    });
  }

  if (Number(potencialBruto ?? 0) > 0 && Number(valorCapturado ?? 0) === 0) {
    sinais.push({
      chave: "potencial-sem-captura",
      rotulo: "Potencial declarado sem captura",
      detalhe: "nenhum valor confirmado até aqui",
    });
  }

  // Só dispara quando existe registro e ele envelheceu: conta que nunca
  // registrou pode ser conta recém-criada, e punir cadastro novo seria
  // ruído. A limitação é essa e está dita.
  if (ultimoRegistroEm) {
    const dias = Math.floor(
      (hoje.getTime() - new Date(ultimoRegistroEm).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (dias > DIAS_SEM_REGISTRO) {
      sinais.push({
        chave: "sem-registro",
        rotulo: `${dias} dias sem registro`,
        detalhe: "último movimento no histórico da conta",
      });
    }
  }

  return sinais;
}
