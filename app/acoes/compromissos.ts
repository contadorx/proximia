"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

function texto(formData: FormData, campo: string): string | null {
  const valor = String(formData.get(campo) ?? "").trim();
  return valor === "" ? null : valor;
}

function traduzir(mensagem: string, codigo?: string): string {
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite essa alteração nesta carteira.";
  }
  return mensagem;
}

export async function criarCompromisso(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();
  const rota = String(formData.get("volta") ?? "/compromissos");

  const titulo = texto(formData, "titulo");
  const venceEm = texto(formData, "vence_em");
  const carteiraId = String(formData.get("carteira_id") ?? "");

  if (!titulo) comErro(rota, "Diga o que precisa ser feito.");
  if (!venceEm) comErro(rota, "Informe a data. Compromisso sem data não é compromisso.");
  if (!carteiraId) comErro(rota, "Escolha a carteira.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("compromissos").insert({
    org_id: org.orgId,
    carteira_id: carteiraId,
    entidade_tipo: String(formData.get("entidade_tipo") ?? "carteira"),
    entidade_id: String(formData.get("entidade_id") ?? carteiraId),
    titulo,
    descricao: texto(formData, "descricao"),
    vence_em: venceEm,
    dono_id: texto(formData, "dono_id") ?? usuario.id,
    alerta_dias: Number(formData.get("alerta_dias") ?? 7) || 7,
    origem: "manual",
    criado_por: usuario.id,
  });

  if (error) comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Compromisso registrado.")}`);
}

export async function mudarStatusCompromisso(formData: FormData) {
  const usuario = await exigirUsuario();
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "concluido");
  const rota = String(formData.get("volta") ?? "/compromissos");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("compromissos")
    .update(
      {
        status,
        concluido_em: status === "concluido" ? new Date().toISOString().slice(0, 10) : null,
        concluido_por: status === "concluido" ? usuario.id : null,
      },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada mudou: seu perfil não permite alterar este compromisso.");

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Compromisso atualizado.")}`);
}

export async function gerarCompromissosPendentes() {
  const org = await exigirOrg();

  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("gerar_compromissos_pendentes", { p_org: org.orgId });

  if (error) comErro("/compromissos", traduzir(error.message, error.code));

  const criados = Number(data ?? 0);
  revalidatePath("/compromissos");
  redirect(
    `/compromissos?ok=${encodeURIComponent(
      criados === 0
        ? "Nada a gerar: todos os contratos e cláusulas já têm compromisso."
        : `${criados} compromisso(s) criado(s) a partir dos contratos e cláusulas.`,
    )}`,
  );
}


/** Troca quem responde por um compromisso. */
export async function reatribuirCompromisso(formData: FormData) {
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const dono = String(formData.get("dono_id") ?? "");
  const volta = String(formData.get("volta") ?? "/compromissos");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("compromissos")
    .update({ dono_id: dono || null }, { count: "exact" })
    .eq("id", id);

  if (error) comErro(volta, traduzir(error.message, error.code));
  if (count === 0) comErro(volta, "Seu perfil não permite alterar este compromisso.");

  revalidatePath(volta);
  redirect(`${volta}?ok=${encodeURIComponent("Compromisso reatribuído.")}`);
}

/**
 * Distribui os que estão sem dono, pela mesma cadeia dos alertas.
 * Não mexe em quem já tem: decisão de pessoa não é desfeita por varredura.
 */
export async function distribuirCompromissos() {
  const org = await exigirOrg();

  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("atribuir_compromissos", { p_org: org.orgId });

  if (error) comErro("/compromissos", traduzir(error.message, error.code));

  const n = Number(data ?? 0);
  revalidatePath("/compromissos");
  redirect(
    `/compromissos?ok=${encodeURIComponent(
      n > 0
        ? `${n} compromisso(s) ganharam responsável.`
        : "Nenhum compromisso sem responsável — ou não há quem responder pelas carteiras deles.",
    )}`,
  );
}
