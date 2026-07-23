import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { usuarioAtual } from "@/lib/auth";
import { rotuloPapel, type Papel } from "@/lib/tipos";
import { aceitarConvite } from "@/app/acoes/convites";
import { BotaoEnviar } from "@/components/botao-enviar";

export const dynamic = "force-dynamic";

export default async function PaginaConvite({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { erro?: string };
}) {
  const supabase = criarClienteServidor();
  const { data } = await supabase.rpc("ver_convite", { p_token: params.token });
  const convite = (data as {
    org_nome: string;
    email: string;
    papel: Papel;
    valido: boolean;
    motivo: string | null;
  }[] | null)?.[0];

  const usuario = await usuarioAtual();

  if (!convite) {
    return (
      <div className="coluna-estreita">
        <p className="olho">Convite</p>
        <h1>Convite não encontrado</h1>
        <p className="chamada">
          O link pode ter sido copiado pela metade. Confira o endereço recebido ou peça um novo
          convite.
        </p>
      </div>
    );
  }

  return (
    <div className="coluna-estreita">
      <p className="olho">Convite</p>
      <h1>{convite.org_nome}</h1>
      <p className="chamada">
        O acesso é como <strong>{rotuloPapel(convite.papel).toLowerCase()}</strong>, para o e-mail{" "}
        <strong>{convite.email}</strong>.
      </p>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

      {!convite.valido ? (
        <p className="aviso aviso-erro">{convite.motivo}</p>
      ) : !usuario ? (
        <div className="painel">
          <p className="nota">
            Para aceitar, entre com <strong>{convite.email}</strong>. Se ainda não tem acesso, crie
            um com esse mesmo e-mail e volte a este link.
          </p>
          <div className="acoes-rodape">
            <Link className="botao botao-primario" href="/entrar">
              Entrar
            </Link>
            <Link className="botao botao-secundario" href="/cadastrar">
              Criar acesso
            </Link>
          </div>
        </div>
      ) : usuario.email?.toLowerCase() !== convite.email.toLowerCase() ? (
        <p className="aviso aviso-erro">
          Você está com {usuario.email}, e este convite foi enviado para {convite.email}. Saia e
          entre com o e-mail convidado.
        </p>
      ) : (
        <div className="painel">
          <form action={aceitarConvite}>
            <input type="hidden" name="token" value={params.token} />
            <BotaoEnviar>
              Aceitar convite
            </BotaoEnviar>
          </form>
        </div>
      )}
    </div>
  );
}
