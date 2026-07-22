import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth";
import FormularioAcesso from "../entrar/formulario";

export const dynamic = "force-dynamic";

export default async function PaginaCadastrar() {
  if (await usuarioAtual()) redirect("/");

  return (
    <div className="coluna-estreita">
      <p className="olho">Acesso</p>
      <h1>Criar acesso</h1>
      <p className="chamada">
        Depois de criar o acesso, você entra em uma organização existente a convite de um
        administrador — ou cria a sua.
      </p>

      <div className="painel">
        <FormularioAcesso modo="cadastrar" />
      </div>

      <p className="nota">
        Já tem acesso? <Link href="/entrar">Entrar</Link>.
      </p>
    </div>
  );
}
