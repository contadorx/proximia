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
 *
 * MEDIÇÃO DE DISPONIBILIDADE
 *
 * Com `?ping=SEGREDO` (o valor de MONITOR_SECRET), o resultado desta
 * checagem é gravado como o minuto medido. É assim que a promessa dos
 * Termos deixa de ser afirmação e vira número: um monitor externo bate
 * aqui de minuto em minuto, e cada passagem vira uma linha.
 *
 * Duas decisões que valem explicação:
 *
 *   · O segredo existe porque, sem ele, qualquer um poderia marcar
 *     minutos como fora do ar e estragar a própria medição que você vai
 *     usar numa discussão de contrato.
 *
 *   · Quem mede é externo, de propósito. Um monitor rodando aqui dentro
 *     não consegue registrar a própria queda — e é justamente a queda que
 *     interessa. Por isso o minuto sem registro conta como fora do ar no
 *     número defensável (migration 0043): o silêncio não vira nota alta.
 */
export async function GET(requisicao: Request) {
  const inicio = Date.now();
  const parametros = new URL(requisicao.url).searchParams;
  const detalhado = parametros.get("detalhado") === "1";

  const segredo = process.env.MONITOR_SECRET;
  const medindo = Boolean(segredo) && parametros.get("ping") === segredo;

  /** Grava o minuto medido. Nunca derruba a resposta: monitor que quebra
   *  a página que monitora é pior que monitor nenhum. */
  const registrar = async (saudavel: boolean, detalhe: string | null) => {
    if (!medindo) return;
    try {
      const admin = criarClienteAdmin();
      await admin.rpc("registrar_ping", {
        p_saudavel: saudavel,
        p_ms: Date.now() - inicio,
        p_detalhe: detalhe,
      });
    } catch {
      // silêncio deliberado
    }
  };

  if (!ambienteCompleto()) {
    await registrar(false, "ambiente incompleto");
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
      await registrar(false, `plataforma respondeu ${resposta.status}`);
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
    await registrar(false, "plataforma inacessível");
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

  // A rotina atrasada degrada o estado, mas não é queda da aplicação: o
  // minuto medido registra a saúde de responder, não a da rotina diária,
  // que tem alarme próprio.
  await registrar(banco === "ok", banco === "ok" ? null : detalheBanco);

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
