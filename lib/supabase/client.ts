"use client";

import { createBrowserClient } from "@supabase/ssr";
import { credenciaisPublicas } from "@/lib/env";

/**
 * Cliente para uso em componentes de cliente.
 * Roda com a chave publica e sempre sob RLS — nunca ver dado de outra
 * organizacao depende do banco, nao de filtro nesta camada.
 */
export function criarClienteBrowser() {
  const { url, anonKey } = credenciaisPublicas();
  return createBrowserClient(url, anonKey);
}
