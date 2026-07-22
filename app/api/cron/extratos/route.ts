import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/server";
import { htmlExtrato, montarExtrato } from "@/lib/extrato";
import { enviarEmail, provedorConfigurado } from "@/lib/email";
import { htmlResumo, itensDaPessoa, resumoDoDia } from "@/lib/resumo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rotina diaria de extratos. Roda uma vez por dia, seleciona as carteiras
 * cuja cadencia vence hoje e envia. Cada envio fica registrado, inclusive
 * o que falhou.
 *
 * Atravessa organizacoes de proposito — por isso usa o cliente de servidor
 * e exige segredo proprio. Nao ha sessao de usuario aqui.
 */
export async function GET(requisicao: Request) {
  const segredo = process.env.CRON_SECRET;
  const autorizacao = requisicao.headers.get("authorization");

  if (!segredo) {
    return NextResponse.json(
      { erro: "CRON_SECRET não configurado. A rotina fica desligada até que seja definido." },
      { status: 503 },
    );
  }

  if (autorizacao !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const hoje = new Date().toISOString().slice(0, 10);

  let supabase;
  try {
    supabase = criarClienteAdmin();
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Falha ao iniciar o cliente." },
      { status: 500 },
    );
  }

  let devidas: unknown = null;
  try {
    const { data, error } = await supabase.rpc("carteiras_para_enviar", { p_hoje: hoje });
    if (error) {
      return NextResponse.json(
        { erro: `Consulta às carteiras falhou: ${error.message}` },
        { status: 500 },
      );
    }
    devidas = data;
  } catch (e) {
    // Banco fora do ar ou credencial errada: a rotina não estoura, e a
    // resposta diz o que aconteceu para quem for ler o log do agendamento.
    return NextResponse.json(
      {
        erro: "Não foi possível falar com o banco.",
        detalhe: e instanceof Error ? e.message : "falha desconhecida",
      },
      { status: 502 },
    );
  }

  const fila = (devidas ?? []) as {
    carteira_id: string;
    org_id: string;
    nome: string;
    destinatarios: string[];
    cadencia: string;
  }[];

  // Período fechado: do mesmo dia do ciclo anterior até ontem.
  const fim = new Date();
  fim.setDate(fim.getDate() - 1);

  // Alertas primeiro: assim o extrato do dia já sai com a situação varrida.
  const alertas: { org: string; diferenca: number; atribuidos: number }[] = [];
  try {
    const { data: orgs } = await supabase.from("orgs").select("id, nome");
    for (const o of (orgs ?? []) as { id: string; nome: string }[]) {
      const { data: dif } = await supabase.rpc("gerar_alertas", { p_org: o.id });
      const { data: atribuidos } = await supabase.rpc("atribuir_alertas", { p_org: o.id });
      await supabase.rpc("atribuir_compromissos", { p_org: o.id });

      // A foto do mês é atualizada a cada passagem: até o mês fechar, o
      // retrato é do dia. Depois disso ele congela e vira série.
      await supabase.rpc("tirar_foto", { p_org: o.id, p_referencia: null });
      alertas.push({
        org: o.nome,
        diferenca: Number(dif ?? 0),
        atribuidos: Number(atribuidos ?? 0),
      });
    }
  } catch (e) {
    console.error("[cron] falha ao gerar alertas:", e);
  }

  // Resumo do dia, por pessoa. Um e-mail por pessoa com o que é dela;
  // quem não tem nada para agir não recebe nada.
  const resumos: { pessoa: string; status: string }[] = [];
  try {
    const { data: orgs } = await supabase.from("orgs").select("id, nome");
    const endereco = new URL(requisicao.url).origin;

    for (const o of (orgs ?? []) as { id: string; nome: string }[]) {
      for (const linha of await resumoDoDia(supabase, o.id)) {
        const itens = await itensDaPessoa(supabase, o.id, linha.user_id, linha.apenas_alta);

        const envio = await enviarEmail({
          para: [linha.email],
          assunto: `${o.nome} — ${linha.alertas_altos > 0 ? "alertas de atenção alta" : "o que está na sua mão hoje"}`,
          html: htmlResumo({
            organizacao: o.nome,
            nome: linha.nome,
            alertas: itens.alertas,
            compromissos: itens.compromissos,
            endereco,
          }),
        });

        await supabase.from("envios").insert({
          org_id: o.id,
          tipo: "resumo",
          origem: "automatico",
          destinatarios: [linha.email],
          periodo_inicio: hoje,
          periodo_fim: hoje,
          assunto: "Resumo do dia",
          status: envio.status,
          detalhe: envio.detalhe,
        });

        resumos.push({ pessoa: linha.email, status: envio.status });
      }
    }
  } catch (e) {
    console.error("[cron] falha ao enviar resumos:", e);
  }

  const resultados: { carteira: string; status: string; detalhe?: string }[] = [];

  for (const item of fila) {
    const inicio = new Date();
    if (item.cadencia === "quinzenal") inicio.setDate(inicio.getDate() - 15);
    else if (item.cadencia === "trimestral") inicio.setMonth(inicio.getMonth() - 3);
    else inicio.setMonth(inicio.getMonth() - 1);

    const periodo = { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };

    try {
      const dados = await montarExtrato(supabase, item.org_id, item.carteira_id, periodo);
      if (!dados) {
        resultados.push({ carteira: item.nome, status: "falhou", detalhe: "carteira não encontrada" });
        continue;
      }

      const assunto = `${dados.carteira.nome} — situação da carteira`;
      const envio = await enviarEmail({
        para: item.destinatarios,
        assunto,
        html: htmlExtrato(dados),
      });

      await supabase.from("envios").insert({
        org_id: item.org_id,
        carteira_id: item.carteira_id,
        origem: "automatico",
        destinatarios: item.destinatarios,
        periodo_inicio: periodo.inicio,
        periodo_fim: periodo.fim,
        assunto,
        status: envio.status,
        detalhe: envio.detalhe,
      });

      // Só marca como enviada quando saiu de verdade: envio simulado ou
      // com falha deve ser tentado de novo no próximo ciclo.
      if (envio.status === "enviado") {
        await supabase
          .from("carteiras")
          .update({ extrato_ultimo_envio: hoje })
          .eq("id", item.carteira_id);
      }

      resultados.push({ carteira: item.nome, status: envio.status, detalhe: envio.detalhe });
    } catch (e) {
      const detalhe = e instanceof Error ? e.message : "falha desconhecida";
      await supabase.from("envios").insert({
        org_id: item.org_id,
        carteira_id: item.carteira_id,
        origem: "automatico",
        destinatarios: item.destinatarios,
        periodo_inicio: periodo.inicio,
        periodo_fim: periodo.fim,
        status: "falhou",
        detalhe,
      });
      resultados.push({ carteira: item.nome, status: "falhou", detalhe });
    }
  }

  return NextResponse.json({
    data: hoje,
    alertas,
    resumos,
    provedor: provedorConfigurado() ? "configurado" : "não configurado (envios simulados)",
    carteiras_na_fila: fila.length,
    resultados,
  });
}
