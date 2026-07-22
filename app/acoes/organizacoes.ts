"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { COOKIE_ORG, exigirUsuario, vinculosDoUsuario } from "@/lib/auth";

const UM_ANO = 60 * 60 * 24 * 365;

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

export async function selecionarOrganizacao(formData: FormData) {
  await exigirUsuario();

  const orgId = String(formData.get("org_id") ?? "");
  const vinculos = await vinculosDoUsuario();

  if (!vinculos.some((v) => v.orgId === orgId)) {
    comErro("/organizacoes", "Você não tem acesso a essa organização.");
  }

  cookies().set({
    name: COOKIE_ORG,
    value: orgId,
    path: "/",
    maxAge: UM_ANO,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  redirect("/painel");
}

export async function trocarOrganizacao() {
  cookies().delete(COOKIE_ORG);
  redirect("/organizacoes");
}

export async function criarOrganizacao(formData: FormData) {
  await exigirUsuario();

  const nome = String(formData.get("nome") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();

  if (!nome) comErro("/organizacoes", "Informe o nome da organização.");
  if (!slug) comErro("/organizacoes", "Informe o identificador da organização.");

  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .rpc("criar_organizacao", { p_nome: nome, p_slug: slug })
    .single();

  if (error) comErro("/organizacoes", error.message);

  const criada = data as { id: string } | null;
  if (!criada?.id) comErro("/organizacoes", "Não foi possível criar a organização. Tente de novo.");

  cookies().set({
    name: COOKIE_ORG,
    value: criada.id,
    path: "/",
    maxAge: UM_ANO,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  redirect("/painel");
}

export async function vincularMembro(formData: FormData) {
  await exigirUsuario();

  const orgId = String(formData.get("org_id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const papel = String(formData.get("papel") ?? "analista");

  if (!email) comErro("/painel", "Informe o e-mail da pessoa.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.rpc("vincular_membro", {
    p_org: orgId,
    p_email: email,
    p_papel: papel,
  });

  if (error) comErro("/painel", error.message);

  revalidatePath("/painel");
  redirect("/painel?ok=" + encodeURIComponent(`${email} agora tem acesso.`));
}

export async function sair() {
  const supabase = criarClienteServidor();
  await supabase.auth.signOut();
  cookies().delete(COOKIE_ORG);
  redirect("/entrar");
}
