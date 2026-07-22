import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ambienteCompleto } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Ponto de retorno dos links enviados por e-mail: confirmação de cadastro
 * e redefinição de senha. O link traz um código de uso único que é
 * trocado aqui por uma sessão; depois disso a pessoa segue para onde o
 * próprio link pediu.
 */
export async function GET(requisicao: Request) {
  const url = new URL(requisicao.url);
  const codigo = url.searchParams.get("code");
  const proximo = url.searchParams.get("proximo") ?? "/";

  if (!ambienteCompleto()) {
    return NextResponse.redirect(new URL("/instalacao", url.origin));
  }

  if (!codigo) {
    return NextResponse.redirect(
      new URL(
        `/entrar?erro=${encodeURIComponent("Link incompleto. Peça um novo e abra-o por inteiro.")}`,
        url.origin,
      ),
    );
  }

  try {
    const supabase = criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);

    if (error) {
      return NextResponse.redirect(
        new URL(
          `/entrar?erro=${encodeURIComponent(
            "Este link não vale mais. Links de e-mail servem uma vez só e expiram — peça outro.",
          )}`,
          url.origin,
        ),
      );
    }
  } catch (e) {
    console.error("[callback] falha ao trocar o código:", e);
    return NextResponse.redirect(
      new URL(
        `/entrar?erro=${encodeURIComponent("Não foi possível concluir. Tente novamente em instantes.")}`,
        url.origin,
      ),
    );
  }

  // Só caminhos internos: um "proximo" externo transformaria este endereço
  // em trampolim para outro site.
  const destino = proximo.startsWith("/") && !proximo.startsWith("//") ? proximo : "/";
  return NextResponse.redirect(new URL(destino, url.origin));
}
