import { criarClienteServidor } from "./supabase/server";

export type Classificacao = {
  id: string;
  grupo: string;
  valor: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
};

export const NATUREZAS = [
  {
    valor: "captura",
    rotulo: "Captura",
    explicacao: "Receita nova, que ainda não existe.",
  },
  {
    valor: "protecao",
    rotulo: "Proteção",
    explicacao: "Receita que já existe e pode ser perdida.",
  },
] as const;

export const PRIORIDADES = [
  { valor: 1, rotulo: "Máxima", classe: "selo selo-falta" },
  { valor: 2, rotulo: "Alta", classe: "selo selo-atencao" },
  { valor: 3, rotulo: "Média", classe: "selo selo-neutro" },
  { valor: 4, rotulo: "Baixa", classe: "selo selo-neutro" },
  { valor: 5, rotulo: "Mínima", classe: "selo selo-neutro" },
];

export function rotuloNatureza(n: string): string {
  return NATUREZAS.find((x) => x.valor === n)?.rotulo ?? n;
}

export function rotuloPrioridade(p: number | null): { rotulo: string; classe: string } {
  return PRIORIDADES.find((x) => x.valor === Number(p)) ?? PRIORIDADES[2];
}

export async function classificacoes(orgId: string): Promise<Classificacao[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("classificacoes")
    .select("id, grupo, valor, descricao, ordem, ativo")
    .eq("org_id", orgId)
    .order("grupo")
    .order("ordem")
    .order("valor");
  return (data ?? []) as Classificacao[];
}

/** Agrupa o catálogo pela pergunta que cada grupo responde. */
export function porGrupo(lista: Classificacao[]): { grupo: string; valores: Classificacao[] }[] {
  const mapa = new Map<string, Classificacao[]>();
  for (const c of lista) {
    const atual = mapa.get(c.grupo) ?? [];
    atual.push(c);
    mapa.set(c.grupo, atual);
  }
  return [...mapa.entries()].map(([grupo, valores]) => ({ grupo, valores }));
}

export async function classificacoesDaConta(contaId: string): Promise<string[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("conta_classificacoes")
    .select("classificacao_id")
    .eq("conta_id", contaId);
  return ((data ?? []) as { classificacao_id: string }[]).map((c) => c.classificacao_id);
}

export async function anexosPermitidos(orgId: string): Promise<boolean> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("orgs")
    .select("permite_anexos")
    .eq("id", orgId)
    .maybeSingle();
  return (data as { permite_anexos: boolean } | null)?.permite_anexos ?? true;
}
