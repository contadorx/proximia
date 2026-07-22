import type { SupabaseClient } from "@supabase/supabase-js";

export type LinhaResumo = {
  user_id: string;
  email: string;
  nome: string | null;
  alertas_altos: number;
  alertas_total: number;
  compromissos_atrasados: number;
  compromissos_hoje: number;
  apenas_alta: boolean;
};

export type ItemResumo = { titulo: string; detalhe: string; grave: boolean };

export async function resumoDoDia(
  supabase: SupabaseClient,
  orgId: string,
): Promise<LinhaResumo[]> {
  const { data, error } = await supabase.rpc("resumo_do_dia", { p_org: orgId });
  if (error) {
    console.error("[resumo] falha ao consultar:", error.message);
    return [];
  }
  return (data ?? []) as LinhaResumo[];
}

/** Os itens que vão nomeados no corpo do e-mail, para não ser só contagem. */
export async function itensDaPessoa(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  apenasAlta: boolean,
): Promise<{ alertas: ItemResumo[]; compromissos: ItemResumo[] }> {
  const hoje = new Date().toISOString().slice(0, 10);

  const consultaAlertas = supabase
    .from("alertas")
    .select("titulo, detalhe, severidade")
    .eq("org_id", orgId)
    .eq("dono_id", userId)
    .eq("status", "aberto")
    .order("severidade")
    .limit(12);

  const [{ data: alertas }, { data: compromissos }] = await Promise.all([
    apenasAlta ? consultaAlertas.eq("severidade", "alta") : consultaAlertas,
    apenasAlta
      ? Promise.resolve({ data: [] })
      : supabase
          .from("compromissos")
          .select("titulo, vence_em")
          .eq("org_id", orgId)
          .eq("dono_id", userId)
          .eq("status", "aberto")
          .lte("vence_em", hoje)
          .order("vence_em")
          .limit(12),
  ]);

  return {
    alertas: ((alertas ?? []) as { titulo: string; detalhe: string | null; severidade: string }[]).map(
      (a) => ({
        titulo: a.titulo,
        detalhe: a.detalhe ?? "",
        grave: a.severidade === "alta",
      }),
    ),
    compromissos: ((compromissos ?? []) as { titulo: string; vence_em: string }[]).map((c) => ({
      titulo: c.titulo,
      detalhe:
        c.vence_em < hoje
          ? `venceu em ${new Date(`${c.vence_em}T00:00:00`).toLocaleDateString("pt-BR")}`
          : "vence hoje",
      grave: c.vence_em < hoje,
    })),
  };
}

function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function htmlResumo(dados: {
  organizacao: string;
  nome: string | null;
  alertas: ItemResumo[];
  compromissos: ItemResumo[];
  endereco: string;
}): string {
  const tinta = "#1b2a4a";
  const cinza = "#64748b";
  const linha = "#e2e8f0";
  const vermelho = "#c2410c";

  const bloco = (titulo: string, itens: ItemResumo[]) =>
    itens.length === 0
      ? ""
      : `
    <tr><td style="padding:18px 0 6px;">
      <div style="font:600 11px/1.4 Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:${cinza};border-bottom:1px solid ${linha};padding-bottom:6px;">${titulo}</div>
    </td></tr>
    <tr><td>${itens
      .map(
        (i) => `<div style="padding:8px 0;border-bottom:1px solid ${linha};">
          <div style="font:700 13px/1.4 Arial,sans-serif;color:${i.grave ? vermelho : tinta};">${escapar(i.titulo)}</div>
          ${i.detalhe ? `<div style="font:400 12px/1.5 Arial,sans-serif;color:${cinza};">${escapar(i.detalhe)}</div>` : ""}
        </div>`,
      )
      .join("")}</td></tr>`;

  const primeiroNome = (dados.nome ?? "").split(" ")[0];

  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f6f8fa;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid ${linha};border-radius:10px;">
  <tr><td style="padding:26px 30px 0;">
    <div style="font:600 11px/1.4 Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:${cinza};">${escapar(dados.organizacao)} · resumo do dia</div>
    <h1 style="font:700 20px/1.3 Arial,sans-serif;color:${tinta};margin:6px 0 4px;">
      ${primeiroNome ? `${escapar(primeiroNome)}, ` : ""}o que está na sua mão
    </h1>
    <p style="font:400 13px/1.5 Arial,sans-serif;color:${cinza};margin:0;">
      Só chega quando há algo para agir — nenhum e-mail significa nada pendente.
    </p>
  </td></tr>

  <tr><td style="padding:0 30px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${bloco("Alertas", dados.alertas)}
      ${bloco("Compromissos vencendo", dados.compromissos)}
    </table>
  </td></tr>

  <tr><td style="padding:22px 30px 28px;">
    <a href="${dados.endereco}/painel" style="display:inline-block;background:#1c9d68;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font:700 13px Arial,sans-serif;">Abrir o painel</a>
    <div style="border-top:1px solid ${linha};margin-top:20px;padding-top:12px;font:400 11px/1.5 Arial,sans-serif;color:#94a3b8;">
      Para deixar de receber, abra Configurações e desligue o resumo diário.
    </div>
  </td></tr>
</table>
</body></html>`;
}
