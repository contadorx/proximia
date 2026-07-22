import { criarClienteServidor } from "./supabase/server";

export type EntidadeTipo = "carteira" | "conta" | "contrato" | "frente";
export type TipoRegistro = "nota" | "reuniao" | "decisao" | "entrega" | "envio";

export const TIPOS_REGISTRO: { valor: TipoRegistro; rotulo: string; explicacao: string }[] = [
  { valor: "nota", rotulo: "Nota", explicacao: "Observação que vale guardar." },
  { valor: "reuniao", rotulo: "Reunião", explicacao: "O que foi conversado e com quem." },
  { valor: "decisao", rotulo: "Decisão", explicacao: "O que ficou decidido e por quê." },
  { valor: "entrega", rotulo: "Entrega", explicacao: "O que foi entregue — é o que vira extrato." },
  { valor: "envio", rotulo: "Envio", explicacao: "Documento ou proposta enviada." },
];

export type Registro = {
  id: string;
  carteira_id: string;
  entidade_tipo: EntidadeTipo;
  entidade_id: string;
  tipo: TipoRegistro;
  titulo: string | null;
  corpo: string;
  ocorrido_em: string;
  autor_id: string;
  versao: number;
  substitui_id: string | null;
  ativo: boolean;
  criado_em: string;
};

const CAMPOS =
  "id, carteira_id, entidade_tipo, entidade_id, tipo, titulo, corpo, ocorrido_em, autor_id, versao, substitui_id, ativo, criado_em";

export async function registrosDaEntidade(
  tipo: EntidadeTipo,
  entidadeId: string,
): Promise<Registro[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("registros")
    .select(CAMPOS)
    .eq("entidade_tipo", tipo)
    .eq("entidade_id", entidadeId)
    .eq("ativo", true)
    .order("ocorrido_em", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[registros] falha ao listar:", error.message);
    return [];
  }
  return (data ?? []) as Registro[];
}

export async function historico(opcoes: {
  orgId: string;
  carteiraId?: string;
  tipo?: string;
  desde?: string;
}): Promise<Registro[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase
    .from("registros")
    .select(CAMPOS)
    .eq("org_id", opcoes.orgId)
    .eq("ativo", true);

  if (opcoes.carteiraId) consulta = consulta.eq("carteira_id", opcoes.carteiraId);
  if (opcoes.tipo) consulta = consulta.eq("tipo", opcoes.tipo);
  if (opcoes.desde) consulta = consulta.gte("ocorrido_em", opcoes.desde);

  const { data, error } = await consulta
    .order("ocorrido_em", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[registros] falha no histórico:", error.message);
    return [];
  }
  return (data ?? []) as Registro[];
}

/** Todas as versões de um registro, da mais recente para a mais antiga. */
export async function versoesDoRegistro(registroId: string): Promise<Registro[]> {
  const supabase = criarClienteServidor();

  const versoes: Registro[] = [];
  let atual: string | null = registroId;

  // Segue a corrente de substituições. Limite de 20 para não percorrer
  // um encadeamento inesperadamente longo.
  for (let i = 0; i < 20 && atual; i++) {
    const { data } = await supabase.from("registros").select(CAMPOS).eq("id", atual).maybeSingle();
    if (!data) break;
    const registro = data as Registro;
    versoes.push(registro);
    atual = registro.substitui_id;
  }

  return versoes;
}

export function rotuloTipo(tipo: TipoRegistro): string {
  return TIPOS_REGISTRO.find((t) => t.valor === tipo)?.rotulo ?? tipo;
}

export function rotuloEntidade(tipo: EntidadeTipo): string {
  const mapa: Record<EntidadeTipo, string> = {
    carteira: "Carteira",
    conta: "Conta",
    contrato: "Contrato",
    frente: "Frente",
  };
  return mapa[tipo];
}

export function caminhoEntidade(tipo: EntidadeTipo, id: string): string {
  const mapa: Record<EntidadeTipo, string> = {
    carteira: "/carteiras",
    conta: "/contas",
    contrato: "/contratos",
    frente: "/frentes",
  };
  return `${mapa[tipo]}/${id}`;
}
