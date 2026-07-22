import { criarClienteServidor } from "./supabase/server";
import type { Papel } from "./tipos";

export type PessoaAcesso = {
  user_id: string;
  papel: Papel;
  ativo: boolean;
  criado_em: string;
  nome: string | null;
  email: string | null;
  carteiras_visiveis: number;
  carteiras_respondidas: number;
  alertas_abertos: number;
  compromissos_abertos: number;
  ultimo_registro: string | null;
};

export async function pessoasComAcesso(orgId: string): Promise<PessoaAcesso[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("acesso_pessoas")
    .select("*")
    .eq("org_id", orgId)
    .limit(300);

  if (error) {
    console.error("[acesso] falha ao consultar:", error.message);
    return [];
  }

  const ordem: Record<Papel, number> = {
    owner: 0,
    admin: 1,
    analista: 2,
    ponto_focal: 3,
    leitura_ampla: 4,
  };

  return ((data ?? []) as PessoaAcesso[]).sort((a, b) => {
    if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
    if (ordem[a.papel] !== ordem[b.papel]) return ordem[a.papel] - ordem[b.papel];
    return (a.nome ?? a.email ?? "").localeCompare(b.nome ?? b.email ?? "", "pt-BR");
  });
}

/** O que cada papel pode fazer, em linguagem de quem usa. */
export const MATRIZ: {
  papel: Papel;
  alcance: string;
  le: string;
  edita: string;
  administra: string;
}[] = [
  {
    papel: "owner",
    alcance: "Toda a organização",
    le: "Tudo",
    edita: "Tudo",
    administra: "Pessoas, catálogos e a própria organização",
  },
  {
    papel: "admin",
    alcance: "Toda a organização",
    le: "Tudo",
    edita: "Tudo",
    administra: "Pessoas e catálogos",
  },
  {
    papel: "analista",
    alcance: "Todas as carteiras",
    le: "Tudo, menos a trilha de alterações",
    edita: "Carteiras, contas, contratos, frentes e oportunidades",
    administra: "Nada",
  },
  {
    papel: "ponto_focal",
    alcance: "Só as carteiras em que foi vinculado",
    le: "O que há nessas carteiras",
    edita: "O que há nessas carteiras",
    administra: "Nada",
  },
  {
    papel: "leitura_ampla",
    alcance: "Toda a organização",
    le: "Tudo, inclusive a trilha de alterações",
    edita: "Nada",
    administra: "Nada",
  },
];
