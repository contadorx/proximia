import { criarClienteServidor } from "./supabase/server";

/**
 * Mapa de decisores.
 *
 * O que isto responde, cinco minutos antes da reunião: quem decide, quem
 * influencia, quem é contra, e por onde a informação entra.
 *
 * O que isto NÃO é: CRM de contatos. Não há campanha, sequência de
 * e-mail nem registro de ligação — só o mapa de quem decide.
 *
 * Papel e postura são catálogo do assinante. O produto nunca lê o rótulo
 * ("Diretor de Operações" não significa nada para ele); lê a propriedade
 * estrutural que o assinante marcou: `decide` no papel, `tom` na postura.
 * É o que permite calcular os avisos sem saber o vocabulário do setor.
 */

export type PapelDecisao = {
  id: string;
  rotulo: string;
  descricao: string | null;
  decide: boolean;
  ordem: number;
  ativo: boolean;
};

export type PosturaContato = {
  id: string;
  rotulo: string;
  descricao: string | null;
  tom: "favoravel" | "neutro" | "contrario";
  ordem: number;
  ativo: boolean;
};

export type ContatoMapa = {
  id: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  principal: boolean;
  area: string | null;
  influencia: number | null;
  papel_id: string | null;
  postura_id: string | null;
  reporta_a: string | null;
};

const CAMPOS_CONTATO =
  "id, nome, cargo, email, telefone, principal, area, influencia, papel_id, postura_id, reporta_a";

export async function papeisDecisao(orgId: string): Promise<PapelDecisao[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("contato_papeis")
    .select("id, rotulo, descricao, decide, ordem, ativo")
    .eq("org_id", orgId)
    .order("ordem");
  if (error) {
    console.error("[decisores] papéis:", error.message);
    return [];
  }
  return (data ?? []) as PapelDecisao[];
}

export async function posturasContato(orgId: string): Promise<PosturaContato[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("contato_posturas")
    .select("id, rotulo, descricao, tom, ordem, ativo")
    .eq("org_id", orgId)
    .order("ordem");
  if (error) {
    console.error("[decisores] posturas:", error.message);
    return [];
  }
  return (data ?? []) as PosturaContato[];
}

export async function contatosDoMapa(contaId: string): Promise<ContatoMapa[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("contatos")
    .select(CAMPOS_CONTATO)
    .eq("conta_id", contaId)
    .order("principal", { ascending: false })
    .order("nome");
  if (error) {
    console.error("[decisores] contatos:", error.message);
    return [];
  }
  return (data ?? []) as ContatoMapa[];
}

/* ------------------------------------------------------------------ */
/* Leitura do mapa — as quatro perguntas da ficha                      */
/* ------------------------------------------------------------------ */

export type LeituraMapa = {
  decidem: ContatoMapa[];
  influenciam: ContatoMapa[];
  contra: ContatoMapa[];
  portaDeEntrada: ContatoMapa[];
  semPapel: number;
  total: number;
};

export function lerMapa(
  contatos: ContatoMapa[],
  papeis: PapelDecisao[],
  posturas: PosturaContato[],
): LeituraMapa {
  const papelDe = new Map(papeis.map((p) => [p.id, p]));
  const posturaDe = new Map(posturas.map((p) => [p.id, p]));

  const decidem = contatos.filter((c) => c.papel_id && papelDe.get(c.papel_id)?.decide);

  // Influencia quem não decide mas pesa: ou tem papel cadastrado que não
  // decide, ou tem influência declarada de 4 para cima.
  const influenciam = contatos.filter(
    (c) =>
      !(c.papel_id && papelDe.get(c.papel_id)?.decide) &&
      ((c.papel_id != null && papelDe.has(c.papel_id)) || (c.influencia ?? 0) >= 4),
  );

  const contra = contatos.filter(
    (c) => c.postura_id && posturaDe.get(c.postura_id)?.tom === "contrario",
  );

  // Por onde a informação entra: o contato principal, e quem mais estiver
  // no topo da hierarquia (não reporta a ninguém dentro da conta).
  const portaDeEntrada = contatos.filter((c) => c.principal || c.reporta_a === null);

  return {
    decidem,
    influenciam,
    contra,
    portaDeEntrada,
    semPapel: contatos.filter((c) => !c.papel_id).length,
    total: contatos.length,
  };
}

/* ------------------------------------------------------------------ */
/* Hierarquia — árvore a partir de "reporta a"                         */
/* ------------------------------------------------------------------ */

export type NoHierarquia = {
  contato: ContatoMapa;
  filhos: NoHierarquia[];
  profundidade: number;
};

/**
 * Monta a árvore. Quem não reporta a ninguém (ou reporta a alguém que não
 * está na lista) vira raiz.
 *
 * O banco já recusa ciclo, mas esta função é usada com dados que podem
 * vir de qualquer lugar — inclusive de um mapa importado antes da trava
 * existir. Por isso ela também se protege: nó já visitado não entra de
 * novo, e o resultado nunca perde contato. Árvore que trava a tela é pior
 * que hierarquia feia.
 */
export function montarHierarquia(contatos: ContatoMapa[]): NoHierarquia[] {
  const porId = new Map(contatos.map((c) => [c.id, c]));
  const filhosDe = new Map<string, ContatoMapa[]>();
  const raizes: ContatoMapa[] = [];

  for (const c of contatos) {
    const chefe = c.reporta_a && porId.has(c.reporta_a) ? c.reporta_a : null;
    if (chefe === null || chefe === c.id) {
      raizes.push(c);
    } else {
      const lista = filhosDe.get(chefe) ?? [];
      lista.push(c);
      filhosDe.set(chefe, lista);
    }
  }

  const visitados = new Set<string>();

  const descer = (contato: ContatoMapa, profundidade: number): NoHierarquia => {
    visitados.add(contato.id);
    const filhos = (filhosDe.get(contato.id) ?? [])
      .filter((f) => !visitados.has(f.id))
      .map((f) => descer(f, profundidade + 1));
    return { contato, filhos, profundidade };
  };

  const arvore = raizes.filter((r) => !visitados.has(r.id)).map((r) => descer(r, 0));

  // Ninguém pode sumir: se sobrou alguém preso num ciclo herdado, ele
  // entra como raiz solta em vez de desaparecer da tela.
  for (const c of contatos) {
    if (!visitados.has(c.id)) arvore.push(descer(c, 0));
  }

  return arvore;
}

/** Achata a árvore na ordem de leitura, para desenhar linha a linha. */
export function achatar(arvore: NoHierarquia[]): NoHierarquia[] {
  const saida: NoHierarquia[] = [];
  const anda = (nos: NoHierarquia[]) => {
    for (const n of nos) {
      saida.push(n);
      anda(n.filhos);
    }
  };
  anda(arvore);
  return saida;
}

/** Rótulo curto da influência. Escala de 1 a 5, sem falsa precisão. */
export function rotuloInfluencia(nivel: number | null): string {
  if (nivel === null || nivel === undefined) return "influência não avaliada";
  const nomes = ["", "muito baixa", "baixa", "média", "alta", "decisiva"];
  return `influência ${nomes[nivel] ?? "não avaliada"}`;
}

export function classeTom(tom: string | undefined): string {
  if (tom === "favoravel") return "selo selo-ok";
  if (tom === "contrario") return "selo selo-falta";
  return "selo selo-neutro";
}
