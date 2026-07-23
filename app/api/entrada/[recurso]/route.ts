import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/server";
import { MODELOS, validar, type TipoImportacao } from "@/lib/importacao";
import { gravarLinhas, referenciasDaOrg } from "@/lib/gravacao";
import { registrarErro } from "@/lib/telemetria";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Porta de entrada de dados.
 *
 * POST /api/entrada/{recurso}
 *   Authorization: Bearer pxm_xxxxxxxx_...
 *   { "conferencia": false, "linhas": [ { ... }, ... ] }
 *
 * Aceita os mesmos recursos da importação por planilha e usa a MESMA
 * conferência linha a linha (`validar`) e a MESMA gravação
 * (`gravarLinhas`). Não há caminho paralelo: o que a planilha recusa,
 * esta rota recusa, com o mesmo motivo.
 *
 * ONDE MORA O ISOLAMENTO
 *
 * A organização nunca vem no corpo nem é escolhida aqui. A rota entrega a
 * chave ao banco, e o banco devolve de qual organização ela é — dentro de
 * `autenticar_chave_api`, que também recusa chave revogada, assinatura
 * suspensa e excesso de vazão. Se esta rota estiver errada, ela não tem
 * como escrever na organização de outro assinante: ela sequer sabe qual
 * é, até o banco dizer.
 *
 * Por isso a rota usa o cliente de serviço — não há sessão de usuário
 * numa chamada por chave, e a RLS não teria por onde decidir. A garantia
 * foi movida para dentro da função do banco, que é onde ela pode ser
 * verificada por teste.
 */

const RECURSOS = Object.keys(MODELOS) as TipoImportacao[];
const LIMITE_LINHAS = 2000;

function erro(mensagem: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ erro: mensagem, ...extra }, { status });
}

export async function POST(
  requisicao: Request,
  { params }: { params: { recurso: string } },
) {
  const inicio = Date.now();

  // ---------------------------------------------------------------- chave
  const autorizacao = requisicao.headers.get("authorization") ?? "";
  const chave = autorizacao.toLowerCase().startsWith("bearer ")
    ? autorizacao.slice(7).trim()
    : "";

  if (!chave) {
    return erro("Envie a chave em Authorization: Bearer <chave>.", 401);
  }

  let supabase;
  try {
    supabase = criarClienteAdmin();
  } catch {
    return erro("Serviço indisponível no momento.", 503);
  }

  const { data: autenticacao, error: erroAuth } = await supabase.rpc("autenticar_chave_api", {
    p_chave: chave,
  });

  if (erroAuth) {
    // 53400 é o limite de vazão; 42501 é assinatura suspensa; o resto é
    // chave inválida ou revogada. A mensagem do banco já é a boa.
    const codigo = (erroAuth as { code?: string }).code;
    const status = codigo === "53400" ? 429 : codigo === "42501" ? 403 : 401;
    return erro(erroAuth.message, status);
  }

  const sessao = (Array.isArray(autenticacao) ? autenticacao[0] : autenticacao) as
    | { org_id: string; chave_id: string; nome: string; limite: number }
    | undefined;

  if (!sessao?.org_id) return erro("Chave inválida.", 401);

  // -------------------------------------------------------------- recurso
  const recurso = params.recurso as TipoImportacao;

  const registrar = async (
    situacao: string,
    recebidas: number,
    gravadas: number,
    recusadas: number,
    recusas: unknown[],
    detalhe: string | null,
  ) => {
    await supabase.rpc("registrar_chamada_api", {
      p_chave_id: sessao.chave_id,
      p_recurso: recurso,
      p_modo: modo,
      p_recebidas: recebidas,
      p_gravadas: gravadas,
      p_recusadas: recusadas,
      p_recusas: recusas,
      p_situacao: situacao,
      p_detalhe: detalhe,
      p_ms: Date.now() - inicio,
    });
  };

  let corpo: { linhas?: unknown; conferencia?: unknown };
  try {
    corpo = await requisicao.json();
  } catch {
    return erro("Corpo inválido: envie JSON.", 400);
  }

  const modo = corpo.conferencia === true ? "conferencia" : "gravar";

  if (!RECURSOS.includes(recurso)) {
    await registrar("recusada", 0, 0, 0, [], `recurso desconhecido: ${params.recurso}`);
    return erro(`Recurso desconhecido. Aceitos: ${RECURSOS.join(", ")}.`, 404, {
      recursos: RECURSOS,
    });
  }

  if (!Array.isArray(corpo.linhas)) {
    await registrar("recusada", 0, 0, 0, [], "linhas ausente ou não é lista");
    return erro('Envie { "linhas": [ ... ] }.', 400);
  }

  if (corpo.linhas.length === 0) {
    await registrar("recusada", 0, 0, 0, [], "lista vazia");
    return erro("Nenhuma linha enviada.", 400);
  }

  if (corpo.linhas.length > LIMITE_LINHAS) {
    await registrar("recusada", corpo.linhas.length, 0, 0, [], "acima do limite por chamada");
    return erro(
      `Máximo de ${LIMITE_LINHAS} linhas por chamada. Divida a carga.`,
      413,
    );
  }

  // Tudo vira texto antes de conferir: é o que a planilha entrega, e é o
  // que `validar` espera. Número e data são convertidos lá, com o mesmo
  // critério — e a mesma mensagem de recusa.
  const linhas = (corpo.linhas as Record<string, unknown>[]).map((l) => {
    const texto: Record<string, string> = {};
    for (const [campo, valor] of Object.entries(l ?? {})) {
      texto[campo] = valor === null || valor === undefined ? "" : String(valor);
    }
    return texto;
  });

  // ------------------------------------------------------------ conferência
  try {
    const refs = await referenciasDaOrg(supabase, sessao.org_id);

    const conferido = validar(recurso, linhas, refs);

    // ------------------------------------------------- modo de conferência
    // O sistema de origem testa antes de mandar de verdade. Nada é gravado
    // e a resposta é idêntica em formato — só não muda nada.
    if (modo === "conferencia") {
      await registrar(
        conferido.erros.length === 0 ? "ok" : "parcial",
        linhas.length,
        0,
        conferido.erros.length,
        conferido.erros,
        "conferência: nada foi gravado",
      );
      return NextResponse.json({
        modo: "conferencia",
        recurso,
        recebidas: linhas.length,
        aceitas: conferido.validas.length,
        recusadas: conferido.erros.length,
        recusas: conferido.erros,
        observacao: "Conferência: nada foi gravado.",
      });
    }

    // ------------------------------------------------------------- gravação
    const resultado = await gravarLinhas(supabase, {
      orgId: sessao.org_id,
      tipo: recurso,
      linhas: conferido.validas,
      autorId: null,
    });

    const situacao = resultado.erro
      ? resultado.gravadas > 0
        ? "parcial"
        : "erro"
      : conferido.erros.length > 0
        ? "parcial"
        : "ok";

    await registrar(
      situacao,
      linhas.length,
      resultado.gravadas,
      conferido.erros.length,
      conferido.erros,
      resultado.erro ?? resultado.detalhe,
    );

    return NextResponse.json(
      {
        modo: "gravar",
        recurso,
        recebidas: linhas.length,
        gravadas: resultado.gravadas,
        recusadas: conferido.erros.length,
        recusas: conferido.erros,
        ...(resultado.erro ? { erro: resultado.erro } : {}),
      },
      { status: resultado.erro && resultado.gravadas === 0 ? 422 : 200 },
    );
  } catch (e) {
    await registrarErro(e, {
      onde: "api/entrada",
      orgId: sessao.org_id,
      rota: `/api/entrada/${recurso}`,
    });
    await registrar("erro", linhas.length, 0, 0, [], "falha inesperada");
    return erro("Não foi possível processar a carga.", 500);
  }
}

/** GET responde o contrato do recurso — quem integra descobre sem sair daqui. */
export async function GET(
  _requisicao: Request,
  { params }: { params: { recurso: string } },
) {
  const recurso = params.recurso as TipoImportacao;
  const modelo = MODELOS[recurso];

  if (!modelo) {
    return NextResponse.json(
      { erro: "Recurso desconhecido.", recursos: RECURSOS },
      { status: 404 },
    );
  }

  return NextResponse.json({
    recurso,
    rotulo: modelo.rotulo,
    descricao: modelo.explicacao,
    limite_por_chamada: LIMITE_LINHAS,
    campos: modelo.colunas.map((c) => ({
      campo: c.chave,
      obrigatorio: c.obrigatoria === true,
      ajuda: c.ajuda ?? null,
    })),
    exemplo: {
      conferencia: true,
      linhas: [
        Object.fromEntries(
          modelo.colunas.filter((c) => c.obrigatoria).map((c) => [c.chave, "..."]),
        ),
      ],
    },
  });
}
