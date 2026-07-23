import Link from "next/link";
import { pedirRedefinicao } from "@/app/acoes/senha";
import { BotaoEnviar } from "@/components/botao-enviar";

export const dynamic = "force-dynamic";

export default function PaginaEsqueci({
  searchParams,
}: {
  searchParams: { erro?: string; enviado?: string };
}) {
  return (
    <div className="coluna-estreita">
      <p className="olho">Acesso</p>
      <h1>Esqueci minha senha</h1>

      {searchParams.enviado ? (
        <>
          <p className="aviso aviso-ok">
            Se houver uma conta com esse e-mail, o link de redefinição já está a caminho.
          </p>
          <p className="nota">
            O link vale por tempo limitado e serve uma vez só. Se não chegar em alguns minutos,
            confira a caixa de spam e o endereço digitado.
          </p>
          <p>
            <Link href="/entrar">Voltar para o acesso</Link>
          </p>
        </>
      ) : (
        <>
          <p className="chamada">
            Informe o e-mail cadastrado. Enviamos um link para você definir uma senha nova.
          </p>

          {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

          <div className="painel">
            <form action={pedirRedefinicao} className="formulario">
              <label className="campo">
                <span>E-mail</span>
                <input type="email" name="email" required autoFocus />
              </label>
              <BotaoEnviar>
                Enviar link
              </BotaoEnviar>
            </form>
          </div>

          <p className="nota">
            <Link href="/entrar">Lembrei a senha, quero entrar</Link>
          </p>
        </>
      )}
    </div>
  );
}
