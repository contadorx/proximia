"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";
import { textoDe, type EstadoAcao } from "@/lib/formulario";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
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

function lerScore(formData: FormData): { score: number | null; erro?: string } {
  const bruto = textoDe(formData, "score_maturidade");
  if (bruto === null) return { score: null };
  const score = Number(bruto.replace(",", "."));
  if (Number.isNaN(score) || score < 0 || score > 100) {
    return { score: null, erro: "O score precisa ser um número entre 0 e 100." };
  }
  return { score };
}

export async function criarCarteira(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const org = await exigirOrg();

  const nome = textoDe(formData, "nome");
  if (!nome) return { erro: "Informe o nome da carteira." };

  const { score, erro } = lerScore(formData);
  if (erro) return { erro };

  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("carteiras")
    .insert({
      org_id: org.orgId,
      nome,
      codigo: textoDe(formData, "codigo"),
      regiao: textoDe(formData, "regiao"),
      responsavel_id: textoDe(formData, "responsavel_id"),
      score_maturidade: score,
      score_ciclo: textoDe(formData, "score_ciclo"),
    })
    .select("id")
    .single();

  if (error) return { erro: traduzir(error.message, error.code) };

  revalidatePath("/carteiras");
  redirect(`/carteiras/${(data as { id: string }).id}`);
}

export async function atualizarCarteira(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const rota = `/carteiras/${id}`;

  const nome = textoDe(formData, "nome");
  if (!nome) return { erro: "Informe o nome da carteira." };

  const { score, erro } = lerScore(formData);
  if (erro) return { erro };

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("carteiras")
    .update(
      {
        nome,
        codigo: textoDe(formData, "codigo"),
        regiao: textoDe(formData, "regiao"),
        status: String(formData.get("status") ?? "ativa"),
        responsavel_id: textoDe(formData, "responsavel_id"),
        score_maturidade: score,
        score_ciclo: textoDe(formData, "score_ciclo"),
        observacoes: textoDe(formData, "observacoes"),
      },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) return { erro: traduzir(error.message, error.code) };
  if (count === 0) return { erro: "Nada foi alterado: seu perfil não permite editar esta carteira." };

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
  const { error, count } = await supabase
    .from("carteira_membros")
    .delete({ count: "exact" })
    .eq("carteira_id", carteiraId)
    .eq("user_id", userId);

  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada foi removido: seu perfil não permite alterar este vínculo.");

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Vínculo removido.")}`);
}
