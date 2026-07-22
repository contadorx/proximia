import Link from "next/link";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import {
  faixaMaturidade,
  listarCarteiras,
  nomePessoa,
  pessoasDaOrganizacao,
  STATUS_CARTEIRA,
} from "@/lib/carteiras";
import { criarCarteira } from "@/app/acoes/carteiras";

export const dynamic = "force-dynamic";

export default async function PaginaCarteiras({
  searchParams,
}: {
  searchParams: { erro?: string };
}) {
  const org = await exigirOrg();
  const [carteiras, pessoas] = await Promise.all([
    listarCarteiras(org.orgId),
    pessoasDaOrganizacao(org.orgId),
  ]);
  const podeCriar = podeEscrever(org.papel) && org.papel !== "ponto_focal";

  return (
    <>
      <p className="olho">{org.nome}</p>
      <h1>Carteiras</h1>
      <p className="chamada">
        {org.papel === "ponto_focal"
          ? "Aqui estão as carteiras em que você foi vinculado."
          : "Cada carteira agrupa as contas sob um responsável. É por ela que o trabalho é acompanhado."}
      </p>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

      {carteiras.length === 0 ? (
        <p className="nota" style={{ marginBottom: 28 }}>
          Nenhuma carteira cadastrada ainda.
          {podeCriar ? " Crie a primeira no formulário abaixo." : " Peça a inclusão a um administrador."}
        </p>
      ) : (
        <section className="painel">
          <ul className="lista-estado">
            {carteiras.map((c) => {
              const faixa = faixaMaturidade(c.score_maturidade);
              const responsavel = pessoas.find((p) => p.id === c.responsavel_id);
              return (
                <li key={c.id}>
                  <span className="rotulo">
                    <Link href={`/carteiras/${c.id}`}>{c.nome}</Link>
                    <span className="dica">
                      {[
                        c.codigo,
                        c.regiao,
                        c.responsavel_id ? `resp. ${nomePessoa(responsavel)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "sem código, região ou responsável"}
                    </span>
                  </span>
                  {c.score_maturidade !== null && (
                    <span className="selo selo-neutro" title={faixa ?? undefined}>
                      <span className="dado">{c.score_maturidade.toFixed(0)}</span>
                      {c.score_ciclo ? ` · ${c.score_ciclo}` : ""}
                    </span>
                  )}
                  <span className={c.status === "ativa" ? "selo selo-ok" : "selo selo-neutro"}>
                    {STATUS_CARTEIRA.find((s) => s.valor === c.status)?.rotulo ?? c.status}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {podeCriar && (
        <section className="painel">
          <h2>Nova carteira</h2>
          <form action={criarCarteira} className="formulario">
            <div className="formulario-linha">
              <label className="campo">
                <span>Nome</span>
                <input type="text" name="nome" required maxLength={120} />
              </label>
              <label className="campo">
                <span>Código</span>
                <input type="text" name="codigo" maxLength={30} placeholder="opcional" />
              </label>
              <label className="campo">
                <span>Região</span>
                <input type="text" name="regiao" maxLength={60} placeholder="opcional" />
              </label>
            </div>
            <div className="formulario-linha">
              <label className="campo">
                <span>Responsável</span>
                <select name="responsavel_id" defaultValue="">
                  <option value="">Definir depois</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {nomePessoa(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Score de maturidade</span>
                <input type="text" name="score_maturidade" inputMode="decimal" placeholder="0 a 100" />
                <small>Nota vinda de avaliação já feita. Deixe em branco se não houver.</small>
              </label>
              <label className="campo">
                <span>Ciclo do score</span>
                <input type="text" name="score_ciclo" maxLength={20} placeholder="2026-1" />
              </label>
            </div>
            <button className="botao" type="submit">
              Criar carteira
            </button>
          </form>
        </section>
      )}
    </>
  );
}
