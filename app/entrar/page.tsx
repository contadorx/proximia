import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirConfiguracao, usuarioAtual } from "@/lib/auth";
import FormularioAcesso from "./formulario";

export const dynamic = "force-dynamic";

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string };
}) {
  exigirConfiguracao();
  if (await usuarioAtual()) redirect("/");

  return (
    <div className="coluna-estreita">
      <p className="olho">Acesso</p>
      <h1>Entrar</h1>
      <p className="chamada">
        Use o e-mail cadastrado na sua organização.
      </p>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <div className="painel">
        <FormularioAcesso modo="entrar" />
        <p className="nota" style={{ marginTop: 16, marginBottom: 0 }}>
          <Link href="/esqueci">Esqueci a senha</Link>
        </p>
      </div>

      <p className="nota">
        Primeira vez por aqui? <Link href="/cadastrar">Criar acesso</Link>.
      </p>
    </div>
  );
}
