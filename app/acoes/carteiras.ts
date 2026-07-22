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

function traduzir(mensagem: string, codigo?: string): string {
  if (codigo === "23505" || /duplicate key/i.test(mensagem)) {
    return "Já existe uma carteira com esse código nesta organização.";
  }
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite essa alteração.";
  }
  if (/score_maturidade/i.test(mensagem)) {
    return "O score precisa ficar entre 0 e 100.";
  }
  return mensagem;
}

export async function criarCarteira(formData: FormData) {
  const org = await exigirOrg();

  const nome = texto(formData, "nome");
  if (!nome) comErro("/carteiras", "Informe o nome da carteira.");

  const scoreBruto = texto(formData, "score_maturidade");
  const score = scoreBruto === null ? null : Number(scoreBruto.replace(",", "."));
  if (score !== null && (Number.isNaN(score) || score < 0 || score > 100)) {
    comErro("/carteiras", "O score precisa ser um número entre 0 e 100.");
  }

  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("carteiras")
    .insert({
      org_id: org.orgId,
      nome,
      codigo: texto(formData, "codigo"),
      regiao: texto(formData, "regiao"),
      responsavel_id: texto(formData, "responsavel_id"),
      score_maturidade: score,
      score_ciclo: texto(formData, "score_ciclo"),
    })
    .select("id")
    .single();

  if (error) comErro("/carteiras", traduzir(error.message, error.code));

  revalidatePath("/carteiras");
  redirect(`/carteiras/${(data as { id: string }).id}`);
}

export async function atualizarCarteira(formData: FormData) {
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const rota = `/carteiras/${id}`;

  const nome = texto(formData, "nome");
  if (!nome) comErro(rota, "Informe o nome da carteira.");

  const scoreBruto = texto(formData, "score_maturidade");
  const score = scoreBruto === null ? null : Number(scoreBruto.replace(",", "."));
  if (score !== null && (Number.isNaN(score) || score < 0 || score > 100)) {
    comErro(rota, "O score precisa ser um número entre 0 e 100.");
  }

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("carteiras")
    .update(
      {
        nome,
        codigo: texto(formData, "codigo"),
        regiao: texto(formData, "regiao"),
        status: String(formData.get("status") ?? "ativa"),
        responsavel_id: texto(formData, "responsavel_id"),
        score_maturidade: score,
        score_ciclo: texto(formData, "score_ciclo"),
        observacoes: texto(formData, "observacoes"),
      },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada foi alterado: seu perfil não permite editar esta carteira.");

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Carteira atualizada.")}`);
}

export async function vincularPessoaCarteira(formData: FormData) {
  const org = await exigirOrg();

  const carteiraId = String(formData.get("carteira_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  const rota = `/carteiras/${carteiraId}`;

  if (!userId) comErro(rota, "Escolha a pessoa que vai acompanhar esta carteira.");

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("carteira_membros")
    .insert({ org_id: org.orgId, carteira_id: carteiraId, user_id: userId });

  if (error && error.code !== "23505") comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Pessoa vinculada à carteira.")}`);
}

export async function desvincularPessoaCarteira(formData: FormData) {
  await exigirOrg();

  const carteiraId = String(formData.get("carteira_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  const rota = `/carteiras/${carteiraId}`;

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("carteira_membros")
    .delete()
    .eq("carteira_id", carteiraId)
    .eq("user_id", userId);

  if (error) comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Vínculo removido.")}`);
}
