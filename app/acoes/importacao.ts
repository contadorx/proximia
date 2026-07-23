"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";
import { lerCsv } from "@/lib/csv";
import { MODELOS, validar, type Referencias, type TipoImportacao } from "@/lib/importacao";
import { gravarLinhas, referenciasDaOrg } from "@/lib/gravacao";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}


export async function conferirArquivo(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const tipo = String(formData.get("tipo") ?? "") as TipoImportacao;
  if (!MODELOS[tipo]) comErro("/importacao", "Escolha o que está sendo importado.");

  const arquivo = formData.get("arquivo") as File | null;
  const colado = String(formData.get("colado") ?? "").trim();

  let conteudo = colado;
  let nome = "texto colado";

  if (arquivo && arquivo.size > 0) {
    if (arquivo.size > 2_000_000) {
      comErro("/importacao", "Arquivo acima de 2 MB. Divida a carga em partes menores.");
    }
    conteudo = await arquivo.text();
    nome = arquivo.name;
  }

  if (!conteudo) comErro("/importacao", "Envie um arquivo CSV ou cole o conteúdo.");

  const { cabecalho, linhas } = lerCsv(conteudo);
  if (linhas.length === 0) {
    comErro("/importacao", "Não encontrei nenhuma linha além do cabeçalho.");
  }

  const obrigatorias = MODELOS[tipo].colunas.filter((c) => c.obrigatoria).map((c) => c.chave);
  const faltando = obrigatorias.filter((c) => !cabecalho.includes(c));
  if (faltando.length > 0) {
    comErro(
      "/importacao",
      `Faltam colunas obrigatórias no cabeçalho: ${faltando.join(", ")}. Baixe o modelo e confira.`,
    );
  }

  const supabase = criarClienteServidor();
  const refs = await referenciasDaOrg(supabase, org.orgId);
  const { validas, erros } = validar(tipo, linhas, refs);

  const { data, error } = await supabase
    .from("importacoes")
    .insert({
      org_id: org.orgId,
      tipo,
      arquivo_nome: nome,
      status: "conferida",
      linhas_total: linhas.length,
      linhas_ok: validas.length,
      linhas_erro: erros.length,
      payload: validas,
      relatorio: erros,
      criado_por: usuario.id,
    })
    .select("id")
    .single();

  if (error) comErro("/importacao", error.message);

  revalidatePath("/importacao");
  redirect(`/importacao/${(data as { id: string }).id}`);
}

export async function confirmarImportacao(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();
  const id = String(formData.get("id") ?? "");
  const rota = `/importacao/${id}`;

  const supabase = criarClienteServidor();
  const { data: registro } = await supabase
    .from("importacoes")
    .select("id, tipo, status, payload")
    .eq("id", id)
    .maybeSingle();

  if (!registro) comErro("/importacao", "Importação não encontrada.");
  const imp = registro as { tipo: TipoImportacao; status: string; payload: Record<string, unknown>[] };

  if (imp.status !== "conferida") comErro(rota, "Esta importação já foi concluída ou descartada.");
  if (!imp.payload?.length) comErro(rota, "Nenhuma linha válida para gravar.");

  // A gravação vive em lib/gravacao.ts porque a porta de entrada por API
  // grava exatamente o mesmo. Duas implementações do mesmo comportamento
  // divergem em silêncio: uma ganha correção, a outra não.
  const resultado = await gravarLinhas(supabase, {
    orgId: org.orgId,
    tipo: imp.tipo,
    linhas: imp.payload,
    autorId: usuario.id,
  });

  if (resultado.erro) {
    await supabase
      .from("importacoes")
      .update({ linhas_gravadas: resultado.gravadas })
      .eq("id", id);
    comErro(rota, resultado.erro);
  }

  await supabase
    .from("importacoes")
    .update({
      status: "concluida",
      linhas_gravadas: resultado.gravadas,
      concluido_em: new Date().toISOString(),
    })
    .eq("id", id);

  if (imp.tipo === "maturidade") {
    revalidatePath("/maturidade");
    redirect(`/maturidade?ok=${encodeURIComponent(resultado.detalhe ?? "Carga concluída.")}`);
  }

  revalidatePath("/importacao");
  redirect(`${rota}?ok=${encodeURIComponent(resultado.detalhe ?? "Carga concluída.")}`);
}

export async function descartarImportacao(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");

  const supabase = criarClienteServidor();
  await supabase.from("importacoes").update({ status: "descartada" }).eq("id", id);

  revalidatePath("/importacao");
  redirect("/importacao");
}
