import { cnpjValido, somenteDigitos } from "./contas";
import { booleano, data, inteiro, numero, texto, type Linha } from "./csv";

export type TipoImportacao = "carteiras" | "contas" | "contratos" | "frentes";

export type Coluna = { chave: string; rotulo: string; obrigatoria?: boolean; ajuda?: string };

export const MODELOS: Record<
  TipoImportacao,
  { rotulo: string; explicacao: string; colunas: Coluna[] }
> = {
  carteiras: {
    rotulo: "Carteiras",
    explicacao: "A primeira carga. Tudo o mais se pendura nelas.",
    colunas: [
      { chave: "nome", rotulo: "nome", obrigatoria: true },
      { chave: "codigo", rotulo: "codigo", ajuda: "identificador curto, único na organização" },
      { chave: "regiao", rotulo: "regiao" },
      { chave: "status", rotulo: "status", ajuda: "ativa, pausada ou encerrada" },
      { chave: "score_maturidade", rotulo: "score_maturidade", ajuda: "0 a 100" },
      { chave: "score_ciclo", rotulo: "score_ciclo", ajuda: "ex.: 2026-1" },
      { chave: "observacoes", rotulo: "observacoes" },
    ],
  },
  contas: {
    rotulo: "Contas",
    explicacao: "Contas que merecem gestão individual. A carteira precisa existir antes.",
    colunas: [
      { chave: "nome", rotulo: "nome", obrigatoria: true },
      { chave: "carteira", rotulo: "carteira", obrigatoria: true, ajuda: "código ou nome da carteira" },
      { chave: "razao_social", rotulo: "razao_social" },
      { chave: "documento", rotulo: "documento", ajuda: "CNPJ, com ou sem máscara" },
      { chave: "segmento", rotulo: "segmento" },
      { chave: "relacao", rotulo: "relacao", ajuda: "estrategica, contrato, pipeline ou protecao" },
      { chave: "criticidade", rotulo: "criticidade", ajuda: "alta, media ou baixa" },
      { chave: "potencial_bruto", rotulo: "potencial_bruto" },
      { chave: "potencial_origem", rotulo: "potencial_origem", ajuda: "obrigatório se houver potencial" },
      { chave: "potencial_data", rotulo: "potencial_data" },
      { chave: "valor_capturado", rotulo: "valor_capturado" },
      { chave: "observacoes", rotulo: "observacoes" },
    ],
  },
  contratos: {
    rotulo: "Contratos",
    explicacao: "Vigências e condições. A conta precisa existir antes.",
    colunas: [
      { chave: "conta", rotulo: "conta", obrigatoria: true, ajuda: "nome exato da conta" },
      { chave: "numero", rotulo: "numero" },
      { chave: "tipo", rotulo: "tipo" },
      { chave: "modalidade", rotulo: "modalidade" },
      { chave: "natureza_beneficio", rotulo: "natureza_beneficio" },
      { chave: "inicio", rotulo: "inicio" },
      { chave: "fim", rotulo: "fim", ajuda: "sem ela não há janela de renegociação" },
      { chave: "aviso_previa_dias", rotulo: "aviso_previa_dias" },
      { chave: "renovacao_automatica", rotulo: "renovacao_automatica", ajuda: "sim ou não" },
      { chave: "valor_base", rotulo: "valor_base" },
      { chave: "periodicidade", rotulo: "periodicidade", ajuda: "mensal, trimestral, anual ou unico" },
      { chave: "status", rotulo: "status", ajuda: "vigente, em_renegociacao ou encerrado" },
      { chave: "link_documento", rotulo: "link_documento" },
      { chave: "observacoes", rotulo: "observacoes" },
    ],
  },
  frentes: {
    rotulo: "Frentes",
    explicacao: "Trabalho de volume agregado. A carteira precisa existir antes.",
    colunas: [
      { chave: "titulo", rotulo: "titulo", obrigatoria: true },
      { chave: "carteira", rotulo: "carteira", obrigatoria: true, ajuda: "código ou nome da carteira" },
      { chave: "status", rotulo: "status", ajuda: "identificada, em_analise, em_execucao ou concluida" },
      { chave: "qtd_casos", rotulo: "qtd_casos" },
      { chave: "potencial_bruto", rotulo: "potencial_bruto" },
      { chave: "potencial_origem", rotulo: "potencial_origem", ajuda: "obrigatório se houver potencial" },
      { chave: "potencial_data", rotulo: "potencial_data" },
      { chave: "valor_capturado", rotulo: "valor_capturado" },
      { chave: "proxima_etapa", rotulo: "proxima_etapa" },
      { chave: "prazo", rotulo: "prazo" },
      { chave: "observacoes", rotulo: "observacoes" },
    ],
  },
};

export type Referencias = {
  carteiras: { id: string; nome: string; codigo: string | null }[];
  contas: { id: string; nome: string; carteira_id: string }[];
};

export type Resultado = {
  validas: Record<string, unknown>[];
  erros: { linha: number; motivo: string; conteudo: string }[];
};

function acharCarteira(valor: string, refs: Referencias) {
  const alvo = valor.trim().toLowerCase();
  return refs.carteiras.find(
    (c) => (c.codigo ?? "").toLowerCase() === alvo || c.nome.toLowerCase() === alvo,
  );
}

function acharConta(valor: string, refs: Referencias) {
  const alvo = valor.trim().toLowerCase();
  const achadas = refs.contas.filter((c) => c.nome.toLowerCase() === alvo);
  return achadas.length === 1 ? achadas[0] : achadas.length > 1 ? "ambigua" : undefined;
}

const DENTRO = (valor: string | null, opcoes: string[]) =>
  valor === null || opcoes.includes(valor.toLowerCase());

/**
 * Converte e valida linha a linha. Nada é gravado aqui: a saída é o que
 * pode entrar e a lista do que foi recusado, com o motivo.
 */
export function validar(
  tipo: TipoImportacao,
  linhas: Linha[],
  refs: Referencias,
): Resultado {
  const validas: Record<string, unknown>[] = [];
  const erros: Resultado["erros"] = [];

  linhas.forEach((linha, indice) => {
    const numeroLinha = indice + 2; // 1 é o cabeçalho
    const resumo = Object.values(linha).filter(Boolean).slice(0, 3).join(" · ");
    const falhar = (motivo: string) => erros.push({ linha: numeroLinha, motivo, conteudo: resumo });

    const num = (campo: string): number | null | undefined => {
      const v = numero(linha[campo]);
      if (v === "invalido") {
        falhar(`${campo}: "${linha[campo]}" não é um número válido.`);
        return undefined;
      }
      return v;
    };
    const dt = (campo: string): string | null | undefined => {
      const v = data(linha[campo]);
      if (v === "invalido") {
        falhar(`${campo}: "${linha[campo]}" não é uma data válida (use DD/MM/AAAA).`);
        return undefined;
      }
      return v;
    };

    if (tipo === "carteiras") {
      const nome = texto(linha.nome);
      if (!nome) return falhar("nome está vazio.");

      const score = num("score_maturidade");
      if (score === undefined) return;
      if (score !== null && (score < 0 || score > 100)) {
        return falhar(`score_maturidade ${score}: precisa ficar entre 0 e 100.`);
      }

      const status = texto(linha.status);
      if (!DENTRO(status, ["ativa", "pausada", "encerrada"])) {
        return falhar(`status "${status}": use ativa, pausada ou encerrada.`);
      }

      validas.push({
        nome,
        codigo: texto(linha.codigo),
        regiao: texto(linha.regiao),
        status: status?.toLowerCase() ?? "ativa",
        score_maturidade: score,
        score_ciclo: texto(linha.score_ciclo),
        observacoes: texto(linha.observacoes),
      });
      return;
    }

    if (tipo === "contas") {
      const nome = texto(linha.nome);
      if (!nome) return falhar("nome está vazio.");

      const refCarteira = texto(linha.carteira);
      if (!refCarteira) return falhar("carteira está vazia.");
      const carteira = acharCarteira(refCarteira, refs);
      if (!carteira) return falhar(`carteira "${refCarteira}" não existe. Cadastre-a antes.`);

      const documento = texto(linha.documento);
      if (documento && !cnpjValido(documento)) {
        return falhar(`documento "${documento}": CNPJ inválido.`);
      }

      const relacao = texto(linha.relacao);
      if (!DENTRO(relacao, ["estrategica", "contrato", "pipeline", "protecao"])) {
        return falhar(`relacao "${relacao}": use estrategica, contrato, pipeline ou protecao.`);
      }
      const criticidade = texto(linha.criticidade);
      if (!DENTRO(criticidade, ["alta", "media", "baixa"])) {
        return falhar(`criticidade "${criticidade}": use alta, media ou baixa.`);
      }

      const potencial = num("potencial_bruto");
      if (potencial === undefined) return;
      const origem = texto(linha.potencial_origem);
      if (potencial !== null && !origem) {
        return falhar("há potencial sem potencial_origem. Estimativa entra com procedência.");
      }
      const potencialData = dt("potencial_data");
      if (potencialData === undefined) return;
      const capturado = num("valor_capturado");
      if (capturado === undefined) return;

      validas.push({
        nome,
        carteira_id: carteira.id,
        razao_social: texto(linha.razao_social),
        documento: documento ? somenteDigitos(documento) : null,
        segmento: texto(linha.segmento),
        relacao: relacao?.toLowerCase() ?? "estrategica",
        criticidade: criticidade?.toLowerCase() ?? "media",
        potencial_bruto: potencial,
        potencial_origem: potencial === null ? null : origem,
        potencial_data:
          potencial === null ? null : (potencialData ?? new Date().toISOString().slice(0, 10)),
        valor_capturado: capturado,
        observacoes: texto(linha.observacoes),
      });
      return;
    }

    if (tipo === "contratos") {
      const refConta = texto(linha.conta);
      if (!refConta) return falhar("conta está vazia.");
      const conta = acharConta(refConta, refs);
      if (conta === "ambigua") {
        return falhar(`conta "${refConta}" existe em mais de uma carteira. Renomeie ou importe pela tela.`);
      }
      if (!conta) return falhar(`conta "${refConta}" não existe. Cadastre-a antes.`);

      const inicio = dt("inicio");
      if (inicio === undefined) return;
      const fim = dt("fim");
      if (fim === undefined) return;
      if (inicio && fim && fim < inicio) {
        return falhar("fim é anterior ao inicio.");
      }

      const aviso = inteiro(linha.aviso_previa_dias);
      if (aviso === "invalido") return falhar("aviso_previa_dias não é um número.");
      if (aviso !== null && (aviso < 0 || aviso > 730)) {
        return falhar("aviso_previa_dias precisa ficar entre 0 e 730.");
      }

      const valor = num("valor_base");
      if (valor === undefined) return;

      const periodicidade = texto(linha.periodicidade);
      if (!DENTRO(periodicidade, ["mensal", "trimestral", "anual", "unico"])) {
        return falhar(`periodicidade "${periodicidade}": use mensal, trimestral, anual ou unico.`);
      }
      const status = texto(linha.status);
      if (!DENTRO(status, ["vigente", "em_renegociacao", "encerrado"])) {
        return falhar(`status "${status}": use vigente, em_renegociacao ou encerrado.`);
      }

      validas.push({
        conta_id: conta.id,
        carteira_id: conta.carteira_id,
        numero: texto(linha.numero),
        tipo: texto(linha.tipo),
        modalidade: texto(linha.modalidade),
        natureza_beneficio: texto(linha.natureza_beneficio),
        inicio,
        fim,
        aviso_previa_dias: aviso ?? 0,
        renovacao_automatica: booleano(linha.renovacao_automatica),
        valor_base: valor,
        periodicidade: periodicidade?.toLowerCase() ?? null,
        status: status?.toLowerCase() ?? "vigente",
        link_documento: texto(linha.link_documento),
        observacoes: texto(linha.observacoes),
      });
      return;
    }

    // frentes
    const titulo = texto(linha.titulo);
    if (!titulo) return falhar("titulo está vazio.");

    const refCarteira = texto(linha.carteira);
    if (!refCarteira) return falhar("carteira está vazia.");
    const carteira = acharCarteira(refCarteira, refs);
    if (!carteira) return falhar(`carteira "${refCarteira}" não existe. Cadastre-a antes.`);

    const status = texto(linha.status);
    if (!DENTRO(status, ["identificada", "em_analise", "em_execucao", "concluida"])) {
      return falhar(
        `status "${status}": use identificada, em_analise, em_execucao ou concluida. Descarte exige motivo e é feito na tela.`,
      );
    }

    const casos = inteiro(linha.qtd_casos);
    if (casos === "invalido") return falhar("qtd_casos não é um número.");

    const potencial = num("potencial_bruto");
    if (potencial === undefined) return;
    const origem = texto(linha.potencial_origem);
    if (potencial !== null && !origem) {
      return falhar("há potencial sem potencial_origem. Estimativa entra com procedência.");
    }
    const potencialData = dt("potencial_data");
    if (potencialData === undefined) return;
    const capturado = num("valor_capturado");
    if (capturado === undefined) return;
    const prazo = dt("prazo");
    if (prazo === undefined) return;

    validas.push({
      titulo,
      carteira_id: carteira.id,
      status: status?.toLowerCase() ?? "identificada",
      qtd_casos: casos,
      potencial_bruto: potencial,
      potencial_origem: potencial === null ? null : origem,
      potencial_data:
        potencial === null ? null : (potencialData ?? new Date().toISOString().slice(0, 10)),
      valor_capturado: capturado,
      proxima_etapa: texto(linha.proxima_etapa),
      prazo,
      observacoes: texto(linha.observacoes),
    });
  });

  return { validas, erros };
}

export function tabelaDestino(tipo: TipoImportacao): string {
  return tipo === "carteiras"
    ? "carteiras"
    : tipo === "contas"
      ? "contas"
      : tipo === "contratos"
        ? "contratos"
        : "frentes";
}
