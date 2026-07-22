import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { credenciaisOpcionais } from "@/lib/env";

/**
 * Renova a sessao a cada requisicao e devolve os cookies atualizados.
 * Sem isso a sessao expira em uso normal e a pessoa e deslogada sozinha.
 *
 * O middleware roda antes de qualquer pagina: se ele lanca, o site inteiro
 * responde 500 sem dizer o motivo. Por isso aqui nada lanca — falta de
 * configuracao ou indisponibilidade do Supabase deixam a requisicao seguir,
 * e a pessoa cai na tela que explica o que falta.
 */
export async function middleware(request: NextRequest) {
  // O layout precisa saber a rota para decidir se mostra a casca do
  // produto. O portal é a exceção: lá a marca é a do assinante.
  const cabecalhos = new Headers(request.headers);
  cabecalhos.set("x-caminho", request.nextUrl.pathname);

  let resposta = NextResponse.next({ request: { headers: cabecalhos } });

  const credenciais = credenciaisOpcionais();
  if (!credenciais) return resposta;

  try {
    const supabase = createServerClient(credenciais.url, credenciais.anonKey, {
      cookies: {
        get(nome: string) {
          return request.cookies.get(nome)?.value;
        },
        set(nome: string, valor: string, opcoes: CookieOptions) {
          request.cookies.set({ name: nome, value: valor, ...opcoes });
          resposta = NextResponse.next({ request: { headers: cabecalhos } });
          resposta.cookies.set({ name: nome, value: valor, ...opcoes });
        },
        remove(nome: string, opcoes: CookieOptions) {
          request.cookies.set({ name: nome, value: "", ...opcoes });
          resposta = NextResponse.next({ request: { headers: cabecalhos } });
          resposta.cookies.set({ name: nome, value: "", ...opcoes });
        },
      },
    });

    await supabase.auth.getUser();
  } catch (e) {
    console.error("[middleware] sessao nao renovada:", e);
  }

  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
