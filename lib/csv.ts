/**
 * Leitor de CSV simples e tolerante ao que sai de uma planilha brasileira:
 * separador ";" ou ",", aspas com escape duplo, BOM no inicio, quebras
 * dentro de campo entre aspas e cabecalho com acento ou maiuscula.
 */

export type Linha = Record<string, string>;

function detectarSeparador(texto: string): string {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? "";
  const pontoVirgula = (primeira.match(/;/g) ?? []).length;
  const virgula = (primeira.match(/,/g) ?? []).length;
  const tab = (primeira.match(/\t/g) ?? []).length;
  if (tab > pontoVirgula && tab > virgula) return "\t";
  return pontoVirgula >= virgula ? ";" : ",";
}

/** Normaliza o cabeçalho: minúsculo, sem acento, com underscore. */
export function normalizarChave(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function lerCsv(texto: string): { cabecalho: string[]; linhas: Linha[] } {
  const limpo = texto.replace(/^\uFEFF/, "");
  const sep = detectarSeparador(limpo);

  const campos: string[][] = [];
  let atual: string[] = [];
  let valor = "";
  let entreAspas = false;

  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];

    if (entreAspas) {
      if (c === '"') {
        if (limpo[i + 1] === '"') {
          valor += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        valor += c;
      }
      continue;
    }

    if (c === '"') {
      entreAspas = true;
    } else if (c === sep) {
      atual.push(valor);
      valor = "";
    } else if (c === "\n") {
      atual.push(valor);
      campos.push(atual);
      atual = [];
      valor = "";
    } else if (c !== "\r") {
      valor += c;
    }
  }

  if (valor !== "" || atual.length > 0) {
    atual.push(valor);
    campos.push(atual);
  }

  const naoVazias = campos.filter(
    // Linha de comentário: o CSV modelo traz as dicas assim, e elas não podem
    // virar dado se a pessoa esquecer de apagá-las.
    (l) => l.some((v) => v.trim() !== "") && !(l[0] ?? "").trim().startsWith("#"),
  );
  if (naoVazias.length === 0) return { cabecalho: [], linhas: [] };

  const cabecalho = naoVazias[0].map(normalizarChave);
  const linhas = naoVazias.slice(1).map((valores) => {
    const linha: Linha = {};
    cabecalho.forEach((chave, i) => {
      if (chave) linha[chave] = (valores[i] ?? "").trim();
    });
    return linha;
  });

  return { cabecalho, linhas };
}

/* ---------- conversões ---------- */

export function texto(valor: string | undefined): string | null {
  const v = (valor ?? "").trim();
  return v === "" ? null : v;
}

/** Aceita 1.234,56 · 1234.56 · R$ 1.234,56 */
export function numero(valor: string | undefined): number | null | "invalido" {
  const v = texto(valor);
  if (v === null) return null;

  const limpo = v.replace(/[R$\s]/g, "");
  const temVirgula = limpo.includes(",");
  const normalizado = temVirgula ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(normalizado);

  return Number.isFinite(n) ? n : "invalido";
}

export function inteiro(valor: string | undefined): number | null | "invalido" {
  const n = numero(valor);
  if (n === null || n === "invalido") return n;
  return Math.round(n);
}

/** Aceita DD/MM/AAAA, AAAA-MM-DD e DD-MM-AAAA. */
export function data(valor: string | undefined): string | null | "invalido" {
  const v = texto(valor);
  if (v === null) return null;

  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return valido(iso[1], iso[2], iso[3]);

  const br = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (br) return valido(br[3], br[2].padStart(2, "0"), br[1].padStart(2, "0"));

  return "invalido";
}

function valido(ano: string, mes: string, dia: string): string | "invalido" {
  const d = new Date(`${ano}-${mes}-${dia}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "invalido";
  if (d.getUTCMonth() + 1 !== Number(mes) || d.getUTCDate() !== Number(dia)) return "invalido";
  return `${ano}-${mes}-${dia}`;
}

/** sim/não, s/n, true/false, 1/0, x */
export function booleano(valor: string | undefined): boolean {
  const v = (valor ?? "").trim().toLowerCase();
  return ["sim", "s", "true", "1", "x", "verdadeiro"].includes(v);
}
