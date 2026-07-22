"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";
import { enviarEmail } from "@/lib/email";
import { rotuloPapel, type Papel } from "@/lib/tipos";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

function enderecoBase(): string {
  const cabecalhos = headers();
  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host") ?? "localhost:3000";
  const protocolo = host.startsWith("localhost") ? "http" : "https";
  return `${protocolo}://${host}`;
}

export async function convidarPessoa(formData: FormData) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const papel = String(formData.get("papel") ?? "analista") as Papel;

  if (!email.includes("@")) comErro("/configuracoes", "Informe um e-mail válido.");

  const supabase = criarClienteServidor();

  // Convite pendente para o mesmo e-mail é substituído: o link antigo
  // deixa de valer e a pessoa recebe um novo, com prazo novo.
  await supabase
    .from("convites")
    .update({ status: "cancelado" })
    .eq("org_id", org.orgId)
    .eq("email", email)
    .eq("status", "pendente");

  const { data, error } = await supabase
    .from("convites")
    .insert({ org_id: org.orgId, email, papel, criado_por: usuario.id })
    .select("token")
    .single();

  if (error) comErro("/configuracoes", error.message);

  const link = `${enderecoBase()}/convite/${(data as { token: string }).token}`;

  const envio = await enviarEmail({
    para: [email],
    assunto: `Convite para acompanhar ${org.nome} no Proximia`,
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f6f8fa;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">
        <tr><td style="padding:30px 32px;font:400 14px/1.6 Arial,sans-serif;color:#1b2a4a;">
          <p style="margin:0 0 16px;font:700 18px/1.3 Arial,sans-serif;">Você foi convidado para ${org.nome}</p>
          <p style="margin:0 0 20px;color:#64748b;">
            O acesso é como <strong>${rotuloPapel(papel).toLowerCase()}</strong>. O convite vale por 14 dias
            e só funciona para este endereço de e-mail.
          </p>
          <p style="margin:0 0 22px;">
            <a href="${link}" style="display:inline-block;background:#1c9d68;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:700;">Aceitar convite</a>
          </p>
          <p style="margin:0;color:#94a3b8;font-size:12px;">
            Se o botão não funcionar, copie este endereço: ${link}
          </p>
        </td></tr>
      </table></body></html>`,
  });

  revalidatePath("/configuracoes");

  const mensagem =
    envio.status === "enviado"
      ? `Convite enviado para ${email}.`
      : envio.status === "simulado"
        ? `Convite criado, mas o provedor de e-mail não está configurado. Envie o link manualmente: ${link}`
        : `Convite criado, mas o envio falhou (${envio.detalhe}). Link: ${link}`;

  redirect(`/configuracoes?ok=${encodeURIComponent(mensagem)}`);
}

export async function cancelarConvite(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("convites").update({ status: "cancelado" }).eq("id", id);
  if (error) comErro("/configuracoes", error.message);

  revalidatePath("/configuracoes");
  redirect(`/configuracoes?ok=${encodeURIComponent("Convite cancelado.")}`);
}

export async function aceitarConvite(formData: FormData) {
  await exigirUsuario();
  const token = String(formData.get("token") ?? "");

  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("aceitar_convite", { p_token: token });

  if (error) comErro(`/convite/${token}`, error.message);

  const resultado = (data as { organizacao_id: string; organizacao_nome: string }[] | null)?.[0];
  revalidatePath("/organizacoes");
  redirect(
    `/organizacoes?ok=${encodeURIComponent(
      resultado ? `Você agora tem acesso a ${resultado.organizacao_nome}.` : "Convite aceito.",
    )}`,
  );
}
