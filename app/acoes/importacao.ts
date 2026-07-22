"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";
import { lerCsv } from "@/lib/csv";
import { MODELOS, tabelaDestino, validar, type Referencias, type TipoImportacao } from "@/lib/importacao";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

async function referencias(orgId: string): Promise<Referencias> {
  const supabase = criarClienteServidor();
  const [{ data: carteiras }, { data: contas }] = await Promise.all([
    supabase.from("carteiras").select("id, nome, codigo").eq("org_id", orgId),
    supabase.from("contas").select("id, nome, carteira_id").eq("org_id", orgId),
  ]);
  return {
    carteiras: (carteiras ?? []) as Referencias["carteiras"],
    contas: (contas ?? []) as Referencias["contas"],
  };
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

  const refs = await referencias(org.orgId);
  const { validas, erros } = validar(tipo, linhas, refs);

  const supabase = criarClienteServidor();
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

  const linhas = imp.payload.map((l) => ({
    ...l,
    org_id: org.orgId,
    criado_por: usuario.id,
  }));

  // Grava em blocos: um erro no meio não deixa metade da carga sem
  // registro do que entrou.
  let gravadas = 0;
  const tamanho = 100;
  for (let i = 0; i < linhas.length; i += tamanho) {
    const bloco = linhas.slice(i, i + tamanho);
    const { error } = await supabase.from(tabelaDestino(imp.tipo)).insert(bloco);
    if (error) {
      await supabase
        .from("importacoes")
        .update({ linhas_gravadas: gravadas })
        .eq("id", id);
      comErro(
        rota,
        `Gravadas ${gravadas} linhas e a carga parou: ${error.message}. Corrija e envie o restante.`,
      );
    }
    gravadas += bloco.length;
  }

  await supabase
    .from("importacoes")
    .update({
      status: "concluida",
      linhas_gravadas: gravadas,
      concluido_em: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/importacao");
  redirect(`${rota}?ok=${encodeURIComponent(`${gravadas} registro(s) gravado(s).`)}`);
}

export async function descartarImportacao(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");

  const supabase = criarClienteServidor();
  await supabase.from("importacoes").update({ status: "descartada" }).eq("id", id);

  revalidatePath("/importacao");
  redirect("/importacao");
}
