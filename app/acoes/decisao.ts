"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";
import type { EstadoAcao } from "@/lib/formulario";

/**
 * Catálogo de decisão — papéis e posturas.
 *
 * O produto nunca lê o rótulo que o assinante escreve aqui: lê a
 * propriedade estrutural ao lado dele (`decide` no papel, `tom` na
 * postura). É o que permite calcular os avisos de mapa sem o produto
 * saber o vocabulário do setor de ninguém.
 */

const ROTA = "/configuracoes/decisao";

function texto(formData: FormData, campo: string): string | null {
  const valor = String(formData.get(campo) ?? "").trim();
  return valor === "" ? null : valor;
}

function traduzir(mensagem: string, codigo?: string): string {
  if (codigo === "23505" || /duplicate key/i.test(mensagem)) {
    return "Já existe um item com esse nome.";
  }
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite alterar o catálogo desta organização.";
  }
  return mensagem;
}

export async function criarPapelDecisao(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const org = await exigirOrg();

  const rotulo = texto(formData, "rotulo");
  if (!rotulo) return { erro: "Dê um nome ao papel." };

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("contato_papeis").insert({
    org_id: org.orgId,
    rotulo,
    descricao: texto(formData, "descricao"),
    decide: formData.get("decide") === "on",
    ordem: Number(formData.get("ordem") ?? 0) || 0,
  });

  if (error) return { erro: traduzir(error.message, error.code) };

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Papel criado.")}`);
}

export async function criarPosturaContato(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const org = await exigirOrg();

  const rotulo = texto(formData, "rotulo");
  if (!rotulo) return { erro: "Dê um nome à postura." };

  const tom = String(formData.get("tom") ?? "neutro");
  if (!["favoravel", "neutro", "contrario"].includes(tom)) {
    return { erro: "Escolha se esta postura é a favor, neutra ou contra." };
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("contato_posturas").insert({
    org_id: org.orgId,
    rotulo,
    descricao: texto(formData, "descricao"),
    tom,
    ordem: Number(formData.get("ordem") ?? 0) || 0,
  });

  if (error) return { erro: traduzir(error.message, error.code) };

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Postura criada.")}`);
}

/**
 * Desativa em vez de excluir quando o item já está em uso: contato
 * apontando para papel apagado perderia a informação. Desativado some dos
 * seletores e continua explicando o que já foi classificado.
 */
export async function alternarItemDecisao(formData: FormData) {
  await exigirOrg();
  const tabela = String(formData.get("tabela") ?? "");
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "1";

  if (!["contato_papeis", "contato_posturas"].includes(tabela)) {
    redirect(`${ROTA}?erro=${encodeURIComponent("Catálogo desconhecido.")}`);
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase.from(tabela).update({ ativo: !ativo }).eq("id", id);

  if (error) redirect(`${ROTA}?erro=${encodeURIComponent(traduzir(error.message, error.code))}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent(ativo ? "Item desativado." : "Item reativado.")}`);
}

/** Cria os valores iniciais sugeridos. Roda uma vez; repetir não duplica. */
export async function semearCatalogoDecisao() {
  const org = await exigirOrg();
  const supabase = criarClienteServidor();
  const { error } = await supabase.rpc("garantir_catalogo_decisao", { p_org: org.orgId });

  if (error) redirect(`${ROTA}?erro=${encodeURIComponent(traduzir(error.message, error.code))}`);

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?ok=${encodeURIComponent("Sugestões criadas. Renomeie, desative ou acrescente o que sua operação usa.")}`,
  );
}
