"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

export async function salvarPortal(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const carteiraId = String(formData.get("carteira_id") ?? "");
  const rota = `/carteiras/${carteiraId}`;

  const dados = {
    ativo: formData.get("ativo") === "on",
    mostrar_valores: formData.get("mostrar_valores") === "on",
    titulo: String(formData.get("titulo") ?? "").trim() || null,
    mensagem: String(formData.get("mensagem") ?? "").trim() || null,
    expira_em: String(formData.get("expira_em") ?? "").trim() || null,
  };

  const supabase = criarClienteServidor();
  const { data: existente } = await supabase
    .from("portais")
    .select("id")
    .eq("carteira_id", carteiraId)
    .maybeSingle();

  const { error } = existente
    ? await supabase.from("portais").update(dados).eq("id", (existente as { id: string }).id)
    : await supabase
        .from("portais")
        .insert({ org_id: org.orgId, carteira_id: carteiraId, criado_por: usuario.id, ...dados });

  if (error) comErro(rota, error.message);

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Portal da unidade atualizado.")}`);
}

/** Troca o segredo do endereço. O link anterior deixa de abrir na hora. */
export async function trocarEndereco(formData: FormData) {
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const carteiraId = String(formData.get("carteira_id") ?? "");
  const rota = `/carteiras/${carteiraId}`;

  const supabase = criarClienteServidor();
  const { error } = await supabase.rpc("trocar_token_portal", { p_portal: id });

  if (error) comErro(rota, error.message);

  revalidatePath(rota);
  redirect(
    `${rota}?ok=${encodeURIComponent("Endereço trocado. O link anterior parou de funcionar.")}`,
  );
}
