"use server";

import { redirect } from "next/navigation";
import { exigirOrg, exigirUsuario, podeAdministrar } from "@/lib/auth";
import { enviarEmail, provedorConfigurado } from "@/lib/email";

const ROTA = "/configuracoes";

/**
 * Envio de teste do e-mail transacional. Vai para o e-mail de quem
 * clicou — provar que a Brevo entrega é pré-requisito para confiar nos
 * convites, extratos e resumos que saem sozinhos.
 */
export async function enviarEmailTeste() {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  if (!podeAdministrar(org.papel)) {
    redirect(`${ROTA}?erro=${encodeURIComponent("Só a administração envia o e-mail de teste.")}`);
  }
  if (!usuario.email) {
    redirect(`${ROTA}?erro=${encodeURIComponent("Sua conta não tem e-mail cadastrado.")}`);
  }
  if (!provedorConfigurado()) {
    redirect(
      `${ROTA}?erro=${encodeURIComponent(
        "Provedor não configurado: defina BREVO_API_KEY e EMAIL_REMETENTE nas variáveis do deploy e refaça o deploy.",
      )}`,
    );
  }

  const resultado = await enviarEmail({
    para: [usuario.email as string],
    assunto: `${org.nome} — teste do e-mail transacional`,
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f6f8fa;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">
        <tr><td style="padding:28px 32px;font:400 14px/1.6 Arial,sans-serif;color:#1b2a4a;">
          <p style="margin:0 0 12px;font:700 18px/1.3 Arial,sans-serif;">O e-mail transacional está funcionando</p>
          <p style="margin:0 0 8px;color:#64748b;">
            Este teste foi pedido em Configurações por ${usuario.email}. Se chegou aqui,
            convites, extratos e o resumo diário de <strong>${org.nome}</strong> vão sair
            por este mesmo caminho.
          </p>
          <p style="margin:0;color:#94a3b8;font-size:12px;">
            Remetente: ${process.env.EMAIL_REMETENTE ?? "—"} · Provedor: Brevo
          </p>
        </td></tr>
      </table></body></html>`,
  });

  redirect(
    `${ROTA}?${resultado.status === "enviado" ? "ok" : "erro"}=${encodeURIComponent(
      resultado.status === "enviado"
        ? `E-mail de teste enviado para ${usuario.email}. Confira a caixa de entrada (e o spam — se caiu lá, falta verificar o remetente na Brevo).`
        : `O envio falhou: ${resultado.detalhe ?? "sem detalhe"}. Confira a chave e o remetente verificado na Brevo.`,
    )}`,
  );
}
