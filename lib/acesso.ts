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

/**
 * Atividade por pessoa — a leitura de adoção que faltava ao gestor.
 *
 * O produto media uso, mas só no painel do operador da plataforma. Quem
 * administra a organização não tinha como responder "quem da minha
 * equipe ainda não começou?", que é a conversa em que adoção de
 * ferramenta interna se ganha ou se perde.
 *
 * Mede atividade com significado — último registro, registros no mês,
 * compromissos em aberto. NÃO mede presença: nada de contagem de cliques
 * nem de tempo de sessão. Presença é vigilância com outro nome, e o
 * número que ela produz não ajuda ninguém a conversar.
 */
export type AtividadePessoa = {
  user_id: string;
  papel: string;
  ultimo_registro: string | null;
  registros_30d: number;
  compromissos_abertos: number;
};

export async function atividadeDaEquipe(orgId: string): Promise<AtividadePessoa[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("adocao_equipe")
    .select("user_id, papel, ultimo_registro, registros_30d, compromissos_abertos")
    .eq("org_id", orgId);

  if (error) {
    console.error("[acesso] atividade da equipe:", error.message);
    return [];
  }
  return (data ?? []) as AtividadePessoa[];
}

/** Como ler o número: nunca entrou, parou, ou está em uso. */
export function lerAtividade(a: AtividadePessoa): {
  estado: "nunca" | "parou" | "ativo";
  frase: string;
  classe: string;
} {
  if (!a.ultimo_registro) {
    return {
      estado: "nunca",
      frase:
        a.compromissos_abertos > 0
          ? `nunca registrou nada — e tem ${a.compromissos_abertos} compromisso(s) na mão`
          : "nunca registrou nada",
      classe: "selo selo-falta",
    };
  }

  const dias = Math.floor(
    (Date.now() - new Date(a.ultimo_registro).getTime()) / (1000 * 60 * 60 * 24),
  );

  if (dias > 30) {
    return {
      estado: "parou",
      frase: `último registro há ${dias} dias`,
      classe: "selo selo-neutro",
    };
  }

  return {
    estado: "ativo",
    frase: `${a.registros_30d} registro(s) em 30 dias`,
    classe: "selo selo-ok",
  };
}
