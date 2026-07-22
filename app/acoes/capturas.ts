"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

function numero(formData: FormData, campo: string): number | null {
  const bruto = String(formData.get(campo) ?? "").trim();
  if (!bruto) return null;
  const valor = Number(bruto.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isNaN(valor) ? null : valor;
}

function traduzir(mensagem: string, codigo?: string): string {
  if (/captura_com_data/i.test(mensagem)) {
    return "Informe a data em que o valor foi confirmado.";
  }
  if (/valor > 0|capturas_valor_check/i.test(mensagem)) {
    return "O valor precisa ser maior que zero.";
  }
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite registrar captura nesta carteira.";
  }
  return mensagem;
}

/** Registra valor confirmado. Não edita nada: acrescenta um lançamento. */
export async function registrarCaptura(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const entidadeTipo = String(formData.get("entidade_tipo") ?? "") as "conta" | "frente";
  const entidadeId = String(formData.get("entidade_id") ?? "");
  const carteiraId = String(formData.get("carteira_id") ?? "");
  const rota = entidadeTipo === "conta" ? `/contas/${entidadeId}` : `/frentes/${entidadeId}`;

  const valor = numero(formData, "valor");
  const confirmadoEm = String(formData.get("confirmado_em") ?? "").trim();

  if (!valor || valor <= 0) comErro(rota, "Informe o valor confirmado.");
  if (!confirmadoEm) comErro(rota, "Informe a data em que o valor foi confirmado.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("capturas").insert({
    org_id: org.orgId,
    carteira_id: carteiraId,
    entidade_tipo: entidadeTipo,
    entidade_id: entidadeId,
    tipo: String(formData.get("tipo") ?? "captura"),
    valor,
    confirmado_em: confirmadoEm,
    descricao: String(formData.get("descricao") ?? "").trim() || null,
    comprovacao: String(formData.get("comprovacao") ?? "").trim() || null,
    autor_id: usuario.id,
  });

  if (error) comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  redirect(
    `${rota}?ok=${encodeURIComponent(
      formData.get("tipo") === "estorno" ? "Estorno registrado." : "Captura registrada.",
    )}`,
  );
}

/** Exclusão é exceção de administração; a correção normal é o estorno. */
export async function excluirCaptura(formData: FormData) {
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const entidadeTipo = String(formData.get("entidade_tipo") ?? "");
  const entidadeId = String(formData.get("entidade_id") ?? "");
  const rota = entidadeTipo === "conta" ? `/contas/${entidadeId}` : `/frentes/${entidadeId}`;

  const supabase = criarClienteServidor();
  const { error, count } = await supabase.from("capturas").delete({ count: "exact" }).eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) {
    comErro(rota, "Só a administração pode excluir um lançamento. Para corrigir, registre um estorno.");
  }

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Lançamento excluído.")}`);
}
