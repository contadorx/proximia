import { criarClienteServidor } from "./supabase/server";
import type { EntidadeTipo } from "./registros";

export type Anexo = {
  id: string;
  org_id: string;
  carteira_id: string;
  entidade_tipo: EntidadeTipo;
  entidade_id: string;
  nome: string;
  descricao: string | null;
  caminho: string | null;
  tipo_mime: string | null;
  tamanho_bytes: number | null;
  url: string | null;
  criado_em: string;
  criado_por: string;
};

const CAMPOS =
  "id, org_id, carteira_id, entidade_tipo, entidade_id, nome, descricao, caminho, tipo_mime, tamanho_bytes, url, criado_em, criado_por";

/** Teto de tamanho por arquivo. O balde tem o mesmo limite; aqui existe para a recusa acontecer antes do upload. */
export const TAMANHO_MAXIMO = 25 * 1024 * 1024;

export async function anexosDaEntidade(
  tipo: EntidadeTipo,
  entidadeId: string,
): Promise<Anexo[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("anexos")
    .select(CAMPOS)
    .eq("entidade_tipo", tipo)
    .eq("entidade_id", entidadeId)
    .order("criado_em", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[anexos] falha ao listar:", error.message);
    return [];
  }
  return (data ?? []) as Anexo[];
}

export async function anexosDaCarteira(carteiraId: string): Promise<Anexo[]> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("anexos")
    .select(CAMPOS)
    .eq("carteira_id", carteiraId)
    .order("criado_em", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[anexos] falha ao listar por carteira:", error.message);
    return [];
  }
  return (data ?? []) as Anexo[];
}

export function formatarTamanho(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Extensão a partir do nome ou do tipo. Serve só para a etiqueta na
 * lista — o que vale para abrir é o tipo declarado no upload.
 */
export function extensao(anexo: Anexo): string {
  if (anexo.url) return "link";
  const ponto = anexo.nome.lastIndexOf(".");
  if (ponto > 0 && ponto < anexo.nome.length - 1) {
    return anexo.nome.slice(ponto + 1).toLowerCase().slice(0, 5);
  }
  return anexo.tipo_mime?.split("/")[1]?.slice(0, 5) ?? "arquivo";
}

/**
 * Nome de arquivo seguro para caminho de Storage: sem acento, sem
 * espaço e sem nada que precise de escape. O nome original continua
 * inteiro na coluna `nome` — é ele que a pessoa vê e baixa.
 */
export function nomeSeguro(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(-80) || "arquivo"
  );
}
