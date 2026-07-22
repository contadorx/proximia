import { criarClienteServidor } from "./supabase/server";

export type Captura = {
  id: string;
  entidade_tipo: "conta" | "frente";
  entidade_id: string;
  tipo: "captura" | "estorno";
  valor: number;
  confirmado_em: string | null;
  descricao: string | null;
  comprovacao: string | null;
  origem: "registro" | "legado";
  autor_id: string | null;
  criado_em: string;
};

export async function capturasDa(
  tipo: "conta" | "frente",
  entidadeId: string,
): Promise<Captura[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("capturas")
    .select(
      "id, entidade_tipo, entidade_id, tipo, valor, confirmado_em, descricao, comprovacao, origem, autor_id, criado_em",
    )
    .eq("entidade_tipo", tipo)
    .eq("entidade_id", entidadeId)
    .order("confirmado_em", { ascending: false, nullsFirst: false })
    .order("criado_em", { ascending: false });

  if (error) {
    console.error("[capturas] falha ao listar:", error.message);
    return [];
  }
  return (data ?? []) as Captura[];
}

/** Saldo: capturas menos estornos. É o mesmo número que o campo guarda. */
export function saldo(lista: Captura[]): number {
  return lista.reduce((t, c) => t + (c.tipo === "captura" ? Number(c.valor) : -Number(c.valor)), 0);
}
