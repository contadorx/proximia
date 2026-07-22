import { redirect } from "next/navigation";
import { exigirUsuario, vinculosDoUsuario } from "@/lib/auth";
import { rotuloPapel } from "@/lib/tipos";
import { criarOrganizacao, selecionarOrganizacao, sair } from "@/app/acoes/organizacoes";

export const dynamic = "force-dynamic";

export default async function PaginaOrganizacoes({
  searchParams,
}: {
  searchParams: { erro?: string };
}) {
  const usuario = await exigirUsuario();
  const vinculos = await vinculosDoUsuario();

  // Com um único vínculo não faz sentido pedir escolha.
  if (vinculos.length === 1 && !searchParams.erro) {
    const unica = vinculos[0];
    return (
      <div className="coluna-estreita">
        <p className="olho">Organização</p>
        <h1>{unica.nome}</h1>
        <p className="chamada">Você entra como {rotuloPapel(unica.papel).toLowerCase()}.</p>
        <form action={selecionarOrganizacao}>
          <input type="hidden" name="org_id" value={unica.orgId} />
          <button className="botao" type="submit">
            Continuar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="coluna-estreita">
      <p className="olho">{usuario.email}</p>
      <h1>Suas organizações</h1>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

      {vinculos.length === 0 ? (
        <p className="chamada">
          Você ainda não tem acesso a nenhuma organização. Crie a sua abaixo ou peça a um
          administrador que inclua o seu e-mail.
        </p>
      ) : (
        <ul className="lista-escolha">
          {vinculos.map((v) => (
            <li key={v.orgId}>
              <form action={selecionarOrganizacao}>
                <input type="hidden" name="org_id" value={v.orgId} />
                <button type="submit" className="escolha">
                  <span className="escolha-nome">{v.nome}</span>
                  <span className="escolha-papel dado">{rotuloPapel(v.papel)}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <div className="painel">
        <h2>Criar organização</h2>
        <p className="nota" style={{ marginBottom: 18 }}>
          Quem cria vira dono e pode incluir as demais pessoas depois.
        </p>
        <form action={criarOrganizacao} className="formulario">
          <label className="campo">
            <span>Nome</span>
            <input type="text" name="nome" required maxLength={120} />
          </label>
          <label className="campo">
            <span>Identificador</span>
            <input
              type="text"
              name="slug"
              required
              pattern="[a-z0-9][a-z0-9\-]{1,48}[a-z0-9]"
              placeholder="minha-operacao"
            />
            <small>Letras minúsculas, números e hífen. Usado nos endereços.</small>
          </label>
          <button className="botao" type="submit">
            Criar organização
          </button>
        </form>
      </div>

      <form action={sair}>
        <button type="submit" className="link-acao">
          Sair
        </button>
      </form>
    </div>
  );
}
