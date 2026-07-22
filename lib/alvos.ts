import { criarClienteServidor } from "./supabase/server";
import type { EntidadeTipo } from "./registros";

export type Alvo = {
  valor: string; // "tipo:id"
  tipo: EntidadeTipo;
  id: string;
  nome: string;
  carteiraId: string;
  rotuloTipo: string;
};

const ROTULOS: Record<EntidadeTipo, string> = {
  carteira: "Carteira",
  conta: "Conta",
  contrato: "Contrato",
  frente: "Frente",
  oportunidade: "Oportunidade",
};

export function rotuloTipo(tipo: EntidadeTipo): string {
  return ROTULOS[tipo] ?? tipo;
}

/**
 * Tudo a que um compromisso pode se referir, numa lista só.
 *
 * O compromisso nasce de uma conversa sobre alguma coisa — uma conta, um
 * contrato, uma frente. Obrigar a pessoa a escolher primeiro o tipo e
 * depois o item faz errar a combinação; uma lista única com busca resolve
 * em um gesto.
 */
export async function alvosDisponiveis(orgId: string): Promise<Alvo[]> {
  const supabase = criarClienteServidor();

  const [carteiras, contas, contratos, frentes, oportunidades] = await Promise.all([
    supabase.from("carteiras").select("id, nome, codigo").eq("org_id", orgId).eq("status", "ativa"),
    supabase.from("contas").select("id, nome, carteira_id").eq("org_id", orgId).eq("status", "ativa"),
    supabase.from("contratos").select("id, numero, conta_id, carteira_id").eq("org_id", orgId).neq("status", "encerrado"),
    supabase.from("frentes").select("id, titulo, carteira_id").eq("org_id", orgId).neq("status", "descartada"),
    supabase.from("oportunidades").select("id, titulo, carteira_id").eq("org_id", orgId).not("fase", "in", "(concluida,descartada)"),
  ]);

  const nomeConta = new Map(
    ((contas.data ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]),
  );

  const lista: Alvo[] = [];

  for (const c of (carteiras.data ?? []) as { id: string; nome: string; codigo: string | null }[]) {
    lista.push({
      valor: `carteira:${c.id}`,
      tipo: "carteira",
      id: c.id,
      nome: c.nome,
      carteiraId: c.id,
      rotuloTipo: "Carteira",
    });
  }

  for (const c of (contas.data ?? []) as { id: string; nome: string; carteira_id: string }[]) {
    lista.push({
      valor: `conta:${c.id}`,
      tipo: "conta",
      id: c.id,
      nome: c.nome,
      carteiraId: c.carteira_id,
      rotuloTipo: "Conta",
    });
  }

  for (const c of (contratos.data ?? []) as {
    id: string;
    numero: string | null;
    conta_id: string;
    carteira_id: string;
  }[]) {
    lista.push({
      valor: `contrato:${c.id}`,
      tipo: "contrato",
      id: c.id,
      nome: `${c.numero ?? "sem número"} · ${nomeConta.get(c.conta_id) ?? "conta"}`,
      carteiraId: c.carteira_id,
      rotuloTipo: "Contrato",
    });
  }

  for (const f of (frentes.data ?? []) as { id: string; titulo: string; carteira_id: string }[]) {
    lista.push({
      valor: `frente:${f.id}`,
      tipo: "frente",
      id: f.id,
      nome: f.titulo,
      carteiraId: f.carteira_id,
      rotuloTipo: "Frente",
    });
  }

  for (const o of (oportunidades.data ?? []) as { id: string; titulo: string; carteira_id: string }[]) {
    lista.push({
      valor: `oportunidade:${o.id}`,
      tipo: "oportunidade",
      id: o.id,
      nome: o.titulo,
      carteiraId: o.carteira_id,
      rotuloTipo: "Oportunidade",
    });
  }

  return lista;
}

/** Nome legível de cada entidade, para a linha do compromisso dizer a que se refere. */
export function mapaDeNomes(alvos: Alvo[]): Map<string, string> {
  return new Map(alvos.map((a) => [`${a.tipo}:${a.id}`, a.nome]));
}
