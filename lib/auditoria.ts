import { criarClienteServidor } from "./supabase/server";

export type Acao =
  | "criou"
  | "alterou"
  | "excluiu"
  | "leu"
  | "baixou"
  | "exportou"
  | "enviou"
  | "abriu_portal";

export type Origem = "app" | "gatilho" | "rotina" | "portal";

export type LinhaAuditoria = {
  id: number;
  user_id: string | null;
  origem: Origem;
  acao: Acao;
  entidade_tipo: string;
  entidade_id: string | null;
  resumo: string | null;
  campos: string[] | null;
  detalhe: Record<string, unknown>;
  criado_em: string;
};

export const ACOES: { valor: Acao; rotulo: string }[] = [
  { valor: "criou", rotulo: "Criou" },
  { valor: "alterou", rotulo: "Alterou" },
  { valor: "excluiu", rotulo: "Excluiu" },
  { valor: "leu", rotulo: "Abriu" },
  { valor: "baixou", rotulo: "Baixou" },
  { valor: "exportou", rotulo: "Exportou" },
  { valor: "enviou", rotulo: "Enviou" },
  { valor: "abriu_portal", rotulo: "Abriu o portal" },
];

/** Nome de tabela é nome de tabela. Aqui vira o nome que a operação usa. */
const ENTIDADES: Record<string, string> = {
  carteiras: "Carteira",
  contas: "Conta",
  contratos: "Contrato",
  contrato_clausulas: "Cláusula",
  frentes: "Frente",
  oportunidades: "Oportunidade",
  anexos: "Anexo",
  memberships: "Acesso de pessoa",
  convites: "Convite",
  portais: "Portal",
  auditoria: "Trilha",
  extrato: "Extrato",
};

export function rotuloEntidadeAuditada(tabela: string): string {
  return ENTIDADES[tabela] ?? tabela;
}

export function rotuloAcao(acao: Acao): string {
  return ACOES.find((a) => a.valor === acao)?.rotulo ?? acao;
}

export function classeAcao(acao: Acao): string {
  if (acao === "excluiu") return "selo selo-falta";
  if (acao === "criou") return "selo selo-ok";
  if (acao === "alterou") return "selo selo-atencao";
  return "selo selo-neutro";
}

/** Nome de coluna do banco em português corrente, para a linha ficar legível. */
const CAMPOS: Record<string, string> = {
  nome: "nome",
  titulo: "título",
  numero: "número",
  status: "situação",
  fim: "fim da vigência",
  inicio: "início da vigência",
  valor_base: "valor base",
  potencial_bruto: "potencial",
  valor_capturado: "capturado",
  aviso_previo_dias: "aviso prévio",
  renovacao_automatica: "renovação automática",
  responsavel_id: "responsável",
  dono_id: "dono",
  papel: "papel",
  ativo: "situação do vínculo",
  score_maturidade: "score",
  qtd_casos: "quantidade de casos",
  proxima_etapa: "próxima etapa",
  prazo: "prazo",
  fase: "fase",
  criticidade: "criticidade",
  relacao: "relação",
};

/** Ruído de gatilho: muda em toda gravação e não diz nada a ninguém. */
const CAMPOS_OCULTOS = new Set(["atualizado_em", "criado_em", "fase_desde", "janela_renegociacao"]);

export function descreverCampos(campos: string[] | null): string {
  if (!campos?.length) return "";
  const uteis = campos.filter((c) => !CAMPOS_OCULTOS.has(c));
  if (!uteis.length) return "";
  return uteis.map((c) => CAMPOS[c] ?? c.replace(/_/g, " ")).join(", ");
}

export async function listarAuditoria(opcoes: {
  orgId: string;
  acoes?: string[];
  pessoas?: string[];
  entidade?: string;
  desde?: string;
  limite?: number;
}): Promise<LinhaAuditoria[]> {
  const supabase = criarClienteServidor();

  let consulta = supabase
    .from("auditoria")
    .select("id, user_id, origem, acao, entidade_tipo, entidade_id, resumo, campos, detalhe, criado_em")
    .eq("org_id", opcoes.orgId);

  if (opcoes.acoes?.length) consulta = consulta.in("acao", opcoes.acoes);
  if (opcoes.pessoas?.length) consulta = consulta.in("user_id", opcoes.pessoas);
  if (opcoes.entidade) consulta = consulta.eq("entidade_tipo", opcoes.entidade);
  if (opcoes.desde) consulta = consulta.gte("criado_em", opcoes.desde);

  const { data, error } = await consulta
    .order("criado_em", { ascending: false })
    .limit(opcoes.limite ?? 300);

  if (error) {
    // Erro aqui costuma ser um de dois: a migration não foi aplicada, ou
    // quem consulta não é administrador. Nenhum dos dois derruba a tela.
    console.error("[auditoria] falha ao listar:", error.message);
    return [];
  }
  return (data ?? []) as LinhaAuditoria[];
}

/** Histórico de acesso de uma entidade específica. */
export async function auditoriaDaEntidade(
  orgId: string,
  tabela: string,
  entidadeId: string,
): Promise<LinhaAuditoria[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("auditoria")
    .select("id, user_id, origem, acao, entidade_tipo, entidade_id, resumo, campos, detalhe, criado_em")
    .eq("org_id", orgId)
    .eq("entidade_tipo", tabela)
    .eq("entidade_id", entidadeId)
    .order("criado_em", { ascending: false })
    .limit(50);

  if (error) return [];
  return (data ?? []) as LinhaAuditoria[];
}

/**
 * Registra o que não passa por gatilho: leitura, download, exportação,
 * envio. Nunca interrompe a operação — trilha que derruba a ação que ela
 * deveria apenas observar é pior do que trilha com buraco, e o buraco
 * fica no log do servidor.
 */
export async function registrarAcesso(evento: {
  orgId: string;
  acao: Acao;
  entidadeTipo: string;
  entidadeId?: string | null;
  resumo?: string | null;
  detalhe?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = criarClienteServidor();
    const { error } = await supabase.rpc("registrar_acesso", {
      p_org: evento.orgId,
      p_acao: evento.acao,
      p_entidade_tipo: evento.entidadeTipo,
      p_entidade_id: evento.entidadeId ?? null,
      p_resumo: evento.resumo ?? null,
      p_detalhe: evento.detalhe ?? {},
    });
    if (error) console.error("[auditoria] acesso não registrado:", error.message);
  } catch (e) {
    console.error("[auditoria] acesso não registrado:", e);
  }
}
