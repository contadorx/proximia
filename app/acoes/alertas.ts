"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";

function comErro(mensagem: string): never {
  redirect(`/pendencias?erro=${encodeURIComponent(mensagem)}`);
}

export async function silenciarAlerta(formData: FormData) {
  const usuario = await exigirUsuario();
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const volta = String(formData.get("volta") ?? "/pendencias");

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
  const volta = String(formData.get("volta") ?? "/pendencias");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("alertas")
    .update({ status: "aberto", silenciado_por: null }, { count: "exact" })
    .eq("id", id);

  if (error) comErro(error.message);
  if (count === 0) comErro("Nada mudou: seu perfil não permite reabrir este alerta.");

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
  // Marcos de renovação: 180, 90 e 60 dias antes do fim, cada um uma vez.
  const { error: erroMarcos } = await supabase.rpc("gerar_alertas_marcos", { p_org: org.orgId });
  if (erroMarcos) comErro(`A varredura parou nos marcos de renovação: ${erroMarcos.message}`);

  const { error: erroAtribuir } = await supabase.rpc("atribuir_alertas", { p_org: org.orgId });
  if (erroAtribuir) comErro(`Alertas gerados, mas a atribuição falhou: ${erroAtribuir.message}`);

  const diferenca = Number(data ?? 0);
  revalidatePath("/pendencias");
  redirect(
    `/pendencias?ok=${encodeURIComponent(
      diferenca > 0
        ? `${diferenca} alerta(s) novo(s).`
        : diferenca < 0
          ? `${Math.abs(diferenca)} alerta(s) deixaram de valer e foram fechados.`
          : "Nada mudou desde a última varredura.",
    )}`,
  );
}
