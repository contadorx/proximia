"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";
import { obterOportunidade } from "@/lib/oportunidades";
import { inteiroDe, numeroDe, textoDe, type EstadoAcao } from "@/lib/formulario";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
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
  const investimento = numeroDe(formData, "investimento");
  const retorno = numeroDe(formData, "retorno_mensal");
  const origem = textoDe(formData, "estimativa_origem");
  const temEstimativa = investimento !== null || retorno !== null;

  return {
    titulo: textoDe(formData, "titulo"),
    descricao: textoDe(formData, "descricao"),
    conta_id: textoDe(formData, "conta_id"),
    catalogo_id: textoDe(formData, "catalogo_id"),
    responsavel_id: textoDe(formData, "responsavel_id"),
    // O formulário sempre perguntou natureza e prioridade; a ação jogava
    // fora. "Proteção" marcada tem de chegar ao banco — é a disciplina
    // captura × proteção valendo desde a entrada do dado.
    natureza: String(formData.get("natureza") ?? "captura"),
    prioridade: inteiroDe(formData, "prioridade", 3, 1, 5),
    proxima_etapa: textoDe(formData, "proxima_etapa"),
    prazo: textoDe(formData, "prazo"),
    investimento,
    retorno_mensal: retorno,
    custo_mensal: numeroDe(formData, "custo_mensal") ?? 0,
    horizonte_meses: inteiroDe(formData, "horizonte_meses", 60, 1, 600),
    estimativa_origem: temEstimativa ? origem : null,
    estimativa_data: temEstimativa
      ? (textoDe(formData, "estimativa_data") ?? new Date().toISOString().slice(0, 10))
      : null,
    temEstimativa,
    origem,
  };
}

export async function criarTipoOportunidade(formData: FormData) {
  const org = await exigirOrg();
  const nome = textoDe(formData, "nome");
  if (!nome) comErro("/configuracoes", "Informe o nome do tipo.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("oportunidade_catalogo").insert({
    org_id: org.orgId,
    nome,
    descricao: textoDe(formData, "descricao"),
  });

  if (error) comErro("/configuracoes", traduzir(error.message, error.code));

  revalidatePath("/configuracoes");
  redirect(`/configuracoes?ok=${encodeURIComponent("Tipo de oportunidade incluído.")}`);
}

export async function criarOportunidade(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const org = await exigirOrg();
  const carteiraId = String(formData.get("carteira_id") ?? "");
  const d = dados(formData);

  if (!d.titulo) return { erro: "Informe o título da oportunidade." };
  if (!carteiraId) return { erro: "Escolha a carteira." };
  if (d.temEstimativa && !d.origem) {
    return { erro: "Informe de onde veio a estimativa de investimento e retorno." };
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

  if (error) return { erro: traduzir(error.message, error.code) };

  revalidatePath("/oportunidades");
  redirect(`/oportunidades/${(data as { id: string }).id}`);
}

export async function atualizarOportunidade(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const rota = `/oportunidades/${id}`;
  const d = dados(formData);

  if (!d.titulo) return { erro: "Informe o título da oportunidade." };

  const fase = String(formData.get("fase") ?? "identificacao");
  const motivo = textoDe(formData, "motivo_descarte");
  if (fase === "descartada" && !motivo) {
    return { erro: "Para descartar, escreva o motivo. É o que fica de aprendizado." };
  }
  if (d.temEstimativa && !d.origem) {
    return { erro: "Informe de onde veio a estimativa de investimento e retorno." };
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
        investimento_realizado: numeroDe(formData, "investimento_realizado"),
        retorno_confirmado: numeroDe(formData, "retorno_confirmado"),
        confirmado_em: textoDe(formData, "confirmado_em"),
        observacoes: textoDe(formData, "observacoes"),
      },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) return { erro: traduzir(error.message, error.code) };
  if (count === 0) {
    return { erro: "Nada foi alterado: seu perfil não permite editar esta oportunidade." };
  }

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Oportunidade atualizada.")}`);
}

export async function mudarFase(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const fase = String(formData.get("fase") ?? "");
  const rota = `/oportunidades/${id}`;

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("oportunidades")
    .update({ fase }, { count: "exact" })
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada mudou: seu perfil não permite alterar esta oportunidade.");

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Fase alterada.")}`);
}

export async function incluirLinkOportunidade(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const rota = `/oportunidades/${id}`;

  const rotulo = textoDe(formData, "rotulo");
  const url = textoDe(formData, "url");
  if (!rotulo || !url) comErro(rota, "Informe o nome e o endereço do link.");

  const oportunidade = await obterOportunidade(id);
  if (!oportunidade) comErro(rota, "Oportunidade não encontrada.");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("oportunidades")
    .update({ links: [...(oportunidade.links ?? []), { rotulo, url }] }, { count: "exact" })
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada mudou: seu perfil não permite editar esta oportunidade.");

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Link incluído.")}`);
}
