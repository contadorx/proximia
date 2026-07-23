"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOrg } from "@/lib/auth";
import { obterFrente } from "@/lib/frentes";
import { inteiroDe, numeroDe, textoDe, type EstadoAcao } from "@/lib/formulario";

function comErro(rota: string, mensagem: string): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
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
  const nome = textoDe(formData, "nome");
  if (!nome) comErro("/frentes", "Informe o nome do tipo de frente.");

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("frente_catalogo").insert({
    org_id: org.orgId,
    nome,
    descricao: textoDe(formData, "descricao"),
  });

  if (error) comErro("/frentes", traduzir(error.message, error.code));

  revalidatePath("/frentes");
  redirect(`/configuracoes?ok=${encodeURIComponent("Tipo de frente incluído.")}`);
}

export async function criarFrente(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const org = await exigirOrg();

  const titulo = textoDe(formData, "titulo");
  const carteiraId = String(formData.get("carteira_id") ?? "");
  if (!titulo) return { erro: "Informe o título da frente." };
  if (!carteiraId) return { erro: "Escolha a carteira desta frente." };

  const potencial = numeroDe(formData, "potencial_bruto");
  const origem = textoDe(formData, "potencial_origem");
  if (potencial !== null && !origem) {
    return { erro: "Informe de onde veio a estimativa de potencial." };
  }

  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .from("frentes")
    .insert({
      org_id: org.orgId,
      carteira_id: carteiraId,
      catalogo_id: textoDe(formData, "catalogo_id"),
      titulo,
      natureza: String(formData.get("natureza") ?? "captura"),
      prioridade: inteiroDe(formData, "prioridade", 3, 1, 5),
      status: String(formData.get("status") ?? "identificada"),
      dono_id: textoDe(formData, "dono_id"),
      qtd_casos: numeroDe(formData, "qtd_casos"),
      potencial_bruto: potencial,
      potencial_origem: potencial === null ? null : origem,
      potencial_data:
        potencial === null
          ? null
          : (textoDe(formData, "potencial_data") ?? new Date().toISOString().slice(0, 10)),
      proxima_etapa: textoDe(formData, "proxima_etapa"),
      prazo: textoDe(formData, "prazo"),
    })
    .select("id")
    .single();

  if (error) return { erro: traduzir(error.message, error.code) };

  revalidatePath("/frentes");
  redirect(`/frentes/${(data as { id: string }).id}`);
}

export async function atualizarFrente(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const rota = `/frentes/${id}`;

  const titulo = textoDe(formData, "titulo");
  if (!titulo) return { erro: "Informe o título da frente." };

  const status = String(formData.get("status") ?? "identificada");
  const motivo = textoDe(formData, "motivo_descarte");
  if (status === "descartada" && !motivo) {
    return { erro: "Para descartar a frente, escreva o motivo. É o que fica de aprendizado." };
  }

  const potencial = numeroDe(formData, "potencial_bruto");
  const origem = textoDe(formData, "potencial_origem");
  if (potencial !== null && !origem) {
    return { erro: "Informe de onde veio a estimativa de potencial." };
  }

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("frentes")
    .update(
      {
        titulo,
        catalogo_id: textoDe(formData, "catalogo_id"),
        // Natureza e prioridade agora se corrigem: classificar errado na
        // criação não pode ser sentença perpétua.
        natureza: String(formData.get("natureza") ?? "captura"),
        prioridade: inteiroDe(formData, "prioridade", 3, 1, 5),
        status,
        motivo_descarte: status === "descartada" ? motivo : null,
        dono_id: textoDe(formData, "dono_id"),
        qtd_casos: numeroDe(formData, "qtd_casos"),
        potencial_bruto: potencial,
        potencial_origem: potencial === null ? null : origem,
        potencial_data:
          potencial === null
            ? null
            : (textoDe(formData, "potencial_data") ?? new Date().toISOString().slice(0, 10)),
        // valor_capturado é soma dos lançamentos de captura: não se escreve aqui.
        proxima_etapa: textoDe(formData, "proxima_etapa"),
        prazo: textoDe(formData, "prazo"),
        observacoes: textoDe(formData, "observacoes"),
      },
      { count: "exact" },
    )
    .eq("id", id);

  if (error) return { erro: traduzir(error.message, error.code) };
  if (count === 0) return { erro: "Nada foi alterado: seu perfil não permite editar esta frente." };

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Frente atualizada.")}`);
}

export async function incluirLink(formData: FormData) {
  await exigirOrg();
  const id = String(formData.get("id") ?? "");
  const rota = `/frentes/${id}`;

  const rotulo = textoDe(formData, "rotulo");
  const url = textoDe(formData, "url");
  if (!rotulo || !url) comErro(rota, "Informe o nome e o endereço do link.");

  const frente = await obterFrente(id);
  if (!frente) comErro(rota, "Frente não encontrada.");

  const supabase = criarClienteServidor();
  const { error, count } = await supabase
    .from("frentes")
    .update({ links: [...(frente.links ?? []), { rotulo, url }] }, { count: "exact" })
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada mudou: seu perfil não permite editar esta frente.");

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
  const { error, count } = await supabase
    .from("frentes")
    .update({ links: (frente.links ?? []).filter((_, i) => i !== posicao) }, { count: "exact" })
    .eq("id", id);

  if (error) comErro(rota, traduzir(error.message, error.code));
  if (count === 0) comErro(rota, "Nada mudou: seu perfil não permite editar esta frente.");

  revalidatePath(rota);
  redirect(`${rota}?ok=${encodeURIComponent("Link removido.")}`);
}
