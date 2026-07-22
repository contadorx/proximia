"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";
import { caminhoEntidade, type EntidadeTipo } from "@/lib/registros";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

function texto(formData: FormData, campo: string): string | null {
  const valor = String(formData.get(campo) ?? "").trim();
  return valor === "" ? null : valor;
}

function traduzir(mensagem: string, codigo?: string): string {
  if (/nova versão/i.test(mensagem)) return mensagem;
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite registrar nesta carteira.";
  }
  if (/length\(btrim\(corpo\)\)/i.test(mensagem)) return "Escreva o conteúdo do registro.";
  return mensagem;
}

export async function criarRegistro(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const entidadeTipo = String(formData.get("entidade_tipo") ?? "") as EntidadeTipo;
  const entidadeId = String(formData.get("entidade_id") ?? "");
  const carteiraId = String(formData.get("carteira_id") ?? "");
  const rota = caminhoEntidade(entidadeTipo, entidadeId);

  const corpo = texto(formData, "corpo");
  if (!corpo) comErro(rota, "Escreva o que aconteceu — é isso que fica de memória.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("registros").insert({
    org_id: org.orgId,
    carteira_id: carteiraId,
    entidade_tipo: entidadeTipo,
    entidade_id: entidadeId,
    tipo: String(formData.get("tipo") ?? "nota"),
    titulo: texto(formData, "titulo"),
    corpo,
    ocorrido_em: texto(formData, "ocorrido_em") ?? new Date().toISOString().slice(0, 10),
    autor_id: usuario.id,
  });

  if (error) comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  revalidatePath("/historico");
  redirect(rota);
}

export async function editarRegistro(formData: FormData) {
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const entidadeTipo = String(formData.get("entidade_tipo") ?? "") as EntidadeTipo;
  const entidadeId = String(formData.get("entidade_id") ?? "");
  const rota = caminhoEntidade(entidadeTipo, entidadeId);

  const corpo = texto(formData, "corpo");
  if (!corpo) comErro(rota, "Escreva o conteúdo do registro.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.rpc("editar_registro", {
    p_id: id,
    p_titulo: texto(formData, "titulo"),
    p_corpo: corpo,
    p_tipo: String(formData.get("tipo") ?? "nota"),
    p_ocorrido_em: texto(formData, "ocorrido_em"),
  });

  if (error) comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  revalidatePath("/historico");
  redirect(`${rota}?ok=${encodeURIComponent("Nova versão registrada. A anterior continua no histórico.")}`);
}
