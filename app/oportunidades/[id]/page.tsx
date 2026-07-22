import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Pencil } from "lucide-react";
import { exigirOrg, exigirUsuario, podeEscrever } from "@/lib/auth";
import { listarCarteiras, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { formatarData, formatarValor, listarContas } from "@/lib/contas";
import {
  FASES,
  classeFase,
  diasNaFase,
  formatarPayback,
  formatarPercentual,
  obterOportunidade,
  rotuloFase,
  tiposDeOportunidade,
} from "@/lib/oportunidades";
import {
  atualizarOportunidade,
  incluirLinkOportunidade,
  mudarFase,
} from "@/app/acoes/oportunidades";
import { Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { BotaoExcluir } from "@/components/botao-excluir";
import { excluirOportunidade } from "@/app/acoes/exclusoes";
import { CampoValor } from "@/components/campos";
import { Historico } from "@/components/historico";
import { AnaliseFinanceira } from "@/components/analise-financeira";
import { Anexos } from "@/components/anexos";
import { Compromissos } from "@/components/compromissos";

export const dynamic = "force-dynamic";

export default async function PaginaOportunidade({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();
  const oportunidade = await obterOportunidade(params.id);
  if (!oportunidade) notFound();

  const [carteiras, contas, tipos, pessoas] = await Promise.all([
    listarCarteiras(org.orgId),
    listarContas({ orgId: org.orgId }),
    tiposDeOportunidade(org.orgId),
    pessoasDaOrganizacao(org.orgId),
  ]);

  const editavel = podeEscrever(org.papel);
  const podeExcluir = org.papel !== "ponto_focal" && podeEscrever(org.papel);
  const id = oportunidade.id;
  const carteira = carteiras.find((c) => c.id === oportunidade.carteira_id);
  const conta = contas.find((c) => c.id === oportunidade.conta_id);
  const dias = diasNaFase(oportunidade);
  const links = oportunidade.links ?? [];
  const indiceFase = FASES.findIndex((f) => f.valor === oportunidade.fase);
  const proxima = FASES[indiceFase + 1];
  const semRetorno = oportunidade.investimento !== null && oportunidade.payback_meses === null;

  return (
    <>
      <p className="olho">
        <Link href="/oportunidades">Oportunidades</Link>
        {carteira && (
          <>
            {" · "}
            <Link href={`/carteiras/${carteira.id}`}>{carteira.nome}</Link>
          </>
        )}
        {conta && (
          <>
            {" · "}
            <Link href={`/contas/${conta.id}`}>{conta.nome}</Link>
          </>
        )}
      </p>

      <div className="cabeca-pagina">
        <div>
          <h1>{oportunidade.titulo}</h1>
          <p className="chamada" style={{ marginBottom: 0 }}>
            <span className={classeFase(oportunidade.fase)}>{rotuloFase(oportunidade.fase)}</span>{" "}
            <span className={dias > 60 ? "texto-alerta" : undefined}>
              há {dias} dias nesta fase
            </span>
            {oportunidade.proxima_etapa ? ` · próxima etapa: ${oportunidade.proxima_etapa}` : ""}
          </p>
        </div>

        {editavel && (
          <div className="cabeca-acoes">
            {proxima && oportunidade.fase !== "descartada" && proxima.valor !== "descartada" && (
              <form action={mudarFase}>
                <input type="hidden" name="id" value={oportunidade.id} />
                <input type="hidden" name="fase" value={proxima.valor} />
                <button className="botao botao-secundario" type="submit">
                  Avançar para {proxima.rotulo}
                  <ArrowRight size={14} />
                </button>
              </form>
            )}

            <Modal
              rotulo="Editar"
              titulo="Editar oportunidade"
              descricao="Estimativa exige origem declarada. Descarte exige motivo."
              icone={<Pencil size={15} />}
              variante="secundario"
              largo
            >
              <form action={atualizarOportunidade} className="formulario">
                <input type="hidden" name="id" value={oportunidade.id} />

                <div className="formulario-linha">
                  <label className="campo">
                    <span>Título</span>
                    <input
                      type="text"
                      name="titulo"
                      defaultValue={oportunidade.titulo}
                      required
                      maxLength={160}
                    />
                  </label>
                  <label className="campo">
                    <span>Conta</span>
                    <select name="conta_id" defaultValue={oportunidade.conta_id ?? ""}>
                      <option value="">Sem conta específica</option>
                      {contas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="campo">
                    <span>Tipo</span>
                    <select name="catalogo_id" defaultValue={oportunidade.catalogo_id ?? ""}>
                      <option value="">Sem tipo</option>
                      {tipos.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="formulario-linha">
                  <label className="campo">
                    <span>Fase</span>
                    <select name="fase" defaultValue={oportunidade.fase}>
                      {FASES.map((f) => (
                        <option key={f.valor} value={f.valor}>
                          {f.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="campo">
                    <span>Responsável</span>
                    <select name="responsavel_id" defaultValue={oportunidade.responsavel_id ?? ""}>
                      <option value="">Sem responsável</option>
                      {pessoas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {nomePessoa(p)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="campo">
                    <span>Prazo</span>
                    <input type="date" name="prazo" defaultValue={oportunidade.prazo ?? ""} />
                  </label>
                </div>

                <label className="campo">
                  <span>Motivo do descarte</span>
                  <input
                    type="text"
                    name="motivo_descarte"
                    defaultValue={oportunidade.motivo_descarte ?? ""}
                    maxLength={200}
                    placeholder="obrigatório apenas se a fase for descartada"
                  />
                </label>

                <div className="formulario-linha">
                  <CampoValor
                    nome="investimento"
                    rotulo="Investimento"
                    inicial={oportunidade.investimento}
                  />
                  <CampoValor
                    nome="retorno_mensal"
                    rotulo="Retorno mensal esperado"
                    inicial={oportunidade.retorno_mensal}
                  />
                  <CampoValor
                    nome="custo_mensal"
                    rotulo="Custo mensal adicional"
                    inicial={oportunidade.custo_mensal}
                  />
                </div>

                <div className="formulario-linha">
                  <label className="campo campo-numerico">
                    <span>Horizonte (meses)</span>
                    <input
                      type="number"
                      name="horizonte_meses"
                      min={1}
                      max={600}
                      defaultValue={oportunidade.horizonte_meses}
                    />
                  </label>
                  <label className="campo">
                    <span>Origem da estimativa</span>
                    <input
                      type="text"
                      name="estimativa_origem"
                      defaultValue={oportunidade.estimativa_origem ?? ""}
                      maxLength={160}
                    />
                  </label>
                  <label className="campo">
                    <span>Apurada em</span>
                    <input
                      type="date"
                      name="estimativa_data"
                      defaultValue={oportunidade.estimativa_data ?? ""}
                    />
                  </label>
                </div>

                <div className="formulario-linha">
                  <CampoValor
                    nome="investimento_realizado"
                    rotulo="Investimento já aplicado"
                    inicial={oportunidade.investimento_realizado}
                  />
                  <CampoValor
                    nome="retorno_confirmado"
                    rotulo="Retorno mensal confirmado"
                    inicial={oportunidade.retorno_confirmado}
                  />
                  <label className="campo">
                    <span>Confirmado em</span>
                    <input
                      type="date"
                      name="confirmado_em"
                      defaultValue={oportunidade.confirmado_em ?? ""}
                    />
                  </label>
                </div>

                <label className="campo">
                  <span>Próxima etapa</span>
                  <input
                    type="text"
                    name="proxima_etapa"
                    defaultValue={oportunidade.proxima_etapa ?? ""}
                    maxLength={160}
                  />
                </label>

                <label className="campo">
                  <span>Observações</span>
                  <textarea
                    name="observacoes"
                    rows={4}
                    defaultValue={oportunidade.observacoes ?? ""}
                  />
                </label>

                <button className="botao botao-primario" type="submit">
                  Salvar alterações
                </button>
              </form>
            </Modal>
          </div>
        )}
      </div>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      {oportunidade.fase === "descartada" && oportunidade.motivo_descarte && (
        <div className="aviso aviso-erro">
          <strong>Descartada:</strong> {oportunidade.motivo_descarte}
        </div>
      )}

      <div className="cartoes">
        <div className="cartao">
          <p className="olho">Investimento</p>
          <p className="cartao-valor teto">{formatarValor(oportunidade.investimento)}</p>
          <p className="cartao-nota">
            {oportunidade.investimento_realizado !== null
              ? `${formatarValor(oportunidade.investimento_realizado)} já aplicado`
              : "nada aplicado ainda"}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Resultado mensal</p>
          <p className="cartao-valor capturado">{formatarValor(oportunidade.resultado_mensal)}</p>
          <p className="cartao-nota">
            {formatarValor(oportunidade.retorno_mensal)} menos {formatarValor(oportunidade.custo_mensal)}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Payback</p>
          <p className={semRetorno ? "cartao-valor alerta" : "cartao-valor"}>
            {formatarPayback(oportunidade.payback_meses)}
          </p>
          <p className="cartao-nota">
            {semRetorno ? "o resultado mensal não cobre o custo" : "para o investimento se pagar"}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Retorno em {oportunidade.horizonte_meses} meses</p>
          <p
            className={
              oportunidade.retorno_percentual !== null && Number(oportunidade.retorno_percentual) < 0
                ? "cartao-valor alerta"
                : "cartao-valor"
            }
          >
            {formatarPercentual(oportunidade.retorno_percentual)}
          </p>
          <p className="cartao-nota">sobre o investimento</p>
        </div>
      </div>

      <AnaliseFinanceira oportunidadeId={oportunidade.id} />

      <section className="painel">
        <h2>Base da estimativa</h2>
        {oportunidade.estimativa_origem ? (
          <p className="nota">
            {oportunidade.estimativa_origem} · apurada em{" "}
            {formatarData(oportunidade.estimativa_data)}.
          </p>
        ) : (
          <p className="nota">Sem estimativa registrada.</p>
        )}
        {oportunidade.retorno_confirmado !== null && (
          <p className="nota">
            Retorno já confirmado: {formatarValor(oportunidade.retorno_confirmado)} por mês, desde{" "}
            {formatarData(oportunidade.confirmado_em)}.
          </p>
        )}
        <p className="nota" style={{ marginBottom: 0 }}>
          Estimado e confirmado ficam em campos separados e não se somam — a mesma regra que vale
          para potencial e capturado no resto do produto.
        </p>
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Documentos e estudos</h2>
          {editavel && (
            <Modal
              rotulo="Incluir link"
              titulo="Incluir link"
              descricao="O arquivo fica no seu repositório; aqui entra só o endereço."
              variante="link"
            >
              <form action={incluirLinkOportunidade} className="formulario">
                <input type="hidden" name="id" value={oportunidade.id} />
                <label className="campo">
                  <span>Nome do link</span>
                  <input type="text" name="rotulo" required maxLength={80} autoFocus />
                </label>
                <label className="campo">
                  <span>Endereço</span>
                  <input type="url" name="url" required placeholder="https://" />
                </label>
                <button className="botao botao-primario" type="submit">
                  Incluir
                </button>
              </form>
            </Modal>
          )}
        </div>

        {links.length === 0 ? (
          <Vazio>
            Nenhum documento vinculado. Estudo de viabilidade, orçamento e proposta continuam no seu
            repositório — aqui fica o caminho até eles.
          </Vazio>
        ) : (
          <ul className="lista-estado">
            {links.map((l, i) => (
              <li key={`${l.url}-${i}`}>
                <span className="rotulo">
                  <a href={l.url} target="_blank" rel="noreferrer">
                    {l.rotulo}
                  </a>
                  <span className="dica">{l.url}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Anexos
        entidadeTipo="oportunidade"
        entidadeId={oportunidade.id}
        carteiraId={oportunidade.carteira_id}
        pessoas={pessoas}
        editavel={editavel}
      />

      <Compromissos
        entidadeTipo="oportunidade"
        entidadeId={oportunidade.id}
        carteiraId={oportunidade.carteira_id}
        pessoas={pessoas}
        editavel={editavel}
        usuarioId={usuario.id}
        volta={`/oportunidades/${oportunidade.id}`}
      />

      <Historico
        entidadeTipo="oportunidade"
        entidadeId={oportunidade.id}
        carteiraId={oportunidade.carteira_id}
        pessoas={pessoas}
        editavel={editavel}
      />

      {podeExcluir && (
        <section className="painel">
          <div className="zona-perigo" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
            <h2>Excluir oportunidade</h2>
            <p className="nota">Apaga o histórico registrado nela. Se ela não se sustenta, prefira descartar com motivo.</p>
            <form action={excluirOportunidade}>
              <input type="hidden" name="id" value={id} />
              <BotaoExcluir rotulo="Excluir oportunidade" aviso="Não há como desfazer." />
            </form>
          </div>
        </section>
      )}
    </>
  );
}
