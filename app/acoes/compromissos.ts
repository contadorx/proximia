"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";
import { inteiroDe, textoDe, type EstadoAcao } from "@/lib/formulario";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

function traduzir(mensagem: string, codigo?: string): string {
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite essa alteração nesta carteira.";
  }
  return mensagem;
}

const TABELA_DO_ALVO: Record<string, string> = {
  conta: "contas",
  contrato: "contratos",
  frente: "frentes",
  oportunidade: "oportunidades",
};

export async function criarCompromisso(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();
  const rota = String(formData.get("volta") ?? "/compromissos");

  const titulo = textoDe(formData, "titulo");
  const venceEm = textoDe(formData, "vence_em");

  // A entidade chega como "tipo:id" num campo só. Dois seletores
  // dependentes seriam pior: o segundo teria de recarregar quando o
  // primeiro muda, e a pessoa erraria a combinação.
  const alvo = textoDe(formData, "alvo");
  const [tipoAlvo, idAlvo] = alvo ? alvo.split(":") : [];

  let carteiraId = String(formData.get("carteira_id") ?? "");

  if (!titulo) return { erro: "Diga o que precisa ser feito." };
  if (!venceEm) return { erro: "Informe a data. Compromisso sem data não é compromisso." };

  const supabase = criarClienteServidor();

  // A carteira vem do alvo, não da escolha solta no formulário: um
  // compromisso sobre a conta X não pode nascer preso à carteira Y —
  // alertas e responsabilidade herdariam o endereço errado.
  if (tipoAlvo === "carteira" && idAlvo) {
    carteiraId = idAlvo;
  } else if (tipoAlvo && idAlvo && TABELA_DO_ALVO[tipoAlvo]) {
    const { data: dono } = await supabase
      .from(TABELA_DO_ALVO[tipoAlvo])
      .select("carteira_id")
      .eq("id", idAlvo)
      .maybeSingle();
    if (!dono) return { erro: "O registro escolhido não foi encontrado ou está fora do seu alcance." };
    carteiraId = (dono as { carteira_id: string }).carteira_id;
  }

  if (!carteiraId) return { erro: "Escolha a carteira." };

  const { error } = await supabase.from("compromissos").insert({
    org_id: org.orgId,
    carteira_id: carteiraId,
    entidade_tipo: tipoAlvo ?? String(formData.get("entidade_tipo") ?? "carteira"),
    entidade_id: idAlvo ?? String(formData.get("entidade_id") ?? carteiraId),
    titulo,
    descricao: textoDe(formData, "descricao"),
    vence_em: venceEm,
    dono_id: textoDe(formData, "dono_id") ?? usuario.id,
    // Zero é pedido legítimo: avisar só no dia. `|| 7` engolia o zero.
    alerta_dias: inteiroDe(formData, "alerta_dias", 7, 0, 365),
    origem: "manual",
    criado_por: usuario.id,
  });

  if (error) return { erro: traduzir(error.message, error.code) };

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Compromisso registrado.")}`);
}

export async function mudarStatusCompromisso(formData: FormData) {
  const usuario = await exigirUsuario();
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "concluido");
  const rota = String(formData.get("volta") ?? "/compromissos");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("compromissos")
    .update(
      {
        status,
        concluido_em: status === "concluido" ? new Date().toISOString().slice(0, 10) : null,
        concluido_por: status === "concluido" ? usuario.id : null,
      },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada mudou: seu perfil não permite alterar este compromisso.");

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Compromisso atualizado.")}`);
}

export async function gerarCompromissosPendentes() {
  const org = await exigirOrg();

  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("gerar_compromissos_pendentes", { p_org: org.orgId });

  if (error) comErro("/compromissos", traduzir(error.message, error.code));

  const criados = Number(data ?? 0);
  revalidatePath("/compromissos");
  redirect(
    `/compromissos?ok=${encodeURIComponent(
      criados === 0
        ? "Nada a gerar: todos os contratos e cláusulas já têm compromisso."
        : `${criados} compromisso(s) criado(s) a partir dos contratos e cláusulas.`,
    )}`,
  );
}


/** Troca quem responde por um compromisso. */
export async function reatribuirCompromisso(formData: FormData) {
  await exigirOrg();

  const id = String(formData.get("id") ?? "");
  const dono = String(formData.get("dono_id") ?? "");
  const volta = String(formData.get("volta") ?? "/compromissos");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("compromissos")
    .update({ dono_id: dono || null }, { count: "exact" })
    .eq("id", id);

  if (error) comErro(volta, traduzir(error.message, error.code));
  if (count === 0) comErro(volta, "Seu perfil não permite alterar este compromisso.");

  revalidatePath(volta);
  redirect(`${volta}?ok=${encodeURIComponent("Compromisso reatribuído.")}`);
}

/**
 * Distribui os que estão sem dono, pela mesma cadeia dos alertas.
 * Não mexe em quem já tem: decisão de pessoa não é desfeita por varredura.
 */
export async function distribuirCompromissos() {
  const org = await exigirOrg();

  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("atribuir_compromissos", { p_org: org.orgId });

  if (error) comErro("/compromissos", traduzir(error.message, error.code));

  const n = Number(data ?? 0);
  revalidatePath("/compromissos");
  redirect(
    `/compromissos?ok=${encodeURIComponent(
      n > 0
        ? `${n} compromisso(s) ganharam responsável.`
        : "Nenhum compromisso sem responsável — ou não há quem responder pelas carteiras deles.",
    )}`,
  );
}
