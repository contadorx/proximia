import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { credenciaisPublicas } from "@/lib/env";

/**
 * Cliente para Server Components, Route Handlers e Server Actions.
 * Le e grava a sessao nos cookies da requisicao. Continua sujeito a RLS.
 */
export function criarClienteServidor() {
  const cookieStore = cookies();
  const { url, anonKey } = credenciaisPublicas();

  return createServerClient(url, anonKey, {
    cookies: {
      get(nome: string) {
        return cookieStore.get(nome)?.value;
      },
      set(nome: string, valor: string, opcoes: CookieOptions) {
        try {
          cookieStore.set({ name: nome, value: valor, ...opcoes });
        } catch {
          // Server Component nao pode escrever cookie. O middleware (F1)
          // renova a sessao; aqui o silencio e esperado.
        }
      },
      remove(nome: string, opcoes: CookieOptions) {
        try {
          cookieStore.set({ name: nome, value: "", ...opcoes });
        } catch {
          // idem
        }
      },
    },
  });
}

/**
 * Cliente administrativo: ignora RLS. Uso restrito a rotinas de servidor que
 * precisam atravessar organizacoes (importacao, manutencao). Nunca importar
 * este modulo em componente de cliente.
 */
export function criarClienteAdmin() {
  const { url } = credenciaisPublicas();
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!chave) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY nao definida. Adicione a variavel no ambiente do servidor para usar rotinas administrativas.",
    );
  }

  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
