"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";

function comErro(mensagem: string): never {
  redirect(`/portais?erro=${encodeURIComponent(mensagem)}`);
}

function marcado(formData: FormData, nome: string): boolean {
  return formData.get(nome) === "on" || formData.get(nome) === "true";
}

export async function criarPortal(formData: FormData) {
  const usuario = await exigirUsuario();
  const org = await exigirOrg();

  const carteiraId = String(formData.get("carteira_id") ?? "");
  if (!carteiraId) comErro("Escolha a carteira que o link vai mostrar.");

  const dias = Number(formData.get("validade_dias") ?? 90);
  const periodo = Number(formData.get("dias_periodo") ?? 90);

  const expira = new Date(Date.now() + (Number.isFinite(dias) ? dias : 90) * 86400000);

  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("portais")
    .insert({
      org_id: org.orgId,
      carteira_id: carteiraId,
      titulo: String(formData.get("titulo") ?? "").trim() || null,
      destinatario: String(formData.get("destinatario") ?? "").trim() || null,
      expira_em: expira.toISOString(),
      dias_periodo: Number.isFinite(periodo) ? Math.min(Math.max(periodo, 7), 730) : 90,
      mostrar_valores: marcado(formData, "mostrar_valores"),
      mostrar_autores: marcado(formData, "mostrar_autores"),
      mostrar_contratos: marcado(formData, "mostrar_contratos"),
      mostrar_pendencias: marcado(formData, "mostrar_pendencias"),
      criado_por: usuario.id,
    })
    .select("id")
    .maybeSingle();

  if (error) comErro(error.message);
  if (!data) comErro("Seu perfil não permite criar link externo para esta carteira.");

  revalidatePath("/portais");
  redirect(
    `/portais?ok=${encodeURIComponent("Link criado. Copie o endereço e envie a quem vai acompanhar.")}&novo=${data.id}`,
  );
}

export async function ajustarPortal(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");

  const dias = Number(formData.get("validade_dias") ?? 0);

  const mudancas: Record<string, unknown> = {
    titulo: String(formData.get("titulo") ?? "").trim() || null,
    destinatario: String(formData.get("destinatario") ?? "").trim() || null,
    mostrar_valores: marcado(formData, "mostrar_valores"),
    mostrar_autores: marcado(formData, "mostrar_autores"),
    mostrar_contratos: marcado(formData, "mostrar_contratos"),
    mostrar_pendencias: marcado(formData, "mostrar_pendencias"),
  };

  // Zero significa "não mexer no prazo". Renovar é decisão explícita: sem
  // isso, toda edição de rótulo empurraria a validade para a frente.
  if (Number.isFinite(dias) && dias > 0) {
    mudancas.expira_em = new Date(Date.now() + dias * 86400000).toISOString();
  }

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("portais")
    .update(mudancas, { count: "exact" })
    .eq("id", id);

  if (error) comErro(error.message);
  if (count === 0) comErro("Seu perfil não permite ajustar este link.");

  revalidatePath("/portais");
  redirect(`/portais?ok=${encodeURIComponent("Link atualizado.")}`);
}

/**
 * Encerrar não apaga: o link vira "revogado" e para de abrir na hora.
 * Apagar levaria junto o registro de quem já tinha aberto — e é
 * exatamente isso que alguém pode precisar consultar depois.
 */
export async function encerrarPortal(formData: FormData) {
  const usuario = await exigirUsuario();
  await exigirOrg();

  const id = String(formData.get("id") ?? "");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("portais")
    .update(
      { status: "revogado", revogado_em: new Date().toISOString(), revogado_por: usuario.id },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) comErro(error.message);
  if (count === 0) comErro("Seu perfil não permite encerrar este link.");

  revalidatePath("/portais");
  redirect(
    `/portais?ok=${encodeURIComponent("Link encerrado. Quem tiver o endereço não abre mais.")}`,
  );
}
