import Link from "next/link";
import { usuarioAtual } from "@/lib/auth";
import { definirSenha } from "@/app/acoes/senha";

export const dynamic = "force-dynamic";

export default async function PaginaRedefinir({
  searchParams,
}: {
  searchParams: { erro?: string };
}) {
  const usuario = await usuarioAtual();

  // Sem sessão significa que o link não foi trocado por uma: ou expirou,
  // ou já foi usado, ou a pessoa abriu esta página direto.
  if (!usuario) {
    return (
      <div className="coluna-estreita">
        <p className="olho">Acesso</p>
        <h1>Link não confirmado</h1>
        <p className="chamada">
          Esta página só abre a partir do link enviado por e-mail, e esse link serve uma vez só.
        </p>
        <div className="acoes-rodape">
          <Link className="botao botao-primario" href="/esqueci">
            Pedir um novo link
          </Link>
          <Link className="link-acao" href="/entrar">
            Voltar para o acesso
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="coluna-estreita">
      <p className="olho">Acesso</p>
      <h1>Definir nova senha</h1>
      <p className="chamada">
        Você está entrando como <strong>{usuario.email}</strong>. Escolha uma senha de pelo menos
        oito caracteres.
      </p>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

      <div className="painel">
        <form action={definirSenha} className="formulario">
          <label className="campo">
            <span>Nova senha</span>
            <input type="password" name="senha" required minLength={8} autoFocus />
          </label>
          <label className="campo">
            <span>Repita a senha</span>
            <input type="password" name="confirmacao" required minLength={8} />
          </label>
          <button className="botao botao-primario" type="submit">
            Salvar senha
          </button>
        </form>
      </div>
    </div>
  );
}
