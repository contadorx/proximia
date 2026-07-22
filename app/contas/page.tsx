import Link from "next/link";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { listarCarteiras } from "@/lib/carteiras";
import {
  CRITICIDADES,
  RELACOES,
  formatarDocumento,
  formatarValor,
  listarContas,
  rotuloRelacao,
} from "@/lib/contas";
import { criarConta } from "@/app/acoes/contas";
import { IntroSecao, Vazio } from "@/components/intro-secao";

export const dynamic = "force-dynamic";

export default async function PaginaContas({
  searchParams,
}: {
  searchParams: { erro?: string; busca?: string; carteira?: string; relacao?: string };
}) {
  const org = await exigirOrg();
  const [carteiras, contas] = await Promise.all([
    listarCarteiras(org.orgId),
    listarContas({
      orgId: org.orgId,
      busca: searchParams.busca,
      carteiraId: searchParams.carteira,
      relacao: searchParams.relacao,
    }),
  ]);

  const podeCriar = podeEscrever(org.papel) && carteiras.length > 0;
  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";
  const filtrando = Boolean(searchParams.busca || searchParams.carteira || searchParams.relacao);

  return (
    <>
      <p className="olho">{org.nome}</p>
      <h1>Contas</h1>
      <IntroSecao>
        Aqui ficam as contas que merecem <strong>gestão individual</strong>: as maiores, as com
        contrato, as em prospecção e as que precisam ser defendidas. Volume de baixo valor unitário
        não entra conta a conta — vira frente agregada na carteira, mais adiante na construção.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

      <form className="filtros" method="get">
        <label className="campo">
          <span>Buscar</span>
          <input
            type="text"
            name="busca"
            defaultValue={searchParams.busca ?? ""}
            placeholder="nome, razão social ou CNPJ"
          />
        </label>
        <label className="campo">
          <span>Carteira</span>
          <select name="carteira" defaultValue={searchParams.carteira ?? ""}>
            <option value="">Todas</option>
            {carteiras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Relação</span>
          <select name="relacao" defaultValue={searchParams.relacao ?? ""}>
            <option value="">Todas</option>
            {RELACOES.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.rotulo}
              </option>
            ))}
          </select>
        </label>
        <button className="botao botao-secundario" type="submit">
          Filtrar
        </button>
        {filtrando && (
          <Link className="link-acao" href="/contas">
            Limpar
          </Link>
        )}
      </form>

      {contas.length === 0 ? (
        <Vazio>
          {filtrando
            ? "Nenhuma conta encontrada com esses filtros."
            : "Nenhuma conta cadastrada ainda. Comece pelas maiores de cada carteira — o formulário abaixo pede só o essencial."}
        </Vazio>
      ) : (
        <section className="painel">
          <p className="olho" style={{ marginBottom: 4 }}>
            <span className="dado">{contas.length}</span>{" "}
            {contas.length === 1 ? "conta" : "contas"}
          </p>
          <ul className="lista-estado">
            {contas.map((c) => (
              <li key={c.id}>
                <span className="rotulo">
                  <Link href={`/contas/${c.id}`}>{c.nome}</Link>
                  <span className="dica">
                    {[nomeCarteira(c.carteira_id), formatarDocumento(c.documento), c.segmento]
                      .filter((v) => v && v !== "—")
                      .join(" · ")}
                  </span>
                </span>
                <span className="par-valores">
                  <span className="valor-teto">teto {formatarValor(c.potencial_bruto)}</span>
                  <span className="valor-capturado">capt. {formatarValor(c.valor_capturado)}</span>
                </span>
                <span
                  className={
                    c.relacao === "protecao"
                      ? "selo selo-falta"
                      : c.relacao === "contrato"
                        ? "selo selo-ok"
                        : "selo selo-neutro"
                  }
                >
                  {rotuloRelacao(c.relacao)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {podeCriar && (
        <section className="painel">
          <h2>Nova conta</h2>
          <form action={criarConta} className="formulario">
            <div className="formulario-linha">
              <label className="campo">
                <span>Nome</span>
                <input type="text" name="nome" required maxLength={160} />
              </label>
              <label className="campo">
                <span>Carteira</span>
                <select name="carteira_id" required defaultValue="">
                  <option value="" disabled>
                    Escolha
                  </option>
                  {carteiras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>CNPJ</span>
                <input type="text" name="documento" placeholder="opcional" maxLength={20} />
              </label>
            </div>

            <div className="formulario-linha">
              <label className="campo">
                <span>Relação</span>
                <select name="relacao" defaultValue="estrategica">
                  {RELACOES.map((r) => (
                    <option key={r.valor} value={r.valor}>
                      {r.rotulo} — {r.explicacao}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Criticidade</span>
                <select name="criticidade" defaultValue="media">
                  {CRITICIDADES.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Segmento</span>
                <input type="text" name="segmento" maxLength={80} placeholder="opcional" />
              </label>
            </div>

            <button className="botao" type="submit">
              Criar conta
            </button>
            <p className="nota" style={{ marginTop: 4 }}>
              Potencial, valor capturado e contatos você registra na ficha da conta.
            </p>
          </form>
        </section>
      )}

      {carteiras.length === 0 && (
        <p className="nota">
          Cadastre uma <Link href="/carteiras">carteira</Link> antes: toda conta pertence a uma.
        </p>
      )}
    </>
  );
}
