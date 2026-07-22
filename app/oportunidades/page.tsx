import Link from "next/link";
import { LayoutGrid, List, Plus, Search } from "lucide-react";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { listarCarteiras, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { formatarData, formatarValor, listarContas } from "@/lib/contas";
import {
  FASES,
  classeFase,
  diasNaFase,
  formatarPayback,
  formatarPercentual,
  listarOportunidades,
  rotuloFase,
  tiposDeOportunidade,
  totaisOportunidades,
} from "@/lib/oportunidades";
import { criarOportunidade } from "@/app/acoes/oportunidades";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { Seletor, SeletorMultiplo } from "@/components/seletor";
import { paraLista, temFiltro } from "@/lib/consulta";
import { CampoValor } from "@/components/campos";

export const dynamic = "force-dynamic";

export default async function PaginaOportunidades({
  searchParams,
}: {
  searchParams: { erro?: string; carteira?: string | string[]; fase?: string | string[] };
}) {
  const org = await exigirOrg();
  const [oportunidades, carteiras, contas, tipos, pessoas] = await Promise.all([
    listarOportunidades({
      orgId: org.orgId,
      carteiras: paraLista(searchParams.carteira),
      fases: paraLista(searchParams.fase),
    }),
    listarCarteiras(org.orgId),
    listarContas({ orgId: org.orgId }),
    tiposDeOportunidade(org.orgId),
    pessoasDaOrganizacao(org.orgId),
  ]);

  const t = totaisOportunidades(oportunidades);
  const podeCriar = podeEscrever(org.papel) && carteiras.length > 0;
  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";
  const opcoesCarteira = carteiras.map((c) => ({
    valor: c.id,
    rotulo: c.nome,
    detalhe: c.codigo ?? undefined,
  }));
  const opcoesConta = contas.map((c) => ({
    valor: c.id,
    rotulo: c.nome,
    detalhe: nomeCarteira(c.carteira_id),
  }));
  const nomeConta = (id: string | null) =>
    id ? (contas.find((c) => c.id === id)?.nome ?? null) : null;
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Oportunidades</h1>
        </div>
        <div className="cabeca-acoes">
          <Link className="botao botao-secundario ativo" href="/oportunidades">
            <List size={15} />
            Lista
          </Link>
          <Link className="botao botao-secundario" href="/oportunidades/quadro">
            <LayoutGrid size={15} />
            Quadro
          </Link>
        </div>
        {podeCriar && (
          <div className="cabeca-acoes">
            <Modal
              rotulo="Nova oportunidade"
              titulo="Nova oportunidade"
              descricao="Investimento e retorno podem entrar depois — mas, quando entrarem, precisam de procedência."
              icone={<Plus size={15} />}
              largo
            >
              <form action={criarOportunidade} className="formulario">
                <div className="formulario-linha">
                  <label className="campo">
                    <span>Título</span>
                    <input type="text" name="titulo" required maxLength={160} autoFocus />
                  </label>
                  <div className="formulario-linha">
                    <label className="campo">
                      <span>Natureza</span>
                      <select name="natureza" defaultValue="captura">
                        <option value="captura">Captura — receita nova</option>
                        <option value="protecao">Proteção — receita que já existe</option>
                      </select>
                      <small>Proteção não soma ao potencial a capturar.</small>
                    </label>
                    <label className="campo">
                      <span>Prioridade</span>
                      <select name="prioridade" defaultValue="3">
                        <option value="1">1 · Máxima</option>
                        <option value="2">2 · Alta</option>
                        <option value="3">3 · Média</option>
                        <option value="4">4 · Baixa</option>
                        <option value="5">5 · Mínima</option>
                      </select>
                    </label>
                  </div>
                  <Seletor
                    nome="carteira_id"
                    rotulo="Carteira"
                    opcoes={opcoesCarteira}
                    vazio="Escolha a carteira"
                    obrigatorio
                  />
                  <Seletor
                    nome="conta_id"
                    rotulo="Conta"
                    opcoes={opcoesConta}
                    vazio="Sem conta específica"
                  />
                </div>

                <div className="formulario-linha">
                  <label className="campo">
                    <span>Tipo</span>
                    <select name="catalogo_id" defaultValue="">
                      <option value="">Sem tipo</option>
                      {tipos
                        .filter((x) => x.ativo)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.nome}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="campo">
                    <span>Fase</span>
                    <select name="fase" defaultValue="identificacao">
                      {FASES.filter((f) => f.valor !== "descartada").map((f) => (
                        <option key={f.valor} value={f.valor}>
                          {f.rotulo} — {f.explicacao}
                        </option>
                      ))}
                    </select>
                  </label>
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
                </div>

                <div className="formulario-linha">
                  <CampoValor nome="investimento" rotulo="Investimento" ajuda="O que precisa ser aplicado antes." />
                  <CampoValor nome="retorno_mensal" rotulo="Retorno mensal esperado" />
                  <CampoValor nome="custo_mensal" rotulo="Custo mensal adicional" ajuda="O que passa a custar depois de pronto." />
                </div>

                <div className="formulario-linha">
                  <label className="campo campo-numerico">
                    <span>Horizonte (meses)</span>
                    <input type="number" name="horizonte_meses" min={1} max={600} defaultValue={60} />
                    <small>Janela usada para calcular o retorno.</small>
                  </label>
                  <label className="campo">
                    <span>Origem da estimativa</span>
                    <input
                      type="text"
                      name="estimativa_origem"
                      maxLength={160}
                      placeholder="de onde vieram esses números"
                    />
                  </label>
                  <label className="campo">
                    <span>Apurada em</span>
                    <input type="date" name="estimativa_data" defaultValue={hoje} />
                  </label>
                </div>

                <div className="formulario-linha">
                  <label className="campo">
                    <span>Próxima etapa</span>
                    <input type="text" name="proxima_etapa" maxLength={160} />
                  </label>
                  <label className="campo">
                    <span>Prazo</span>
                    <input type="date" name="prazo" />
                  </label>
                </div>

                <button className="botao botao-primario" type="submit">
                  Criar oportunidade
                </button>
              </form>
            </Modal>
          </div>
        )}
      </div>

      <IntroSecao>
        Oportunidade é o que <strong>exige investimento antes de gerar receita</strong>: uma
        expansão, um equipamento, um serviço novo. Com investimento, retorno mensal esperado e custo
        adicional, o sistema calcula sozinho o payback e o retorno no horizonte — e a conta fica a
        mesma para todo mundo. Os tipos ficam em <Link href="/configuracoes">configurações</Link>.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

      {oportunidades.length > 0 && (
        <div className="cartoes">
          <div className="cartao">
            <p className="olho">Em andamento</p>
            <p className="cartao-valor">{t.emAndamento}</p>
          </div>
          <div className="cartao">
            <p className="olho">Investimento previsto</p>
            <p className="cartao-valor teto">{formatarValor(t.investimento)}</p>
            <p className="cartao-nota">estimado, não comprometido</p>
          </div>
          <div className="cartao">
            <p className="olho">Resultado mensal esperado</p>
            <p className="cartao-valor capturado">{formatarValor(t.resultadoMensal)}</p>
            <p className="cartao-nota">retorno menos custo adicional</p>
          </div>
          <div className="cartao">
            <p className="olho">Payback médio</p>
            <p className="cartao-valor">{formatarPayback(t.paybackMedio)}</p>
            <p className="cartao-nota">só das que têm payback</p>
          </div>
        </div>
      )}

      <form className="filtros" method="get">
        <SeletorMultiplo
          nome="carteira"
          rotulo="Carteira"
          opcoes={opcoesCarteira}
          inicial={paraLista(searchParams.carteira)}
        />
        <SeletorMultiplo
          nome="fase"
          rotulo="Fase"
          opcoes={FASES.map((f) => ({ valor: f.valor, rotulo: f.rotulo }))}
          inicial={paraLista(searchParams.fase)}
        />
        <button className="botao botao-secundario" type="submit">
          <Search size={14} />
          Filtrar
        </button>
        {temFiltro(searchParams.carteira, searchParams.fase) && (
          <Link className="link-acao" href="/oportunidades">
            Limpar
          </Link>
        )}
      </form>

      {oportunidades.length === 0 ? (
        <Vazio
          acao={
            carteiras.length === 0 ? (
              <Link className="botao botao-secundario" href="/carteiras">
                Criar carteira
              </Link>
            ) : undefined
          }
        >
          {carteiras.length === 0
            ? "Toda oportunidade pertence a uma carteira. Crie a carteira primeiro."
            : "Nenhuma oportunidade registrada. Comece pela que já está sendo discutida com o cliente."}
        </Vazio>
      ) : (
        <section className="painel sem-recheio">
          <div className="tabela-rolagem">
            <table className="tabela-panorama">
              <thead>
                <tr>
                  <th>Oportunidade</th>
                  <th>Fase</th>
                  <th className="numero">Investimento</th>
                  <th className="numero">Resultado/mês</th>
                  <th className="numero">Payback</th>
                  <th className="numero">Retorno</th>
                </tr>
              </thead>
              <tbody>
                {oportunidades.map((o) => {
                  const dias = diasNaFase(o);
                  const conta = nomeConta(o.conta_id);
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/oportunidades/${o.id}`}>{o.titulo}</Link>
                        <span className="celula-sub">
                          {[
                            nomeCarteira(o.carteira_id),
                            conta,
                            o.responsavel_id
                              ? nomePessoa(pessoas.find((p) => p.id === o.responsavel_id))
                              : null,
                            o.prazo ? `prazo ${formatarData(o.prazo)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </td>
                      <td>
                        <span className={classeFase(o.fase)}>{rotuloFase(o.fase)}</span>
                        <span className={dias > 60 ? "celula-sub texto-alerta" : "celula-sub"}>
                          há {dias} d
                        </span>
                      </td>
                      <td className="numero dado valor-teto">{formatarValor(o.investimento)}</td>
                      <td className="numero dado valor-capturado">
                        {formatarValor(o.resultado_mensal)}
                      </td>
                      <td className="numero dado">{formatarPayback(o.payback_meses)}</td>
                      <td className="numero dado">
                        <span
                          className={
                            o.retorno_percentual !== null && Number(o.retorno_percentual) < 0
                              ? "texto-alerta"
                              : undefined
                          }
                        >
                          {formatarPercentual(o.retorno_percentual)}
                        </span>
                        <span className="celula-sub">em {o.horizonte_meses} meses</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="nota">
        Investimento e retorno são estimativas com origem e data registradas. O que já foi aplicado e
        o que já se confirmou ficam em campos separados, na ficha de cada oportunidade.
      </p>
    </>
  );
}
