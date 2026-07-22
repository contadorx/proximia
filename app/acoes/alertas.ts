"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";

function comErro(mensagem: string): never {
  redirect(`/alertas?erro=${encodeURIComponent(mensagem)}`);
}

export async function silenciarAlerta(formData: FormData) {
  const usuario = await exigirUsuario();
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const volta = String(formData.get("volta") ?? "/alertas");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("alertas")
    .update({ status: "silenciado", silenciado_por: usuario.id }, { count: "exact" })
    .eq("id", id);

  if (error) comErro(error.message);
  if (count === 0) comErro("Seu perfil não permite silenciar alertas desta carteira.");

  revalidatePath(volta);
  redirect(`${volta}?ok=${encodeURIComponent("Alerta silenciado. Ele não volta enquanto a situação for a mesma.")}`);
}

export async function reabrirAlerta(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const volta = String(formData.get("volta") ?? "/alertas");

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("alertas")
    .update({ status: "aberto", silenciado_por: null })
    .eq("id", id);

  if (error) comErro(error.message);

  revalidatePath(volta);
  redirect(`${volta}?ok=${encodeURIComponent("Alerta reaberto.")}`);
}

/** Varredura sob demanda. A automática roda uma vez por dia. */
export async function varrerAgora() {
  const org = await exigirOrg();

  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("gerar_alertas", { p_org: org.orgId });

  if (error) comErro(error.message);

  // Alerta sem dono é alerta de ninguém: a atribuição vem logo atrás da
  // varredura, usando a cadeia de responsabilidade da carteira.
  await supabase.rpc("atribuir_alertas", { p_org: org.orgId });

  const diferenca = Number(data ?? 0);
  revalidatePath("/alertas");
  redirect(
    `/alertas?ok=${encodeURIComponent(
      diferenca > 0
        ? `${diferenca} alerta(s) novo(s).`
        : diferenca < 0
          ? `${Math.abs(diferenca)} alerta(s) deixaram de valer e foram fechados.`
          : "Nada mudou desde a última varredura.",
    )}`,
  );
}
