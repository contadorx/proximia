import Link from "next/link";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { usuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Quem chega aqui entrou, mas não tem vínculo com organização nenhuma.
 *
 * Antes de dizer "peça a um administrador", vale a pergunta do acesso
 * corporativo: esta pessoa entrou pelo SSO de uma organização que
 * configurou provisionamento? Se sim, o vínculo nasce agora, com o papel
 * padrão — é o "provisionamento na primeira entrada".
 *
 * Quem decide isso é o banco, em provisionar_acesso_sso: ele confere que
 * a sessão veio do SSO daquela organização, e não apenas que o e-mail tem
 * o domínio parecido. Esta tela só pergunta.
 */
export default async function PaginaSemAcesso() {
  const usuario = await usuarioAtual();

  if (usuario) {
    const supabase = criarClienteServidor();
    const { data } = await supabase.rpc("provisionar_acesso_sso");
    if (data) redirect("/organizacoes");
  }

  return (
    <div className="coluna-estreita">
      <p className="olho">Acesso negado</p>
      <h1>Você não tem acesso a esta organização</h1>
      <p className="chamada">
        Peça a um administrador da organização que inclua o seu e-mail. Enquanto isso, você pode
        voltar para as organizações em que já tem acesso.
      </p>
      <p>
        <Link className="botao botao-secundario" href="/organizacoes">
          Ver minhas organizações
        </Link>
      </p>
    </div>
  );
}
