"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";
import { textoDe, type EstadoAcao } from "@/lib/formulario";

const ROTA = "/configuracoes";

function comErro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

function traduzir(mensagem: string, codigo?: string): string {
  if (codigo === "23505" && /idx_equipe_email/i.test(mensagem)) {
    return "Já existe uma pessoa com esse e-mail nesta organização.";
  }
  if (codigo === "23503") {
    return "Essa pessoa responde por carteiras ou tem itens na fila. Desative-a em vez de excluir — o histórico fica.";
  }
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite gerenciar a equipe.";
  }
  return mensagem;
}

/**
 * Cadastra uma pessoa da operação — sem exigir que ela tenha login.
 * Quando (e se) ela aceitar um convite com o mesmo e-mail, o banco casa
 * os dois cadastros sozinho e tudo o que ela responde continua dela.
 */
export async function criarPessoaEquipe(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const nome = textoDe(formData, "nome");
  if (!nome) return { erro: "Informe o nome da pessoa." };

  const email = textoDe(formData, "email")?.toLowerCase() ?? null;
  if (email && !email.includes("@")) return { erro: "O e-mail não parece válido." };

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("equipe").insert({
    org_id: org.orgId,
    nome,
    email,
    observacao: textoDe(formData, "observacao"),
    criado_por: usuario.id,
  });

  if (error) return { erro: traduzir(error.message, error.code) };

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?ok=${encodeURIComponent(
      email
        ? `${nome} entrou na equipe. Quando aceitar um convite com ${email}, o acesso liga sozinho.`
        : `${nome} entrou na equipe — já pode responder por carteiras e compromissos.`,
    )}`,
  );
}

export async function editarPessoaEquipe(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");

  const nome = textoDe(formData, "nome");
  if (!nome) return { erro: "Informe o nome da pessoa." };

  const email = textoDe(formData, "email")?.toLowerCase() ?? null;
  if (email && !email.includes("@")) return { erro: "O e-mail não parece válido." };

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("equipe")
    .update(
      { nome, email, observacao: textoDe(formData, "observacao") },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) return { erro: traduzir(error.message, error.code) };
  if (count === 0) return { erro: "Nada mudou: seu perfil não permite editar a equipe." };

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Pessoa atualizada.")}`);
}

/** Desativar tira a pessoa dos seletores; o que ela respondia fica registrado. */
export async function alternarPessoaEquipe(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const ativar = formData.get("ativar") === "1";

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("equipe")
    .update({ ativo: ativar }, { count: "exact" })
    .eq("id", id);

  if (error) comErro(traduzir(error.message, error.code));
  if (count === 0) comErro("Nada mudou: seu perfil não permite alterar a equipe.");

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?ok=${encodeURIComponent(
      ativar
        ? "Pessoa reativada: volta a aparecer nos seletores."
        : "Pessoa desativada. O que ela respondia continua registrado com o nome dela.",
    )}`,
  );
}

export async function excluirPessoaEquipe(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase.from("equipe").delete({ count: "exact" }).eq("id", id);

  if (error) comErro(traduzir(error.message, error.code));
  if (count === 0) comErro("Nada foi excluído: só a administração exclui pessoas da equipe.");

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Pessoa excluída da equipe.")}`);
}
