import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import {
  faixaMaturidade,
  nomePessoa,
  obterCarteira,
  pessoasDaCarteira,
  pessoasDaOrganizacao,
  STATUS_CARTEIRA,
} from "@/lib/carteiras";
import { formatarValor, listarContas, rotuloRelacao } from "@/lib/contas";
import { classeStatus, listarFrentes, rotuloStatus } from "@/lib/frentes";
import {
  atualizarCarteira,
  desvincularPessoaCarteira,
  vincularPessoaCarteira,
} from "@/app/acoes/carteiras";

export const dynamic = "force-dynamic";

export default async function PaginaCarteira({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const carteira = await obterCarteira(params.id);

  // A RLS já esconde carteira de outra organização ou fora do alcance:
  // se não veio nada, para quem pediu ela não existe.
  if (!carteira) notFound();

  const [pessoasOrg, pessoasCart, contas, frentes] = await Promise.all([
    pessoasDaOrganizacao(org.orgId),
    pessoasDaCarteira(carteira.id),
    listarContas({ orgId: org.orgId, carteiraId: carteira.id }),
    listarFrentes({ orgId: org.orgId, carteiraId: carteira.id }),
  ]);

  const podeEditar = podeEscrever(org.papel) && org.papel !== "ponto_focal";
  const faixa = faixaMaturidade(carteira.score_maturidade);
  const disponiveis = pessoasOrg.filter((p) => !pessoasCart.some((v) => v.id === p.id));

  return (
    <>
      <p className="olho">
        <Link href="/carteiras">Carteiras</Link> · {org.nome}
      </p>
      <h1>{carteira.nome}</h1>
      <p className="chamada">
        {[
          carteira.codigo,
          carteira.regiao,
          carteira.score_maturidade !== null
            ? `maturidade ${carteira.score_maturidade.toFixed(0)}${faixa ? ` · ${faixa.toLowerCase()}` : ""}${carteira.score_ciclo ? ` · ciclo ${carteira.score_ciclo}` : ""}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Sem código, região ou score registrados."}
      </p>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <section className="painel">
        <h2>Contas desta carteira</h2>
        {contas.length === 0 ? (
          <p className="nota">
            Nenhuma conta ainda. <Link href="/contas">Cadastre a primeira</Link>.
          </p>
        ) : (
          <ul className="lista-estado">
            {contas.map((c) => (
              <li key={c.id}>
                <span className="rotulo">
                  <Link href={`/contas/${c.id}`}>{c.nome}</Link>
                  <span className="dica">{rotuloRelacao(c.relacao)}</span>
                </span>
                <span className="par-valores">
                  <span className="valor-teto">teto {formatarValor(c.potencial_bruto)}</span>
                  <span className="valor-capturado">capt. {formatarValor(c.valor_capturado)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="painel">
        <h2>Frentes desta carteira</h2>
        {frentes.length === 0 ? (
          <p className="nota">
            Nenhuma frente. <Link href="/frentes">Registre a primeira</Link>.
          </p>
        ) : (
          <ul className="lista-estado">
            {frentes.map((f) => (
              <li key={f.id}>
                <span className="rotulo">
                  <Link href={`/frentes/${f.id}`}>{f.titulo}</Link>
                  <span className="dica">
                    {[f.qtd_casos !== null ? `${f.qtd_casos} casos` : null, f.proxima_etapa]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className={classeStatus(f.status)}>{rotuloStatus(f.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="painel">
        <h2>Quem acompanha</h2>
        <p className="nota" style={{ marginBottom: 18 }}>
          Vincular uma pessoa aqui é o que define o alcance de quem tem perfil de ponto focal: ela
          passa a enxergar esta carteira e nenhuma outra. Quem é analista ou administrador já vê
          todas.
        </p>

        {pessoasCart.length === 0 ? (
          <p className="nota">Ninguém vinculado ainda.</p>
        ) : (
          <ul className="lista-estado">
            {pessoasCart.map((p) => (
              <li key={p.id}>
                <span className="rotulo">
                  {nomePessoa(p)}
                  {p.email && p.nome && <span className="dica">{p.email}</span>}
                </span>
                {podeEditar && (
                  <form action={desvincularPessoaCarteira}>
                    <input type="hidden" name="carteira_id" value={carteira.id} />
                    <input type="hidden" name="user_id" value={p.id} />
                    <button className="link-acao" type="submit">
                      Remover
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {podeEditar && disponiveis.length > 0 && (
          <form action={vincularPessoaCarteira} className="formulario formulario-linha" style={{ marginTop: 20 }}>
            <input type="hidden" name="carteira_id" value={carteira.id} />
            <label className="campo">
              <span>Incluir pessoa</span>
              <select name="user_id" defaultValue="">
                <option value="" disabled>
                  Escolha na lista
                </option>
                {disponiveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nomePessoa(p)}
                  </option>
                ))}
              </select>
            </label>
            <button className="botao" type="submit">
              Vincular
            </button>
          </form>
        )}
      </section>

      {podeEditar ? (
        <section className="painel">
          <h2>Dados da carteira</h2>
          <form action={atualizarCarteira} className="formulario">
            <input type="hidden" name="id" value={carteira.id} />

            <div className="formulario-linha">
              <label className="campo">
                <span>Nome</span>
                <input type="text" name="nome" defaultValue={carteira.nome} required maxLength={120} />
              </label>
              <label className="campo">
                <span>Código</span>
                <input type="text" name="codigo" defaultValue={carteira.codigo ?? ""} maxLength={30} />
              </label>
              <label className="campo">
                <span>Região</span>
                <input type="text" name="regiao" defaultValue={carteira.regiao ?? ""} maxLength={60} />
              </label>
            </div>

            <div className="formulario-linha">
              <label className="campo">
                <span>Situação</span>
                <select name="status" defaultValue={carteira.status}>
                  {STATUS_CARTEIRA.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Responsável</span>
                <select name="responsavel_id" defaultValue={carteira.responsavel_id ?? ""}>
                  <option value="">Sem responsável</option>
                  {pessoasOrg.map((p) => (
                    <option key={p.id} value={p.id}>
                      {nomePessoa(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Score</span>
                <input
                  type="text"
                  name="score_maturidade"
                  inputMode="decimal"
                  defaultValue={carteira.score_maturidade ?? ""}
                />
              </label>
              <label className="campo">
                <span>Ciclo</span>
                <input type="text" name="score_ciclo" defaultValue={carteira.score_ciclo ?? ""} maxLength={20} />
              </label>
            </div>

            <label className="campo">
              <span>Observações</span>
              <textarea name="observacoes" rows={4} defaultValue={carteira.observacoes ?? ""} />
            </label>

            <button className="botao" type="submit">
              Salvar alterações
            </button>
          </form>
        </section>
      ) : (
        carteira.observacoes && (
          <section className="painel">
            <h2>Observações</h2>
            <p className="nota">{carteira.observacoes}</p>
          </section>
        )
      )}

      <p className="nota">
        O histórico e o extrato desta carteira entram nas próximas etapas da construção.
      </p>
    </>
  );
}
