import { criarClienteServidor } from "./supabase/server";

/**
 * Equipe: as pessoas da operação, com ou sem login.
 *
 * Responder por uma carteira e poder entrar no sistema são coisas
 * diferentes. A pessoa pode ser cadastrada antes do convite — para o
 * dado nascer com dono — e, quando aceita o acesso, o gatilho no banco
 * casa o cadastro pelo e-mail: tudo o que ela respondia continua dela.
 */
export type PessoaEquipe = {
  id: string;
  nome: string;
  email: string | null;
  user_id: string | null;
  ativo: boolean;
  observacao: string | null;
};

export async function listarEquipe(
  orgId: string,
  opcoes: { incluirInativos?: boolean } = {},
): Promise<PessoaEquipe[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase
    .from("equipe")
    .select("id, nome, email, user_id, ativo, observacao")
    .eq("org_id", orgId);
  if (!opcoes.incluirInativos) consulta = consulta.eq("ativo", true);

  const { data, error } = await consulta.order("nome").limit(500);
  if (error) {
    console.error("[equipe] falha ao listar:", error.message);
    return [];
  }
  return (data ?? []) as PessoaEquipe[];
}

/**
 * A pessoa da equipe que corresponde ao usuário da sessão nesta
 * organização. É por este id que "meus" compromissos e alertas são
 * encontrados — o dono das fichas é pessoa da equipe, não login.
 */
export async function minhaEquipeId(orgId: string, userId: string): Promise<string | null> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("equipe")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  return ((data as { id: string } | null)?.id) ?? null;
}
