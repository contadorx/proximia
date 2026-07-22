/**
 * Adaptador de envio de e-mail. A aplicacao chama sempre `enviarEmail`;
 * qual provedor esta atras disso e detalhe de configuracao.
 *
 * Sem chave configurada, o envio entra em modo simulado: nada sai, e o
 * registro fica marcado como "simulado". Assim da para montar o extrato e
 * conferir o conteudo antes de ligar o disparo de verdade.
 */

export type ResultadoEnvio = {
  status: "enviado" | "simulado" | "falhou";
  detalhe?: string;
};

export function provedorConfigurado(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_REMETENTE);
}

export async function enviarEmail(mensagem: {
  para: string[];
  assunto: string;
  html: string;
  respostaPara?: string;
}): Promise<ResultadoEnvio> {
  const destinatarios = mensagem.para.filter((e) => e.includes("@"));

  if (destinatarios.length === 0) {
    return { status: "falhou", detalhe: "Nenhum destinatário válido." };
  }

  if (!provedorConfigurado()) {
    return {
      status: "simulado",
      detalhe: `Sem provedor configurado. Seriam ${destinatarios.length} destinatário(s).`,
    };
  }

  try {
    const resposta = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY as string,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: process.env.EMAIL_REMETENTE,
          name: process.env.EMAIL_REMETENTE_NOME ?? "Proximia",
        },
        to: destinatarios.map((email) => ({ email })),
        replyTo: mensagem.respostaPara ? { email: mensagem.respostaPara } : undefined,
        subject: mensagem.assunto,
        htmlContent: mensagem.html,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text();
      return {
        status: "falhou",
        detalhe: `Provedor respondeu ${resposta.status}: ${corpo.slice(0, 240)}`,
      };
    }

    return { status: "enviado", detalhe: `${destinatarios.length} destinatário(s).` };
  } catch (e) {
    return {
      status: "falhou",
      detalhe: e instanceof Error ? e.message : "Falha desconhecida no envio.",
    };
  }
}
