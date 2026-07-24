"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";

function traduzir(mensagem: string, codigo?: string): string {
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite planejar nesta carteira.";
  }
  if (/length\(btrim\(acao\)\)/i.test(mensagem)) return "Escreva o que será feito.";
  return mensagem;
}

/**
 * Cria um item de plano a partir de uma lacuna do diagnóstico.
 *
 * O item nasce junto com um compromisso na carteira — plano que mora só
 * em tela de plano não é acompanhado por ninguém.
 */
export async function criarItemPlano(formData: FormData) {
  await exigirOrg();

  const avaliacao = String(formData.get("avaliacao_id") ?? "");
  const pergunta = String(formData.get("pergunta_id") ?? "");
  const acao = String(formData.get("acao") ?? "").trim();
  const dono = String(formData.get("dono_id") ?? "") || null;
  const prazo = String(formData.get("prazo") ?? "") || null;
  const rota = `/maturidade/${avaliacao}`;

  if (!acao) {
    redirect(`${rota}?erro=${encodeURIComponent("Escreva o que será feito.")}`);
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase.rpc("criar_item_plano", {
    p_avaliacao: avaliacao,
    p_pergunta: pergunta,
    p_acao: acao,
    p_dono: dono,
    p_prazo: prazo,
  });

  if (error) {
    redirect(`${rota}?erro=${encodeURIComponent(traduzir(error.message, error.code))}`);
  }

  revalidatePath(rota);
  revalidatePath("/pendencias");
  redirect(
    `${rota}?ok=${encodeURIComponent(
      "Item incluído no plano e compromisso criado na carteira — ele aparece em Pendências.",
    )}`,
  );
}
