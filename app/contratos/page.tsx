import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { listarCarteiras } from "@/lib/carteiras";
import { formatarData, formatarValor, listarContas } from "@/lib/contas";
import { PERIODICIDADES, classeSelo, listarContratos, urgencia } from "@/lib/contratos";
import { criarContrato } from "@/app/acoes/contratos";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { Seletor, SeletorMultiplo } from "@/components/seletor";
import { paraLista, temFiltro } from "@/lib/consulta";
import { CampoValor } from "@/components/campos";

export const dynamic = "force-dynamic";

const SITUACOES = [
  { valor: "vencido", rotulo: "Vencidos" },
  { valor: "janela", rotulo: "Janela aberta" },
  { valor: "acompanhar", rotulo: "Em acompanhamento" },
  { valor: "sem_prazo", rotulo: "Sem prazo" },
  { valor: "encerrado", rotulo: "Encerrados" },
];

export default async function PaginaContratos({
  searchParams,
}: {
  searchParams: { erro?: string; carteira?: string | string[]; situacao?: string | string[] };
}) {
  const org = await exigirOrg();
  const [todos, contas, carteiras] = await Promise.all([
    listarContratos({ orgId: org.orgId }),
    listarContas({ orgId: org.orgId }),
    listarCarteiras(org.orgId),
  ]);

  const filtroCarteiras = paraLista(searchParams.carteira);
  const filtroSituacoes = paraLista(searchParams.situacao);
  const contratos = todos.filter((c) => {
    if (filtroCarteiras.length && !filtroCarteiras.includes(c.carteira_id)) return false;
    if (filtroSituacoes.length && !filtroSituacoes.includes(urgencia(c).chave)) return false;
    return true;
  });
  const opcoesCarteira = carteiras.map((c) => ({
    valor: c.id,
    rotulo: c.nome,
    detalhe: c.codigo ?? undefined,
  }));

  const nomeConta = (id: string) => contas.find((c) => c.id === id)?.nome ?? "conta removida";
  const podeCriar = podeEscrever(org.papel) && contas.length > 0;
  const vencidos = todos.filter((c) => urgencia(c).chave === "vencido").length;
  const emJanela = todos.filter((c) => urgencia(c).chave === "janela").length;

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Contratos</h1>
        </div>
        {podeCriar && (
          <div className="cabeca-acoes">
            <Modal
              rotulo="Novo contrato"
              titulo="Novo contrato"
              descricao="As cláusulas você registra depois, na ficha do contrato."
              icone={<Plus size={15} />}
              largo
            >
              <form action={criarContrato} className="formulario">
                <input type="hidden" name="volta" value="/contratos" />
                <div className="formulario-linha">
                  <Seletor
                    nome="conta_id"
                    rotulo="Conta"
                    opcoes={contas.map((c) => ({
                      valor: c.id,
                      rotulo: c.nome,
                      detalhe: carteiras.find((k) => k.id === c.carteira_id)?.nome,
                    }))}
                    vazio="Escolha a conta"
                    obrigatorio
                  />
                  <label className="campo">
                    <span>Número</span>
                    <input type="text" name="numero" maxLength={60} placeholder="opcional" />
                  </label>
                  <label className="campo">
                    <span>Tipo</span>
                    <input
                      type="text"
                      name="tipo"
                      maxLength={60}
                      placeholder="como sua operação chama"
                    />
                  </label>
                </div>

                <div className="formulario-linha">
                  <label className="campo">
                    <span>Início</span>
                    <input type="date" name="inicio" />
                  </label>
                  <label className="campo">
                    <span>Fim</span>
                    <input type="date" name="fim" />
                  </label>
                  <label className="campo campo-numerico">
                    <span>Aviso prévio (dias)</span>
                    <input type="number" name="aviso_previa_dias" min={0} max={730} defaultValue={90} />
                    <small>Quantos dias antes do fim a conversa precisa começar.</small>
                  </label>
                  <label className="campo campo-marcador">
                    <input type="checkbox" name="renovacao_automatica" />
                    <span>Renovação automática</span>
                  </label>
                </div>

                <div className="formulario-linha">
                  <CampoValor nome="valor_base" rotulo="Valor base" />
                  <label className="campo">
                    <span>Periodicidade</span>
                    <select name="periodicidade" defaultValue="">
                      <option value="">Não definida</option>
                      {PERIODICIDADES.map((p) => (
                        <option key={p.valor} value={p.valor}>
                          {p.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="campo">
                    <span>Natureza do benefício</span>
                    <input
                      type="text"
                      name="natureza_beneficio"
                      maxLength={120}
                      placeholder="o que foi concedido e com que fundamento"
                    />
                  </label>
                </div>

                <button className="botao botao-primario" type="submit">
                  Registrar contrato
                </button>
              </form>
            </Modal>
          </div>
        )}
      </div>

      <IntroSecao>
        Cada contrato guarda vigência, o que foi concedido e as cláusulas que precisam de
        acompanhamento. A <strong>janela de renegociação</strong> é calculada sozinha — data de fim
        menos o aviso prévio —, e a lista vem ordenada pela urgência, não pela data de cadastro.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

      {(vencidos > 0 || emJanela > 0) && (
        <div className="tira-alerta">
          {vencidos > 0 && (
            <Link href="/contratos?situacao=vencido">
              <span className="dado">{vencidos}</span>{" "}
              {vencidos === 1 ? "contrato vencido" : "contratos vencidos"}
            </Link>
          )}
          {emJanela > 0 && (
            <Link href="/contratos?situacao=janela">
              <span className="dado">{emJanela}</span> com janela de renegociação aberta
            </Link>
          )}
        </div>
      )}

      <form className="filtros" method="get">
        <SeletorMultiplo
          nome="carteira"
          rotulo="Carteira"
          opcoes={opcoesCarteira}
          inicial={filtroCarteiras}
        />
        <SeletorMultiplo
          nome="situacao"
          rotulo="Situação"
          opcoes={SITUACOES.map((s) => ({ valor: s.valor, rotulo: s.rotulo }))}
          inicial={filtroSituacoes}
        />
        <button className="botao botao-secundario" type="submit">
          <Search size={14} />
          Filtrar
        </button>
        {temFiltro(searchParams.carteira, searchParams.situacao) && (
          <Link className="link-acao" href="/contratos">
            Limpar
          </Link>
        )}
      </form>

      {contratos.length === 0 ? (
        <Vazio
          acao={
            contas.length === 0 ? (
              <Link className="botao botao-secundario" href="/contas">
                Cadastrar uma conta
              </Link>
            ) : undefined
          }
        >
          {contas.length === 0
            ? "Todo contrato pertence a uma conta. Cadastre a conta primeiro."
            : "Nenhum contrato com esses filtros. Comece pelos que vencem este ano."}
        </Vazio>
      ) : (
        <section className="painel">
          <ul className="lista-estado">
            {contratos.map((c) => {
              const u = urgencia(c);
              return (
                <li key={c.id}>
                  <span className="rotulo">
                    <Link href={`/contratos/${c.id}`}>
                      {c.numero ? `${c.numero} · ` : ""}
                      {nomeConta(c.conta_id)}
                    </Link>
                    <span className="dica">
                      {[c.tipo, c.fim ? `vence ${formatarData(c.fim)}` : "sem data de fim", u.detalhe]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {c.valor_base !== null && (
                    <span className="valor-teto">{formatarValor(c.valor_base)}</span>
                  )}
                  <span className={classeSelo(u.tom)}>{u.rotulo}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
