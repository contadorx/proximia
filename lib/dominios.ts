/**
 * Domínio de e-mail para acesso corporativo.
 *
 * A pessoa digita de tudo: "@acme.com", "ACME.com/", "acme.com ". O banco
 * exige minúsculas e sem arroba (check em org_dominios), então a
 * normalização precisa acontecer antes — e precisa ser a mesma no
 * cadastro e em qualquer lugar que compare domínio.
 */
export function normalizarDominio(bruto: string): string {
  return bruto
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

/** Extrai o domínio de um e-mail. Devolve vazio se não houver arroba. */
export function dominioDoEmail(email: string): string {
  const partes = email.trim().toLowerCase().split("@");
  return partes.length === 2 ? normalizarDominio(partes[1]) : "";
}
