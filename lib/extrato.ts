import type { SupabaseClient } from "@supabase/supabase-js";
import { formatarData, formatarValor } from "./contas";

/**
 * Monta o extrato de uma carteira e gera o HTML do e-mail.
 *
 * Recebe o cliente Supabase de fora de proposito: a mesma funcao serve a
 * pagina (cliente da sessao, sob RLS) e a rotina diaria (cliente de
 * servidor, que atravessa organizacoes).
 */

export type DadosExtrato = {
  carteira: { id: string; nome: string; codigo: string | null; regiao: string | null };
  organizacao: string;
  periodo: { inicio: string; fim: string };
  contas: number;
  frentesAbertas: { titulo: string; casos: number | null; potencial: number | null; capturado: number | null; proxima: string | null }[];
  contratos: { numero: string | null; conta: string; fim: string | null; situacao: string }[];
  entregas: { data: string; titulo: string; corpo: string }[];
  pendencias: { titulo: string; vence: string }[];
  potencial: number;
  capturado: number;
};

export async function montarExtrato(
  supabase: SupabaseClient,
  orgId: string,
  carteiraId: string,
  periodo: { inicio: string; fim: string },
): Promise<DadosExtrato | null> {
  const [{ data: carteira }, { data: org }] = await Promise.all([
    supabase.from("carteiras").select("id, nome, codigo, regiao").eq("id", carteiraId).maybeSingle(),
    supabase.from("orgs").select("nome").eq("id", orgId).maybeSingle(),
  ]);

  if (!carteira) return null;

  const [{ data: contas }, { data: frentes }, { data: contratos }, { data: registros }, { data: compromissos }] =
    await Promise.all([
      supabase
        .from("contas")
        .select("id, nome, potencial_bruto, valor_capturado")
        .eq("carteira_id", carteiraId)
        .eq("status", "ativa"),
      supabase
        .from("frentes")
        .select("titulo, status, qtd_casos, potencial_bruto, valor_capturado, proxima_etapa")
        .eq("carteira_id", carteiraId),
      supabase
        .from("contratos")
        .select("numero, conta_id, fim, status, janela_renegociacao")
        .eq("carteira_id", carteiraId)
        .neq("status", "encerrado"),
      supabase
        .from("registros")
        .select("titulo, corpo, tipo, ocorrido_em")
        .eq("carteira_id", carteiraId)
        .eq("ativo", true)
        .gte("ocorrido_em", periodo.inicio)
        .lte("ocorrido_em", periodo.fim)
        .in("tipo", ["entrega", "decisao"])
        .order("ocorrido_em", { ascending: false })
        .limit(20),
      supabase
        .from("compromissos")
        .select("titulo, vence_em")
        .eq("carteira_id", carteiraId)
        .eq("status", "aberto")
        .order("vence_em")
        .limit(10),
    ]);

  const listaContas = contas ?? [];
  const nomeConta = (id: string) =>
    (listaContas.find((c) => c.id === id)?.nome as string) ?? "conta";

  const abertas = (frentes ?? []).filter((f) =>
    ["identificada", "em_analise", "em_execucao"].includes(f.status as string),
  );

  const hoje = new Date().toISOString().slice(0, 10);

  return {
    carteira: carteira as DadosExtrato["carteira"],
    organizacao: (org?.nome as string) ?? "",
    periodo,
    contas: listaContas.length,
    frentesAbertas: abertas.map((f) => ({
      titulo: f.titulo as string,
      casos: f.qtd_casos as number | null,
      potencial: f.potencial_bruto as number | null,
      capturado: f.valor_capturado as number | null,
      proxima: f.proxima_etapa as string | null,
    })),
    contratos: (contratos ?? [])
      .filter(
        (c) =>
          (c.fim && (c.fim as string) < hoje) ||
          (c.janela_renegociacao && (c.janela_renegociacao as string) <= hoje),
      )
      .map((c) => ({
        numero: c.numero as string | null,
        conta: nomeConta(c.conta_id as string),
        fim: c.fim as string | null,
        situacao: c.fim && (c.fim as string) < hoje ? "vencido" : "janela aberta",
      })),
    entregas: (registros ?? []).map((r) => ({
      data: r.ocorrido_em as string,
      titulo: (r.titulo as string) ?? (r.tipo === "decisao" ? "Decisão" : "Entrega"),
      corpo: r.corpo as string,
    })),
    pendencias: (compromissos ?? []).map((c) => ({
      titulo: c.titulo as string,
      vence: c.vence_em as string,
    })),
    potencial:
      abertas.reduce((t, f) => t + Number(f.potencial_bruto ?? 0), 0) +
      listaContas.reduce((t, c) => t + Number(c.potencial_bruto ?? 0), 0),
    capturado:
      (frentes ?? []).reduce((t, f) => t + Number(f.valor_capturado ?? 0), 0) +
      listaContas.reduce((t, c) => t + Number(c.valor_capturado ?? 0), 0),
  };
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML do e-mail: tabelas e estilo em linha, que é o que cliente de e-mail entende. */
export function htmlExtrato(d: DadosExtrato): string {
  const tinta = "#1b2a4a";
  const cinza = "#64748b";
  const linha = "#e2e8f0";
  const verde = "#157a51";

  const bloco = (titulo: string, conteudo: string) => `
    <tr><td style="padding:20px 0 6px;">
      <div style="font:600 11px/1.4 Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:${cinza};border-bottom:1px solid ${linha};padding-bottom:6px;">${titulo}</div>
    </td></tr>
    <tr><td style="font:400 13px/1.55 Arial,sans-serif;color:${tinta};">${conteudo}</td></tr>`;

  const vazio = (texto: string) =>
    `<div style="font:400 13px/1.5 Arial,sans-serif;color:${cinza};padding:8px 0;">${texto}</div>`;

  const frentes = d.frentesAbertas.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${d.frentesAbertas
        .map(
          (f) => `<tr>
            <td style="padding:7px 0;border-bottom:1px solid ${linha};font:400 13px/1.45 Arial,sans-serif;color:${tinta};">
              <strong>${escapar(f.titulo)}</strong>
              ${f.casos !== null ? `<span style="color:${cinza};"> · ${f.casos.toLocaleString("pt-BR")} casos</span>` : ""}
              ${f.proxima ? `<div style="color:${cinza};font-size:12px;">${escapar(f.proxima)}</div>` : ""}
            </td>
            <td align="right" style="padding:7px 0;border-bottom:1px solid ${linha};white-space:nowrap;font:400 12px/1.5 Arial,sans-serif;">
              <span style="color:${cinza};">teto ${formatarValor(f.potencial)}</span><br>
              <span style="color:${verde};">capt. ${formatarValor(f.capturado)}</span>
            </td>
          </tr>`,
        )
        .join("")}</table>`
    : vazio("Nenhuma frente em aberto.");

  const contratos = d.contratos.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${d.contratos
        .map(
          (c) => `<tr>
            <td style="padding:7px 0;border-bottom:1px solid ${linha};font:400 13px/1.45 Arial,sans-serif;color:${tinta};">
              <strong>${escapar(c.numero ?? "sem número")}</strong> · ${escapar(c.conta)}
            </td>
            <td align="right" style="padding:7px 0;border-bottom:1px solid ${linha};white-space:nowrap;font:400 12px/1.5 Arial,sans-serif;color:#c2410c;">
              ${c.situacao}${c.fim ? ` · vence ${formatarData(c.fim)}` : ""}
            </td>
          </tr>`,
        )
        .join("")}</table>`
    : vazio("Nenhum contrato vencido ou com janela aberta.");

  const entregas = d.entregas.length
    ? d.entregas
        .map(
          (e) => `<div style="padding:7px 0;border-bottom:1px solid ${linha};">
            <span style="color:${cinza};font-size:12px;">${formatarData(e.data)}</span>
            <strong style="margin-left:8px;">${escapar(e.titulo)}</strong>
            <div style="color:#334155;font-size:12.5px;">${escapar(e.corpo)}</div>
          </div>`,
        )
        .join("")
    : vazio("Nada registrado como entrega ou decisão neste período.");

  const pendencias = d.pendencias.length
    ? d.pendencias
        .map(
          (p) => `<div style="padding:6px 0;border-bottom:1px solid ${linha};font-size:13px;">
            <span style="color:${cinza};font-size:12px;">${formatarData(p.vence)}</span>
            <span style="margin-left:8px;">${escapar(p.titulo)}</span>
          </div>`,
        )
        .join("")
    : vazio("Nenhum compromisso em aberto.");

  const numero = (rotulo: string, valor: string, cor = tinta) => `
    <td width="25%" style="padding:0 8px 0 0;vertical-align:top;">
      <div style="font:600 10px/1.4 Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:${cinza};">${rotulo}</div>
      <div style="font:400 18px/1.3 Arial,sans-serif;color:${cor};">${valor}</div>
    </td>`;

  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f6f8fa;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid ${linha};border-radius:10px;">
  <tr><td style="padding:28px 30px 0;">
    <div style="font:600 11px/1.4 Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:${cinza};">${escapar(d.organizacao)} · situação da carteira</div>
    <h1 style="font:700 22px/1.25 Arial,sans-serif;color:${tinta};margin:6px 0 4px;">${escapar(d.carteira.nome)}</h1>
    <div style="font:400 13px/1.5 Arial,sans-serif;color:${cinza};">
      ${[d.carteira.codigo, d.carteira.regiao].filter((v): v is string => Boolean(v)).map(escapar).join(" · ")}
      ${d.carteira.codigo || d.carteira.regiao ? " · " : ""}${formatarData(d.periodo.inicio)} a ${formatarData(d.periodo.fim)}
    </div>
  </td></tr>

  <tr><td style="padding:20px 30px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${linha};border-bottom:1px solid ${linha};padding:14px 0;"><tr>
      ${numero("Contas", String(d.contas))}
      ${numero("Frentes abertas", String(d.frentesAbertas.length))}
      ${numero("Potencial", formatarValor(d.potencial), cinza)}
      ${numero("Capturado", formatarValor(d.capturado), verde)}
    </tr></table>
  </td></tr>

  <tr><td style="padding:0 30px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${bloco("Frentes em aberto", frentes)}
      ${bloco("Contratos que exigem decisão", contratos)}
      ${bloco("Entregue no período", entregas)}
      ${bloco("Pendências", pendencias)}
    </table>
  </td></tr>

  <tr><td style="padding:22px 30px 28px;">
    <div style="border-top:1px solid ${linha};padding-top:12px;font:400 11px/1.5 Arial,sans-serif;color:${cinza};">
      Potencial é teto estimado, com origem e data registradas em cada item; capturado é o que já se
      confirmou. Os dois números têm naturezas diferentes e não se somam.
      <br>Gerado automaticamente em ${new Date().toLocaleDateString("pt-BR")}.
    </div>
  </td></tr>
</table>
</body></html>`;
}
