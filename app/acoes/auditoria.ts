"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, podeAdministrar } from "@/lib/auth";

function comErro(mensagem: string): never {
  redirect(`/auditoria?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Descarte do que passou do prazo de guarda.
 *
 * É a única operação capaz de tirar linha da trilha, e ela própria vira
 * linha na trilha — o banco grava o descarte antes de devolver. Não
 * existe apagar linha específica: seria a mesma coisa que não ter trilha.
 */
export async function limparTrilha(formData: FormData) {
  const org = await exigirOrg();
  if (!podeAdministrar(org.papel)) comErro("Apenas a administração pode limpar a trilha.");

  const dias = Number(formData.get("dias") ?? 365);
  if (!Number.isFinite(dias) || dias < 30) {
    comErro("O prazo mínimo de guarda é de 30 dias.");
  }

  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("limpar_auditoria", {
    p_org: org.orgId,
    p_dias: Math.round(dias),
  });

  if (error) comErro(error.message);

  const removidas = Number(data ?? 0);
  revalidatePath("/auditoria");
  redirect(
    `/auditoria?ok=${encodeURIComponent(
      removidas > 0
        ? `${removidas} linha(s) além de ${Math.round(dias)} dias foram descartadas.`
        : `Nada além de ${Math.round(dias)} dias para descartar.`,
    )}`,
  );
}
