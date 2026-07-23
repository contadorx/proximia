import { redirect } from "next/navigation";

/**
 * Alertas virou a seção "Avisos do sistema" dentro de Pendências. Esta
 * rota fica para os links antigos não quebrarem. O parâmetro `status`
 * virou `situacao`, e a lente `de=meus` virou `lente=meus`.
 */
export default function RotaAntigaAlertas({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = new URLSearchParams();
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const lista = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v : v ? [v] : [];

  const status = um(searchParams.status);
  if (status && status !== "aberto") q.set("situacao", status);

  const de = um(searchParams.de);
  if (de === "meus") q.set("lente", "meus");

  for (const c of lista(searchParams.carteira)) q.append("carteira", c);
  for (const s of lista(searchParams.severidade)) q.append("severidade", s);

  const sufixo = q.toString();
  redirect(`/pendencias${sufixo ? `?${sufixo}` : ""}#avisos`);
}
