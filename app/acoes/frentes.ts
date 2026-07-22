"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";
import { obterFrente } from "@/lib/frentes";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

function texto(formData: FormData, campo: string): string | null {
  const valor = String(formData.get(campo) ?? "").trim();
  return valor === "" ? null : valor;
}

function numero(formData: FormData, campo: string): number | null {
  const bruto = texto(formData, campo);
  if (bruto === null) return null;
  const valor = Number(bruto.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isNaN(valor) ? null : valor;
}

function traduzir(mensagem: string, codigo?: string): string {
  if (/frente_potencial_declarado/i.test(mensagem)) {
    return "Para registrar um potencial, informe também de onde veio a estimativa.";
  }
  if (/descarte_justificado/i.test(mensagem)) {
    return "Para descartar a frente, escreva o motivo. É o que fica de aprendizado.";
  }
  if (codigo === "23505" || /idx_catalogo_nome/i.test(mensagem)) {
    return "Já existe um tipo de frente com esse nome.";
  }
  if (codigo === "42501" || /row-level security/i.test(mensagem)) {
    return "Seu perfil não permite essa alteração nesta carteira.";
  }
  return mensagem;
}

export async function criarTipoFrente(formData: FormData) {
  const org = await exigirOrg();
  const nome = texto(formData, "nome");
  if (!nome) comErro("/frentes", "Informe o nome do tipo de frente.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("frente_catalogo").insert({
    org_id: org.orgId,
    nome,
    descricao: texto(formData, "descricao"),
  });

  if (error) comErro("/frentes", traduzir(error.message, error.code));

  revalidatePath("/frentes");
  redirect(`/configuracoes?ok=${encodeURIComponent("Tipo de frente incluído.")}`);
}

export async function criarFrente(formData: FormData) {
  const org = await exigirOrg();

  const titulo = texto(formData, "titulo");
  const carteiraId = String(formData.get("carteira_id") ?? "");
  if (!titulo) comErro("/frentes", "Informe o título da frente.");
  if (!carteiraId) comErro("/frentes", "Escolha a carteira desta frente.");

  const potencial = numero(formData, "potencial_bruto");
  const origem = texto(formData, "potencial_origem");
  if (potencial !== null && !origem) {
    comErro("/frentes", "Informe de onde veio a estimativa de potencial.");
  }

  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("frentes")
    .insert({
      org_id: org.orgId,
      carteira_id: carteiraId,
      catalogo_id: texto(formData, "catalogo_id"),
      titulo,
    natureza: String(formData.get("natureza") ?? "captura"),
    prioridade: Number(formData.get("prioridade") ?? 3) || 3,
      status: String(formData.get("status") ?? "identificada"),
      dono_id: texto(formData, "dono_id"),
      qtd_casos: numero(formData, "qtd_casos"),
      potencial_bruto: potencial,
      potencial_origem: potencial === null ? null : origem,
      potencial_data:
        potencial === null ? null : (texto(formData, "potencial_data") ?? new Date().toISOString().slice(0, 10)),
      proxima_etapa: texto(formData, "proxima_etapa"),
      prazo: texto(formData, "prazo"),
    })
    .select("id")
    .single();

  if (error) comErro("/frentes", traduzir(error.message, error.code));

  revalidatePath("/frentes");
  redirect(`/frentes/${(data as { id: string }).id}`);
}

export async function atualizarFrente(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const rota = `/frentes/${id}`;

  const titulo = texto(formData, "titulo");
  if (!titulo) comErro(rota, "Informe o título da frente.");

  const status = String(formData.get("status") ?? "identificada");
  const motivo = texto(formData, "motivo_descarte");
  if (status === "descartada" && !motivo) {
    comErro(rota, "Para descartar a frente, escreva o motivo. É o que fica de aprendizado.");
  }

  const potencial = numero(formData, "potencial_bruto");
  const origem = texto(formData, "potencial_origem");
  if (potencial !== null && !origem) comErro(rota, "Informe de onde veio a estimativa de potencial.");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("frentes")
    .update(
      {
        titulo,
        catalogo_id: texto(formData, "catalogo_id"),
        status,
        motivo_descarte: status === "descartada" ? motivo : null,
        dono_id: texto(formData, "dono_id"),
        qtd_casos: numero(formData, "qtd_casos"),
        potencial_bruto: potencial,
        potencial_origem: potencial === null ? null : origem,
        potencial_data:
          potencial === null
            ? null
            : (texto(formData, "potencial_data") ?? new Date().toISOString().slice(0, 10)),
      // valor_capturado é soma dos lançamentos de captura: não se escreve aqui.
        proxima_etapa: texto(formData, "proxima_etapa"),
        prazo: texto(formData, "prazo"),
        observacoes: texto(formData, "observacoes"),
      },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada foi alterado: seu perfil não permite editar esta frente.");

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Frente atualizada.")}`);
}

export async function incluirLink(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const rota = `/frentes/${id}`;

  const rotulo = texto(formData, "rotulo");
  const url = texto(formData, "url");
  if (!rotulo || !url) comErro(rota, "Informe o nome e o endereço do link.");

  const frente = await obterFrente(id);
  if (!frente) comErro(rota, "Frente não encontrada.");

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("frentes")
    .update({ links: [...(frente.links ?? []), { rotulo, url }] })
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Link incluído.")}`);
}

export async function removerLink(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const posicao = Number(formData.get("posicao") ?? -1);
  const rota = `/frentes/${id}`;

  const frente = await obterFrente(id);
  if (!frente) comErro(rota, "Frente não encontrada.");

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("frentes")
    .update({ links: (frente.links ?? []).filter((_, i) => i !== posicao) })
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Link removido.")}`);
}
