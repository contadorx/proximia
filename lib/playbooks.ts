import { criarClienteServidor } from "./supabase/server";
import type { Fase } from "./oportunidades";

export type Playbook = {
  id: string;
  nome: string;
  descricao: string | null;
  fase: Fase;
  ativo: boolean;
};

export type PlaybookTarefa = {
  id: string;
  playbook_id: string;
  titulo: string;
  descricao: string | null;
  dias_apos: number;
  alerta_dias: number;
  dono_regra: "responsavel_entidade" | "responsavel_carteira" | "quem_moveu";
  ordem: number;
};

export const REGRAS_DONO: { valor: PlaybookTarefa["dono_regra"]; rotulo: string; explicacao: string }[] =
  [
    {
      valor: "responsavel_entidade",
      rotulo: "Responsável da oportunidade",
      explicacao: "Cai em quem toca a oportunidade; sem responsável, vai para quem responde pela carteira.",
    },
    {
      valor: "responsavel_carteira",
      rotulo: "Quem responde pela carteira",
      explicacao: "Útil para tarefas de acompanhamento e conferência.",
    },
    {
      valor: "quem_moveu",
      rotulo: "Quem moveu a oportunidade",
      explicacao: "Cai em quem avançou a etapa — bom para o que precisa ser feito por quem estava lá.",
    },
  ];

export async function playbooks(orgId: string): Promise<Playbook[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("playbooks")
    .select("id, nome, descricao, fase, ativo")
    .eq("org_id", orgId)
    .order("fase");
  return (data ?? []) as Playbook[];
}

export async function tarefasDosPlaybooks(orgId: string): Promise<PlaybookTarefa[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("playbook_tarefas")
    .select("id, playbook_id, titulo, descricao, dias_apos, alerta_dias, dono_regra, ordem")
    .eq("org_id", orgId)
    .order("ordem");
  return (data ?? []) as PlaybookTarefa[];
}

export function rotuloRegra(regra: PlaybookTarefa["dono_regra"]): string {
  return REGRAS_DONO.find((r) => r.valor === regra)?.rotulo ?? regra;
}
