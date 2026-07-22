"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";
import type { Papel } from "@/lib/tipos";

const ROTA = "/configuracoes/acesso";

function comErro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

function traduzir(mensagem: string, codigo?: string): string {
  // As travas do banco já explicam o motivo em português: repassamos.
  if (/sem dono|próprio|Só quem é dono/i.test(mensagem)) return mensagem;
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite gerenciar acessos.";
  }
  return mensagem;
}

export async function alterarPapel(formData: FormData) {
  const org = await exigirOrg();
  const userId = String(formData.get("user_id") ?? "");
  const papel = String(formData.get("papel") ?? "") as Papel;

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("memberships")
    .update({ papel }, { count: "exact" })
    .eq("org_id", org.orgId)
    .eq("user_id", userId);

  if (error) comErro(traduzir(error.message, error.code));
  if (count === 0) comErro("Nada mudou: seu perfil não permite alterar este acesso.");

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Papel alterado.")}`);
}

export async function alternarAtivo(formData: FormData) {
  const org = await exigirOrg();
  const userId = String(formData.get("user_id") ?? "");
  const ativar = formData.get("ativar") === "1";

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("memberships")
    .update({ ativo: ativar }, { count: "exact" })
    .eq("org_id", org.orgId)
    .eq("user_id", userId);

  if (error) comErro(traduzir(error.message, error.code));
  if (count === 0) comErro("Nada mudou: seu perfil não permite alterar este acesso.");

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?ok=${encodeURIComponent(
      ativar
        ? "Acesso reativado."
        : "Acesso suspenso. O histórico da pessoa continua onde está.",
    )}`,
  );
}

export async function removerAcesso(formData: FormData) {
  const org = await exigirOrg();
  const userId = String(formData.get("user_id") ?? "");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("memberships")
    .delete({ count: "exact" })
    .eq("org_id", org.orgId)
    .eq("user_id", userId);

  if (error) comErro(traduzir(error.message, error.code));
  if (count === 0) comErro("Nada foi removido: seu perfil não permite.");

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Acesso removido.")}`);
}

/** Vincula ou desvincula carteiras de um ponto focal, tudo de uma vez. */
export async function salvarCarteirasDaPessoa(formData: FormData) {
  const org = await exigirOrg();
  const userId = String(formData.get("user_id") ?? "");
  const escolhidas = formData.getAll("carteira").map(String).filter(Boolean);

  const supabase = criarClienteServidor();

  const { data: atuais } = await supabase
    .from("carteira_membros")
    .select("carteira_id")
    .eq("org_id", org.orgId)
    .eq("user_id", userId);

  const tinha = new Set(((atuais ?? []) as { carteira_id: string }[]).map((c) => c.carteira_id));
  const quer = new Set(escolhidas);

  const incluir = escolhidas.filter((c) => !tinha.has(c));
  const remover = [...tinha].filter((c) => !quer.has(c));

  if (incluir.length > 0) {
    const { error } = await supabase.from("carteira_membros").insert(
      incluir.map((carteira_id) => ({ org_id: org.orgId, carteira_id, user_id: userId })),
    );
    if (error) comErro(traduzir(error.message, error.code));
  }

  if (remover.length > 0) {
    const { error } = await supabase
      .from("carteira_membros")
      .delete()
      .eq("org_id", org.orgId)
      .eq("user_id", userId)
      .in("carteira_id", remover);
    if (error) comErro(traduzir(error.message, error.code));
  }

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?ok=${encodeURIComponent(
      `Alcance atualizado: ${escolhidas.length} carteira(s).`,
    )}`,
  );
}
