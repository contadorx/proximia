import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ambienteCompleto } from "@/lib/env";
import { destinoSeguro } from "@/lib/retorno";

export const dynamic = "force-dynamic";

/**
 * Ponto de retorno dos links enviados por e-mail: confirmação de cadastro
 * e redefinição de senha.
 *
 * O SUPABASE DEVOLVE O LINK DE TRÊS FORMAS DIFERENTES, e a versão
 * anterior desta rota entendia só uma. Quem caísse nas outras duas via
 * "Link incompleto" — mensagem que culpava o e-mail por um problema que
 * era daqui.
 *
 *   1. `?code=…`                → fluxo PKCE. Troca-se o código por
 *                                 sessão. Exige que o link seja aberto no
 *                                 MESMO navegador que pediu, porque o
 *                                 verificador fica num cookie local.
 *
 *   2. `?token_hash=…&type=…`   → é o que o Supabase manda hoje nos
 *                                 modelos de e-mail. Não depende de
 *                                 cookie: funciona em qualquer navegador,
 *                                 inclusive no do celular. Verifica-se
 *                                 com verifyOtp.
 *
 *   3. `#access_token=…`        → fluxo implícito. Os tokens vêm no
 *                                 FRAGMENTO da URL, que nunca chega ao
 *                                 servidor — por desenho do navegador.
 *                                 Só o cliente enxerga, então a rota
 *                                 encaminha para uma tela que lê o
 *                                 fragmento e conclui por lá.
 *
 * Aceitar as três é o que faz o link funcionar independente de como o
 * projeto estiver configurado — e a configuração pode mudar sem aviso,
 * do lado do Supabase.
 */

const TIPOS_ACEITOS = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const;

type TipoOtp = (typeof TIPOS_ACEITOS)[number];

export async function GET(requisicao: Request) {
  const url = new URL(requisicao.url);
  const proximo = url.searchParams.get("proximo") ?? "/";

  // Só caminhos internos — ver lib/retorno.ts para o porquê.
  const destino = destinoSeguro(proximo);

  if (!ambienteCompleto()) {
    return NextResponse.redirect(new URL("/instalacao", url.origin));
  }

  const codigo = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as TipoOtp | null;

  const falhar = (mensagem: string) =>
    NextResponse.redirect(
      new URL(`/entrar?erro=${encodeURIComponent(mensagem)}`, url.origin),
    );

  // Erro devolvido pelo próprio Supabase antes de chegar aqui — link
  // expirado, por exemplo. Vem como ?error=…&error_description=…
  const erroDoProvedor = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (erroDoProvedor && !codigo && !tokenHash) {
    return falhar(
      `O provedor recusou o link: ${erroDoProvedor}. Links de e-mail servem uma vez só e expiram — peça outro.`,
    );
  }

  try {
    const supabase = criarClienteServidor();

    if (tokenHash && tipo && TIPOS_ACEITOS.includes(tipo)) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
      if (error) {
        return falhar(
          "Este link não vale mais. Links de e-mail servem uma vez só e expiram — peça outro.",
        );
      }
      return NextResponse.redirect(new URL(destino, url.origin));
    }

    if (codigo) {
      const { error } = await supabase.auth.exchangeCodeForSession(codigo);
      if (error) {
        return falhar(
          "Não foi possível concluir com este link. Ele precisa ser aberto no mesmo navegador em que o pedido foi feito — se abriu no celular, tente pelo computador, ou peça um novo.",
        );
      }
      return NextResponse.redirect(new URL(destino, url.origin));
    }
  } catch (e) {
    console.error("[callback] falha ao concluir a entrada:", e);
    return falhar("Não foi possível concluir. Tente novamente em instantes.");
  }

  // Nenhum dos dois na consulta: pode ser o fluxo implícito, com os tokens
  // no fragmento. O servidor não enxerga fragmento — o navegador não o
  // envia —, então quem conclui é a tela. O fragmento sobrevive a este
  // redirecionamento porque o destino não tem fragmento próprio.
  return NextResponse.redirect(
    new URL(`/auth/concluir?proximo=${encodeURIComponent(destino)}`, url.origin),
  );
}
