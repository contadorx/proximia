import Link from "next/link";

export default function PaginaSemAcesso() {
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
