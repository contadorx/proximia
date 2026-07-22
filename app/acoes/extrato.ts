"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";
import { acharPeriodo } from "@/lib/periodo";
import { htmlExtrato, montarExtrato } from "@/lib/extrato";
import { enviarEmail } from "@/lib/email";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

export async function salvarCadencia(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const rota = `/carteiras/${id}`;

  const cadencia = String(formData.get("cadencia_extrato") ?? "nenhuma");
  const dia = Math.min(28, Math.max(1, Number(formData.get("extrato_dia") ?? 1) || 1));

  const destinatarios = String(formData.get("destinatarios") ?? "")
    .split(/[\n,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));

  if (cadencia !== "nenhuma" && destinatarios.length === 0) {
    comErro(rota, "Informe ao menos um e-mail para receber o extrato.");
  }

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("carteiras")
    .update(
      {
        cadencia_extrato: cadencia,
        extrato_dia: dia,
        extrato_destinatarios: destinatarios,
      },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) comErro(rota, error.message);
  if (count === 0) comErro(rota, "Seu perfil não permite alterar esta carteira.");

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Cadência do extrato atualizada.")}`);
}

export async function enviarExtratoAgora(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const id = String(formData.get("id") ?? "");
  const rota = `/carteiras/${id}`;
  const periodo = acharPeriodo(String(formData.get("periodo") ?? "mes"));

  const supabase = criarClienteServidor();

  const { data: carteira } = await supabase
    .from("carteiras")
    .select("nome, extrato_destinatarios")
    .eq("id", id)
    .maybeSingle();

  if (!carteira) comErro(rota, "Carteira não encontrada.");

  const informados = String(formData.get("destinatarios") ?? "")
    .split(/[\n,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));

  const destinatarios = informados.length
    ? informados
    : ((carteira as { extrato_destinatarios: string[] }).extrato_destinatarios ?? []);

  if (destinatarios.length === 0) {
    comErro(rota, "Nenhum destinatário: informe os e-mails na configuração do extrato.");
  }

  const dados = await montarExtrato(supabase, org.orgId, id, {
    inicio: periodo.inicio,
    fim: periodo.fim,
  });
  if (!dados) comErro(rota, "Não foi possível montar o extrato.");

  const assunto = `${dados.carteira.nome} — situação da carteira (${periodo.rotulo.toLowerCase()})`;
  const resultado = await enviarEmail({
    para: destinatarios,
    assunto,
    html: htmlExtrato(dados),
  });

  await supabase.from("envios").insert({
    org_id: org.orgId,
    carteira_id: id,
    origem: "manual",
    destinatarios,
    periodo_inicio: periodo.inicio,
    periodo_fim: periodo.fim,
    assunto,
    status: resultado.status,
    detalhe: resultado.detalhe,
    criado_por: usuario.id,
  });

  revalidatePath(rota);

  const mensagem =
    resultado.status === "enviado"
      ? `Extrato enviado para ${destinatarios.length} destinatário(s).`
      : resultado.status === "simulado"
        ? "Envio simulado: o provedor de e-mail ainda não está configurado. O registro ficou no histórico."
        : `O envio falhou: ${resultado.detalhe}`;

  redirect(
    `${rota}?${resultado.status === "falhou" ? "erro" : "ok"}=${encodeURIComponent(mensagem)}`,
  );
}
