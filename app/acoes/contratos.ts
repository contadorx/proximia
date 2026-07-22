"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

function texto(formData: FormData, campo: string): string | null {
  const valor = String(formData.get(campo) ?? "").trim();
  return valor === "" ? null : valor;
}

function numero(formData: FormData, campo: string): number | null {
  const bruto = texto(formData, campo);
  if (bruto === null) return null;
  const valor = Number(bruto.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isNaN(valor) ? null : valor;
}

function inteiro(formData: FormData, campo: string, padrao: number): number {
  const valor = numero(formData, campo);
  return valor === null ? padrao : Math.max(0, Math.round(valor));
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
    numero: texto(formData, "numero"),
    tipo: texto(formData, "tipo"),
    modalidade: texto(formData, "modalidade"),
    natureza_beneficio: texto(formData, "natureza_beneficio"),
    inicio: texto(formData, "inicio"),
    fim: texto(formData, "fim"),
    renovacao_automatica: formData.get("renovacao_automatica") === "on",
    aviso_previa_dias: inteiro(formData, "aviso_previa_dias", 0),
    valor_base: numero(formData, "valor_base"),
    periodicidade: texto(formData, "periodicidade"),
    link_documento: texto(formData, "link_documento"),
  };
}

export async function criarContrato(formData: FormData) {
  const org = await exigirOrg();

  const contaId = String(formData.get("conta_id") ?? "");
  const rotaVolta = String(formData.get("volta") ?? "/contratos");
  if (!contaId) comErro(rotaVolta, "Escolha a conta deste contrato.");

  const supabase = criarClienteServidor();
  const { data: conta } = await supabase
    .from("contas")
    .select("carteira_id")
    .eq("id", contaId)
    .maybeSingle();

  if (!conta) comErro(rotaVolta, "Conta não encontrada ou fora do seu alcance.");

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

  if (error) comErro(rotaVolta, traduzir(error.message, error.code));

  revalidatePath("/contratos");
  redirect(`/contratos/${(data as { id: string }).id}`);
}

export async function atualizarContrato(formData: FormData) {
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
        observacoes: texto(formData, "observacoes"),
      },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada foi alterado: seu perfil não permite editar este contrato.");

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Contrato atualizado.")}`);
}

export async function criarClausula(formData: FormData) {
  const org = await exigirOrg();
  const contratoId = String(formData.get("contrato_id") ?? "");
  const rota = `/contratos/${contratoId}`;

  const descricao = texto(formData, "descricao");
  if (!descricao) comErro(rota, "Descreva a cláusula.");

  const monitorada = formData.get("monitorada") === "on";
  const dataReferencia = texto(formData, "data_referencia");
  if (monitorada && !dataReferencia) {
    comErro(rota, "Para acompanhar esta cláusula, informe a data de referência.");
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("contrato_clausulas").insert({
    org_id: org.orgId,
    contrato_id: contratoId,
    tipo: String(formData.get("tipo") ?? "outra"),
    descricao,
    monitorada,
    data_referencia: dataReferencia,
    antecedencia_dias: inteiro(formData, "antecedencia_dias", 30),
  });

  if (error) comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Cláusula incluída.")}`);
}

export async function excluirClausula(formData: FormData) {
  await exigirOrg();
  const contratoId = String(formData.get("contrato_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const rota = `/contratos/${contratoId}`;

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("contrato_clausulas").delete().eq("id", id);
  if (error) comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Cláusula removida.")}`);
}
