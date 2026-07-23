/**
 * Leitura de campos de formulário nas ações de servidor.
 *
 * Antes, cada arquivo de ações tinha a própria cópia de `numero()`, e todas
 * assumiam formato pt-BR: removiam os pontos antes de converter. Só que o
 * campo com máscara (CampoValor) envia o valor cru com ponto decimal —
 * "1234.56" — e o ponto era tratado como separador de milhar: todo valor
 * com centavos entrava multiplicado por cem. A regra correta já existia em
 * lib/csv.ts; agora ela mora aqui e é a única.
 */

/** Estado devolvido pelas ações que preservam o formulário no erro. */
export type EstadoAcao = { erro: string } | null;

export function textoDe(formData: FormData, campo: string): string | null {
  const valor = String(formData.get(campo) ?? "").trim();
  return valor === "" ? null : valor;
}

/**
 * Interpreta um número vindo de gente ou de máscara, sem adivinhar errado:
 *
 *   "1.234,56"  → 1234.56   (pt-BR completo: ponto é milhar)
 *   "1234.56"   → 1234.56   (máscara/banco: ponto é decimal)
 *   "1.234"     → 1234      (só pontos em grupos de três: milhar)
 *   "R$ 500"    → 500
 *
 * A ambiguidade real é "1.234" — decidimos por milhar porque é assim que
 * uma pessoa digita em português; a máscara nunca produz essa forma (ela
 * sempre manda duas casas decimais).
 */
export function interpretarNumero(bruto: string): number | null {
  const limpo = bruto.replace(/[R$\s]/g, "");
  if (limpo === "") return null;

  let normalizado: string;
  if (limpo.includes(",")) {
    // Formato brasileiro: pontos são milhar, vírgula é decimal.
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(limpo)) {
    // Só pontos, todos em grupos de três: milhar digitado à mão.
    normalizado = limpo.replace(/\./g, "");
  } else {
    // Ponto decimal (máscara, banco) ou inteiro puro.
    normalizado = limpo;
  }

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

export function numeroDe(formData: FormData, campo: string): number | null {
  const bruto = textoDe(formData, campo);
  if (bruto === null) return null;
  return interpretarNumero(bruto);
}

/**
 * Inteiro com faixa e padrão. Zero é valor válido — `|| padrao` engolia o
 * zero e "avisar 0 dias antes" virava 7.
 */
export function inteiroDe(
  formData: FormData,
  campo: string,
  padrao: number,
  minimo = 0,
  maximo = Number.MAX_SAFE_INTEGER,
): number {
  const bruto = textoDe(formData, campo);
  if (bruto === null) return padrao;
  const valor = interpretarNumero(bruto);
  if (valor === null) return padrao;
  return Math.min(maximo, Math.max(minimo, Math.round(valor)));
}
