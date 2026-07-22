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
  const [{ data: carteiras }, { data: contas }, { data: perguntas }, { data: ciclos }] =
    await Promise.all([
      supabase.from("carteiras").select("id, nome, codigo").eq("org_id", orgId),
      supabase.from("contas").select("id, nome, carteira_id").eq("org_id", orgId),
      supabase
        .from("maturidade_perguntas")
        .select("id, texto, dimensao_id")
        .eq("org_id", orgId)
        .eq("ativo", true),
      supabase.from("maturidade_ciclos").select("id, nome").eq("org_id", orgId),
    ]);

  return {
    carteiras: (carteiras ?? []) as Referencias["carteiras"],
    contas: (contas ?? []) as Referencias["contas"],
    perguntas: ((perguntas ?? []) as { id: string; texto: string; dimensao_id: string }[]).map(
      (p) => ({ id: p.id, texto: p.texto, dimensao: p.dimensao_id }),
    ),
    ciclos: (ciclos ?? []) as Referencias["ciclos"],
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

  // Maturidade não é uma linha por registro: cada resposta precisa de uma
  // avaliação da carteira naquele ciclo. Criamos as que faltam antes,
  // senão a resposta não tem onde pendurar.
  if (imp.tipo === "maturidade") {
    const combinacoes = new Map<string, { carteira_id: string; ciclo_id: string }>();
    for (const l of imp.payload) {
      const chave = `${l.carteira_id}:${l.ciclo_id}`;
      if (!combinacoes.has(chave)) {
        combinacoes.set(chave, {
          carteira_id: String(l.carteira_id),
          ciclo_id: String(l.ciclo_id),
        });
      }
    }

    const { error: erroAval } = await supabase.from("maturidade_avaliacoes").upsert(
      [...combinacoes.values()].map((c) => ({
        org_id: org.orgId,
        carteira_id: c.carteira_id,
        ciclo_id: c.ciclo_id,
        observacoes: "Carga por importação.",
        criado_por: usuario.id,
      })),
      { onConflict: "carteira_id,ciclo_id", ignoreDuplicates: true },
    );

    if (erroAval) comErro(rota, `Não foi possível preparar as avaliações: ${erroAval.message}`);

    const { data: avaliacoes } = await supabase
      .from("maturidade_avaliacoes")
      .select("id, carteira_id, ciclo_id")
      .eq("org_id", org.orgId);

    const porChave = new Map(
      ((avaliacoes ?? []) as { id: string; carteira_id: string; ciclo_id: string }[]).map((a) => [
        `${a.carteira_id}:${a.ciclo_id}`,
        a.id,
      ]),
    );

    const respostas = imp.payload.map((l) => ({
      org_id: org.orgId,
      avaliacao_id: porChave.get(`${l.carteira_id}:${l.ciclo_id}`),
      pergunta_id: l.pergunta_id,
      nota: l.nota,
      observacao: l.observacao ?? null,
      criado_por: usuario.id,
    }));

    const { error: erroResp } = await supabase
      .from("maturidade_respostas")
      .upsert(respostas, { onConflict: "avaliacao_id,pergunta_id" });

    if (erroResp) comErro(rota, `Não foi possível gravar as respostas: ${erroResp.message}`);

    await supabase
      .from("importacoes")
      .update({ status: "concluida", linhas_gravadas: respostas.length })
      .eq("id", id);

    revalidatePath("/maturidade");
    redirect(
      `/maturidade?ok=${encodeURIComponent(
        `${respostas.length} respostas gravadas em ${combinacoes.size} avaliação(ões). Conclua cada uma para publicar o score.`,
      )}`,
    );
  }

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
