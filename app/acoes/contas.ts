"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";
import { cnpjValido, somenteDigitos } from "@/lib/contas";

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
  const limpo = bruto.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const valor = Number(limpo);
  return Number.isNaN(valor) ? null : valor;
}

function traduzir(mensagem: string, codigo?: string): string {
  if (/potencial_declarado/i.test(mensagem)) {
    return "Para registrar um potencial, informe também de onde veio a estimativa.";
  }
  if (/idx_contatos_principal/i.test(mensagem)) {
    return "Já existe um contato principal nesta conta. Desmarque o atual antes.";
  }
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite essa alteração nesta carteira.";
  }
  return mensagem;
}

/** Campos comuns entre criação e edição. */
function montarDados(formData: FormData) {
  const documento = texto(formData, "documento");
  const digitos = documento ? somenteDigitos(documento) : null;

  const potencial = numero(formData, "potencial_bruto");
  const origem = texto(formData, "potencial_origem");
  const dataPotencial = texto(formData, "potencial_data");

  return {
    documento: digitos,
    dados: {
      nome: texto(formData, "nome"),
      razao_social: texto(formData, "razao_social"),
      documento: digitos,
      segmento: texto(formData, "segmento"),
      relacao: String(formData.get("relacao") ?? "estrategica"),
      criticidade: String(formData.get("criticidade") ?? "media"),
      responsavel_id: texto(formData, "responsavel_id"),
      potencial_bruto: potencial,
      potencial_origem: potencial === null ? null : origem,
      // Sem data informada, vale hoje: estimativa precisa de referência no tempo.
      potencial_data:
        potencial === null ? null : (dataPotencial ?? new Date().toISOString().slice(0, 10)),
      // valor_capturado é soma dos lançamentos de captura: não se escreve aqui.
    },
    potencial,
    origem,
  };
}

export async function criarConta(formData: FormData) {
  const org = await exigirOrg();
  const carteiraId = String(formData.get("carteira_id") ?? "");
  const { documento, dados, potencial, origem } = montarDados(formData);

  if (!dados.nome) comErro("/contas", "Informe o nome da conta.");
  if (!carteiraId) comErro("/contas", "Escolha a carteira desta conta.");
  if (documento && !cnpjValido(documento)) comErro("/contas", "CNPJ inválido. Confira os dígitos.");
  if (potencial !== null && !origem) {
    comErro("/contas", "Informe de onde veio a estimativa de potencial.");
  }

  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("contas")
    .insert({ org_id: org.orgId, carteira_id: carteiraId, ...dados })
    .select("id")
    .single();

  if (error) comErro("/contas", traduzir(error.message, error.code));

  revalidatePath("/contas");
  redirect(`/contas/${(data as { id: string }).id}`);
}

export async function atualizarConta(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const rota = `/contas/${id}`;
  const { documento, dados, potencial, origem } = montarDados(formData);

  if (!dados.nome) comErro(rota, "Informe o nome da conta.");
  if (documento && !cnpjValido(documento)) comErro(rota, "CNPJ inválido. Confira os dígitos.");
  if (potencial !== null && !origem) comErro(rota, "Informe de onde veio a estimativa de potencial.");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("contas")
    .update(
      {
        ...dados,
        status: String(formData.get("status") ?? "ativa"),
        observacoes: texto(formData, "observacoes"),
      },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada foi alterado: seu perfil não permite editar esta conta.");

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Conta atualizada.")}`);
}

export async function criarContato(formData: FormData) {
  const org = await exigirOrg();
  const contaId = String(formData.get("conta_id") ?? "");
  const rota = `/contas/${contaId}`;

  const nome = texto(formData, "nome");
  if (!nome) comErro(rota, "Informe o nome do contato.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("contatos").insert({
    org_id: org.orgId,
    conta_id: contaId,
    nome,
    cargo: texto(formData, "cargo"),
    email: texto(formData, "email"),
    telefone: texto(formData, "telefone"),
    principal: formData.get("principal") === "on",
  });

  if (error) comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Contato incluído.")}`);
}

export async function excluirContato(formData: FormData) {
  await exigirOrg();
  const contaId = String(formData.get("conta_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const rota = `/contas/${contaId}`;

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("contatos").delete().eq("id", id);
  if (error) comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Contato removido.")}`);
}
