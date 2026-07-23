"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";
import type { EstadoAcao } from "@/lib/formulario";

const ROTA = "/configuracoes/api";

function traduzir(mensagem: string, codigo?: string): string {
  if (codigo === "42501") return "Somente administradores gerenciam chaves de API.";
  return mensagem;
}

/**
 * Cria a chave e devolve o segredo UMA vez, pela própria URL de retorno.
 *
 * Passar o segredo por parâmetro de endereço é uma decisão consciente e
 * tem custo: ele fica no histórico do navegador. A alternativa seria
 * guardá-lo em sessão para mostrar na volta — o que significa gravar em
 * algum lugar o que prometemos não guardar. Entre os dois, escolhemos o
 * que não cria cópia no servidor, e a tela avisa para copiar e recarregar.
 */
export async function criarChaveApi(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const org = await exigirOrg();

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { erro: "Dê um nome à chave — é como você vai reconhecê-la depois." };

  const limite = Number(formData.get("limite") ?? 60) || 60;

  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("criar_chave_api", {
    p_org: org.orgId,
    p_nome: nome,
    p_limite: Math.min(Math.max(limite, 1), 6000),
  });

  if (error) return { erro: traduzir(error.message, error.code) };

  const criada = (Array.isArray(data) ? data[0] : data) as { chave: string } | undefined;
  if (!criada?.chave) return { erro: "A chave não foi criada." };

  revalidatePath(ROTA);
  redirect(`${ROTA}?nova=${encodeURIComponent(criada.chave)}`);
}

export async function revogarChaveApi(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");

  const supabase = criarClienteServidor();
  const { error } = await supabase.rpc("revogar_chave_api", { p_chave_id: id });

  if (error) redirect(`${ROTA}?erro=${encodeURIComponent(traduzir(error.message, error.code))}`);

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?ok=${encodeURIComponent(
      "Chave revogada. Quem estiver usando recebe recusa na próxima chamada.",
    )}`,
  );
}
