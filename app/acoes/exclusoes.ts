"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";

/**
 * Exclusoes. Cada uma respeita a politica da tabela: se o perfil nao
 * permite, o banco recusa e a tela diz isso — em vez de fingir sucesso.
 */

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

function traduzir(mensagem: string, codigo?: string): string {
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite excluir este registro.";
  }
  if (codigo === "23503") {
    return "Há registros dependentes que impedem a exclusão.";
  }
  return mensagem;
}

async function excluir(tabela: string, id: string, rotaVolta: string, mensagem: string) {
  await exigirOrg();

  const supabase = criarClienteServidor();
  const { error, count } = await supabase.from(tabela).delete({ count: "exact" }).eq("id", id);

  if (error) comErro(rotaVolta, traduzir(error.message, error.code));
  if (count === 0) {
    comErro(rotaVolta, "Nada foi excluído: seu perfil não permite essa exclusão.");
  }

  revalidatePath(rotaVolta);
  redirect(`${rotaVolta}?ok=${encodeURIComponent(mensagem)}`);
}

export async function excluirCarteira(formData: FormData) {
  await excluir(
    "carteiras",
    String(formData.get("id") ?? ""),
    "/carteiras",
    "Carteira excluída, junto de suas contas, contratos, frentes e histórico.",
  );
}

export async function excluirConta(formData: FormData) {
  await excluir("contas", String(formData.get("id") ?? ""), "/contas", "Conta excluída.");
}

export async function excluirContrato(formData: FormData) {
  await excluir("contratos", String(formData.get("id") ?? ""), "/contratos", "Contrato excluído.");
}

export async function excluirFrente(formData: FormData) {
  await excluir("frentes", String(formData.get("id") ?? ""), "/frentes", "Frente excluída.");
}

export async function excluirOportunidade(formData: FormData) {
  await excluir(
    "oportunidades",
    String(formData.get("id") ?? ""),
    "/oportunidades",
    "Oportunidade excluída.",
  );
}

export async function excluirDimensao(formData: FormData) {
  await excluir(
    "maturidade_dimensoes",
    String(formData.get("id") ?? ""),
    "/maturidade",
    "Dimensão excluída, junto de suas perguntas e respostas.",
  );
}

export async function excluirPergunta(formData: FormData) {
  await excluir(
    "maturidade_perguntas",
    String(formData.get("id") ?? ""),
    "/maturidade",
    "Pergunta excluída, junto das respostas dadas a ela.",
  );
}

export async function excluirCiclo(formData: FormData) {
  await excluir(
    "maturidade_ciclos",
    String(formData.get("id") ?? ""),
    "/maturidade",
    "Ciclo excluído, junto das avaliações dele.",
  );
}

export async function excluirAvaliacao(formData: FormData) {
  await excluir(
    "maturidade_avaliacoes",
    String(formData.get("id") ?? ""),
    "/maturidade",
    "Avaliação excluída.",
  );
}

export async function excluirTipoFrente(formData: FormData) {
  await excluir(
    "frente_catalogo",
    String(formData.get("id") ?? ""),
    "/configuracoes",
    "Tipo de frente excluído. As frentes que o usavam ficam sem tipo.",
  );
}

export async function excluirTipoOportunidade(formData: FormData) {
  await excluir(
    "oportunidade_catalogo",
    String(formData.get("id") ?? ""),
    "/configuracoes",
    "Tipo de oportunidade excluído.",
  );
}
