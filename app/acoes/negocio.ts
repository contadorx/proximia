"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirUsuario } from "@/lib/auth";

const ROTA = "/negocio";

function comErro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

function identificador(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function assumirOperacao(formData: FormData) {
  await exigirUsuario();
  const email = String(formData.get("email") ?? "").trim();

  const supabase = criarClienteServidor();
  const { error } = await supabase.rpc("promover_admin_plataforma", { p_email: email });

  if (error) comErro(error.message);

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Acesso de operador concedido.")}`);
}

export async function criarAssinante(formData: FormData) {
  await exigirUsuario();

  const nome = String(formData.get("nome") ?? "").trim();
  const email = String(formData.get("email_dono") ?? "").trim();
  const slugInformado = String(formData.get("slug") ?? "").trim();

  if (nome.length < 2) comErro("Informe o nome da organização.");
  if (!email.includes("@")) comErro("Informe o e-mail de quem vai administrá-la.");

  const supabase = criarClienteServidor();
  const base = identificador(slugInformado || nome) || "organizacao";

  // Identificador colidindo não é erro do operador: o sistema desempata.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const slug = tentativa === 0 ? base : `${base}-${Math.floor(Math.random() * 900 + 100)}`;

    const { data, error } = await supabase.rpc("criar_assinante", {
      p_nome: nome,
      p_slug: slug,
      p_email_dono: email,
      p_plano: String(formData.get("plano_id") ?? "") || null,
      p_teste: formData.get("conta_teste") === "on",
      p_dias_avaliacao: Number(formData.get("dias_avaliacao") ?? 30) || 30,
    });

    if (!error) {
      const linha = (Array.isArray(data) ? data[0] : data) as
        | { org_id: string; token_convite: string }
        | undefined;

      const cabecalhos = headers();
      const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host") ?? "localhost:3000";
      const protocolo = host.startsWith("localhost") ? "http" : "https";
      const link = `${protocolo}://${host}/convite/${linha?.token_convite ?? ""}`;

      revalidatePath(ROTA);
      redirect(
        `${ROTA}?ok=${encodeURIComponent(
          `${nome} criada. Envie este link para quem vai administrar: ${link}`,
        )}`,
      );
    }

    if (error.code !== "23505" && !/duplicate|unique/i.test(error.message)) {
      comErro(error.message);
    }
  }

  comErro("Não foi possível criar. Tente outro nome.");
}

export async function atualizarAssinatura(formData: FormData) {
  await exigirUsuario();

  const valorBruto = String(formData.get("valor_mensal") ?? "0").replace(/\./g, "").replace(",", ".");

  const supabase = criarClienteServidor();
  const { error } = await supabase.rpc("atualizar_assinatura", {
    p_org: String(formData.get("org_id") ?? ""),
    p_status: String(formData.get("status") ?? "avaliacao"),
    p_plano: String(formData.get("plano_id") ?? "") || null,
    p_valor: Number(valorBruto) || 0,
    p_ciclo: String(formData.get("ciclo") ?? "mensal"),
    p_vencimento: String(formData.get("proximo_vencimento") ?? "") || null,
    p_avaliacao: String(formData.get("avaliacao_ate") ?? "") || null,
    p_teste: formData.get("conta_teste") === "on",
    p_observacao: String(formData.get("observacao_interna") ?? "").trim() || null,
  });

  if (error) comErro(error.message);

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Assinatura atualizada.")}`);
}
