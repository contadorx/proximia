/**
 * O seletor múltiplo envia um campo por item marcado, então o mesmo
 * parâmetro pode chegar como texto, como lista ou ausente. Estas funções
 * normalizam isso num lugar só.
 */

export function paraLista(valor: string | string[] | undefined): string[] {
  if (!valor) return [];
  return (Array.isArray(valor) ? valor : [valor]).filter((v) => v.trim() !== "");
}

export function paraTexto(valor: string | string[] | undefined): string | undefined {
  const lista = paraLista(valor);
  return lista.length > 0 ? lista[0] : undefined;
}

export function temFiltro(...valores: (string | string[] | undefined)[]): boolean {
  return valores.some((v) => paraLista(v).length > 0);
}
