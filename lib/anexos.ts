import { criarClienteServidor } from "./supabase/server";
import type { EntidadeTipo } from "./registros";

export type Anexo = {
  id: string;
  entidade_tipo: EntidadeTipo;
  entidade_id: string;
  nome: string;
  caminho: string;
  tipo_mime: string | null;
  tamanho: number | null;
  descricao: string | null;
  criado_em: string;
  criado_por: string | null;
};

export async function anexosDa(tipo: EntidadeTipo, entidadeId: string): Promise<Anexo[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("anexos")
    .select("id, entidade_tipo, entidade_id, nome, caminho, tipo_mime, tamanho, descricao, criado_em, criado_por")
    .eq("entidade_tipo", tipo)
    .eq("entidade_id", entidadeId)
    .order("criado_em", { ascending: false });

  if (error) {
    console.error("[anexos] falha ao listar:", error.message);
    return [];
  }
  return (data ?? []) as Anexo[];
}

export function formatarTamanho(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
