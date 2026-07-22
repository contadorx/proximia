import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { usuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Busca unificada. A função no banco roda com o privilégio de quem chama,
 * então o alcance por carteira é o mesmo das telas — não há filtro aqui
 * que alguém possa esquecer de aplicar num tipo novo.
 */
export async function GET(requisicao: Request) {
  const usuario = await usuarioAtual();
  if (!usuario) return NextResponse.json({ resultados: [] }, { status: 401 });

  const termo = new URL(requisicao.url).searchParams.get("q")?.trim() ?? "";

  // Uma letra devolveria quase tudo e não ajudaria ninguém.
  if (termo.length < 2) return NextResponse.json({ resultados: [] });

  const supabase = criarClienteServidor();
  const { data, error } = await supabase.rpc("buscar", { p_termo: termo, p_limite: 6 });

  if (error) {
    console.error("[busca] falha:", error.message);
    return NextResponse.json({ resultados: [], erro: "Não foi possível buscar agora." });
  }

  return NextResponse.json(
    { resultados: data ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}
