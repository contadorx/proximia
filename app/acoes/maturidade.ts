"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

function texto(formData: FormData, campo: string): string | null {
  const valor = String(formData.get(campo) ?? "").trim();
  return valor === "" ? null : valor;
}

function peso(formData: FormData, campo: string): number {
  const valor = Number(String(formData.get(campo) ?? "1").replace(",", "."));
  if (Number.isNaN(valor) || valor <= 0) return 1;
  return Math.min(10, valor);
}

function traduzir(mensagem: string, codigo?: string): string {
  if (codigo === "23505" && /idx_dimensao_nome/.test(mensagem)) return "Já existe uma dimensão com esse nome.";
  if (codigo === "23505" && /idx_ciclo_nome/.test(mensagem)) return "Já existe um ciclo com esse nome.";
  if (codigo === "23505") return "Esta carteira já tem avaliação neste ciclo.";
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite essa alteração.";
  }
  return mensagem;
}

export async function criarDimensao(formData: FormData) {
  const org = await exigirOrg();
  const nome = texto(formData, "nome");
  if (!nome) comErro("/maturidade", "Informe o nome da dimensão.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("maturidade_dimensoes").insert({
    org_id: org.orgId,
    nome,
    descricao: texto(formData, "descricao"),
    peso: peso(formData, "peso"),
    ordem: Number(formData.get("ordem") ?? 0) || 0,
  });

  if (error) comErro("/maturidade", traduzir(error.message, error.code));
  revalidatePath("/maturidade");
  redirect("/maturidade");
}

export async function criarPergunta(formData: FormData) {
  const org = await exigirOrg();
  const dimensaoId = String(formData.get("dimensao_id") ?? "");
  const textoPergunta = texto(formData, "texto");

  if (!dimensaoId) comErro("/maturidade", "Escolha a dimensão da pergunta.");
  if (!textoPergunta) comErro("/maturidade", "Escreva a pergunta.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("maturidade_perguntas").insert({
    org_id: org.orgId,
    dimensao_id: dimensaoId,
    texto: textoPergunta,
    ajuda: texto(formData, "ajuda"),
    peso: peso(formData, "peso"),
    ordem: Number(formData.get("ordem") ?? 0) || 0,
  });

  if (error) comErro("/maturidade", traduzir(error.message, error.code));
  revalidatePath("/maturidade");
  redirect("/maturidade");
}

/**
 * Régua inicial genérica. Não é um modelo de setor: são as cinco dimensões
 * que qualquer operação de conta-chave tem. Serve para começar hoje e ser
 * reescrita depois — melhor do que uma tela vazia.
 */
export async function criarReguaInicial() {
  const org = await exigirOrg();
  const supabase = criarClienteServidor();

  const modelo = [
    {
      nome: "Conhecimento da carteira",
      peso: 1.5,
      perguntas: [
        "As contas relevantes estão identificadas e atualizadas?",
        "Sabemos quem decide em cada conta relevante?",
        "O histórico da relação está registrado em algum lugar acessível?",
      ],
    },
    {
      nome: "Processo comercial",
      peso: 2,
      perguntas: [
        "Existe rotina definida de acompanhamento das contas?",
        "A rotina é seguida mesmo quando o mês aperta?",
        "As oportunidades têm dono e próxima etapa claros?",
      ],
    },
    {
      nome: "Contratos e condições",
      peso: 2,
      perguntas: [
        "Os contratos vigentes estão mapeados com prazos e condições?",
        "As renegociações começam antes do vencimento?",
        "As condições concedidas têm fundamento registrado?",
      ],
    },
    {
      nome: "Dados e ferramentas",
      peso: 1,
      perguntas: [
        "As informações usadas na decisão são confiáveis?",
        "A equipe consegue obter os dados sem depender de uma pessoa?",
      ],
    },
    {
      nome: "Equipe e continuidade",
      peso: 1.5,
      perguntas: [
        "Há gente suficiente e com clareza de papel?",
        "Se alguém sair amanhã, o trabalho continua?",
      ],
    },
  ];

  for (const [i, d] of modelo.entries()) {
    const { data, error } = await supabase
      .from("maturidade_dimensoes")
      .insert({ org_id: org.orgId, nome: d.nome, peso: d.peso, ordem: i + 1 })
      .select("id")
      .single();

    if (error) {
      comErro(
        "/maturidade",
        error.code === "23505"
          ? "A régua já foi criada antes. Edite as dimensões existentes."
          : traduzir(error.message, error.code),
      );
    }

    await supabase.from("maturidade_perguntas").insert(
      d.perguntas.map((texto, j) => ({
        org_id: org.orgId,
        dimensao_id: (data as { id: string }).id,
        texto,
        ordem: j + 1,
      })),
    );
  }

  revalidatePath("/maturidade");
  redirect(`/maturidade?ok=${encodeURIComponent("Régua inicial criada. Ajuste as perguntas ao seu contexto.")}`);
}

export async function criarCiclo(formData: FormData) {
  const org = await exigirOrg();
  const nome = texto(formData, "nome");
  if (!nome) comErro("/maturidade", "Informe o nome do ciclo, como 2026-1.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("maturidade_ciclos").insert({
    org_id: org.orgId,
    nome,
    referencia: texto(formData, "referencia") ?? new Date().toISOString().slice(0, 10),
  });

  if (error) comErro("/maturidade", traduzir(error.message, error.code));
  revalidatePath("/maturidade");
  redirect("/maturidade");
}

export async function iniciarAvaliacao(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const carteiraId = String(formData.get("carteira_id") ?? "");
  const cicloId = String(formData.get("ciclo_id") ?? "");
  if (!carteiraId || !cicloId) comErro("/maturidade", "Escolha a carteira e o ciclo.");

  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("maturidade_avaliacoes")
    .insert({ org_id: org.orgId, carteira_id: carteiraId, ciclo_id: cicloId, criado_por: usuario.id })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existente } = await supabase
        .from("maturidade_avaliacoes")
        .select("id")
        .eq("carteira_id", carteiraId)
        .eq("ciclo_id", cicloId)
        .maybeSingle();
      if (existente) redirect(`/maturidade/${(existente as { id: string }).id}`);
    }
    comErro("/maturidade", traduzir(error.message, error.code));
  }

  revalidatePath("/maturidade");
  redirect(`/maturidade/${(data as { id: string }).id}`);
}

export async function salvarRespostas(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const avaliacaoId = String(formData.get("avaliacao_id") ?? "");
  const rota = `/maturidade/${avaliacaoId}`;
  const supabase = criarClienteServidor();

  const linhas: {
    org_id: string;
    avaliacao_id: string;
    pergunta_id: string;
    nota: number;
    observacao: string | null;
    criado_por: string;
  }[] = [];

  for (const [chave, valor] of formData.entries()) {
    if (!chave.startsWith("nota_")) continue;
    const bruto = String(valor);
    if (bruto === "") continue; // sem resposta fica fora da conta

    const perguntaId = chave.slice(5);
    linhas.push({
      org_id: org.orgId,
      avaliacao_id: avaliacaoId,
      pergunta_id: perguntaId,
      nota: Number(bruto),
      observacao: texto(formData, `obs_${perguntaId}`),
      criado_por: usuario.id,
    });
  }

  if (linhas.length > 0) {
    const { error } = await supabase
      .from("maturidade_respostas")
      .upsert(linhas, { onConflict: "avaliacao_id,pergunta_id" });
    if (error) comErro(rota, traduzir(error.message, error.code));
  }

  await supabase
    .from("maturidade_avaliacoes")
    .update({ observacoes: texto(formData, "observacoes") })
    .eq("id", avaliacaoId);

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Respostas salvas.")}`);
}

export async function concluirAvaliacao(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const rota = `/maturidade/${id}`;

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("maturidade_avaliacoes")
    .update({ status: "concluida" })
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  revalidatePath("/maturidade");
  redirect(`${rota}?ok=${encodeURIComponent("Avaliação concluída. O score foi para a carteira.")}`);
}

export async function reabrirAvaliacao(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const rota = `/maturidade/${id}`;

  const supabase = criarClienteServidor();
  await supabase.from("maturidade_avaliacoes").update({ status: "rascunho" }).eq("id", id);

  revalidatePath(rota);
  redirect(rota);
}
