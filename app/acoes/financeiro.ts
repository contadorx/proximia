"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";

export async function salvarTaxaDesconto(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const bruto = String(formData.get("taxa") ?? "").replace(",", ".");
  const percentual = Number(bruto);

  if (Number.isNaN(percentual) || percentual < 0 || percentual >= 300) {
    redirect(
      `/configuracoes/pipeline?erro=${encodeURIComponent("Informe a taxa em porcentagem ao ano, entre 0 e 300.")}`,
    );
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("parametros_financeiros").upsert(
    {
      org_id: org.orgId,
      taxa_desconto_anual: percentual / 100,
      observacao: String(formData.get("observacao") ?? "").trim() || null,
      atualizado_em: new Date().toISOString(),
      atualizado_por: usuario.id,
    },
    { onConflict: "org_id" },
  );

  if (error) {
    redirect(`/configuracoes/pipeline?erro=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/configuracoes/pipeline");
  revalidatePath("/oportunidades");
  redirect(
    `/configuracoes/pipeline?ok=${encodeURIComponent(
      "Taxa atualizada. Todas as análises foram recalculadas.",
    )}`,
  );
}
