import { exigirOrg, podeAdministrar } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { PAPEIS, rotuloPapel, type Papel } from "@/lib/tipos";
import { sair, trocarOrganizacao, vincularMembro } from "@/app/acoes/organizacoes";

export const dynamic = "force-dynamic";

type Pessoa = { user_id: string; papel: Papel; nome: string | null; email: string | null };

async function pessoasDaOrg(orgId: string): Promise<Pessoa[]> {
  const supabase = criarClienteServidor();

  const { data: vinculos } = await supabase
    .from("memberships")
    .select("user_id, papel")
    .eq("org_id", orgId)
    .eq("ativo", true);

  if (!vinculos?.length) return [];

  const { data: perfis } = await supabase
    .from("perfis")
    .select("id, nome, email")
    .in(
      "id",
      vinculos.map((v) => v.user_id as string),
    );

  const porId = new Map((perfis ?? []).map((p) => [p.id as string, p]));

  return vinculos.map((v) => {
    const perfil = porId.get(v.user_id as string);
    return {
      user_id: v.user_id as string,
      papel: v.papel as Papel,
      nome: (perfil?.nome as string) ?? null,
      email: (perfil?.email as string) ?? null,
    };
  });
}

export default async function PaginaPainel({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const pessoas = await pessoasDaOrg(org.orgId);
  const administra = podeAdministrar(org.papel);

  return (
    <>
      <p className="olho">Organização</p>
      <h1>{org.nome}</h1>
      <p className="chamada">
        Você está como {rotuloPapel(org.papel).toLowerCase()}. As carteiras entram na próxima etapa
        da construção; por enquanto, aqui se define quem tem acesso e com qual alcance.
      </p>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <section className="painel">
        <h2>Pessoas com acesso</h2>
        <ul className="lista-estado">
          {pessoas.map((p) => (
            <li key={p.user_id}>
              <span className="rotulo">
                {p.nome ?? p.email ?? "Pessoa sem perfil"}
                {p.email && p.nome && <span className="dica">{p.email}</span>}
              </span>
              <span className="selo selo-neutro">{rotuloPapel(p.papel)}</span>
            </li>
          ))}
        </ul>
      </section>

      {administra && (
        <section className="painel">
          <h2>Incluir pessoa</h2>
          <p className="nota" style={{ marginBottom: 18 }}>
            A pessoa precisa ter criado o acesso antes. Informe o mesmo e-mail que ela cadastrou.
          </p>
          <form action={vincularMembro} className="formulario formulario-linha">
            <input type="hidden" name="org_id" value={org.orgId} />
            <label className="campo">
              <span>E-mail</span>
              <input type="email" name="email" required />
            </label>
            <label className="campo">
              <span>Alcance</span>
              <select name="papel" defaultValue="analista">
                {PAPEIS.filter((p) => p.valor !== "owner").map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo} — {p.explicacao}
                  </option>
                ))}
              </select>
            </label>
            <button className="botao" type="submit">
              Incluir
            </button>
          </form>
        </section>
      )}

      <div className="acoes-rodape">
        <form action={trocarOrganizacao}>
          <button type="submit" className="link-acao">
            Trocar de organização
          </button>
        </form>
        <form action={sair}>
          <button type="submit" className="link-acao">
            Sair
          </button>
        </form>
      </div>
    </>
  );
}
