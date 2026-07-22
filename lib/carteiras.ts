import { criarClienteServidor } from "./supabase/server";

export type StatusCarteira = "ativa" | "pausada" | "encerrada";

export const STATUS_CARTEIRA: { valor: StatusCarteira; rotulo: string }[] = [
  { valor: "ativa", rotulo: "Ativa" },
  { valor: "pausada", rotulo: "Pausada" },
  { valor: "encerrada", rotulo: "Encerrada" },
];

export type Carteira = {
  id: string;
  nome: string;
  codigo: string | null;
  regiao: string | null;
  status: StatusCarteira;
  responsavel_id: string | null;
  score_maturidade: number | null;
  score_ciclo: string | null;
  observacoes: string | null;
  atualizado_em: string;
};

export type Pessoa = { id: string; nome: string | null; email: string | null };

export async function listarCarteiras(orgId: string): Promise<Carteira[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("carteiras")
    .select(
      "id, nome, codigo, regiao, status, responsavel_id, score_maturidade, score_ciclo, observacoes, atualizado_em",
    )
    .eq("org_id", orgId)
    .order("nome");

  if (error) {
    console.error("[carteiras] falha ao listar:", error.message);
    return [];
  }
  return (data ?? []) as Carteira[];
}

export async function obterCarteira(id: string): Promise<Carteira | null> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("carteiras")
    .select(
      "id, nome, codigo, regiao, status, responsavel_id, score_maturidade, score_ciclo, observacoes, atualizado_em",
    )
    .eq("id", id)
    .maybeSingle();

  return (data as Carteira) ?? null;
}

/** Pessoas com acesso à organização — usadas para responsável e vínculos. */
export async function pessoasDaOrganizacao(orgId: string): Promise<Pessoa[]> {
  const supabase = criarClienteServidor();

  const { data: vinculos } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("ativo", true);

  if (!vinculos?.length) return [];

  const { data: perfis } = await supabase
    .from("perfis")
    .select("id, nome, email")
    .in(
      "id",
      vinculos.map((v) => v.user_id as string),
    );

  return ((perfis ?? []) as Pessoa[]).sort((a, b) =>
    (a.nome ?? a.email ?? "").localeCompare(b.nome ?? b.email ?? "", "pt-BR"),
  );
}

/** Quem está vinculado a uma carteira (define o alcance do ponto focal). */
export async function pessoasDaCarteira(carteiraId: string): Promise<Pessoa[]> {
  const supabase = criarClienteServidor();

  const { data: vinculos } = await supabase
    .from("carteira_membros")
    .select("user_id")
    .eq("carteira_id", carteiraId);

  if (!vinculos?.length) return [];

  const { data: perfis } = await supabase
    .from("perfis")
    .select("id, nome, email")
    .in(
      "id",
      vinculos.map((v) => v.user_id as string),
    );

  return (perfis ?? []) as Pessoa[];
}

export function nomePessoa(pessoa: Pessoa | undefined | null): string {
  if (!pessoa) return "—";
  return pessoa.nome ?? pessoa.email ?? "Pessoa sem perfil";
}

export function faixaMaturidade(score: number | null): string | null {
  if (score === null) return null;
  if (score < 40) return "Inicial";
  if (score < 60) return "Em estruturação";
  if (score < 80) return "Intermediária";
  return "Avançada";
}
