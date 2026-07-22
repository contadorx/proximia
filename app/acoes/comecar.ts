"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { COOKIE_ORG, exigirUsuario } from "@/lib/auth";

function comErro(passo: string, mensagem: string): never {
  redirect(`/comecar?passo=${passo}&erro=${encodeURIComponent(mensagem)}`);
}

function paraSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function salvarNome(formData: FormData) {
  const usuario = await exigirUsuario();
  const nome = String(formData.get("nome") ?? "").trim();

  if (nome.length < 2) comErro("nome", "Informe seu nome.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("perfis").update({ nome }).eq("id", usuario.id);
  if (error) comErro("nome", error.message);

  revalidatePath("/comecar");
  redirect("/comecar?passo=organizacao");
}

export async function criarPrimeiraOrganizacao(formData: FormData) {
  await exigirUsuario();

  const nome = String(formData.get("nome") ?? "").trim();
  if (nome.length < 2) comErro("organizacao", "Informe o nome da organização.");

  const slugInformado = String(formData.get("slug") ?? "").trim();
  const slug = paraSlug(slugInformado || nome) || `org-${Date.now().toString(36)}`;

  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .rpc("criar_organizacao", { p_nome: nome, p_slug: slug })
    .single();

  if (error) {
    comErro(
      "organizacao",
      error.code === "23505" || /duplicate|unique/i.test(error.message)
        ? "Já existe uma organização com esse identificador. Escolha outro."
        : error.message,
    );
  }

  // Deixa a organização recém-criada como a corrente e segue para o
  // último passo, sem obrigar a pessoa a escolher numa lista de uma.
  cookies().set({
    name: COOKIE_ORG,
    value: (data as { id: string }).id,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/comecar");
  redirect("/comecar?passo=carteira");
}

export async function criarPrimeiraCarteira(formData: FormData) {
  const usuario = await exigirUsuario();

  const orgId = String(formData.get("org_id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const codigo = String(formData.get("codigo") ?? "").trim() || null;

  if (!nome) comErro("carteira", "Informe o nome da primeira carteira.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("carteiras").insert({
    org_id: orgId,
    nome,
    codigo,
    responsavel_id: usuario.id,
    criado_por: usuario.id,
  });

  if (error) comErro("carteira", error.message);

  revalidatePath("/painel");
  redirect(`/painel?ok=${encodeURIComponent("Tudo pronto. A primeira carteira já está no ar.")}`);
}
