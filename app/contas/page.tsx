import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { listarCarteiras } from "@/lib/carteiras";
import {
  CRITICIDADES,
  LIMITE_CONTAS,
  RELACOES,
  formatarDocumento,
  formatarValor,
  listarContas,
  rotuloRelacao,
} from "@/lib/contas";
import { criarConta, excluirContasEmLote } from "@/app/acoes/contas";
import { cuidadoDaOrg, lerCuidado } from "@/lib/cuidado";
import { BotaoExcluir } from "@/components/botao-excluir";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { Seletor, SeletorMultiplo } from "@/components/seletor";
import { BotaoEnviar } from "@/components/botao-enviar";
import { FormAcao } from "@/components/form-acao";
import { paraLista, temFiltro } from "@/lib/consulta";
import { listarAlertas } from "@/lib/alertas";
import { listarCompromissos } from "@/lib/compromissos";
import { listarContratos } from "@/lib/contratos";
import { sinaisDaConta } from "@/lib/sinais";
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
    criticidade?: string | string[];
    ordem?: string;
    ok?: string;
  };
}) {
  const org = await exigirOrg();
  const [carteiras, contas, contratos, avisosAbertos, compromissosAbertos, cuidados] = await Promise.all([
    listarCarteiras(org.orgId),
    listarContas({
      orgId: org.orgId,
      busca: searchParams.busca,
      carteiras: paraLista(searchParams.carteira),
      relacoes: paraLista(searchParams.relacao),
      criticidades: paraLista(searchParams.criticidade),
      ordem: (["nome", "receita", "potencial", "capturado", "recentes"] as const).includes(
        searchParams.ordem as never,
      )
        ? (searchParams.ordem as "nome" | "receita" | "potencial" | "capturado" | "recentes")
        : "nome",
    }),
    listarContratos({ orgId: org.orgId }),
    listarAlertas({ orgId: org.orgId, status: "aberto" }),
    listarCompromissos({ orgId: org.orgId, status: "aberto" }),
    cuidadoDaOrg(org.orgId),
  ]);

  const cuidadoDe = new Map(cuidados.map((c) => [c.conta_id, c.indice]));

  // Sinais na triagem: o que faz abrir a ficha aparece antes de abrir.
  // Aqui não entra "dias sem registro" — exigiria uma consulta de
  // histórico por conta da lista inteira, e o ganho não paga o custo.
  // A ficha mostra o conjunto completo.
  const sinaisDe = (contaId: string, potencial: number | null, capturado: number | null) =>
    sinaisDaConta({
      contaId,
      potencialBruto: potencial,
      valorCapturado: capturado,
      contratos,
      avisosAbertos,
      compromissosAbertos,
      ultimoRegistroEm: null,
    });

  const podeCriar = podeEscrever(org.papel) && carteiras.length > 0;
  // Exclusão em lote é para quem administra. Ponto focal opera a carteira
  // dele; apagar trezentas contas de uma vez não é operação de rotina.
  const podeApagarEmLote = podeEscrever(org.papel) && org.papel !== "ponto_focal";
  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";
  const filtrando =
    Boolean(searchParams.busca) ||
    temFiltro(searchParams.carteira, searchParams.relacao, searchParams.criticidade) ||
    Boolean(searchParams.ordem && searchParams.ordem !== "nome");
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
              <FormAcao action={criarConta}>
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
                <BotaoEnviar>Criar conta</BotaoEnviar>
              </FormAcao>
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
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

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
          nome="criticidade"
          rotulo="Criticidade"
          opcoes={[
            { valor: "alta", rotulo: "Alta" },
            { valor: "media", rotulo: "Média" },
            { valor: "baixa", rotulo: "Baixa" },
          ]}
          inicial={paraLista(searchParams.criticidade)}
        />
        <label className="campo">
          <span>Ordenar por</span>
          <select name="ordem" defaultValue={searchParams.ordem ?? "nome"}>
            <option value="nome">Nome</option>
            <option value="receita">Maior receita atual</option>
            <option value="potencial">Maior potencial</option>
            <option value="capturado">Maior capturado</option>
            <option value="recentes">Alteradas recentemente</option>
          </select>
        </label>
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
        <Vazio
              acao={<Link className="botao botao-primario" href="/importacao">Importar por planilha</Link>}
            >
              Nenhuma conta ainda. Comece pelas que merecem gestão individual: em geral são poucas e respondem pela maior parte da receita.
            </Vazio>
      ) : (
        <section className="painel">
          <div className="linha-titulo">
            <h2>
              {contas.length >= LIMITE_CONTAS
                ? `Primeiras ${LIMITE_CONTAS} contas`
                : `${contas.length} ${contas.length === 1 ? "conta" : "contas"}`}
            </h2>
          </div>
          {contas.length >= LIMITE_CONTAS && (
            <p className="nota">
              Há mais contas do que a lista mostra. Use a busca ou o filtro de carteira para
              chegar ao restante.
            </p>
          )}
          <form action={excluirContasEmLote}>
          <ul className="lista-estado">
            {contas.map((c) => (
              <li key={c.id}>
                {podeApagarEmLote && (
                  <input
                    type="checkbox"
                    name="ids"
                    value={c.id}
                    className="marcador-lote"
                    aria-label={`Selecionar ${c.nome}`}
                  />
                )}
                <span className="rotulo">
                  <Link href={`/contas/${c.id}`}>{c.nome}</Link>
                  <span className="dica">
                    {[nomeCarteira(c.carteira_id), formatarDocumento(c.documento), c.segmento]
                      .filter((v) => v && v !== "—")
                      .join(" · ")}
                  </span>
                </span>
                {cuidadoDe.has(c.id) && (
                  <span
                    className={lerCuidado(cuidadoDe.get(c.id)).classe}
                    title="Cuidado da conta: quanto do checklist da operação está cumprido"
                  >
                    {lerCuidado(cuidadoDe.get(c.id)).rotulo}
                  </span>
                )}
                <span className="par-valores">
                  {c.receita_atual !== null && (
                    <span className="dado">hoje {formatarValor(c.receita_atual)}</span>
                  )}
                  <span className="valor-teto">teto {formatarValor(c.potencial_bruto)}</span>
                  <span className="valor-capturado">capt. {formatarValor(c.valor_capturado)}</span>
                </span>
                {(() => {
                  const sinais = sinaisDe(c.id, c.potencial_bruto, c.valor_capturado);
                  return sinais.length > 0 ? (
                    <span className="selo selo-falta" title={sinais.map((s) => s.rotulo).join(" · ")}>
                      {sinais.length} {sinais.length === 1 ? "sinal" : "sinais"}
                    </span>
                  ) : null;
                })()}
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

          {podeApagarEmLote && (
            <div className="rodape-lote">
              <BotaoExcluir
                rotulo="Excluir selecionadas"
                aviso="Não há como desfazer. Contas com captura confirmada são preservadas e a tela dirá quais."
              />
              <span className="nota">
                Conta com captura confirmada não é apagada em lote — captura tem autor e
                comprovação, e apagá-la em massa é perda que não se desfaz.
              </span>
            </div>
          )}
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
