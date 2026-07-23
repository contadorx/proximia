/**
 * Telemetria de erro — servidor e navegador.
 *
 * A regra que manda aqui: o relatório leva IDENTIFICADOR, nunca CONTEÚDO.
 * Nome de conta, valor capturado, potencial, razão social, e-mail de
 * contato e texto de registro não podem sair para ferramenta de terceiro
 * — nem em mensagem de erro, nem em "contexto extra", nem por descuido de
 * quem for adicionar um campo depois.
 *
 * Por isso a saída não é montada à mão em cada ponto de erro: tudo passa
 * por `limpar()`, que remove o que parecer conteúdo. É mais chato de
 * escrever e muito mais difícil de vazar por acidente.
 *
 * Onde vai parar: por padrão, no log estruturado do servidor (que na
 * Vercel já é coletado) e, se PROXIMIA_ERROS_URL estiver definida, num
 * POST para o coletor escolhido. Sem dependência nova e sem custo fixo.
 */

export type ErroRelato = {
  onde: string;
  tipo: string;
  mensagem: string;
  org_id?: string | null;
  user_id?: string | null;
  rota?: string | null;
  pilha?: string | null;
};

/** Campos cujo VALOR nunca deve viajar, mesmo que alguém os inclua. */
const PROIBIDOS = [
  "nome", "razao_social", "razão_social", "documento", "cnpj", "cpf",
  "email", "e-mail", "telefone", "valor", "potencial", "capturado",
  "corpo", "titulo", "título", "descricao", "descrição", "observacoes",
  "observações", "detalhe", "comprovacao", "comprovação", "senha", "token",
];

/**
 * Mensagens de erro do Postgres costumam carregar o valor que causou o
 * problema — "duplicate key value violates ... Key (documento)=(11222333...)".
 * Isso é dado de cliente dentro de uma mensagem técnica. Aqui se corta
 * tudo que vem depois de "=(" e qualquer sequência longa de dígitos.
 */
export function limparMensagem(bruta: string): string {
  let limpa = bruta;

  // Chaves e valores do Postgres: Key (coluna)=(valor)
  limpa = limpa.replace(/Key\s*\([^)]*\)\s*=\s*\([^)]*\)/gi, "Key (…)=(…)");

  // Literais entre aspas simples, que quase sempre são dado.
  limpa = limpa.replace(/'[^']{4,}'/g, "'…'");

  // Sequências longas de dígitos (documento, telefone, valor).
  limpa = limpa.replace(/\d{6,}/g, "…");

  // Endereços de e-mail.
  limpa = limpa.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "…@…");

  return limpa.slice(0, 300);
}

/** Remove de um objeto qualquer chave suspeita de carregar conteúdo. */
function limpar(extra: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(extra)) {
    const suspeita = PROIBIDOS.some((p) => chave.toLowerCase().includes(p));
    if (suspeita) continue;
    // Só escalares curtos passam; objeto aninhado pode esconder qualquer coisa.
    if (typeof valor === "number" || typeof valor === "boolean") saida[chave] = valor;
    else if (typeof valor === "string" && valor.length <= 64) saida[chave] = limparMensagem(valor);
  }
  return saida;
}

/**
 * Registra um erro. Nunca lança: telemetria que quebra a página é pior
 * que telemetria que falta.
 */
export async function registrarErro(
  erro: unknown,
  contexto: {
    onde: string;
    orgId?: string | null;
    userId?: string | null;
    rota?: string | null;
    extra?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const e = erro instanceof Error ? erro : new Error(String(erro));

    const relato: ErroRelato & Record<string, unknown> = {
      onde: contexto.onde,
      tipo: e.name || "Error",
      mensagem: limparMensagem(e.message ?? ""),
      org_id: contexto.orgId ?? null,
      user_id: contexto.userId ?? null,
      rota: contexto.rota ?? null,
      // A pilha é código nosso, não dado de cliente — mas cortada, porque
      // pilha inteira polui o log e não ajuda a diagnosticar.
      pilha: (e.stack ?? "").split("\n").slice(0, 4).join(" | ").slice(0, 400),
      ...limpar(contexto.extra ?? {}),
    };

    // Log estruturado: na Vercel isso já é coletado e pesquisável.
    console.error("[erro]", JSON.stringify(relato));

    const destino = process.env.PROXIMIA_ERROS_URL;
    if (destino) {
      await fetch(destino, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(relato),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {});
    }
  } catch {
    // Silêncio deliberado: nada aqui pode derrubar o fluxo do usuário.
  }
}
