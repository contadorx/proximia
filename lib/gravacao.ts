import type { SupabaseClient } from "@supabase/supabase-js";
import { tabelaDestino, type Referencias, type TipoImportacao } from "./importacao";

/**
 * Gravação das linhas já conferidas — uma implementação só.
 *
 * Isto existe porque a porta de entrada por API (B45) precisa gravar
 * exatamente o que a importação de planilha grava. Reimplementar o mesmo
 * comportamento em dois lugares é como as regras divergem em silêncio:
 * um lado ganha uma correção, o outro não, e ninguém percebe até o dado
 * sair errado.
 *
 * O que esta função NÃO faz: validar. A conferência linha a linha
 * continua sendo `validar()` de lib/importacao.ts, também compartilhada.
 * Aqui entra só o que já passou.
 */

export type ResultadoGravacao = {
  gravadas: number;
  detalhe: string | null;
  /** Preenchido quando a carga parou no meio: o que entrou continua valendo. */
  erro: string | null;
};

/**
 * Pessoas citadas por nome nas linhas (responsável, dono) que ainda não
 * existem na equipe são criadas agora — a planilha e o sistema de origem
 * chegam antes dos convites, e o dado precisa nascer com dono. A pessoa
 * entra só com o nome; e-mail e convite vêm depois.
 */
async function resolverEquipe(
  supabase: SupabaseClient,
  orgId: string,
  linhas: Record<string, unknown>[],
  autorId: string | null,
): Promise<Map<string, string>> {
  const pendentes = new Map<string, string>();
  for (const l of linhas) {
    for (const campo of ["responsavel_nome", "dono_nome"]) {
      const nome = l[campo];
      if (typeof nome === "string" && nome.trim() !== "") {
        pendentes.set(nome.trim().toLowerCase(), nome.trim());
      }
    }
  }

  const idPorNome = new Map<string, string>();
  if (pendentes.size === 0) return idPorNome;

  const { data: existentes } = await supabase
    .from("equipe")
    .select("id, nome")
    .eq("org_id", orgId);

  for (const e of (existentes ?? []) as { id: string; nome: string }[]) {
    idPorNome.set(e.nome.trim().toLowerCase(), e.id);
  }

  const criar = [...pendentes.entries()].filter(([chave]) => !idPorNome.has(chave));
  if (criar.length > 0) {
    const { data: criadas, error } = await supabase
      .from("equipe")
      .insert(criar.map(([, nome]) => ({ org_id: orgId, nome, criado_por: autorId })))
      .select("id, nome");

    if (error) throw new Error(`Não foi possível criar as pessoas da equipe: ${error.message}`);

    for (const e of (criadas ?? []) as { id: string; nome: string }[]) {
      idPorNome.set(e.nome.trim().toLowerCase(), e.id);
    }
  }

  return idPorNome;
}

/**
 * Maturidade não é uma linha por registro: cada resposta precisa de uma
 * avaliação da carteira naquele ciclo. As que faltam são criadas antes,
 * senão a resposta não tem onde pendurar.
 */
async function gravarMaturidade(
  supabase: SupabaseClient,
  orgId: string,
  linhas: Record<string, unknown>[],
  autorId: string | null,
): Promise<ResultadoGravacao> {
  const combinacoes = new Map<string, { carteira_id: string; ciclo_id: string }>();
  for (const l of linhas) {
    const chave = `${l.carteira_id}:${l.ciclo_id}`;
    if (!combinacoes.has(chave)) {
      combinacoes.set(chave, {
        carteira_id: String(l.carteira_id),
        ciclo_id: String(l.ciclo_id),
      });
    }
  }

  const { error: erroAval } = await supabase.from("maturidade_avaliacoes").upsert(
    [...combinacoes.values()].map((c) => ({
      org_id: orgId,
      carteira_id: c.carteira_id,
      ciclo_id: c.ciclo_id,
      observacoes: "Carga por importação.",
      criado_por: autorId,
    })),
    { onConflict: "carteira_id,ciclo_id", ignoreDuplicates: true },
  );

  if (erroAval) {
    return { gravadas: 0, detalhe: null, erro: `Não foi possível preparar as avaliações: ${erroAval.message}` };
  }

  const { data: avaliacoes } = await supabase
    .from("maturidade_avaliacoes")
    .select("id, carteira_id, ciclo_id")
    .eq("org_id", orgId);

  const porChave = new Map(
    ((avaliacoes ?? []) as { id: string; carteira_id: string; ciclo_id: string }[]).map((a) => [
      `${a.carteira_id}:${a.ciclo_id}`,
      a.id,
    ]),
  );

  const respostas = linhas.map((l) => ({
    org_id: orgId,
    avaliacao_id: porChave.get(`${l.carteira_id}:${l.ciclo_id}`),
    pergunta_id: l.pergunta_id,
    nota: l.nota,
    observacao: l.observacao ?? null,
    criado_por: autorId,
  }));

  const { error: erroResp } = await supabase
    .from("maturidade_respostas")
    .upsert(respostas, { onConflict: "avaliacao_id,pergunta_id" });

  if (erroResp) {
    return { gravadas: 0, detalhe: null, erro: `Não foi possível gravar as respostas: ${erroResp.message}` };
  }

  return {
    gravadas: respostas.length,
    detalhe: `${respostas.length} resposta(s) em ${combinacoes.size} avaliação(ões). Conclua cada uma para publicar o score.`,
    erro: null,
  };
}

/**
 * Grava as linhas conferidas. Serve a importação de planilha e a porta de
 * entrada por API — mesma regra, mesmo comportamento, mesmo resultado.
 *
 * O `orgId` vem de quem chama, mas nunca do corpo de uma requisição
 * externa: na tela vem da sessão, e na API vem do banco, resolvido a
 * partir da chave. Este módulo não escolhe organização.
 */
export async function gravarLinhas(
  supabase: SupabaseClient,
  opcoes: {
    orgId: string;
    tipo: TipoImportacao;
    linhas: Record<string, unknown>[];
    autorId: string | null;
  },
): Promise<ResultadoGravacao> {
  const { orgId, tipo, linhas, autorId } = opcoes;

  if (linhas.length === 0) {
    return { gravadas: 0, detalhe: "Nenhuma linha válida para gravar.", erro: null };
  }

  if (tipo === "maturidade") {
    return gravarMaturidade(supabase, orgId, linhas, autorId);
  }

  let idPorNome: Map<string, string>;
  try {
    idPorNome = await resolverEquipe(supabase, orgId, linhas, autorId);
  } catch (e) {
    return { gravadas: 0, detalhe: null, erro: e instanceof Error ? e.message : "falha ao resolver a equipe" };
  }

  const preparadas = linhas.map((l) => {
    const { responsavel_nome, dono_nome, ...campos } = l as Record<string, unknown> & {
      responsavel_nome?: string | null;
      dono_nome?: string | null;
    };
    if (typeof responsavel_nome === "string" && responsavel_nome.trim() !== "") {
      campos.responsavel_id = idPorNome.get(responsavel_nome.trim().toLowerCase()) ?? null;
    }
    if (typeof dono_nome === "string" && dono_nome.trim() !== "") {
      campos.dono_id = idPorNome.get(dono_nome.trim().toLowerCase()) ?? null;
    }
    return { ...campos, org_id: orgId, criado_por: autorId };
  });

  // Grava em blocos: um erro no meio não deixa metade da carga sem
  // registro do que entrou.
  let gravadas = 0;
  const tamanho = 100;
  for (let i = 0; i < preparadas.length; i += tamanho) {
    const bloco = preparadas.slice(i, i + tamanho);
    const { error } = await supabase.from(tabelaDestino(tipo)).insert(bloco);
    if (error) {
      return {
        gravadas,
        detalhe: null,
        erro: `Gravadas ${gravadas} linhas e a carga parou: ${error.message}. Corrija e envie o restante.`,
      };
    }
    gravadas += bloco.length;
  }

  return { gravadas, detalhe: `${gravadas} registro(s) gravado(s).`, erro: null };
}


/**
 * Referências que a conferência precisa para resolver nome em id:
 * carteiras, contas, perguntas ativas, ciclos e equipe.
 *
 * Também compartilhada entre a tela e a porta de entrada. Recebe o
 * cliente porque a tela usa a sessão do usuário (e a RLS restringe o que
 * ela enxerga) e a API usa o cliente de serviço com a organização já
 * resolvida pela chave.
 *
 * Detalhe que só aparece quando se lê o original: perguntas entram
 * filtradas por `ativo`, e `dimensao_id` vira `dimensao`. Escrever isto
 * de novo, de cabeça, erra os dois.
 */
export async function referenciasDaOrg(
  supabase: SupabaseClient,
  orgId: string,
): Promise<Referencias> {
  const [{ data: carteiras }, { data: contas }, { data: perguntas }, { data: ciclos }, { data: equipe }] =
    await Promise.all([
      supabase.from("carteiras").select("id, nome, codigo").eq("org_id", orgId),
      supabase.from("contas").select("id, nome, carteira_id").eq("org_id", orgId),
      supabase
        .from("maturidade_perguntas")
        .select("id, texto, dimensao_id")
        .eq("org_id", orgId)
        .eq("ativo", true),
      supabase.from("maturidade_ciclos").select("id, nome").eq("org_id", orgId),
      supabase.from("equipe").select("id, nome, email").eq("org_id", orgId),
    ]);

  return {
    carteiras: (carteiras ?? []) as Referencias["carteiras"],
    contas: (contas ?? []) as Referencias["contas"],
    perguntas: ((perguntas ?? []) as { id: string; texto: string; dimensao_id: string }[]).map(
      (p) => ({ id: p.id, texto: p.texto, dimensao: p.dimensao_id }),
    ),
    ciclos: (ciclos ?? []) as Referencias["ciclos"],
    equipe: (equipe ?? []) as Referencias["equipe"],
  };
}
