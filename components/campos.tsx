"use client";

import { useState } from "react";

/**
 * Campos com máscara. O que a pessoa vê é formatado; o que vai para o
 * servidor é o valor cru, num campo escondido — assim a leitura fica fácil
 * e o servidor nunca precisa adivinhar se "1.234" são mil ou um vírgula dois.
 */

function soDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

function formatarMoeda(digitos: string): string {
  if (!digitos) return "";
  const centavos = Number(digitos) / 100;
  return centavos.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Valor em reais. Envia o número cru (ex.: 120000.00). */
export function CampoValor({
  nome,
  rotulo,
  inicial,
  ajuda,
}: {
  nome: string;
  rotulo: string;
  inicial?: number | string | null;
  ajuda?: string;
}) {
  const digitosIniciais =
    inicial === null || inicial === undefined || inicial === ""
      ? ""
      : String(Math.round(Number(inicial) * 100));
  const [digitos, setDigitos] = useState(digitosIniciais);

  const cru = digitos ? (Number(digitos) / 100).toFixed(2) : "";

  return (
    <label className="campo campo-numerico">
      <span>{rotulo}</span>
      <div className="campo-prefixado">
        <span className="prefixo">R$</span>
        <input
          type="text"
          inputMode="numeric"
          value={formatarMoeda(digitos)}
          onChange={(e) => setDigitos(soDigitos(e.target.value).slice(0, 13))}
          placeholder="0,00"
        />
      </div>
      <input type="hidden" name={nome} value={cru} />
      {ajuda && <small>{ajuda}</small>}
    </label>
  );
}

/** Quantidade inteira com separador de milhar. Envia só os dígitos. */
export function CampoQuantidade({
  nome,
  rotulo,
  inicial,
  ajuda,
}: {
  nome: string;
  rotulo: string;
  inicial?: number | string | null;
  ajuda?: string;
}) {
  const [digitos, setDigitos] = useState(
    inicial === null || inicial === undefined || inicial === "" ? "" : soDigitos(String(inicial)),
  );

  return (
    <label className="campo campo-numerico">
      <span>{rotulo}</span>
      <input
        type="text"
        inputMode="numeric"
        value={digitos ? Number(digitos).toLocaleString("pt-BR") : ""}
        onChange={(e) => setDigitos(soDigitos(e.target.value).slice(0, 9))}
        placeholder="0"
      />
      <input type="hidden" name={nome} value={digitos} />
      {ajuda && <small>{ajuda}</small>}
    </label>
  );
}

function formatarCnpj(d: string): string {
  const v = d.slice(0, 14);
  if (v.length <= 2) return v;
  if (v.length <= 5) return `${v.slice(0, 2)}.${v.slice(2)}`;
  if (v.length <= 8) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5)}`;
  if (v.length <= 12) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8)}`;
  return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
}

function cnpjValido(d: string): boolean {
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

/** CNPJ com máscara e conferência dos dígitos verificadores na hora. */
export function CampoCnpj({
  nome = "documento",
  rotulo = "CNPJ",
  inicial,
}: {
  nome?: string;
  rotulo?: string;
  inicial?: string | null;
}) {
  const [digitos, setDigitos] = useState(soDigitos(inicial ?? ""));
  const completo = digitos.length === 14;
  const invalido = completo && !cnpjValido(digitos);

  return (
    <label className="campo">
      <span>{rotulo}</span>
      <input
        type="text"
        inputMode="numeric"
        value={formatarCnpj(digitos)}
        onChange={(e) => setDigitos(soDigitos(e.target.value).slice(0, 14))}
        placeholder="00.000.000/0000-00"
        aria-invalid={invalido}
      />
      <input type="hidden" name={nome} value={digitos} />
      {invalido && <small className="texto-alerta">Dígitos verificadores não conferem.</small>}
      {completo && !invalido && <small className="texto-ok">CNPJ válido.</small>}
    </label>
  );
}

/** Percentual de 0 a 100, com uma casa. */
export function CampoScore({
  nome = "score_maturidade",
  rotulo = "Score de maturidade",
  inicial,
  ajuda,
}: {
  nome?: string;
  rotulo?: string;
  inicial?: number | string | null;
  ajuda?: string;
}) {
  const [valor, setValor] = useState(
    inicial === null || inicial === undefined ? "" : String(inicial).replace(".", ","),
  );
  const numero = Number(valor.replace(",", "."));
  const foraDaFaixa = valor !== "" && (Number.isNaN(numero) || numero < 0 || numero > 100);

  return (
    <label className="campo campo-numerico">
      <span>{rotulo}</span>
      <input
        type="text"
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, "").slice(0, 6))}
        placeholder="0 a 100"
        aria-invalid={foraDaFaixa}
      />
      <input type="hidden" name={nome} value={valor.replace(",", ".")} />
      {foraDaFaixa ? (
        <small className="texto-alerta">Precisa ficar entre 0 e 100.</small>
      ) : (
        ajuda && <small>{ajuda}</small>
      )}
    </label>
  );
}
