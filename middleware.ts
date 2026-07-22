import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { credenciaisPublicas } from "@/lib/env";

/**
 * Renova a sessao a cada requisicao e devolve os cookies atualizados.
 * Sem isso a sessao expira em uso normal e a pessoa e deslogada sozinha.
 */
export async function middleware(request: NextRequest) {
  let resposta = NextResponse.next({ request: { headers: request.headers } });
  const { url, anonKey } = credenciaisPublicas();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(nome: string) {
        return request.cookies.get(nome)?.value;
      },
      set(nome: string, valor: string, opcoes: CookieOptions) {
        request.cookies.set({ name: nome, value: valor, ...opcoes });
        resposta = NextResponse.next({ request: { headers: request.headers } });
        resposta.cookies.set({ name: nome, value: valor, ...opcoes });
      },
      remove(nome: string, opcoes: CookieOptions) {
        request.cookies.set({ name: nome, value: "", ...opcoes });
        resposta = NextResponse.next({ request: { headers: request.headers } });
        resposta.cookies.set({ name: nome, value: "", ...opcoes });
      },
    },
  });

  await supabase.auth.getUser();

  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
