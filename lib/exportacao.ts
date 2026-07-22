/**
 * Exportação de dados.
 *
 * O recorte por organização e por carteira não é feito aqui: a consulta
 * roda com a sessão de quem pede, então a RLS do banco decide o que sai.
 * Ponto focal exporta apenas as carteiras dele, e isso é consequência do
 * mesmo mecanismo que protege as telas — não de um filtro paralelo que
 * alguém pode esquecer de aplicar.
 */

export type Recurso = {
  chave: string;
  rotulo: string;
  tabela: string;
  colunas: string;
  ordem?: string;
  descricao: string;
};

export const RECURSOS: Recurso[] = [
  {
    chave: "carteiras",
    rotulo: "Carteiras",
    tabela: "carteiras",
    colunas: "id, nome, codigo, regiao, status, score_maturidade, score_ciclo, observacoes, criado_em",
    ordem: "nome",
    descricao: "Unidades, com score de maturidade quando houver",
  },
  {
    chave: "contas",
    rotulo: "Contas",
    tabela: "contas",
    colunas:
      "id, carteira_id, nome, razao_social, documento, segmento, relacao, criticidade, status, potencial_bruto, potencial_origem, potencial_data, valor_capturado, criado_em",
    ordem: "nome",
    descricao: "Fichas das contas, com potencial e capturado",
  },
  {
    chave: "contatos",
    rotulo: "Contatos",
    tabela: "contatos",
    colunas: "id, conta_id, nome, cargo, email, telefone, principal, criado_em",
    descricao: "Pessoas de contato nas contas — contém dado pessoal",
  },
  {
    chave: "contratos",
    rotulo: "Contratos",
    tabela: "contratos",
    colunas:
      "id, carteira_id, conta_id, numero, tipo, modalidade, natureza_beneficio, inicio, fim, aviso_previa_dias, renovacao_automatica, janela_renegociacao, valor_base, periodicidade, status, criado_em",
    ordem: "fim",
    descricao: "Vigência, condições e janela de renegociação",
  },
  {
    chave: "clausulas",
    rotulo: "Cláusulas",
    tabela: "contrato_clausulas",
    colunas: "id, contrato_id, tipo, descricao, monitorada, data_referencia, antecedencia_dias, parametros",
    descricao: "Cláusulas monitoradas dos contratos",
  },
  {
    chave: "frentes",
    rotulo: "Frentes",
    tabela: "frentes",
    colunas:
      "id, carteira_id, catalogo_id, titulo, status, qtd_casos, potencial_bruto, potencial_origem, potencial_data, valor_capturado, proxima_etapa, prazo, motivo_descarte, criado_em",
    descricao: "Trabalho de volume agregado por carteira",
  },
  {
    chave: "oportunidades",
    rotulo: "Oportunidades",
    tabela: "oportunidades",
    colunas:
      "id, carteira_id, conta_id, titulo, fase, fase_desde, investimento, retorno_mensal, custo_mensal, horizonte_meses, resultado_mensal, payback_meses, retorno_percentual, estimativa_origem, estimativa_data, investimento_realizado, retorno_confirmado, confirmado_em, motivo_descarte, criado_em",
    descricao: "Iniciativas com investimento, retorno e payback",
  },
  {
    chave: "capturas",
    rotulo: "Capturas",
    tabela: "capturas",
    colunas:
      "id, carteira_id, entidade_tipo, entidade_id, valor, tipo, confirmado_em, comprovacao, origem, criado_em",
    ordem: "confirmado_em",
    descricao: "Lançamentos de valor confirmado, com estornos",
  },
  {
    chave: "compromissos",
    rotulo: "Compromissos",
    tabela: "compromissos",
    colunas:
      "id, carteira_id, entidade_tipo, entidade_id, titulo, descricao, vence_em, status, dono_id, alerta_dias, origem, criado_em",
    ordem: "vence_em",
    descricao: "O que foi combinado, com prazo e dono",
  },
  {
    chave: "historico",
    rotulo: "Histórico",
    tabela: "registros",
    colunas: "id, carteira_id, entidade_tipo, entidade_id, tipo, titulo, corpo, ocorrido_em, versao, ativo, autor_id, criado_em",
    ordem: "ocorrido_em",
    descricao: "Registros de reunião, decisão, entrega e nota",
  },
  {
    chave: "alertas",
    rotulo: "Alertas",
    tabela: "alertas",
    colunas: "id, carteira_id, tipo, severidade, titulo, detalhe, status, dono_id, criado_em, resolvido_em",
    descricao: "O que o sistema apontou, aberto ou resolvido",
  },
  {
    chave: "maturidade",
    rotulo: "Maturidade",
    tabela: "maturidade_resultado",
    colunas: "avaliacao_id, carteira_id, carteira_nome, ciclo_nome, ciclo_referencia, status, respondidas, total_perguntas, score",
    descricao: "Avaliações por ciclo, com score calculado",
  },
];

const SEPARADOR = ";";

function celula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";

  if (typeof valor === "object") return JSON.stringify(valor).replace(/"/g, '""');

  const texto = String(valor);
  // Aspas, separador e quebra de linha exigem o campo entre aspas — sem
  // isso, uma observação com ponto e vírgula desloca a planilha inteira.
  if (texto.includes('"') || texto.includes(SEPARADOR) || /[\r\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export function paraCsv(linhas: Record<string, unknown>[], colunas: string[]): string {
  const cabecalho = colunas.join(SEPARADOR);
  const corpo = linhas
    .map((l) => colunas.map((c) => celula(l[c])).join(SEPARADOR))
    .join("\r\n");

  // BOM na frente: sem ele, o Excel abre acentuação quebrada, e a pessoa
  // conclui que o sistema exportou errado.
  return `\uFEFF${cabecalho}\r\n${corpo}\r\n`;
}

export function nomeArquivo(recurso: string, extensao: string): string {
  const hoje = new Date().toISOString().slice(0, 10);
  return `proximia-${recurso}-${hoje}.${extensao}`;
}
