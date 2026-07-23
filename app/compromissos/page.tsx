import { redirect } from "next/navigation";

/**
 * Compromissos virou a primeira seção de Pendências — a porta única para
 * o que pede ação. Esta rota fica para os links antigos (e-mails,
 * follow-ups, favoritos) não quebrarem, traduzindo os parâmetros que
 * mudaram de nome.
 */
export default function RotaAntigaCompromissos({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = new URLSearchParams();
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const lista = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v : v ? [v] : [];

  const lente = um(searchParams.lente);
  if (lente && lente !== "todos") q.set("lente", lente);

  const dono = um(searchParams.dono);
  if (dono) q.set("dono", dono);

  const alvo = um(searchParams.alvo);
  if (alvo) q.set("alvo", alvo);

  for (const c of lista(searchParams.carteira)) q.append("carteira", c);

  const sufixo = q.toString();
  redirect(`/pendencias${sufixo ? `?${sufixo}` : ""}`);
}
