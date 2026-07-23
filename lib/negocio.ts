import { criarClienteServidor } from "./supabase/server";

export type Assinante = {
  id: string;
  nome: string;
  slug: string;
  status: "avaliacao" | "ativa" | "suspensa" | "encerrada";
  plano: string | null;
  plano_id: string | null;
  valor_mensal: number;
  ciclo: string;
  avaliacao_ate: string | null;
  proximo_vencimento: string | null;
  conta_teste: boolean;
  observacao_interna: string | null;
  criado_em: string;
  carteiras: number;
  pessoas: number;
  ultimo_registro: string | null;

  /** Quem é o dono e se o convite virou acesso. */
  dono_email: string | null;
  convite_email: string | null;
  convite_aceito_em: string | null;
};

/**
 * O que dizer sobre o dono de um assinante.
 *
 * A informação útil não é o e-mail sozinho: é se ele já entrou.
 * Organização criada há duas semanas com convite pendente não é
 * assinante devagar — é assinante que nunca entrou, e isso muda o que se
 * faz a respeito.
 */
export function situacaoDoDono(a: Assinante): {
  email: string | null;
  estado: "ativo" | "pendente" | "sem_dono";
  frase: string;
} {
  if (a.dono_email) {
    return {
      email: a.dono_email,
      estado: "ativo",
      frase: a.dono_email,
    };
  }

  if (a.convite_email) {
    return {
      email: a.convite_email,
      estado: "pendente",
      frase: `${a.convite_email} — convite ainda não aceito`,
    };
  }

  return {
    email: null,
    estado: "sem_dono",
    frase: "sem dono definido",
  };
}

export type PainelNegocio = {
  receita_recorrente: number;
  receita_em_avaliacao: number;
  assinantes: {
    total: number;
    ativa: number;
    avaliacao: number;
    suspensa: number;
    encerrada: number;
    teste: number;
  };
  novos_30d: number;
  avaliacoes_vencendo: number;
  serie: { mes: string; novos: number }[];
  lista: Assinante[];
};

export type Plano = {
  id: string;
  nome: string;
  descricao: string | null;
  valor_mensal: number;
  limite_carteiras: number | null;
  limite_pessoas: number | null;
  ativo: boolean;
};

export const STATUS_ASSINATURA = [
  { valor: "avaliacao", rotulo: "Em avaliação", classe: "selo selo-atencao" },
  { valor: "ativa", rotulo: "Ativa", classe: "selo selo-ok" },
  { valor: "suspensa", rotulo: "Suspensa", classe: "selo selo-falta" },
  { valor: "encerrada", rotulo: "Encerrada", classe: "selo selo-neutro" },
];

export function seloStatus(status: string) {
  return STATUS_ASSINATURA.find((s) => s.valor === status) ?? STATUS_ASSINATURA[0];
}

export async function souOperador(): Promise<boolean> {
  const supabase = criarClienteServidor();
  const { data } = await supabase.rpc("e_admin_plataforma");
  return Boolean(data);
}

export async function painelNegocio(): Promise<PainelNegocio | null> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("painel_negocio");

  if (error) {
    // Sem acesso é resposta legítima, não falha: quem não opera a
    // plataforma simplesmente não tem essa tela.
    if (!/sem acesso/i.test(error.message)) console.error("[negocio] falha:", error.message);
    return null;
  }
  return data as PainelNegocio;
}

export async function planos(): Promise<Plano[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("planos")
    .select("id, nome, descricao, valor_mensal, limite_carteiras, limite_pessoas, ativo")
    .order("ordem");
  return (data ?? []) as Plano[];
}

/** Assinante que não usa é churn que ainda não avisou. */
export function diasSemUso(a: Assinante): number | null {
  if (!a.ultimo_registro) return null;
  const dias = Math.floor(
    (Date.now() - new Date(a.ultimo_registro).getTime()) / (1000 * 60 * 60 * 24),
  );
  return dias;
}

/**
 * Quem opera a plataforma — nome, e-mail e desde quando.
 *
 * A tabela `plataforma_admins` guarda só o identificador; o e-mail vive
 * em `auth.users`, que o papel da aplicação não lê. Por isso a lista sai
 * por função com privilégio de dono, guardada por `e_admin_plataforma`.
 */
export type Operador = {
  user_id: string;
  nome: string;
  email: string;
  criado_em: string;
  sou_eu: boolean;
};

export async function operadoresDaPlataforma(): Promise<Operador[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("operadores_da_plataforma");

  if (error) {
    console.error("[negocio] falha ao listar operadores:", error.message);
    return [];
  }
  return (data ?? []) as Operador[];
}

/* ------------------------------------------------------------------ */
/* Operação: disponibilidade e rotina diária                           */
/* ------------------------------------------------------------------ */

export type Disponibilidade = {
  minutos_medidos: number;
  minutos_esperados: number;
  cobertura_pct: number;
  minutos_fora: number;
  minutos_sem_medicao: number;
  disponibilidade_pct: number | null;
  disponibilidade_defensavel_pct: number;
  sustenta_995: boolean;
};

export type SaudeRotina = {
  situacao: string;
  ultima_em: string | null;
  horas_atras: number | null;
  ultima_falhas: number | null;
  detalhe: string;
};

export async function disponibilidadeDosUltimos(dias = 30): Promise<Disponibilidade | null> {
  const supabase = criarClienteServidor();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - dias);

  const { data, error } = await supabase.rpc("disponibilidade_periodo", {
    p_inicio: inicio.toISOString(),
  });

  if (error) {
    console.error("[negocio] disponibilidade:", error.message);
    return null;
  }
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha ?? null) as Disponibilidade | null;
}

export async function saudeDaRotina(): Promise<SaudeRotina | null> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("rotina_saude", { p_rotina: "extratos" });

  if (error) {
    console.error("[negocio] saúde da rotina:", error.message);
    return null;
  }
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha ?? null) as SaudeRotina | null;
}

/**
 * A leitura em palavra. Sem isso o número fica no ar: 99,2% é bom ou
 * ruim? Depende do que foi prometido — e o que foi prometido é 99,5%.
 */
export function lerDisponibilidade(d: Disponibilidade | null): {
  estado: "sem_medicao" | "sustenta" | "nao_sustenta";
  frase: string;
  classe: string;
} {
  if (!d || d.minutos_medidos === 0) {
    return {
      estado: "sem_medicao",
      frase:
        "Ninguém está medindo ainda. Enquanto não houver monitor externo batendo na rota de saúde, os 99,5% dos Termos são promessa sem número atrás.",
      classe: "selo selo-falta",
    };
  }

  if (d.sustenta_995) {
    return {
      estado: "sustenta",
      frase: `${d.disponibilidade_defensavel_pct}% no período, contando como fora do ar todo minuto sem medição. Sustenta os 99,5% dos Termos.`,
      classe: "selo selo-ok",
    };
  }

  return {
    estado: "nao_sustenta",
    frase:
      `${d.disponibilidade_defensavel_pct}% no período — abaixo dos 99,5% dos Termos. ` +
      (d.minutos_sem_medicao > d.minutos_fora
        ? `A maior parte é falta de medição (${d.minutos_sem_medicao} minutos sem registro), não queda comprovada: confira se o monitor está de pé antes de tratar como incidente.`
        : `${d.minutos_fora} minuto(s) registrados fora do ar.`),
    classe: "selo selo-falta",
  };
}

/* ------------------------------------------------------------------ */
/* Erros do navegador                                                  */
/* ------------------------------------------------------------------ */

export type ErroCliente = {
  id: string;
  org_id: string | null;
  onde: string;
  tipo: string;
  mensagem: string;
  rota: string | null;
  criado_em: string;
};

/**
 * Agrupa por mensagem: cem ocorrências do mesmo erro são um problema, não
 * cem. A lista crua faria a página rolar sem dizer o que consertar.
 */
export type GrupoErro = {
  mensagem: string;
  tipo: string;
  ocorrencias: number;
  rotas: string[];
  organizacoes: number;
  ultima: string;
};

export async function errosRecentes(dias = 7): Promise<ErroCliente[]> {
  const supabase = criarClienteServidor();
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const { data, error } = await supabase
    .from("erros_cliente")
    .select("id, org_id, onde, tipo, mensagem, rota, criado_em")
    .gte("criado_em", desde.toISOString())
    .order("criado_em", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[negocio] erros do cliente:", error.message);
    return [];
  }
  return (data ?? []) as ErroCliente[];
}

export function agruparErros(lista: ErroCliente[]): GrupoErro[] {
  const mapa = new Map<string, GrupoErro & { orgs: Set<string>; rotasSet: Set<string> }>();

  for (const e of lista) {
    const chave = `${e.tipo}::${e.mensagem}`;
    const atual = mapa.get(chave) ?? {
      mensagem: e.mensagem,
      tipo: e.tipo,
      ocorrencias: 0,
      rotas: [],
      organizacoes: 0,
      ultima: e.criado_em,
      orgs: new Set<string>(),
      rotasSet: new Set<string>(),
    };

    atual.ocorrencias += 1;
    if (e.org_id) atual.orgs.add(e.org_id);
    if (e.rota) atual.rotasSet.add(e.rota);
    if (e.criado_em > atual.ultima) atual.ultima = e.criado_em;

    mapa.set(chave, atual);
  }

  return [...mapa.values()]
    .map((g) => ({
      mensagem: g.mensagem,
      tipo: g.tipo,
      ocorrencias: g.ocorrencias,
      rotas: [...g.rotasSet].slice(0, 3),
      organizacoes: g.orgs.size,
      ultima: g.ultima,
    }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias);
}
