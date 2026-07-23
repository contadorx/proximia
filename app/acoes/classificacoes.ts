"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";

const ROTA = "/configuracoes/classificacoes";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

export async function criarClassificacao(formData: FormData) {
  const org = await exigirOrg();

  const grupo = String(formData.get("grupo") ?? "").trim();
  const valor = String(formData.get("valor") ?? "").trim();
  if (!grupo) comErro(ROTA, "Informe o grupo — a pergunta que essa classificação responde.");
  if (!valor) comErro(ROTA, "Informe o valor.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("classificacoes").insert({
    org_id: org.orgId,
    grupo,
    valor,
    descricao: String(formData.get("descricao") ?? "").trim() || null,
    ordem: Number(formData.get("ordem") ?? 0) || 0,
  });

  if (error) {
    comErro(
      ROTA,
      error.code === "23505" ? "Esse valor já existe nesse grupo." : error.message,
    );
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Classificação criada.")}`);
}

export async function excluirClassificacao(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("classificacoes")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) comErro(ROTA, error.message);
  if (count === 0) comErro(ROTA, "Nada foi excluído: seu perfil não permite alterar classificações.");

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?ok=${encodeURIComponent("Classificação excluída das contas que a usavam.")}`,
  );
}

/** Salva todas as classificações de uma conta de uma vez. */
export async function salvarClassificacoesDaConta(formData: FormData) {
  const org = await exigirOrg();
  const contaId = String(formData.get("conta_id") ?? "");
  const rota = `/contas/${contaId}`;
  const escolhidas = formData.getAll("classificacao").map(String).filter(Boolean);

  const supabase = criarClienteServidor();

  const { error: erroLimpeza } = await supabase
    .from("conta_classificacoes")
    .delete()
    .eq("conta_id", contaId);
  if (erroLimpeza) comErro(rota, erroLimpeza.message);

  if (escolhidas.length > 0) {
    const { error } = await supabase.from("conta_classificacoes").insert(
      escolhidas.map((classificacao_id) => ({
        org_id: org.orgId,
        conta_id: contaId,
        classificacao_id,
      })),
    );
    if (error) comErro(rota, error.message);
  }

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Classificação da conta atualizada.")}`);
}

export async function alternarAnexos(formData: FormData) {
  const org = await exigirOrg();
  const permitir = formData.get("permitir") === "1";

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("orgs")
    .update({ permite_anexos: permitir })
    .eq("id", org.orgId);

  if (error) comErro("/configuracoes", error.message);

  revalidatePath("/configuracoes");
  redirect(
    `/configuracoes?ok=${encodeURIComponent(
      permitir
        ? "Anexos liberados. Arquivos podem ser guardados no sistema."
        : "Anexo zero ligado. Só links para o repositório externo, e o banco recusa upload.",
    )}`,
  );
}

/**
 * Liga ou desliga a consulta pública de CNPJ.
 *
 * Fica aqui, junto dos outros interruptores da organização, e não numa
 * tela própria: é uma decisão de uma linha, não um assunto.
 */
export async function alternarEnriquecimento(formData: FormData) {
  const org = await exigirOrg();
  const ligar = formData.get("ligar") === "1";

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("orgs")
    .update({ enriquecimento_cnpj: ligar })
    .eq("id", org.orgId);

  if (error) {
    redirect(`/configuracoes?erro=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/configuracoes");
  redirect(
    `/configuracoes?ok=${encodeURIComponent(
      ligar
        ? "Consulta de CNPJ ligada. A partir de agora, o CNPJ da conta pode ser enviado ao serviço público quando alguém pedir o preenchimento."
        : "Consulta de CNPJ desligada. Nenhum dado sai do produto.",
    )}`,
  );
}
