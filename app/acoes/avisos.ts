"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";

export async function salvarPreferenciaAviso(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("preferencias_aviso").upsert(
    {
      org_id: org.orgId,
      user_id: usuario.id,
      resumo_diario: formData.get("resumo_diario") === "on",
      apenas_alta: formData.get("apenas_alta") === "on",
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "org_id,user_id" },
  );

  if (error) {
    redirect(`/configuracoes?erro=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/configuracoes");
  redirect(`/configuracoes?ok=${encodeURIComponent("Preferência de aviso salva.")}`);
}
