"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirUsuario } from "@/lib/auth";

function enderecoBase(): string {
  const cabecalhos = headers();
  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host") ?? "localhost:3000";
  const protocolo = host.startsWith("localhost") ? "http" : "https";
  return `${protocolo}://${host}`;
}

/**
 * Pedido de redefinição. A resposta é sempre a mesma, exista ou não a
 * conta: dizer "esse e-mail não está cadastrado" entrega a terceiros quem
 * usa o sistema.
 */
export async function pedirRedefinicao(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email.includes("@")) {
    redirect(`/esqueci?erro=${encodeURIComponent("Informe um e-mail válido.")}`);
  }

  try {
    const supabase = criarClienteServidor();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${enderecoBase()}/auth/callback?proximo=/redefinir`,
    });
  } catch (e) {
    console.error("[senha] falha ao pedir redefinição:", e);
  }

  redirect("/esqueci?enviado=1");
}

export async function definirSenha(formData: FormData) {
  await exigirUsuario();

  const senha = String(formData.get("senha") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (senha.length < 8) {
    redirect(`/redefinir?erro=${encodeURIComponent("A senha precisa ter ao menos 8 caracteres.")}`);
  }
  if (senha !== confirmacao) {
    redirect(`/redefinir?erro=${encodeURIComponent("As duas senhas não são iguais.")}`);
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: senha });

  if (error) {
    redirect(`/redefinir?erro=${encodeURIComponent(error.message)}`);
  }

  redirect(`/?ok=${encodeURIComponent("Senha alterada.")}`);
}

/** Troca de senha por quem já está dentro, em Configurações. */
export async function trocarSenha(formData: FormData) {
  await exigirUsuario();

  const senha = String(formData.get("senha") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (senha.length < 8) {
    redirect(`/configuracoes?erro=${encodeURIComponent("A senha precisa ter ao menos 8 caracteres.")}`);
  }
  if (senha !== confirmacao) {
    redirect(`/configuracoes?erro=${encodeURIComponent("As duas senhas não são iguais.")}`);
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: senha });

  if (error) {
    redirect(`/configuracoes?erro=${encodeURIComponent(error.message)}`);
  }

  redirect(`/configuracoes?ok=${encodeURIComponent("Senha alterada.")}`);
}
