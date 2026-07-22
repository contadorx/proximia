"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";

const ROTA = "/configuracoes/pipeline";

function comErro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

export async function criarReguaFases() {
  const org = await exigirOrg();

  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("garantir_fases", { p_org: org.orgId });
  if (error) comErro(error.message);

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?ok=${encodeURIComponent(
      Number(data ?? 0) > 0 ? "Régua de fases criada. Ajuste os nomes e os prazos." : "As fases já existiam.",
    )}`,
  );
}

export async function salvarFase(formData: FormData) {
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const prazo = String(formData.get("prazo_esperado_dias") ?? "").trim();

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("oportunidade_fases")
    .update({
      rotulo: String(formData.get("rotulo") ?? "").trim() || "Etapa",
      prazo_esperado_dias: prazo === "" ? null : Math.max(1, Number(prazo) || 1),
      ativa: formData.get("ativa") === "on",
    })
    .eq("id", id);

  if (error) comErro(error.message);

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Etapa atualizada.")}`);
}

export async function criarMotivo(formData: FormData) {
  const org = await exigirOrg();
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) comErro("Informe o motivo.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("motivos_descarte").insert({
    org_id: org.orgId,
    nome,
    descricao: String(formData.get("descricao") ?? "").trim() || null,
    ordem: Number(formData.get("ordem") ?? 0) || 0,
  });

  if (error) {
    comErro(
      error.code === "23505" ? "Já existe um motivo com esse nome." : error.message,
    );
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Motivo criado.")}`);
}

export async function excluirMotivo(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("motivos_descarte").delete().eq("id", id);
  if (error) comErro(error.message);

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Motivo excluído. As oportunidades ficam sem classificação.")}`);
}
