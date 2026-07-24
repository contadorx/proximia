"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { consultarCnpj } from "@/lib/receita";
import { exigirOrg } from "@/lib/auth";
import { cnpjValido, somenteDigitos } from "@/lib/contas";
import { numeroDe, textoDe, type EstadoAcao } from "@/lib/formulario";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
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
  const documento = textoDe(formData, "documento");
  const digitos = documento ? somenteDigitos(documento) : null;

  const potencial = numeroDe(formData, "potencial_bruto");
  const origem = textoDe(formData, "potencial_origem");
  const dataPotencial = textoDe(formData, "potencial_data");

  // Receita atual segue a mesma regra do potencial: número entra com
  // procedência. São quantidades diferentes — o que se paga hoje, o que
  // ainda pode vir — e nenhuma delas se soma à outra.
  const receita = numeroDe(formData, "receita_atual");
  const receitaOrigem = textoDe(formData, "receita_origem");
  const receitaData = textoDe(formData, "receita_data");

  return {
    documento: digitos,
    dados: {
      nome: textoDe(formData, "nome"),
      razao_social: textoDe(formData, "razao_social"),
      documento: digitos,
      segmento: textoDe(formData, "segmento"),
      relacao: String(formData.get("relacao") ?? "estrategica"),
      criticidade: String(formData.get("criticidade") ?? "media"),
      responsavel_id: textoDe(formData, "responsavel_id"),
      potencial_bruto: potencial,
      potencial_origem: potencial === null ? null : origem,
      // Sem data informada, vale hoje: estimativa precisa de referência no tempo.
      potencial_data:
        potencial === null ? null : (dataPotencial ?? new Date().toISOString().slice(0, 10)),
      receita_atual: receita,
      receita_origem: receita === null ? null : receitaOrigem,
      receita_data:
        receita === null ? null : (receitaData ?? new Date().toISOString().slice(0, 10)),
      // valor_capturado é soma dos lançamentos de captura: não se escreve aqui.
    },
    potencial,
    origem,
    receita,
    receitaOrigem,
  };
}

export async function criarConta(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const org = await exigirOrg();
  const carteiraId = String(formData.get("carteira_id") ?? "");
  const { documento, dados, potencial, origem, receita, receitaOrigem } = montarDados(formData);

  if (!dados.nome) return { erro: "Informe o nome da conta." };
  if (!carteiraId) return { erro: "Escolha a carteira desta conta." };
  if (documento && !cnpjValido(documento)) return { erro: "CNPJ inválido. Confira os dígitos." };
  if (potencial !== null && !origem) {
    return { erro: "Informe de onde veio a estimativa de potencial." };
  }
  if (receita !== null && !receitaOrigem) {
    return { erro: "Informe de onde veio a receita atual — qual base, qual extração." };
  }

  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("contas")
    .insert({ org_id: org.orgId, carteira_id: carteiraId, ...dados })
    .select("id")
    .single();

  if (error) return { erro: traduzir(error.message, error.code) };

  revalidatePath("/contas");
  redirect(`/contas/${(data as { id: string }).id}`);
}

export async function atualizarConta(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const rota = `/contas/${id}`;
  const { documento, dados, potencial, origem, receita, receitaOrigem } = montarDados(formData);

  if (!dados.nome) return { erro: "Informe o nome da conta." };
  if (documento && !cnpjValido(documento)) return { erro: "CNPJ inválido. Confira os dígitos." };
  if (potencial !== null && !origem) {
    return { erro: "Informe de onde veio a estimativa de potencial." };
  }
  if (receita !== null && !receitaOrigem) {
    return { erro: "Informe de onde veio a receita atual — qual base, qual extração." };
  }

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("contas")
    .update(
      {
        ...dados,
        status: String(formData.get("status") ?? "ativa"),
        observacoes: textoDe(formData, "observacoes"),
      },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) return { erro: traduzir(error.message, error.code) };
  if (count === 0) return { erro: "Nada foi alterado: seu perfil não permite editar esta conta." };

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Conta atualizada.")}`);
}

export async function criarContato(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const org = await exigirOrg();
  const contaId = String(formData.get("conta_id") ?? "");
  const rota = `/contas/${contaId}`;

  const nome = textoDe(formData, "nome");
  if (!nome) return { erro: "Informe o nome do contato." };

  const influenciaBruta = textoDe(formData, "influencia");
  const influencia = influenciaBruta ? Number(influenciaBruta) : null;

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("contatos").insert({
    org_id: org.orgId,
    conta_id: contaId,
    nome,
    cargo: textoDe(formData, "cargo"),
    email: textoDe(formData, "email"),
    telefone: textoDe(formData, "telefone"),
    principal: formData.get("principal") === "on",
    // Mapa de decisores: papel, postura e hierarquia. Vazio é vazio —
    // contato sem papel aparece na ficha como "falta mapear", que é
    // informação melhor que um papel chutado.
    papel_id: textoDe(formData, "papel_id"),
    postura_id: textoDe(formData, "postura_id"),
    area: textoDe(formData, "area"),
    influencia: influencia && influencia >= 1 && influencia <= 5 ? influencia : null,
    reporta_a: textoDe(formData, "reporta_a"),
  });

  if (error) return { erro: traduzir(error.message, error.code) };

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Contato incluído.")}`);
}

/**
 * Atualiza o mapa de um contato já cadastrado. Separado de criarContato
 * de propósito: quem cadastra o contato quase nunca sabe o papel na
 * decisão no mesmo minuto — o mapa se preenche depois, conversa a
 * conversa.
 */
export async function atualizarMapaContato(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  await exigirOrg();
  const contaId = String(formData.get("conta_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const rota = `/contas/${contaId}`;

  const influenciaBruta = textoDe(formData, "influencia");
  const influencia = influenciaBruta ? Number(influenciaBruta) : null;
  const reportaA = textoDe(formData, "reporta_a");

  if (reportaA === id) return { erro: "Um contato não reporta a si mesmo." };

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("contatos")
    .update({
      papel_id: textoDe(formData, "papel_id"),
      postura_id: textoDe(formData, "postura_id"),
      area: textoDe(formData, "area"),
      influencia: influencia && influencia >= 1 && influencia <= 5 ? influencia : null,
      reporta_a: reportaA,
    })
    .eq("id", id);

  if (error) return { erro: traduzir(error.message, error.code) };

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Mapa atualizado.")}`);
}

export async function excluirContato(formData: FormData) {
  await exigirOrg();
  const contaId = String(formData.get("conta_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const rota = `/contas/${contaId}`;

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("contatos")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada foi removido: seu perfil não permite excluir este contato.");

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Contato removido.")}`);
}

/**
 * Preenche os dados cadastrais a partir do CNPJ.
 *
 * O que sai daqui para fora é só o CNPJ — número público, que qualquer
 * pessoa consulta na Receita. Nada da operação atravessa: nem potencial,
 * nem captura, nem contrato, nem histórico.
 *
 * A regra de não sobrescrever vive no banco (aplicar_dados_receita), não
 * aqui: assim vale para qualquer caminho que venha a existir depois,
 * inclusive a entrada por API.
 */
export async function enriquecerPorCnpj(formData: FormData) {
  const org = await exigirOrg();
  const contaId = String(formData.get("conta_id") ?? "");
  const rota = `/contas/${contaId}`;

  const supabase = criarClienteServidor();

  const { data: conta } = await supabase
    .from("contas")
    .select("id, documento")
    .eq("id", contaId)
    .maybeSingle();

  const documento = (conta as { documento: string | null } | null)?.documento ?? "";

  if (!documento) {
    redirect(
      `${rota}?erro=${encodeURIComponent(
        "Esta conta não tem CNPJ registrado. Informe o CNPJ e tente de novo.",
      )}`,
    );
  }

  const resultado = await consultarCnpj(documento);

  // Toda consulta fica registrada, inclusive a que não deu certo: quem
  // auditar precisa poder responder o que saiu daqui.
  const registrar = (situacao: string, detalhe: string | null, campos = 0) =>
    supabase.rpc("registrar_consulta_cnpj", {
      p_org: org.orgId,
      p_conta: contaId,
      p_documento: documento,
      p_situacao: situacao,
      p_detalhe: detalhe,
      p_campos: campos,
    });

  if (resultado.situacao !== "ok") {
    await registrar(resultado.situacao, resultado.detalhe);
    redirect(`${rota}?erro=${encodeURIComponent(resultado.detalhe)}`);
  }

  const { data: preenchidos, error } = await supabase.rpc("aplicar_dados_receita", {
    p_conta: contaId,
    p_razao_social: resultado.dados.razaoSocial,
    p_segmento: resultado.dados.segmento,
    p_origem: "Receita Federal (consulta pública)",
  });

  if (error) {
    await registrar("erro", error.message);
    redirect(`${rota}?erro=${encodeURIComponent(traduzir(error.message, error.code))}`);
  }

  const quantos = Number(preenchidos ?? 0);
  await registrar("ok", null, quantos);

  revalidatePath(rota);
  redirect(
    `${rota}?ok=${encodeURIComponent(
      quantos === 0
        ? "Consulta feita. Nada foi alterado: os campos já estavam preenchidos, e o que você escreveu não é sobrescrito."
        : `${quantos} campo(s) preenchido(s) a partir do registro público.`,
    )}`,
  );
}
