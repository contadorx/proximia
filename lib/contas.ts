import { criarClienteServidor } from "./supabase/server";

export type Relacao = "estrategica" | "contrato" | "pipeline" | "protecao";
export type Criticidade = "alta" | "media" | "baixa";

export const RELACOES: { valor: Relacao; rotulo: string; explicacao: string }[] = [
  {
    valor: "estrategica",
    rotulo: "Estratégica",
    explicacao: "Conta grande sob acompanhamento contínuo.",
  },
  { valor: "contrato", rotulo: "Com contrato", explicacao: "Tem instrumento vigente a controlar." },
  { valor: "pipeline", rotulo: "Em prospecção", explicacao: "Ainda não é cliente ou está em negociação." },
  { valor: "protecao", rotulo: "Em proteção", explicacao: "Risco de perda — defesa de base, não captura." },
];

export const CRITICIDADES: { valor: Criticidade; rotulo: string }[] = [
  { valor: "alta", rotulo: "Alta" },
  { valor: "media", rotulo: "Média" },
  { valor: "baixa", rotulo: "Baixa" },
];

export type Conta = {
  id: string;
  carteira_id: string;
  nome: string;
  razao_social: string | null;
  documento: string | null;
  segmento: string | null;
  relacao: Relacao;
  criticidade: Criticidade;
  status: "ativa" | "encerrada";
  responsavel_id: string | null;
  potencial_bruto: number | null;
  potencial_origem: string | null;
  potencial_data: string | null;
  valor_capturado: number | null;
  capturado_confirmado_em: string | null;
  observacoes: string | null;
  atualizado_em: string;
  /** Procedência dos dados cadastrais, quando vieram de consulta pública. */
  dados_receita_em: string | null;
  dados_receita_origem: string | null;
};

export type Contato = {
  id: string;
  conta_id: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  principal: boolean;
};

const CAMPOS =
  "id, carteira_id, nome, razao_social, documento, segmento, relacao, criticidade, status, responsavel_id, potencial_bruto, potencial_origem, potencial_data, valor_capturado, capturado_confirmado_em, observacoes, atualizado_em, dados_receita_em, dados_receita_origem";

/** Teto de linhas por consulta. Quando a lista bate nele, a tela avisa. */
export const LIMITE_CONTAS = 300;

export async function listarContas(opcoes: {
  orgId: string;
  busca?: string;
  carteiraId?: string;
  carteiras?: string[];
  relacoes?: string[];
}): Promise<Conta[]> {
  const supabase = criarClienteServidor();
  let consulta = supabase.from("contas").select(CAMPOS).eq("org_id", opcoes.orgId);

  if (opcoes.carteiraId) consulta = consulta.eq("carteira_id", opcoes.carteiraId);
  if (opcoes.carteiras?.length) consulta = consulta.in("carteira_id", opcoes.carteiras);
  if (opcoes.relacoes?.length) consulta = consulta.in("relacao", opcoes.relacoes);

  const busca = (opcoes.busca ?? "").trim();
  if (busca) {
    const digitos = somenteDigitos(busca);
    consulta =
      digitos.length >= 3
        ? consulta.or(`nome.ilike.%${busca}%,razao_social.ilike.%${busca}%,documento.like.%${digitos}%`)
        : consulta.or(`nome.ilike.%${busca}%,razao_social.ilike.%${busca}%`);
  }

  const { data, error } = await consulta.order("nome").limit(LIMITE_CONTAS);
  if (error) {
    console.error("[contas] falha ao listar:", error.message);
    return [];
  }
  return (data ?? []) as Conta[];
}

export async function obterConta(id: string): Promise<Conta | null> {
  const supabase = criarClienteServidor();
  const { data } = await supabase.from("contas").select(CAMPOS).eq("id", id).maybeSingle();
  return (data as Conta) ?? null;
}

export async function contatosDaConta(contaId: string): Promise<Contato[]> {
  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("contatos")
    .select("id, conta_id, nome, cargo, email, telefone, principal")
    .eq("conta_id", contaId)
    .order("principal", { ascending: false })
    .order("nome");
  return (data ?? []) as Contato[];
}

/* ---------- utilitários ---------- */

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function formatarDocumento(documento: string | null): string {
  if (!documento) return "—";
  const d = somenteDigitos(documento);
  if (d.length !== 14) return documento;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Validação de CNPJ pelos dígitos verificadores. */
export function cnpjValido(documento: string): boolean {
  const d = somenteDigitos(documento);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;

  const digito = (base: string): number => {
    const pesos =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split("").reduce((t, n, i) => t + Number(n) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return digito(d.slice(0, 12)) === Number(d[12]) && digito(d.slice(0, 13)) === Number(d[13]);
}

export function formatarValor(valor: number | string | null | undefined): string {
  // Três armadilhas, todas encontradas por teste:
  //
  //   1. `undefined` chegava e quebrava a página. Campo opcional é comum,
  //      e ausência não pode derrubar a tela.
  //   2. O Postgres devolve `numeric` como texto no cliente JavaScript, e
  //      String.toLocaleString ignora as opções em silêncio — o valor
  //      aparecia sem separador, parecendo dado sujo.
  //   3. Texto não numérico virava "R$ NaN".
  if (valor === null || valor === undefined || valor === "") return "—";

  const numero = typeof valor === "number" ? valor : Number(valor);
  if (Number.isNaN(numero)) return "—";

  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function formatarData(data: string | null): string {
  if (!data) return "—";
  const [ano, mes, dia] = data.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

export function rotuloRelacao(relacao: Relacao): string {
  return RELACOES.find((r) => r.valor === relacao)?.rotulo ?? relacao;
}
