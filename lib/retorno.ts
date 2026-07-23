/**
 * Para onde mandar a pessoa depois de um link de e-mail.
 *
 * O parâmetro `proximo` vem da URL, e URL de e-mail é território de
 * quem quiser: sem trava, `/auth/callback?proximo=https://site-falso`
 * transformaria este endereço em trampolim — a pessoa clica num link do
 * Proximia, é autenticada, e cai num site que não é o nosso já logada.
 * É o padrão de redirecionamento aberto, e é assim que se rouba sessão
 * sem invadir nada.
 */
export function destinoSeguro(proximo: string | null | undefined): string {
  if (!proximo) return "/";

  const valor = proximo.trim();

  // Precisa começar com uma barra e não com duas: "//outro.site" é
  // endereço absoluto disfarçado de caminho — o navegador completa o
  // protocolo sozinho.
  if (!valor.startsWith("/") || valor.startsWith("//")) return "/";

  // Barra invertida também vira separador em alguns navegadores.
  if (valor.includes("\\")) return "/";

  return valor;
}

/**
 * Lê o fragmento da URL (#access_token=…), que o navegador nunca envia ao
 * servidor. Devolve o que interessa, sem inventar campo.
 */
export function lerFragmento(hash: string): {
  accessToken: string | null;
  refreshToken: string | null;
  erro: string | null;
} {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  return {
    accessToken: p.get("access_token"),
    refreshToken: p.get("refresh_token"),
    erro: p.get("error_description") ?? p.get("error"),
  };
}
