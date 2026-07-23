import { NextResponse } from "next/server";
import { ambienteCompleto, credenciaisPublicas } from "@/lib/env";
import { criarClienteAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Verificação de saúde, para monitoramento externo.
 *
 * O que mudou e por quê: a versão anterior só perguntava ao endpoint de
 * autenticação do Supabase se ele estava vivo. Isso não cobre o caso que
 * mais dói — o banco recusando conexão, ou a rotina diária parada há dois
 * dias — e um monitor externo apontado para cá marcaria "no ar" enquanto
 * o produto estivesse quebrado por dentro.
 *
 * Agora responde três perguntas separadas:
 *
 *   ambiente : as variáveis estão preenchidas?
 *   banco    : uma consulta real volta, e em quanto tempo?
 *   rotina   : a última execução da rotina diária foi quando, e como?
 *
 * Contrato para o monitor: HTTP 200 = tudo de pé; 503 = degradado ou
 * fora. O corpo diz o que está ruim. Nenhum dado de negócio aparece
 * aqui — nome de conta e valor não saem nem para o monitor.
 *
 * `?detalhado=1` inclui a saúde da rotina; sem isso, a checagem é só
 * ambiente + banco, que é o que um ping de um minuto precisa.
 */
export async function GET(requisicao: Request) {
  const inicio = Date.now();
  const detalhado = new URL(requisicao.url).searchParams.get("detalhado") === "1";

  if (!ambienteCompleto()) {
    return NextResponse.json(
      {
        estado: "incompleto",
        ambiente: "faltam variáveis",
        banco: "não verificado",
        detalhe: "Defina as variáveis de ambiente do Supabase e recarregue.",
      },
      { status: 503 },
    );
  }

  const { url, anonKey } = credenciaisPublicas();

  // 1. A plataforma responde pela rede?
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
          ambiente: "ok",
          banco: "recusado",
          ms: Date.now() - inicio,
          detalhe: `O projeto respondeu ${resposta.status}. Confira a chave anon.`,
        },
        { status: 503 },
      );
    }
  } catch {
    return NextResponse.json(
      {
        estado: "erro",
        ambiente: "ok",
        banco: "inacessível",
        ms: Date.now() - inicio,
        detalhe: "Não foi possível falar com o Supabase.",
      },
      { status: 503 },
    );
  }

  // 2. O banco responde a uma consulta de verdade? Contar organizações é
  //    barato e prova o caminho inteiro: conexão, autenticação e SQL.
  let banco = "ok";
  let bancoMs: number | null = null;
  let detalheBanco: string | null = null;
  try {
    const t0 = Date.now();
    const admin = criarClienteAdmin();
    const { error } = await admin.from("orgs").select("id", { count: "exact", head: true });
    bancoMs = Date.now() - t0;
    if (error) {
      banco = "erro";
      detalheBanco = error.message;
    }
  } catch (e) {
    banco = "erro";
    detalheBanco = e instanceof Error ? e.message : "falha desconhecida";
  }

  // 3. A rotina diária está saudável? (só quando pedido)
  let rotina: Record<string, unknown> | null = null;
  if (detalhado && banco === "ok") {
    try {
      const admin = criarClienteAdmin();
      const { data } = await admin.rpc("rotina_saude", { p_rotina: "extratos" });
      const linha = Array.isArray(data) ? data[0] : data;
      if (linha) {
        rotina = {
          situacao: linha.situacao,
          ultima_em: linha.ultima_em,
          horas_atras: linha.horas_atras,
          falhas: linha.ultima_falhas,
          detalhe: linha.detalhe,
        };
      }
    } catch {
      rotina = { situacao: "desconhecida", detalhe: "não foi possível consultar o diário" };
    }
  }

  const rotinaRuim =
    rotina !== null &&
    ["nunca_rodou", "atrasada", "falhou"].includes(String(rotina.situacao ?? ""));
  const saudavel = banco === "ok" && !rotinaRuim;

  return NextResponse.json(
    {
      estado: saudavel ? "ok" : "degradado",
      ambiente: "ok",
      banco,
      banco_ms: bancoMs,
      ms: Date.now() - inicio,
      ...(detalheBanco ? { detalhe: detalheBanco } : {}),
      ...(rotina ? { rotina } : {}),
    },
    { status: saudavel ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
