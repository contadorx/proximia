import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/server";
import { limparMensagem } from "@/lib/telemetria";
import { usuarioAtual } from "@/lib/auth";
import { orgAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Recebe o relato de um erro que aconteceu no navegador.
 *
 * POR QUE ESTA ROTA É PÚBLICA
 *
 * Erro acontece antes do login também — tela de entrada, link de
 * confirmação quebrado, página de instalação. Exigir sessão perderia
 * exatamente os casos que mais atrapalham quem está começando.
 *
 * O QUE PROTEGE, JÁ QUE ELA É PÚBLICA
 *
 *   · corpo limitado e formato conferido: o que não tem a forma esperada
 *     é descartado sem gravar;
 *   · teto de gravação por minuto, imposto no banco (migration 0044) —
 *     no banco, e não aqui, porque é lá que não tem como ser contornado;
 *   · nenhum dado de negócio: a mensagem passa por `limparMensagem`, a
 *     mesma que a telemetria do servidor usa, com teste que trava isso.
 *
 * A resposta é sempre 204, inclusive quando o relato é descartado. Quem
 * está reportando um erro não deve receber outro erro de volta, e dizer
 * "recusei" só ajudaria quem estivesse sondando o teto.
 */
export async function POST(requisicao: Request) {
  try {
    const bruto = await requisicao.text();

    // Relato de erro não passa de alguns kilobytes. Acima disso é ruído
    // ou tentativa, e nos dois casos o certo é descartar sem ler.
    if (bruto.length > 4000) return new NextResponse(null, { status: 204 });

    const corpo = JSON.parse(bruto) as Record<string, unknown>;

    const texto = (valor: unknown, limite: number): string | null => {
      if (typeof valor !== "string") return null;
      const limpo = limparMensagem(valor).slice(0, limite).trim();
      return limpo === "" ? null : limpo;
    };

    const mensagem = texto(corpo.mensagem, 300);
    if (!mensagem) return new NextResponse(null, { status: 204 });

    // Sessão, quando existe. Não é obrigatória e não se confia no que o
    // navegador disser sobre quem é: quem responde é o cookie.
    let userId: string | null = null;
    let orgId: string | null = null;
    try {
      const usuario = await usuarioAtual();
      userId = usuario?.id ?? null;
      if (usuario) {
        const org = await orgAtual();
        orgId = org?.orgId ?? null;
      }
    } catch {
      // sem sessão, segue sem identificação
    }

    const admin = criarClienteAdmin();
    await admin.rpc("registrar_erro_cliente", {
      p_onde: texto(corpo.onde, 60) ?? "navegador",
      p_tipo: texto(corpo.tipo, 60) ?? "Error",
      p_mensagem: mensagem,
      p_rota: texto(corpo.rota, 200),
      p_pilha: texto(corpo.pilha, 400),
      p_agente: (requisicao.headers.get("user-agent") ?? "").slice(0, 200) || null,
      p_org: orgId,
      p_user: userId,
    });
  } catch {
    // Telemetria que quebra é pior que telemetria que falta.
  }

  return new NextResponse(null, { status: 204 });
}
