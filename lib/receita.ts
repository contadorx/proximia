import { cnpjValido, somenteDigitos } from "./contas";

/**
 * Consulta do registro público de CNPJ.
 *
 * O QUE SAI DAQUI: um CNPJ. Nada mais. Nem nome de conta, nem potencial,
 * nem contrato, nem histórico. É o único dado do cliente que atravessa a
 * fronteira do produto, e ele é público por definição — qualquer pessoa
 * consulta o mesmo número no site da Receita.
 *
 * Ainda assim, o interruptor é por organização e nasce desligado
 * (migration 0047). Promessa escrita não se ajusta em silêncio.
 *
 * A ESCOLHA DO PROVEDOR. BrasilAPI é gratuita, não exige cadastro nem
 * chave, e serve de fachada para a base pública. A troca de provedor fica
 * a uma constante de distância, de propósito: quem depende de um serviço
 * gratuito precisa poder trocar sem reescrever nada.
 */

const ENDERECO = "https://brasilapi.com.br/api/cnpj/v1";
const TEMPO_LIMITE_MS = 8000;

export type DadosReceita = {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  segmento: string | null;
  situacao: string | null;
  municipio: string | null;
  uf: string | null;
};

export type ResultadoConsulta =
  | { situacao: "ok"; dados: DadosReceita }
  | { situacao: "nao_encontrado"; detalhe: string }
  | { situacao: "recusado"; detalhe: string }
  | { situacao: "erro"; detalhe: string };

/**
 * Traduz a resposta do provedor para os campos do produto.
 *
 * Separada da chamada de rede porque é aqui que mora a regra — e regra
 * sem teste é regra que ninguém garante. A resposta real tem dezenas de
 * campos; o produto usa quatro, e ignorar o resto é decisão, não
 * esquecimento: guardar dado que ninguém olha é passivo.
 */
export function mapearResposta(bruta: unknown): DadosReceita {
  const r = (bruta ?? {}) as Record<string, unknown>;

  const texto = (valor: unknown): string | null => {
    if (typeof valor !== "string") return null;
    const limpo = valor.trim();
    return limpo === "" ? null : limpo;
  };

  // A atividade principal vem como objeto com código e descrição, e é a
  // melhor aproximação de "segmento" que o registro público oferece.
  const atividade = r.cnae_fiscal_descricao ?? r.atividade_principal;
  const segmento =
    texto(atividade) ??
    (Array.isArray(atividade) ? texto((atividade[0] as Record<string, unknown>)?.text) : null);

  return {
    razaoSocial: texto(r.razao_social) ?? texto(r.nome),
    nomeFantasia: texto(r.nome_fantasia) ?? texto(r.fantasia),
    segmento,
    situacao: texto(r.descricao_situacao_cadastral) ?? texto(r.situacao),
    municipio: texto(r.municipio),
    uf: texto(r.uf),
  };
}

/** Nada de útil voltou — evita gravar consulta que não preencheu nada. */
export function respostaVazia(d: DadosReceita): boolean {
  return !d.razaoSocial && !d.nomeFantasia && !d.segmento;
}

/**
 * Consulta o CNPJ. Nunca lança: devolve o motivo, porque o motivo é o
 * que a tela precisa mostrar e o que fica no registro de consultas.
 */
export async function consultarCnpj(documento: string): Promise<ResultadoConsulta> {
  const digitos = somenteDigitos(documento);

  if (digitos.length !== 14) {
    return { situacao: "recusado", detalhe: "O CNPJ precisa ter 14 dígitos." };
  }
  if (!cnpjValido(digitos)) {
    // Conferir antes de sair evita gastar chamada — e evita mandar para
    // fora um número que já se sabe inválido.
    return { situacao: "recusado", detalhe: "CNPJ inválido: os dígitos verificadores não fecham." };
  }

  try {
    const resposta = await fetch(`${ENDERECO}/${digitos}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });

    if (resposta.status === 404) {
      return { situacao: "nao_encontrado", detalhe: "Não há registro público para este CNPJ." };
    }

    if (resposta.status === 429) {
      return {
        situacao: "erro",
        detalhe: "O serviço público recusou por excesso de consultas. Tente daqui a pouco.",
      };
    }

    if (!resposta.ok) {
      return { situacao: "erro", detalhe: `O serviço público respondeu ${resposta.status}.` };
    }

    const dados = mapearResposta(await resposta.json());

    if (respostaVazia(dados)) {
      return { situacao: "nao_encontrado", detalhe: "O registro veio sem os campos que usamos." };
    }

    return { situacao: "ok", dados };
  } catch (e) {
    const mensagem = e instanceof Error && e.name === "TimeoutError"
      ? "O serviço público demorou demais para responder."
      : "Não foi possível falar com o serviço público de CNPJ.";
    return { situacao: "erro", detalhe: mensagem };
  }
}
