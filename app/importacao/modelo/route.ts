import { NextResponse } from "next/server";
import { MODELOS, type TipoImportacao } from "@/lib/importacao";
import { usuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Devolve um CSV modelo com o cabeçalho e uma linha de exemplo. */
export async function GET(requisicao: Request) {
  if (!(await usuarioAtual())) {
    return NextResponse.json({ erro: "Faça login para baixar o modelo." }, { status: 401 });
  }

  const { searchParams } = new URL(requisicao.url);
  const tipo = (searchParams.get("tipo") ?? "carteiras") as TipoImportacao;
  const modelo = MODELOS[tipo];

  if (!modelo) {
    return NextResponse.json({ erro: "Tipo desconhecido." }, { status: 400 });
  }

  const cabecalho = modelo.colunas.map((c) => c.rotulo).join(";");
  const exemplo = modelo.colunas
    .map((c) => (c.ajuda ? `# ${c.ajuda}` : ""))
    .join(";");

  // BOM na frente para o Excel abrir com acentuação correta.
  const csv = `\uFEFF${cabecalho}\n${exemplo}\n`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="modelo_${tipo}.csv"`,
    },
  });
}
