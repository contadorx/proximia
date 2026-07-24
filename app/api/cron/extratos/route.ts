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

  // ------------------------------------------------------------------
  // Dois modos, uma rotina só.
  //
  // Varrer alertas é barato e vale de hora em hora: contrato entra em
  // janela, compromisso vence, carteira para — quanto antes o aviso
  // aparecer, mais tempo há para agir. Já extrato e resumo por e-mail
  // são envio: de hora em hora viram spam e a pessoa desliga a
  // notificação, que é o pior desfecho possível.
  //
  // Por isso `?modo=avisos` faz só a varredura, e o modo completo (o
  // padrão) faz varredura + foto + envios. O agendamento em vercel.json
  // chama o primeiro de hora em hora e o segundo uma vez por dia.
  // ------------------------------------------------------------------
  const modo = new URL(requisicao.url).searchParams.get("modo") === "avisos"
    ? "avisos"
    : "completo";
  const soAvisos = modo === "avisos";

  // Período fechado: do mesmo dia do ciclo anterior até ontem.
  const fim = new Date();
  fim.setDate(fim.getDate() - 1);

  // Abre o diário da execução. Sem isto, uma rotina que não roda é
  // indistinguível de uma que rodou e não tinha nada a fazer.
  // O diário separa as duas: assim "a varredura não rodou" e "o envio não
  // rodou" são perguntas diferentes, com respostas diferentes.
  const { data: execucaoId } = await supabase.rpc("rotina_iniciar", {
    p_rotina: soAvisos ? "avisos" : "extratos",
  });

  // Falhas acumuladas, por organização. Só identificador e mensagem
  // técnica — nada de nome de conta ou valor sai daqui.
  const falhas: { org: string; etapa: string; erro: string }[] = [];

  // Alertas primeiro: assim o extrato do dia já sai com a situação varrida.
  const alertas: { org: string; diferenca: number; atribuidos: number }[] = [];
  let orgsTotal = 0;
  let orgsOk = 0;

  const { data: orgs, error: erroOrgs } = await supabase.from("orgs").select("id, nome");
  if (erroOrgs) {
    await supabase.rpc("rotina_concluir", {
      p_id: execucaoId,
      p_total: 0,
      p_ok: 0,
      p_falhas: [{ org: "-", etapa: "listar orgs", erro: erroOrgs.message }],
      p_detalhe: "não foi possível listar as organizações",
    });
    return NextResponse.json(
      { erro: "Não foi possível listar as organizações.", detalhe: erroOrgs.message },
      { status: 500 },
    );
  }

  orgsTotal = (orgs ?? []).length;

  for (const o of (orgs ?? []) as { id: string; nome: string }[]) {
    // Cada organização é uma ilha: o que falha numa não pode derrubar a
    // varredura das outras. Antes, uma exceção aqui abortava o laço
    // inteiro e as organizações seguintes ficavam sem varredura, sem
    // foto e sem ninguém saber.
    const errosDaOrg: string[] = [];

    const passo = async (etapa: string, fn: () => PromiseLike<{ error: unknown }>) => {
      try {
        const { error } = await fn();
        if (error) {
          const msg = (error as { message?: string }).message ?? String(error);
          errosDaOrg.push(`${etapa}: ${msg}`);
        }
      } catch (e) {
        errosDaOrg.push(`${etapa}: ${e instanceof Error ? e.message : "falha desconhecida"}`);
      }
    };

    const { data: dif, error: erroGerar } = await supabase.rpc("gerar_alertas", { p_org: o.id });
    if (erroGerar) errosDaOrg.push(`gerar_alertas: ${erroGerar.message}`);

    await passo("gerar_alertas_marcos", () => supabase.rpc("gerar_alertas_marcos", { p_org: o.id }));

    const { data: atribuidos, error: erroAtribuir } = await supabase.rpc("atribuir_alertas", {
      p_org: o.id,
    });
    if (erroAtribuir) errosDaOrg.push(`atribuir_alertas: ${erroAtribuir.message}`);

    await passo("atribuir_compromissos", () =>
      supabase.rpc("atribuir_compromissos", { p_org: o.id }),
    );

    // A foto do mês é atualizada a cada passagem: até o mês fechar, o
    // retrato é do dia. Depois disso ele congela e vira série. É o passo
    // cuja falha silenciosa deixa buraco permanente no histórico.
    // Foto é retrato do dia: uma por dia, no modo completo.
    if (!soAvisos) {
      await passo("tirar_foto", () =>
        supabase.rpc("tirar_foto", { p_org: o.id, p_referencia: null }),
      );
    }

    if (errosDaOrg.length === 0) {
      orgsOk += 1;
    } else {
      for (const erro of errosDaOrg) {
        const [etapa, ...resto] = erro.split(": ");
        falhas.push({ org: o.id, etapa, erro: resto.join(": ") });
      }
      console.error(`[cron] organização ${o.id}: ${errosDaOrg.join(" · ")}`);
    }

    alertas.push({
      org: o.nome,
      diferenca: Number(dif ?? 0),
      atribuidos: Number(atribuidos ?? 0),
    });
  }

  // Resumo do dia, por pessoa. Um e-mail por pessoa com o que é dela;
  // quem não tem nada para agir não recebe nada.
  const resumos: { pessoa: string; status: string }[] = [];
  try {
    // No modo avisos nada é enviado: a varredura já aconteceu acima, e é
    // ela que interessa de hora em hora. Lista vazia faz os laços abaixo
    // não terem o que percorrer — sem desvio de fluxo por exceção.
    const { data: orgs } = soAvisos
      ? { data: [] as { id: string; nome: string }[] }
      : await supabase.from("orgs").select("id, nome");
    const endereco = new URL(requisicao.url).origin;

    // Trava de reenvio. O extrato por carteira já se protege sozinho
    // (carteiras_para_enviar só devolve quem tem extrato_ultimo_envio
    // anterior a hoje), mas o resumo por pessoa não tinha nada: rodar a
    // rotina duas vezes no mesmo dia — coisa banal num reprocessamento
    // manual, ou se o agendador repetir — mandava dois e-mails para cada
    // pessoa. Aqui se lê o que já saiu hoje e se pula quem já recebeu.
    const { data: jaEnviados } = await supabase
      .from("envios")
      .select("destinatarios")
      .eq("tipo", "resumo")
      .eq("periodo_inicio", hoje);

    const recebeuHoje = new Set<string>();
    for (const e of (jaEnviados ?? []) as { destinatarios: string[] | null }[]) {
      for (const d of e.destinatarios ?? []) recebeuHoje.add(d.toLowerCase());
    }

    for (const o of (orgs ?? []) as { id: string; nome: string }[]) {
      for (const linha of await resumoDoDia(supabase, o.id)) {
        if (recebeuHoje.has(linha.email.toLowerCase())) {
          resumos.push({ pessoa: linha.email, status: "pulado (já recebeu hoje)" });
          continue;
        }
        recebeuHoje.add(linha.email.toLowerCase());

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

  // Extratos que falharam também contam como falha da rotina.
  for (const r of resultados) {
    if (r.status === "falhou") {
      falhas.push({ org: "-", etapa: "extrato", erro: `${r.carteira}: ${r.detalhe ?? "sem detalhe"}` });
    }
  }

  // Limpeza do que não ajuda mais: erro de trinta dias atrás não
  // diagnostica nada e vira custo de armazenamento.
  // Limpeza é diária: não faz sentido de hora em hora.
  if (!soAvisos) await supabase.rpc("limpar_erros_antigos", { p_dias: 30 });

  // Fecha o diário. A situação é derivada: ok, parcial ou falhou.
  await supabase.rpc("rotina_concluir", {
    p_id: execucaoId,
    p_total: orgsTotal,
    p_ok: orgsOk,
    p_falhas: falhas,
    p_detalhe: provedorConfigurado() ? null : "provedor de e-mail não configurado (envios simulados)",
  });

  // O status HTTP passa a dizer a verdade. Antes, a rotina podia falhar
  // em todas as organizações e ainda responder 200 — o agendador da
  // Vercel marcaria sucesso e ninguém saberia de nada.
  const situacao = falhas.length === 0 ? "ok" : orgsOk === 0 ? "falhou" : "parcial";
  const status = situacao === "ok" ? 200 : situacao === "parcial" ? 207 : 500;

  return NextResponse.json(
    {
      data: hoje,
      situacao,
      orgs: { total: orgsTotal, ok: orgsOk, com_falha: orgsTotal - orgsOk },
      falhas,
      alertas,
      resumos,
      provedor: provedorConfigurado() ? "configurado" : "não configurado (envios simulados)",
      carteiras_na_fila: fila.length,
      resultados,
    },
    { status },
  );
}
