"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

function traduzir(mensagem: string, codigo?: string): string {
  if (/idx_papel_primario/.test(mensagem)) {
    return "Já existe um papel primário. Desmarque o atual antes de definir outro.";
  }
  if (codigo === "23505" && /idx_papel_nome/.test(mensagem)) {
    return "Já existe um papel com esse nome.";
  }
  if (codigo === "23505") return "Essa pessoa já tem esse papel nesta carteira.";
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite essa alteração.";
  }
  return mensagem;
}

export async function criarPapel(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) comErro("/configuracoes", "Informe o nome do papel.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("papeis_operacionais").insert({
    org_id: org.orgId,
    nome,
    descricao: String(formData.get("descricao") ?? "").trim() || null,
    primario: formData.get("primario") === "on",
    ordem: Number(formData.get("ordem") ?? 0) || 0,
    criado_por: usuario.id,
  });

  if (error) comErro("/configuracoes", traduzir(error.message, error.code));

  revalidatePath("/configuracoes");
  redirect(`/configuracoes?ok=${encodeURIComponent("Papel criado.")}`);
}

export async function excluirPapel(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("papeis_operacionais")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) comErro("/configuracoes", traduzir(error.message, error.code));
  if (count === 0) comErro("/configuracoes", "Nada foi excluído: seu perfil não permite alterar papéis.");

  revalidatePath("/configuracoes");
  redirect(`/configuracoes?ok=${encodeURIComponent("Papel excluído.")}`);
}

export async function atribuirResponsavel(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const carteiraId = String(formData.get("carteira_id") ?? "");
  const rota = `/carteiras/${carteiraId}`;

  const userId = String(formData.get("user_id") ?? "");
  const papelId = String(formData.get("papel_id") ?? "");
  if (!userId) comErro(rota, "Escolha a pessoa.");
  if (!papelId) comErro(rota, "Escolha o papel. Se ainda não há nenhum, cadastre em Configurações.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("responsabilidades").insert({
    org_id: org.orgId,
    carteira_id: carteiraId,
    user_id: userId,
    papel_id: papelId,
    observacao: String(formData.get("observacao") ?? "").trim() || null,
    criado_por: usuario.id,
  });

  if (error) comErro(rota, traduzir(error.message, error.code));

  // Quem responde mudou: os alertas em aberto acompanham.
  await supabase.rpc("atribuir_alertas", { p_org: org.orgId });

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Responsável definido.")}`);
}

export async function removerResponsavel(formData: FormData) {
  const org = await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const carteiraId = String(formData.get("carteira_id") ?? "");
  const rota = `/carteiras/${carteiraId}`;

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("responsabilidades")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada foi removido: seu perfil não permite alterar responsabilidades.");

  await supabase.rpc("atribuir_alertas", { p_org: org.orgId });

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Responsabilidade removida.")}`);
}

export async function reatribuirAlerta(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const dono = String(formData.get("dono_id") ?? "");
  const volta = String(formData.get("volta") ?? "/alertas");

  const supabase = criarClienteServidor();
  const { error } = await supabase.rpc("reatribuir_alerta", {
    p_alerta: id,
    p_dono: dono || null,
  });

  if (error) comErro(volta, traduzir(error.message, error.code));

  revalidatePath(volta);
  redirect(`${volta}?ok=${encodeURIComponent("Alerta reatribuído.")}`);
}
