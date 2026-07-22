import { criarClienteServidor } from "./supabase/server";

export type PapelOperacional = {
  id: string;
  nome: string;
  descricao: string | null;
  primario: boolean;
  ordem: number;
  ativo: boolean;
};

export type Responsabilidade = {
  id: string;
  carteira_id: string;
  user_id: string;
  papel_id: string;
  observacao: string | null;
};

export async function papeisOperacionais(orgId: string): Promise<PapelOperacional[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("papeis_operacionais")
    .select("id, nome, descricao, primario, ordem, ativo")
    .eq("org_id", orgId)
    .order("ordem")
    .order("nome");
  return (data ?? []) as PapelOperacional[];
}

export async function responsabilidades(opcoes: {
  orgId: string;
  carteiraId?: string;
  userId?: string;
}): Promise<Responsabilidade[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase
    .from("responsabilidades")
    .select("id, carteira_id, user_id, papel_id, observacao")
    .eq("org_id", opcoes.orgId);

  if (opcoes.carteiraId) consulta = consulta.eq("carteira_id", opcoes.carteiraId);
  if (opcoes.userId) consulta = consulta.eq("user_id", opcoes.userId);

  const { data, error } = await consulta.limit(500);
  if (error) {
    console.error("[responsabilidades] falha ao listar:", error.message);
    return [];
  }
  return (data ?? []) as Responsabilidade[];
}

/** Carteiras pelas quais a pessoa responde, em qualquer papel. */
export async function carteirasDaPessoa(orgId: string, userId: string): Promise<string[]> {
  const lista = await responsabilidades({ orgId, userId });
  return [...new Set(lista.map((r) => r.carteira_id))];
}
