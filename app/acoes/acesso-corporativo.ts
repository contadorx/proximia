"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";
import type { EstadoAcao } from "@/lib/formulario";
import { normalizarDominio } from "@/lib/dominios";

const ROTA = "/configuracoes/acesso-corporativo";

function traduzir(mensagem: string, codigo?: string): string {
  if (codigo === "23505" || /duplicate key/i.test(mensagem)) {
    return "Este domínio já está cadastrado — por esta ou por outra organização. Fale com o suporte se ele for seu.";
  }
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Somente administradores configuram o acesso corporativo.";
  }
  if (/dominio_check/i.test(mensagem)) {
    return "Informe só o domínio, em minúsculas e sem arroba. Exemplo: acme.com.br";
  }
  return mensagem;
}


export async function cadastrarDominio(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const dominio = normalizarDominio(String(formData.get("dominio") ?? ""));
  if (!dominio || !dominio.includes(".")) {
    return { erro: "Informe um domínio válido, como acme.com.br" };
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("org_dominios").insert({
    org_id: org.orgId,
    dominio,
    sso_provider_id: String(formData.get("provider") ?? "").trim() || null,
    papel_padrao: String(formData.get("papel") ?? "ponto_focal"),
    criado_por: usuario.id,
    // Nasce sem exigir e sem provisionar: ligar é ato explícito, depois de
    // conferir que o SSO funciona.
    exige_sso: false,
    provisiona: false,
  });

  if (error) return { erro: traduzir(error.message, error.code) };

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Domínio cadastrado. Configure o provedor e teste a entrada antes de exigir SSO.")}`);
}

export async function atualizarDominio(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");

  const provider = String(formData.get("provider") ?? "").trim() || null;
  const exigeSso = formData.get("exige_sso") === "on";
  const provisiona = formData.get("provisiona") === "on";

  // Exigir SSO ou provisionar sem provedor configurado tranca todo mundo
  // do lado de fora. A trava é aqui porque a mensagem precisa explicar.
  if ((exigeSso || provisiona) && !provider) {
    return {
      erro: "Informe o identificador do provedor no Supabase antes de exigir SSO ou provisionar — sem ele, ninguém entra.",
    };
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("org_dominios")
    .update({
      sso_provider_id: provider,
      exige_sso: exigeSso,
      provisiona,
      papel_padrao: String(formData.get("papel") ?? "ponto_focal"),
    })
    .eq("id", id);

  if (error) return { erro: traduzir(error.message, error.code) };

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Configuração salva.")}`);
}

export async function removerDominio(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("org_dominios").delete().eq("id", id);

  if (error) redirect(`${ROTA}?erro=${encodeURIComponent(traduzir(error.message, error.code))}`);

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?ok=${encodeURIComponent("Domínio removido. Quem já tem acesso continua entrando.")}`,
  );
}
