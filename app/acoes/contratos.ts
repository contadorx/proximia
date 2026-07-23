"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";
import { inteiroDe, numeroDe, textoDe, type EstadoAcao } from "@/lib/formulario";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

function traduzir(mensagem: string, codigo?: string): string {
  if (/vigencia_coerente/i.test(mensagem)) {
    return "A data de fim não pode ser anterior à de início.";
  }
  if (/monitorada_tem_data/i.test(mensagem)) {
    return "Cláusula monitorada precisa de uma data de referência — é ela que dispara o aviso.";
  }
  if (/aviso_previa_dias/i.test(mensagem)) {
    return "O aviso prévio precisa ficar entre 0 e 730 dias.";
  }
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite essa alteração nesta carteira.";
  }
  return mensagem;
}

function dadosContrato(formData: FormData) {
  return {
    numero: textoDe(formData, "numero"),
    tipo: textoDe(formData, "tipo"),
    modalidade: textoDe(formData, "modalidade"),
    natureza_beneficio: textoDe(formData, "natureza_beneficio"),
    inicio: textoDe(formData, "inicio"),
    fim: textoDe(formData, "fim"),
    renovacao_automatica: formData.get("renovacao_automatica") === "on",
    aviso_previa_dias: inteiroDe(formData, "aviso_previa_dias", 0, 0, 730),
    valor_base: numeroDe(formData, "valor_base"),
    periodicidade: textoDe(formData, "periodicidade"),
    link_documento: textoDe(formData, "link_documento"),
  };
}

export async function criarContrato(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const org = await exigirOrg();

  const contaId = String(formData.get("conta_id") ?? "");
  if (!contaId) return { erro: "Escolha a conta deste contrato." };

  const supabase = criarClienteServidor();
  const { data: conta } = await supabase
    .from("contas")
    .select("carteira_id")
    .eq("id", contaId)
    .maybeSingle();

  if (!conta) return { erro: "Conta não encontrada ou fora do seu alcance." };

  const { data, error } = await supabase
    .from("contratos")
    .insert({
      org_id: org.orgId,
      conta_id: contaId,
      carteira_id: (conta as { carteira_id: string }).carteira_id,
      ...dadosContrato(formData),
    })
    .select("id")
    .single();

  if (error) return { erro: traduzir(error.message, error.code) };

  revalidatePath("/contratos");
  redirect(`/contratos/${(data as { id: string }).id}`);
}

export async function atualizarContrato(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const rota = `/contratos/${id}`;

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("contratos")
    .update(
      {
        ...dadosContrato(formData),
        status: String(formData.get("status") ?? "vigente"),
        observacoes: textoDe(formData, "observacoes"),
      },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) return { erro: traduzir(error.message, error.code) };
  if (count === 0) {
    return { erro: "Nada foi alterado: seu perfil não permite editar este contrato." };
  }

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Contrato atualizado.")}`);
}

export async function criarClausula(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const org = await exigirOrg();
  const contratoId = String(formData.get("contrato_id") ?? "");
  const rota = `/contratos/${contratoId}`;

  const descricao = textoDe(formData, "descricao");
  if (!descricao) return { erro: "Descreva a cláusula." };

  const monitorada = formData.get("monitorada") === "on";
  const dataReferencia = textoDe(formData, "data_referencia");
  if (monitorada && !dataReferencia) {
    return { erro: "Para acompanhar esta cláusula, informe a data de referência." };
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("contrato_clausulas").insert({
    org_id: org.orgId,
    contrato_id: contratoId,
    tipo: String(formData.get("tipo") ?? "outra"),
    descricao,
    monitorada,
    data_referencia: dataReferencia,
    antecedencia_dias: inteiroDe(formData, "antecedencia_dias", 30, 0, 730),
  });

  if (error) return { erro: traduzir(error.message, error.code) };

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Cláusula incluída.")}`);
}

export async function excluirClausula(formData: FormData) {
  await exigirOrg();
  const contratoId = String(formData.get("contrato_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const rota = `/contratos/${contratoId}`;

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("contrato_clausulas")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada foi removido: seu perfil não permite excluir esta cláusula.");

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Cláusula removida.")}`);
}
