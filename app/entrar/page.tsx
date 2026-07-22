import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth";
import FormularioAcesso from "./formulario";

export const dynamic = "force-dynamic";

export default async function PaginaEntrar() {
  if (await usuarioAtual()) redirect("/");

  return (
    <div className="coluna-estreita">
      <p className="olho">Acesso</p>
      <h1>Entrar</h1>
      <p className="chamada">
        Use o e-mail cadastrado na sua organização.
      </p>

      <div className="painel">
        <FormularioAcesso modo="entrar" />
      </div>

      <p className="nota">
        Primeira vez por aqui? <Link href="/cadastrar">Criar acesso</Link>.
      </p>
    </div>
  );
}
