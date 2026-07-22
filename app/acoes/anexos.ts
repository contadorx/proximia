"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";
import { TAMANHO_MAXIMO, nomeSeguro } from "@/lib/anexos";
import { registrarAcesso } from "@/lib/auditoria";

function voltarCom(volta: string, chave: "erro" | "ok", mensagem: string): never {
  redirect(`${volta}?${chave}=${encodeURIComponent(mensagem)}`);
}

/**
 * Sobe o arquivo para o Storage e grava a ficha.
 *
 * A ordem importa: primeiro o arquivo, depois a linha. Se a linha falhar
 * depois do upload, o arquivo é apagado — o contrário deixaria ficha
 * apontando para o vazio, que é o pior dos dois estados.
 */
export async function anexarArquivo(formData: FormData) {
  const usuario = await exigirUsuario();
  const org = await exigirOrg();

  const volta = String(formData.get("volta") ?? "/painel");
  const carteiraId = String(formData.get("carteira_id") ?? "");
  const entidadeTipo = String(formData.get("entidade_tipo") ?? "");
  const entidadeId = String(formData.get("entidade_id") ?? "");
  const descricao = String(formData.get("descricao") ?? "").trim() || null;
  const arquivo = formData.get("arquivo");

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    voltarCom(volta, "erro", "Escolha um arquivo antes de anexar.");
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    voltarCom(
      volta,
      "erro",
      `O arquivo tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB e o limite é 25 MB. Para material maior, anexe o link do repositório.`,
    );
  }

  const supabase = criarClienteServidor();
  const caminho = `${org.orgId}/${entidadeTipo}/${entidadeId}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;

  const { error: erroUpload } = await supabase.storage.from("anexos").upload(caminho, arquivo, {
    contentType: arquivo.type || "application/octet-stream",
    upsert: false,
  });

  if (erroUpload) {
    voltarCom(
      volta,
      "erro",
      erroUpload.message.includes("Bucket not found")
        ? "O balde de arquivos ainda não existe. Aplique a migration 0015_anexos.sql no banco."
        : `Não foi possível enviar o arquivo: ${erroUpload.message}`,
    );
  }

  const { error } = await supabase.from("anexos").insert({
    org_id: org.orgId,
    carteira_id: carteiraId,
    entidade_tipo: entidadeTipo,
    entidade_id: entidadeId,
    nome: arquivo.name,
    descricao,
    caminho,
    tipo_mime: arquivo.type || null,
    tamanho_bytes: arquivo.size,
    criado_por: usuario.id,
  });

  if (error) {
    await supabase.storage.from("anexos").remove([caminho]);
    voltarCom(volta, "erro", error.message);
  }

  revalidatePath(volta);
  voltarCom(volta, "ok", `“${arquivo.name}” anexado.`);
}

/** Documento que vive fora: entra o endereço, não o arquivo. */
export async function anexarLink(formData: FormData) {
  const usuario = await exigirUsuario();
  const org = await exigirOrg();

  const volta = String(formData.get("volta") ?? "/painel");
  const nome = String(formData.get("nome") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim() || null;

  if (!nome) voltarCom(volta, "erro", "Dê um nome ao documento.");
  if (!/^https?:\/\/.+/i.test(url)) {
    voltarCom(volta, "erro", "O endereço precisa começar com http:// ou https://.");
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("anexos").insert({
    org_id: org.orgId,
    carteira_id: String(formData.get("carteira_id") ?? ""),
    entidade_tipo: String(formData.get("entidade_tipo") ?? ""),
    entidade_id: String(formData.get("entidade_id") ?? ""),
    nome,
    descricao,
    url,
    criado_por: usuario.id,
  });

  if (error) voltarCom(volta, "erro", error.message);

  revalidatePath(volta);
  voltarCom(volta, "ok", "Link anexado.");
}

/**
 * Download por endereço assinado, válido por um minuto.
 *
 * O balde é privado: não existe URL que funcione sem passar por aqui, e
 * passar por aqui significa a RLS ter dito que a pessoa alcança aquela
 * carteira. O acesso vai para a trilha antes do redirecionamento.
 */
export async function baixarAnexo(formData: FormData) {
  await exigirUsuario();
  const org = await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const volta = String(formData.get("volta") ?? "/painel");

  const supabase = criarClienteServidor();
  const { data: anexo } = await supabase
    .from("anexos")
    .select("id, nome, caminho, url, entidade_tipo, entidade_id")
    .eq("id", id)
    .maybeSingle();

  if (!anexo) voltarCom(volta, "erro", "Anexo não encontrado ou fora do seu alcance.");

  await registrarAcesso({
    orgId: org.orgId,
    acao: "baixou",
    entidadeTipo: "anexos",
    entidadeId: anexo.id as string,
    resumo: anexo.nome as string,
  });

  if (anexo.url) redirect(anexo.url as string);

  const { data, error } = await supabase.storage
    .from("anexos")
    .createSignedUrl(anexo.caminho as string, 60, { download: anexo.nome as string });

  if (error || !data?.signedUrl) {
    voltarCom(volta, "erro", error?.message ?? "Não foi possível abrir o arquivo.");
  }

  redirect(data.signedUrl);
}

export async function removerAnexo(formData: FormData) {
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const volta = String(formData.get("volta") ?? "/painel");

  const supabase = criarClienteServidor();
  const { data: anexo } = await supabase
    .from("anexos")
    .select("id, nome, caminho")
    .eq("id", id)
    .maybeSingle();

  if (!anexo) voltarCom(volta, "erro", "Anexo não encontrado.");

  const { error, count } = await supabase
    .from("anexos")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) voltarCom(volta, "erro", error.message);
  if (count === 0) voltarCom(volta, "erro", "Seu perfil não permite remover anexos desta carteira.");

  // O arquivo sai depois da ficha. Se a remoção do arquivo falhar, o que
  // sobra é um objeto órfão no balde — invisível e inofensivo. O inverso
  // deixaria a ficha apontando para o nada.
  if (anexo.caminho) {
    const { error: erroArquivo } = await supabase.storage
      .from("anexos")
      .remove([anexo.caminho as string]);
    if (erroArquivo) console.error("[anexos] ficha removida, arquivo permaneceu:", erroArquivo.message);
  }

  revalidatePath(volta);
  voltarCom(volta, "ok", `“${anexo.nome}” removido.`);
}
