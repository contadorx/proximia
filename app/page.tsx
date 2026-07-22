import { redirect } from "next/navigation";
import { ambienteCompleto } from "@/lib/env";
import { orgAtual, usuarioAtual, vinculosDoUsuario } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Porta de entrada: manda a pessoa para o proximo passo que falta.
 * Configuracao -> acesso -> organizacao -> painel.
 */
export default async function PaginaRaiz() {
  if (!ambienteCompleto()) redirect("/instalacao");

  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar");

  const org = await orgAtual();
  if (org) redirect("/painel");

  const vinculos = await vinculosDoUsuario();

  // Sem organização nenhuma, a pessoa é nova: vai para o primeiro acesso
  // em vez de cair numa lista vazia com um formulário solto.
  if (vinculos.length === 0) redirect("/comecar");

  redirect("/organizacoes");
}
