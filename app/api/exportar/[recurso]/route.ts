import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg, exigirUsuario } from "@/lib/auth";
import { RECURSOS, nomeArquivo, paraCsv, type Recurso } from "@/lib/exportacao";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Página da paginação, não teto: a rota busca em blocos até esgotar.
// Antes havia um corte silencioso em 5.000 linhas — e a tela promete que
// os dados saem inteiros. Corte que ninguém vê é promessa quebrada.
const PAGINA = 1000;

async function buscarTudo(
  supabase: SupabaseClient,
  recurso: Recurso,
): Promise<{ linhas: Record<string, unknown>[]; erro: string | null }> {
  const linhas: Record<string, unknown>[] = [];

  for (let inicio = 0; ; inicio += PAGINA) {
    let consulta = supabase
      .from(recurso.tabela)
      .select(recurso.colunas)
      .range(inicio, inicio + PAGINA - 1);
    if (recurso.ordem) consulta = consulta.order(recurso.ordem);

    const { data, error } = await consulta;
    if (error) return { linhas, erro: error.message };

    const bloco = (data ?? []) as unknown as Record<string, unknown>[];
    linhas.push(...bloco);
    if (bloco.length < PAGINA) return { linhas, erro: null };
  }
}

/**
 * Exportação de um recurso, ou de tudo em JSON.
 *
 * Roda sob a sessão de quem pede: a RLS decide o que sai. Não há
 * parâmetro de organização na rota de propósito — recebê-lo abriria a
 * porta para alguém tentar exportar a de outro.
 */
export async function GET(
  requisicao: Request,
  { params }: { params: { recurso: string } },
) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();
  const supabase = criarClienteServidor();

  const registrar = async (recurso: string, formato: "csv" | "json", linhas: number) => {
    await supabase.from("exportacoes").insert({
      org_id: org.orgId,
      recurso,
      formato,
      linhas,
      autor_id: usuario.id,
    });
  };

  // ---------- tudo, em JSON ----------
  if (params.recurso === "tudo") {
    const pacote: Record<string, unknown> = {
      organizacao: org.nome,
      gerado_em: new Date().toISOString(),
      observacao:
        "Exportação completa no alcance de quem gerou. Potencial é estimativa declarada; capturado é valor confirmado. Os dois não se somam.",
    };

    let total = 0;
    for (const r of RECURSOS) {
      const { linhas, erro } = await buscarTudo(supabase, r);
      if (erro) {
        console.error(`[exportar] ${r.chave}:`, erro);
        pacote[r.chave] = { erro: "não foi possível exportar este recurso" };
        continue;
      }
      pacote[r.chave] = linhas;
      total += linhas.length;
    }

    await registrar("tudo", "json", total);

    return new NextResponse(JSON.stringify(pacote, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${nomeArquivo("completo", "json")}"`,
        "cache-control": "no-store",
      },
    });
  }

  // ---------- um recurso, em CSV ----------
  const recurso = RECURSOS.find((r) => r.chave === params.recurso);
  if (!recurso) {
    return NextResponse.json({ erro: "Recurso não reconhecido." }, { status: 404 });
  }

  const { linhas, erro } = await buscarTudo(supabase, recurso);

  if (erro) {
    return NextResponse.json(
      { erro: `Não foi possível exportar: ${erro}` },
      { status: 500 },
    );
  }

  const colunas = recurso.colunas.split(",").map((c) => c.trim());

  await registrar(recurso.chave, "csv", linhas.length);

  return new NextResponse(paraCsv(linhas, colunas), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nomeArquivo(recurso.chave, "csv")}"`,
      "cache-control": "no-store",
    },
  });
}
