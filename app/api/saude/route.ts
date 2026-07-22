import { NextResponse } from "next/server";
import { ambienteCompleto, credenciaisPublicas } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Verificacao de saude. Responde se o ambiente esta configurado e se o
 * Supabase realmente responde pela rede — nao basta ter as variaveis
 * preenchidas, elas precisam apontar para um projeto que existe.
 * Usada no deploy para confirmar que a instancia esta de pe.
 */
export async function GET() {
  if (!ambienteCompleto()) {
    return NextResponse.json(
      {
        estado: "incompleto",
        banco: "nao verificado",
        detalhe: "Defina as variaveis de ambiente do Supabase e recarregue.",
      },
      { status: 503 },
    );
  }

  const { url, anonKey } = credenciaisPublicas();

  try {
    const resposta = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!resposta.ok) {
      return NextResponse.json(
        {
          estado: "erro",
          banco: "recusado",
          detalhe: `O projeto respondeu ${resposta.status}. Confira a chave anon em Project Settings > API.`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ estado: "ok", banco: "acessivel" });
  } catch {
    return NextResponse.json(
      {
        estado: "erro",
        banco: "inacessivel",
        detalhe:
          "Nao foi possivel falar com o Supabase. Confira a URL do projeto e a conexao de rede.",
      },
      { status: 502 },
    );
  }
}
