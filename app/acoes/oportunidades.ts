"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";
import { obterOportunidade } from "@/lib/oportunidades";

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

function traduzir(mensagem: string, codigo?: string): string {
  if (/estimativa_declarada/i.test(mensagem)) {
    return "Para registrar investimento ou retorno, informe de onde veio a estimativa e quando foi apurada.";
  }
  if (/oportunidade_descarte/i.test(mensagem)) {
    return "Para descartar, escreva o motivo. É o que fica de aprendizado.";
  }
  if (codigo === "23505") return "Já existe um tipo com esse nome.";
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite essa alteração nesta carteira.";
  }
  return mensagem;
}

function dados(formData: FormData) {
  const investimento = numero(formData, "investimento");
  const retorno = numero(formData, "retorno_mensal");
  const origem = texto(formData, "estimativa_origem");
  const temEstimativa = investimento !== null || retorno !== null;

  return {
    titulo: texto(formData, "titulo"),
    descricao: texto(formData, "descricao"),
    conta_id: texto(formData, "conta_id"),
    catalogo_id: texto(formData, "catalogo_id"),
    responsavel_id: texto(formData, "responsavel_id"),
    proxima_etapa: texto(formData, "proxima_etapa"),
    prazo: texto(formData, "prazo"),
    investimento,
    retorno_mensal: retorno,
    custo_mensal: numero(formData, "custo_mensal") ?? 0,
    horizonte_meses: Math.max(1, Math.round(numero(formData, "horizonte_meses") ?? 60)),
    estimativa_origem: temEstimativa ? origem : null,
    estimativa_data: temEstimativa
      ? (texto(formData, "estimativa_data") ?? new Date().toISOString().slice(0, 10))
      : null,
    temEstimativa,
    origem,
  };
}

export async function criarTipoOportunidade(formData: FormData) {
  const org = await exigirOrg();
  const nome = texto(formData, "nome");
  if (!nome) comErro("/configuracoes", "Informe o nome do tipo.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("oportunidade_catalogo").insert({
    org_id: org.orgId,
    nome,
    descricao: texto(formData, "descricao"),
  });

  if (error) comErro("/configuracoes", traduzir(error.message, error.code));

  revalidatePath("/configuracoes");
  redirect("/configuracoes");
}

export async function criarOportunidade(formData: FormData) {
  const org = await exigirOrg();
  const carteiraId = String(formData.get("carteira_id") ?? "");
  const d = dados(formData);

  if (!d.titulo) comErro("/oportunidades", "Informe o título da oportunidade.");
  if (!carteiraId) comErro("/oportunidades", "Escolha a carteira.");
  if (d.temEstimativa && !d.origem) {
    comErro("/oportunidades", "Informe de onde veio a estimativa de investimento e retorno.");
  }

  const { temEstimativa: _t, origem: _o, ...campos } = d;

  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("oportunidades")
    .insert({
      org_id: org.orgId,
      carteira_id: carteiraId,
      fase: String(formData.get("fase") ?? "identificacao"),
      ...campos,
    })
    .select("id")
    .single();

  if (error) comErro("/oportunidades", traduzir(error.message, error.code));

  revalidatePath("/oportunidades");
  redirect(`/oportunidades/${(data as { id: string }).id}`);
}

export async function atualizarOportunidade(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const rota = `/oportunidades/${id}`;
  const d = dados(formData);

  if (!d.titulo) comErro(rota, "Informe o título da oportunidade.");

  const fase = String(formData.get("fase") ?? "identificacao");
  const motivo = texto(formData, "motivo_descarte");
  if (fase === "descartada" && !motivo) {
    comErro(rota, "Para descartar, escreva o motivo. É o que fica de aprendizado.");
  }
  if (d.temEstimativa && !d.origem) {
    comErro(rota, "Informe de onde veio a estimativa de investimento e retorno.");
  }

  const { temEstimativa: _t, origem: _o, ...campos } = d;

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("oportunidades")
    .update(
      {
        ...campos,
        fase,
        motivo_descarte: fase === "descartada" ? motivo : null,
        investimento_realizado: numero(formData, "investimento_realizado"),
        retorno_confirmado: numero(formData, "retorno_confirmado"),
        confirmado_em: texto(formData, "confirmado_em"),
        observacoes: texto(formData, "observacoes"),
      },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada foi alterado: seu perfil não permite editar esta oportunidade.");

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Oportunidade atualizada.")}`);
}

export async function mudarFase(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const fase = String(formData.get("fase") ?? "");
  const rota = `/oportunidades/${id}`;

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("oportunidades").update({ fase }).eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  redirect(rota);
}

export async function incluirLinkOportunidade(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const rota = `/oportunidades/${id}`;

  const rotulo = texto(formData, "rotulo");
  const url = texto(formData, "url");
  if (!rotulo || !url) comErro(rota, "Informe o nome e o endereço do link.");

  const oportunidade = await obterOportunidade(id);
  if (!oportunidade) comErro(rota, "Oportunidade não encontrada.");

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("oportunidades")
    .update({ links: [...(oportunidade.links ?? []), { rotulo, url }] })
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  redirect(rota);
}
