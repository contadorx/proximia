import { criarClienteServidor } from "./supabase/server";
import type { EntidadeTipo } from "./registros";

export type TipoAlerta =
  | "contrato_vencido"
  | "contrato_janela"
  | "compromisso_atrasado"
  | "carteira_parada"
  | "frente_parada"
  | "oportunidade_parada"
  | "potencial_sem_captura"
  // Mapa de decisores (0037): derivados do mapa, não do calendário.
  | "conta_sem_decisor"
  | "conta_ponto_unico";

export type Alerta = {
  id: string;
  carteira_id: string;
  tipo: TipoAlerta;
  severidade: "alta" | "atencao" | "informativa";
  entidade_tipo: EntidadeTipo | null;
  entidade_id: string | null;
  titulo: string;
  detalhe: string | null;
  status: "aberto" | "resolvido" | "silenciado";
  dono_id: string | null;
  observadores: string[];
  criado_em: string;
};

export const ROTULO_TIPO: Record<TipoAlerta, string> = {
  contrato_vencido: "Contrato vencido",
  contrato_janela: "Janela de renegociação",
  compromisso_atrasado: "Compromisso atrasado",
  carteira_parada: "Carteira sem movimento",
  frente_parada: "Frente parada",
  oportunidade_parada: "Oportunidade parada",
  potencial_sem_captura: "Potencial sem captura",
  conta_sem_decisor: "Conta sem decisor mapeado",
  conta_ponto_unico: "Ponto único de relacionamento",
};

/** Teto de linhas por consulta. Quando a lista bate nele, a tela avisa. */
export const LIMITE_ALERTAS = 200;

export async function listarAlertas(opcoes: {
  orgId: string;
  status?: string;
  carteiras?: string[];
  severidades?: string[];
}): Promise<Alerta[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase
    .from("alertas")
    .select("id, carteira_id, tipo, severidade, entidade_tipo, entidade_id, titulo, detalhe, status, criado_em, dono_id, observadores")
    .eq("org_id", opcoes.orgId)
    .eq("status", opcoes.status ?? "aberto");

  if (opcoes.carteiras?.length) consulta = consulta.in("carteira_id", opcoes.carteiras);
  if (opcoes.severidades?.length) consulta = consulta.in("severidade", opcoes.severidades);

  const { data, error } = await consulta
    .order("criado_em", { ascending: false })
    .limit(LIMITE_ALERTAS);
  if (error) {
    console.error("[alertas] falha ao listar:", error.message);
    return [];
  }

  const ordem = { alta: 0, atencao: 1, informativa: 2 } as const;
  return ((data ?? []) as Alerta[]).sort(
    (a, b) => ordem[a.severidade] - ordem[b.severidade],
  );
}

export function classeSeveridade(s: Alerta["severidade"]): string {
  if (s === "alta") return "selo selo-falta";
  if (s === "atencao") return "selo selo-atencao";
  return "selo selo-neutro";
}
