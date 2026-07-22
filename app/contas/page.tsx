import Link from "next/link";
import { Plus, Search } from "lucide-react";
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
import { Modal } from "@/components/modal";
import { Seletor, SeletorMultiplo } from "@/components/seletor";
import { paraLista, temFiltro } from "@/lib/consulta";
import { CampoCnpj } from "@/components/campos";

export const dynamic = "force-dynamic";

export default async function PaginaContas({
  searchParams,
}: {
  searchParams: {
    erro?: string;
    busca?: string;
    carteira?: string | string[];
    relacao?: string | string[];
  };
}) {
  const org = await exigirOrg();
  const [carteiras, contas] = await Promise.all([
    listarCarteiras(org.orgId),
    listarContas({
      orgId: org.orgId,
      busca: searchParams.busca,
      carteiras: paraLista(searchParams.carteira),
      relacoes: paraLista(searchParams.relacao),
    }),
  ]);

  const podeCriar = podeEscrever(org.papel) && carteiras.length > 0;
  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";
  const filtrando = Boolean(searchParams.busca) || temFiltro(searchParams.carteira, searchParams.relacao);
  const opcoesCarteira = carteiras.map((c) => ({
    valor: c.id,
    rotulo: c.nome,
    detalhe: c.codigo ?? undefined,
  }));

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Contas</h1>
        </div>
        {podeCriar && (
          <div className="cabeca-acoes">
            <Modal
              rotulo="Nova conta"
              titulo="Nova conta"
              descricao="Potencial, capturado e contatos você registra depois, na ficha."
              icone={<Plus size={15} />}
            >
              <form action={criarConta} className="formulario">
                <div className="formulario-linha">
                  <label className="campo">
                    <span>Nome</span>
                    <input type="text" name="nome" required maxLength={160} autoFocus />
                  </label>
                  <Seletor
                    nome="carteira_id"
                    rotulo="Carteira"
                    opcoes={opcoesCarteira}
                    vazio="Escolha a carteira"
                    obrigatorio
                  />
                </div>
                <div className="formulario-linha">
                  <CampoCnpj />
                  <label className="campo">
                    <span>Segmento</span>
                    <input type="text" name="segmento" maxLength={80} placeholder="opcional" />
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
                </div>
                <button className="botao botao-primario" type="submit">
                  Criar conta
                </button>
              </form>
            </Modal>
          </div>
        )}
      </div>

      <IntroSecao>
        Aqui ficam as contas que merecem <strong>gestão individual</strong>: as maiores, as com
        contrato, as em prospecção e as que precisam ser defendidas. Volume de baixo valor unitário
        não entra conta a conta — vira frente agregada na carteira.
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
        <SeletorMultiplo
          nome="carteira"
          rotulo="Carteira"
          opcoes={opcoesCarteira}
          inicial={paraLista(searchParams.carteira)}
        />
        <SeletorMultiplo
          nome="relacao"
          rotulo="Relação"
          opcoes={RELACOES.map((r) => ({ valor: r.valor, rotulo: r.rotulo }))}
          inicial={paraLista(searchParams.relacao)}
        />
        <button className="botao botao-secundario" type="submit">
          <Search size={14} />
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
            : "Nenhuma conta cadastrada ainda. Comece pelas maiores de cada carteira."}
        </Vazio>
      ) : (
        <section className="painel">
          <div className="linha-titulo">
            <h2>
              {contas.length} {contas.length === 1 ? "conta" : "contas"}
            </h2>
          </div>
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

      {carteiras.length === 0 && (
        <p className="nota">
          Cadastre uma <Link href="/carteiras">carteira</Link> antes: toda conta pertence a uma.
        </p>
      )}
    </>
  );
}
