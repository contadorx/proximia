"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";

const ROTA = "/configuracoes/cuidado";

/** Mensagem de banco em português de gente. Cada arquivo de ação tem a
 *  sua, como o resto do projeto — o vocabulário muda com o contexto. */
function traduzir(mensagem: string, codigo?: string): string {
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite ajustar a régua desta organização.";
  }
  if (/conta_criterios_peso_check/i.test(mensagem)) return "O peso precisa ser de 1 a 5.";
  return mensagem;
}

/** Cria a régua sugerida. Sugestão: tudo aqui é ajustável depois. */
export async function semearRegua() {
  const org = await exigirOrg();
  const supabase = criarClienteServidor();
  const { error } = await supabase.rpc("garantir_criterios_conta", { p_org: org.orgId });

  if (error) redirect(`${ROTA}?erro=${encodeURIComponent(traduzir(error.message, error.code))}`);

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?ok=${encodeURIComponent(
      "Régua sugerida criada. Ajuste os pesos e desligue o que não fizer sentido para a sua operação.",
    )}`,
  );
}

/**
 * Salva a régua inteira de uma vez.
 *
 * Um formulário só, com todos os critérios, em vez de salvar item a item:
 * ajustar peso é comparação — mexer num muda o significado dos outros —,
 * e salvar de um em um forçaria a pessoa a raciocinar em pedaços.
 */
export async function salvarRegua(formData: FormData) {
  const org = await exigirOrg();
  const supabase = criarClienteServidor();

  const ids = formData.getAll("id").map(String);
  const erros: string[] = [];

  for (const id of ids) {
    const peso = Number(formData.get(`peso_${id}`) ?? 1);
    const ativo = formData.get(`ativo_${id}`) === "on";
    const parametroBruto = formData.get(`parametro_${id}`);
    const parametro =
      parametroBruto === null || String(parametroBruto).trim() === ""
        ? null
        : Number(parametroBruto);

    if (!Number.isFinite(peso) || peso < 1 || peso > 5) {
      erros.push("Peso deve ser de 1 a 5.");
      continue;
    }
    if (parametro !== null && (!Number.isFinite(parametro) || parametro < 1)) {
      erros.push("O período em dias precisa ser um número positivo.");
      continue;
    }

    const { error } = await supabase
      .from("conta_criterios")
      .update({ peso, ativo, parametro })
      .eq("id", id)
      .eq("org_id", org.orgId);

    if (error) erros.push(traduzir(error.message, error.code));
  }

  if (erros.length > 0) {
    redirect(`${ROTA}?erro=${encodeURIComponent(erros[0])}`);
  }

  revalidatePath(ROTA);
  revalidatePath("/contas");
  redirect(`${ROTA}?ok=${encodeURIComponent("Régua salva. O índice de todas as contas já reflete o ajuste.")}`);
}
