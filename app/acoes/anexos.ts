"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";
import { caminhoEntidade, type EntidadeTipo } from "@/lib/registros";

const LIMITE = 20 * 1024 * 1024;

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

/** Nome de arquivo previsível: sem acento, sem espaço, sem surpresa no caminho. */
function limparNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-80);
}

export async function enviarAnexo(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const entidadeTipo = String(formData.get("entidade_tipo") ?? "") as EntidadeTipo;
  const entidadeId = String(formData.get("entidade_id") ?? "");
  const carteiraId = String(formData.get("carteira_id") ?? "");
  const rota = caminhoEntidade(entidadeTipo, entidadeId);

  const arquivo = formData.get("arquivo") as File | null;
  if (!arquivo || arquivo.size === 0) comErro(rota, "Escolha um arquivo.");
  if (arquivo.size > LIMITE) comErro(rota, "Arquivo acima de 20 MB.");

  const supabase = criarClienteServidor();
  const caminho = `${org.orgId}/${entidadeTipo}/${crypto.randomUUID()}-${limparNome(arquivo.name)}`;

  const { error: erroUpload } = await supabase.storage
    .from("anexos")
    .upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false });

  if (erroUpload) {
    comErro(
      rota,
      /mime|not allowed/i.test(erroUpload.message)
        ? "Tipo de arquivo não aceito. Use PDF, imagem, planilha, documento ou texto."
        : `Falha ao enviar: ${erroUpload.message}`,
    );
  }

  const { error } = await supabase.from("anexos").insert({
    org_id: org.orgId,
    carteira_id: carteiraId,
    entidade_tipo: entidadeTipo,
    entidade_id: entidadeId,
    nome: arquivo.name,
    caminho,
    tipo_mime: arquivo.type || null,
    tamanho: arquivo.size,
    descricao: String(formData.get("descricao") ?? "").trim() || null,
    criado_por: usuario.id,
  });

  if (error) {
    // Sem a linha, o objeto vira lixo invisível: desfaz o envio.
    await supabase.storage.from("anexos").remove([caminho]);
    comErro(rota, error.message);
  }

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Anexo enviado.")}`);
}

export async function excluirAnexo(formData: FormData) {
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const entidadeTipo = String(formData.get("entidade_tipo") ?? "") as EntidadeTipo;
  const entidadeId = String(formData.get("entidade_id") ?? "");
  const rota = caminhoEntidade(entidadeTipo, entidadeId);

  const supabase = criarClienteServidor();
  const { data } = await supabase.from("anexos").select("caminho").eq("id", id).maybeSingle();

  const { error, count } = await supabase.from("anexos").delete({ count: "exact" }).eq("id", id);
  if (error) comErro(rota, error.message);
  if (count === 0) comErro(rota, "Seu perfil não permite excluir este anexo.");

  if (data) await supabase.storage.from("anexos").remove([(data as { caminho: string }).caminho]);

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Anexo removido.")}`);
}

/** Link temporário de download. Vale 60 segundos e não é reaproveitável. */
export async function baixarAnexo(formData: FormData) {
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const entidadeTipo = String(formData.get("entidade_tipo") ?? "") as EntidadeTipo;
  const entidadeId = String(formData.get("entidade_id") ?? "");
  const rota = caminhoEntidade(entidadeTipo, entidadeId);

  const supabase = criarClienteServidor();
  const { data: anexo } = await supabase.from("anexos").select("caminho, nome").eq("id", id).maybeSingle();
  if (!anexo) comErro(rota, "Anexo não encontrado.");

  const { data, error } = await supabase.storage
    .from("anexos")
    .createSignedUrl((anexo as { caminho: string }).caminho, 60, {
      download: (anexo as { nome: string }).nome,
    });

  if (error || !data) comErro(rota, "Não foi possível gerar o link de download.");

  redirect(data.signedUrl);
}
