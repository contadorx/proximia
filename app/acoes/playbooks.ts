"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";

const ROTA = "/configuracoes/playbooks";

function comErro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

export async function criarPlaybook(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const nome = String(formData.get("nome") ?? "").trim();
  const fase = String(formData.get("fase") ?? "");
  if (!nome) comErro("Dê um nome ao playbook.");
  if (!fase) comErro("Escolha a etapa que dispara.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("playbooks").insert({
    org_id: org.orgId,
    nome,
    descricao: String(formData.get("descricao") ?? "").trim() || null,
    fase,
    criado_por: usuario.id,
  });

  if (error) {
    comErro(
      /idx_playbook_fase_ativo/.test(error.message)
        ? "Já existe um playbook ativo para essa etapa. Desligue o atual antes de criar outro."
        : error.message,
    );
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Playbook criado. Agora inclua as tarefas.")}`);
}

export async function alternarPlaybook(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const ativar = formData.get("ativar") === "1";

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("playbooks")
    .update({ ativo: ativar }, { count: "exact" })
    .eq("id", id);

  if (!error && count === 0) {
    comErro("Nada mudou: seu perfil não permite alterar playbooks.");
  }
  if (error) {
    comErro(
      /idx_playbook_fase_ativo/.test(error.message)
        ? "Já existe outro playbook ativo para essa etapa."
        : error.message,
    );
  }

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?ok=${encodeURIComponent(ativar ? "Playbook ligado." : "Playbook desligado.")}`,
  );
}

export async function excluirPlaybook(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase.from("playbooks").delete({ count: "exact" }).eq("id", id);
  if (error) comErro(error.message);
  if (count === 0) comErro("Nada foi excluído: seu perfil não permite alterar playbooks.");

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?ok=${encodeURIComponent(
      "Playbook excluído. Os compromissos que ele já criou continuam onde estão.",
    )}`,
  );
}

export async function criarTarefa(formData: FormData) {
  const org = await exigirOrg();

  const playbookId = String(formData.get("playbook_id") ?? "");
  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) comErro("Escreva o que precisa ser feito.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("playbook_tarefas").insert({
    org_id: org.orgId,
    playbook_id: playbookId,
    titulo,
    descricao: String(formData.get("descricao") ?? "").trim() || null,
    dias_apos: Math.max(0, Number(formData.get("dias_apos") ?? 0) || 0),
    alerta_dias: Math.max(0, Number(formData.get("alerta_dias") ?? 3) || 0),
    dono_regra: String(formData.get("dono_regra") ?? "responsavel_entidade"),
    ordem: Number(formData.get("ordem") ?? 0) || 0,
  });

  if (error) comErro(error.message);

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Tarefa incluída.")}`);
}

export async function excluirTarefa(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("playbook_tarefas")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) comErro(error.message);
  if (count === 0) comErro("Nada foi removido: seu perfil não permite alterar playbooks.");

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Tarefa removida do playbook.")}`);
}
