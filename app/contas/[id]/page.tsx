import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirOrg, exigirUsuario, podeEscrever } from "@/lib/auth";
import { minhaEquipeId } from "@/lib/equipe";
import { listarCarteiras, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import {
  CRITICIDADES,
  RELACOES,
  contatosDaConta,
  formatarData,
  formatarDocumento,
  formatarValor,
  obterConta,
} from "@/lib/contas";
import { classeSelo, listarContratos, urgencia } from "@/lib/contratos";
import { listarAlertas } from "@/lib/alertas";
import { listarCompromissos } from "@/lib/compromissos";
import { registrosDaEntidade } from "@/lib/registros";
import { sinaisDaConta } from "@/lib/sinais";
import {
  contatosDoMapa,
  lerMapa,
  montarHierarquia,
  papeisDecisao,
  posturasContato,
  rotuloInfluencia,
  classeTom,
} from "@/lib/decisores";
import { Organograma } from "@/components/organograma";
import { atualizarMapaContato } from "@/app/acoes/contas";
import { Network } from "lucide-react";
import { atualizarConta, criarContato, excluirContato } from "@/app/acoes/contas";
import { Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { BotaoExcluir } from "@/components/botao-excluir";
import { excluirConta } from "@/app/acoes/exclusoes";
import { Pencil } from "lucide-react";
import { Historico } from "@/components/historico";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { Anexos } from "@/components/anexos";
import { Compromissos } from "@/components/compromissos";
import { classificacoes, classificacoesDaConta, porGrupo } from "@/lib/classificacoes";
import { salvarClassificacoesDaConta } from "@/app/acoes/classificacoes";
import { Seletor, SeletorMultiplo } from "@/components/seletor";
import { Tags } from "lucide-react";
import { Capturas } from "@/components/capturas";
import { classeFase, formatarPayback, listarOportunidades, rotuloFase } from "@/lib/oportunidades";
import { BotaoEnviar } from "@/components/botao-enviar";
import { FormAcao } from "@/components/form-acao";
import { CampoCnpj, CampoValor } from "@/components/campos";


export const dynamic = "force-dynamic";

export default async function PaginaConta({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();
  const equipeId = (await minhaEquipeId(org.orgId, usuario.id)) ?? usuario.id;
  const conta = await obterConta(params.id);
  if (!conta) notFound();

  const [carteiras, pessoas, contatos, contratos, oportunidades, avisosAbertos, compromissosAbertos, registrosConta] =
    await Promise.all([
      listarCarteiras(org.orgId),
      pessoasDaOrganizacao(org.orgId),
      contatosDoMapa(conta.id),
      listarContratos({ orgId: org.orgId, contaId: conta.id }),
      listarOportunidades({ orgId: org.orgId, contaId: conta.id }),
      listarAlertas({ orgId: org.orgId, status: "aberto" }),
      listarCompromissos({ orgId: org.orgId, status: "aberto" }),
      registrosDaEntidade("conta", conta.id),
    ]);

  // Sinais: fatos nomeados, não nota composta.
  //
  // A alternativa seria um "health score" por conta. Uma nota composta
  // exigiria pesos, e peso é opinião disfarçada de número — quebraria a
  // regra da casa de que todo valor diz de onde veio, e competiria com a
  // maturidade, que já é o score do produto, por carteira e com régua do
  // assinante. Dois scores com métodos diferentes geram a pior pergunta
  // possível numa reunião: "qual dos dois vale?".
  //
  // Aqui não há fórmula: cada sinal é um fato que o produto já calcula,
  // nomeado e com origem clicável.
  const sinais = sinaisDaConta({
    contaId: conta.id,
    potencialBruto: conta.potencial_bruto,
    valorCapturado: conta.valor_capturado,
    contratos,
    avisosAbertos,
    compromissosAbertos,
    ultimoRegistroEm: registrosConta[0]?.ocorrido_em ?? null,
  });

  const [catalogo, marcadas, papeis, posturas] = await Promise.all([
    classificacoes(org.orgId),
    classificacoesDaConta(conta.id),
    papeisDecisao(org.orgId),
    posturasContato(org.orgId),
  ]);

  // Mapa de decisores: quem decide, quem influencia, quem é contra, e por
  // onde a informação entra. O produto nunca lê o rótulo do papel — lê a
  // propriedade `decide`, marcada pelo assinante no catálogo dele.
  const mapa = lerMapa(contatos, papeis, posturas);
  const hierarquia = montarHierarquia(contatos);
  const papelDe = new Map(papeis.map((p) => [p.id, p]));
  const posturaDe = new Map(posturas.map((p) => [p.id, p]));
  const papeisAtivos = papeis.filter((p) => p.ativo);
  const posturasAtivas = posturas.filter((p) => p.ativo);
  const grupos = porGrupo(catalogo.filter((c) => c.ativo));

  const editavel = podeEscrever(org.papel);
  const podeExcluir = org.papel !== "ponto_focal" && podeEscrever(org.papel);
  const id = conta.id;
  const carteira = carteiras.find((c) => c.id === conta.carteira_id);

  return (
    <>
      <p className="olho">
        <Link href="/contas">Contas</Link>
        {carteira && (
          <>
            {" · "}
            <Link href={`/carteiras/${carteira.id}`}>{carteira.nome}</Link>
          </>
        )}
      </p>
      <div className="cabeca-pagina">
        <h1>{conta.nome}</h1>
        <div className="cabeca-acoes nao-imprimir">
          {/* O dossiê é a versão de reunião desta ficha: mesmo dado,
              recortado por período e sem controle de edição. */}
          <Link className="botao botao-secundario" href={`/contas/${conta.id}/reuniao`}>
            Dossiê de reunião
          </Link>
          <BotaoImprimir />
        </div>
      </div>
      <p className="chamada">
        {[conta.razao_social, formatarDocumento(conta.documento), conta.segmento]
          .filter((v) => v && v !== "—")
          .join(" · ") || "Sem razão social, CNPJ ou segmento registrados."}
      </p>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      {sinais.length > 0 && (
        <section className="painel painel-alerta">
          <h2>Sinais</h2>
          <ul className="lista-estado">
            {sinais.map((sinal) => (
              <li key={sinal.chave}>
                <span className="rotulo">
                  {sinal.href ? <Link href={sinal.href}>{sinal.rotulo}</Link> : sinal.rotulo}
                  {sinal.detalhe && <span className="dica">{sinal.detalhe}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
            Cada linha é um fato registrado, com a origem a um clique. Não há nota nem fórmula —
            a maturidade da carteira continua sendo o único score do produto.
          </p>
        </section>
      )}

      <section className="painel">
        <h2>Potencial e realizado</h2>
        <div className="dois-valores">
          <div>
            <p className="olho">Potencial estimado</p>
            <p className="numero-grande valor-teto">{formatarValor(conta.potencial_bruto)}</p>
            <p className="nota">
              {conta.potencial_bruto === null
                ? "Nenhuma estimativa registrada."
                : `${conta.potencial_origem} · apurado em ${formatarData(conta.potencial_data)}`}
            </p>
          </div>
          <div>
            <p className="olho">Capturado</p>
            <p className="numero-grande valor-capturado">{formatarValor(conta.valor_capturado)}</p>
            <p className="nota">
              {conta.valor_capturado === null
                ? "Nada confirmado ainda."
                : `Confirmado em ${formatarData(conta.capturado_confirmado_em)}`}
            </p>
          </div>
        </div>
        <p className="nota" style={{ marginTop: 16 }}>
          Os dois números têm naturezas diferentes e não se somam. Potencial é teto estimado, com
          origem e data; capturado é o que já se confirmou.
        </p>
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Contratos</h2>
          <Link className="link-acao" href="/contratos">
            Registrar contrato
          </Link>
        </div>
        {contratos.length === 0 ? (
          <Vazio>Nenhum contrato registrado para esta conta.</Vazio>
        ) : (
          <ul className="lista-estado">
            {contratos.map((ct) => {
              const u = urgencia(ct);
              return (
                <li key={ct.id}>
                  <span className="rotulo">
                    <Link href={`/contratos/${ct.id}`}>{ct.numero ?? "Contrato sem número"}</Link>
                    <span className="dica">
                      {[ct.tipo, ct.fim ? `vence ${formatarData(ct.fim)}` : null, u.detalhe]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className={classeSelo(u.tom)}>{u.rotulo}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {oportunidades.length > 0 && (
        <section className="painel">
          <h2>Oportunidades</h2>
          <ul className="lista-estado">
            {oportunidades.map((o) => (
              <li key={o.id}>
                <span className="rotulo">
                  <Link href={`/oportunidades/${o.id}`}>{o.titulo}</Link>
                  <span className="dica">
                    investimento {formatarValor(o.investimento)} · payback{" "}
                    {formatarPayback(o.payback_meses)}
                  </span>
                </span>
                <span className={classeFase(o.fase)}>{rotuloFase(o.fase)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="painel">
        <div className="linha-titulo">
          <h2>
            <Network size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Mapa de decisores
          </h2>
          <span className="passos-contagem">
            {mapa.total} contato(s)
            {mapa.semPapel > 0 ? ` · ${mapa.semPapel} sem papel definido` : ""}
          </span>
        </div>

        {mapa.total === 0 ? (
          <Vazio>
            Nenhum contato registrado. O mapa começa com uma pessoa: quem atende o telefone.
          </Vazio>
        ) : (
          <>
            {/* As quatro perguntas que a ficha passa a responder. */}
            <div className="cartoes">
              <div className="cartao">
                <p className="olho">Quem decide</p>
                <p className={mapa.decidem.length === 0 ? "cartao-valor alerta" : "cartao-valor"}>
                  {mapa.decidem.length}
                </p>
                <p className="cartao-nota">
                  {mapa.decidem.length > 0
                    ? mapa.decidem.map((c) => c.nome).join(", ")
                    : "ninguém com papel que decide"}
                </p>
              </div>
              <div className="cartao">
                <p className="olho">Quem influencia</p>
                <p className="cartao-valor">{mapa.influenciam.length}</p>
                <p className="cartao-nota">
                  {mapa.influenciam.length > 0
                    ? mapa.influenciam.map((c) => c.nome).join(", ")
                    : "ninguém mapeado"}
                </p>
              </div>
              <div className="cartao">
                <p className="olho">Quem é contra</p>
                <p className={mapa.contra.length > 0 ? "cartao-valor alerta" : "cartao-valor"}>
                  {mapa.contra.length}
                </p>
                <p className="cartao-nota">
                  {mapa.contra.length > 0
                    ? mapa.contra.map((c) => c.nome).join(", ")
                    : "nenhuma resistência declarada"}
                </p>
              </div>
              <div className="cartao">
                <p className="olho">Por onde entra</p>
                <p className="cartao-valor">{mapa.portaDeEntrada.length}</p>
                <p className="cartao-nota">
                  {mapa.portaDeEntrada.length > 0
                    ? mapa.portaDeEntrada.map((c) => c.nome).join(", ")
                    : "sem porta de entrada definida"}
                </p>
              </div>
            </div>

            {hierarquia.length > 0 && (
              <div className="subgrupo">
                <p className="olho">Quem reporta a quem</p>
                <Organograma arvore={hierarquia} papeis={papeis} posturas={posturas} />
                <p className="nota" style={{ marginBottom: 0 }}>
                  Círculo maior é quem decide; a cor vem da postura declarada. A hierarquia é
                  montada a partir do campo &ldquo;reporta a&rdquo; de cada contato — o produto não
                  adivinha nada.
                </p>
              </div>
            )}

            <div className="subgrupo">
              <p className="olho">Contatos</p>
              <ul className="lista-estado">
                {contatos.map((c) => {
                  const papel = c.papel_id ? papelDe.get(c.papel_id) : undefined;
                  const postura = c.postura_id ? posturaDe.get(c.postura_id) : undefined;
                  const chefe = c.reporta_a ? contatos.find((k) => k.id === c.reporta_a) : undefined;
                  return (
                    <li key={c.id}>
                      <span className="rotulo">
                        {c.nome}
                        <span className="dica">
                          {[
                            papel?.rotulo ?? "papel não definido",
                            c.cargo,
                            c.area,
                            chefe ? `reporta a ${chefe.nome}` : null,
                            rotuloInfluencia(c.influencia),
                            c.email,
                            c.telefone,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      {papel?.decide && <span className="selo selo-ok">Decide</span>}
                      {postura && <span className={classeTom(postura.tom)}>{postura.rotulo}</span>}
                      {c.principal && <span className="selo selo-neutro">Principal</span>}

                      {editavel && (
                        <Modal
                          rotulo="Mapear"
                          titulo={`Papel de ${c.nome} na decisão`}
                          descricao="Papel e postura vêm do catálogo da sua organização."
                          variante="link"
                          icone={<Network size={13} />}
                        >
                          <FormAcao action={atualizarMapaContato}>
                            <input type="hidden" name="conta_id" value={conta.id} />
                            <input type="hidden" name="id" value={c.id} />
                            <div className="formulario-linha">
                              <Seletor
                                nome="papel_id"
                                rotulo="Papel na decisão"
                                opcoes={papeisAtivos.map((p) => ({
                                  valor: p.id,
                                  rotulo: p.rotulo,
                                  detalhe: p.decide ? "decide" : undefined,
                                }))}
                                inicial={c.papel_id ?? ""}
                                vazio="Não definido"
                              />
                              <Seletor
                                nome="postura_id"
                                rotulo="Postura"
                                opcoes={posturasAtivas.map((p) => ({
                                  valor: p.id,
                                  rotulo: p.rotulo,
                                }))}
                                inicial={c.postura_id ?? ""}
                                vazio="Não definida"
                              />
                            </div>
                            <div className="formulario-linha">
                              <label className="campo">
                                <span>Área</span>
                                <input
                                  type="text"
                                  name="area"
                                  defaultValue={c.area ?? ""}
                                  maxLength={80}
                                  placeholder="Operações, Suprimentos…"
                                />
                              </label>
                              <label className="campo campo-numerico">
                                <span>Influência (1 a 5)</span>
                                <input
                                  type="number"
                                  name="influencia"
                                  min={1}
                                  max={5}
                                  defaultValue={c.influencia ?? ""}
                                />
                              </label>
                              <Seletor
                                nome="reporta_a"
                                rotulo="Reporta a"
                                opcoes={contatos
                                  .filter((k) => k.id !== c.id)
                                  .map((k) => ({ valor: k.id, rotulo: k.nome }))}
                                inicial={c.reporta_a ?? ""}
                                vazio="Ninguém nesta conta"
                                ajuda="Só gente da mesma conta. O banco recusa ciclo."
                              />
                            </div>
                            <BotaoEnviar>Salvar mapa</BotaoEnviar>
                          </FormAcao>
                        </Modal>
                      )}

                      {editavel && (
                        <form action={excluirContato}>
                          <input type="hidden" name="conta_id" value={conta.id} />
                          <input type="hidden" name="id" value={c.id} />
                          <button className="link-acao" type="submit">
                            Remover
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}

        {/* Duas linhas em vez de sete campos numa só: com tudo na mesma
            linha, o formulário quebrava em qualquer tela menor que a de
            quem o escreveu, e o botão terminava perdido no meio. Quem está
            cadastrando contato quase nunca sabe o papel na decisão no
            mesmo minuto — por isso a identificação vem primeiro e o mapa
            fica na segunda linha, opcional. */}
        {editavel && (
          <FormAcao action={criarContato}>
            <input type="hidden" name="conta_id" value={conta.id} />

            <div className="formulario-linha">
              <label className="campo">
                <span>Nome</span>
                <input type="text" name="nome" required maxLength={120} />
              </label>
              <label className="campo">
                <span>Cargo</span>
                <input type="text" name="cargo" maxLength={80} />
              </label>
            </div>

            <div className="formulario-linha">
              <label className="campo">
                <span>E-mail</span>
                <input type="email" name="email" maxLength={120} />
              </label>
              <label className="campo">
                <span>Telefone</span>
                <input type="text" name="telefone" maxLength={40} />
              </label>
              <Seletor
                nome="papel_id"
                rotulo="Papel na decisão"
                opcoes={papeisAtivos.map((p) => ({
                  valor: p.id,
                  rotulo: p.rotulo,
                  detalhe: p.decide ? "decide" : undefined,
                }))}
                vazio="Definir depois"
                ajuda="Dá para deixar em branco e mapear na conversa seguinte."
              />
              <label className="campo campo-marcador">
                <span>Principal</span>
                <input type="checkbox" name="principal" />
              </label>
            </div>

            <BotaoEnviar>Incluir contato</BotaoEnviar>
          </FormAcao>
        )}

        {papeis.length === 0 && (
          <p className="nota">
            O catálogo de papéis de decisão ainda não foi criado.{" "}
            <Link href="/configuracoes">Crie em Configurações</Link> — os valores iniciais são
            sugestões, e você renomeia o que quiser.
          </p>
        )}
      </section>

      {editavel && (
        <Modal rotulo="Editar conta" titulo="Editar conta" descricao="Potencial exige origem declarada." largo icone={<Pencil size={15} />} variante="secundario">
          <FormAcao action={atualizarConta}>
            <input type="hidden" name="id" value={conta.id} />

            <div className="formulario-linha">
              <label className="campo">
                <span>Nome</span>
                <input type="text" name="nome" defaultValue={conta.nome} required maxLength={160} />
              </label>
              <label className="campo">
                <span>Razão social</span>
                <input
                  type="text"
                  name="razao_social"
                  defaultValue={conta.razao_social ?? ""}
                  maxLength={160}
                />
              </label>
              {/* Mesmo campo da criação: máscara e conferência de dígitos.
                  Editar não pode ser menos cuidadoso do que criar. */}
              <CampoCnpj inicial={conta.documento} />
            </div>

            <div className="formulario-linha">
              <label className="campo">
                <span>Relação</span>
                <select name="relacao" defaultValue={conta.relacao}>
                  {RELACOES.map((r) => (
                    <option key={r.valor} value={r.valor}>
                      {r.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Criticidade</span>
                <select name="criticidade" defaultValue={conta.criticidade}>
                  {CRITICIDADES.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Situação</span>
                <select name="status" defaultValue={conta.status}>
                  <option value="ativa">Ativa</option>
                  <option value="encerrada">Encerrada</option>
                </select>
              </label>
              <label className="campo">
                <span>Responsável</span>
                <select name="responsavel_id" defaultValue={conta.responsavel_id ?? ""}>
                  <option value="">Sem responsável</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {nomePessoa(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Segmento</span>
                <input type="text" name="segmento" defaultValue={conta.segmento ?? ""} maxLength={80} />
              </label>
            </div>

            <div className="formulario-linha">
              <CampoValor
                nome="potencial_bruto"
                rotulo="Potencial estimado"
                inicial={conta.potencial_bruto}
              />
              <label className="campo">
                <span>Origem da estimativa</span>
                <input
                  type="text"
                  name="potencial_origem"
                  defaultValue={conta.potencial_origem ?? ""}
                  maxLength={160}
                  placeholder="de onde veio esse número"
                />
              </label>
              <label className="campo">
                <span>Data da apuração</span>
                <input type="date" name="potencial_data" defaultValue={conta.potencial_data ?? ""} />
              </label>
            </div>
              <p className="nota">
                O valor capturado não é mais editado aqui: ele é a soma dos lançamentos registrados
                no bloco &ldquo;Capturado&rdquo;, cada um com data, autor e comprovação.
              </p>

            <label className="campo">
              <span>Observações</span>
              <textarea name="observacoes" rows={4} defaultValue={conta.observacoes ?? ""} />
            </label>

            <BotaoEnviar>Salvar alterações</BotaoEnviar>
          </FormAcao>
        </Modal>
      )}

      <Capturas
        entidadeTipo="conta"
        entidadeId={conta.id}
        carteiraId={conta.carteira_id}
        potencial={conta.potencial_bruto}
        pessoas={pessoas}
        editavel={editavel}
      />

      <Anexos
        entidadeTipo="conta"
        entidadeId={conta.id}
        carteiraId={conta.carteira_id}
        orgId={org.orgId}
        pessoas={pessoas}
        editavel={editavel}
      />

      <section className="painel">
        <div className="linha-titulo">
          <h2>
            <Tags size={15} style={{ verticalAlign: "-2px", marginRight: 8, color: "var(--g400)" }} />
            Classificação
          </h2>
          {editavel && grupos.length > 0 && (
            <Modal
              rotulo="Classificar"
              titulo="Classificar a conta"
              descricao="Uma conta pode receber valores de vários grupos."
              variante="secundario"
            >
              <form action={salvarClassificacoesDaConta} className="formulario">
                <input type="hidden" name="conta_id" value={conta.id} />
                {grupos.map((g) => (
                  <SeletorMultiplo
                    key={g.grupo}
                    nome="classificacao"
                    rotulo={g.grupo}
                    opcoes={g.valores.map((v) => ({
                      valor: v.id,
                      rotulo: v.valor,
                      detalhe: v.descricao ?? undefined,
                    }))}
                    inicial={marcadas.filter((m) => g.valores.some((v) => v.id === m))}
                    rotuloTodas="Não classificado"
                  />
                ))}
                <BotaoEnviar>Salvar classificação</BotaoEnviar>
                <p className="nota">
                  Salvar substitui a classificação inteira da conta pelo que estiver marcado aqui.
                </p>
              </form>
            </Modal>
          )}
        </div>

        {grupos.length === 0 ? (
          <p className="nota" style={{ marginBottom: 0 }}>
            Nenhuma classificação cadastrada ainda.{" "}
            <Link href="/configuracoes/classificacoes">Criar em Configurações</Link>.
          </p>
        ) : marcadas.length === 0 ? (
          <p className="nota" style={{ marginBottom: 0 }}>
            Conta sem classificação. Sem ela, esta conta não aparece nos recortes por ramo, natureza
            ou porte.
          </p>
        ) : (
          <div className="celula-sinais">
            {grupos.map((g) =>
              g.valores
                .filter((v) => marcadas.includes(v.id))
                .map((v) => (
                  <span className="selo selo-neutro" key={v.id}>
                    {g.grupo}: {v.valor}
                  </span>
                )),
            )}
          </div>
        )}
      </section>

      <Compromissos
        entidadeTipo="conta"
        entidadeId={conta.id}
        carteiraId={conta.carteira_id}
        pessoas={pessoas}
        editavel={editavel}
        usuarioId={equipeId}
        volta={`/contas/${conta.id}`}
      />

      <Historico
        entidadeTipo="conta"
        entidadeId={conta.id}
        carteiraId={conta.carteira_id}
        pessoas={pessoas}
        editavel={editavel}
      />

      {podeExcluir && (
        <section className="painel">
          <div className="zona-perigo" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
            <h2>Excluir conta</h2>
            <p className="nota">Apaga também os contratos, contatos e o histórico desta conta.</p>
            <form action={excluirConta}>
              <input type="hidden" name="id" value={id} />
              <BotaoExcluir rotulo="Excluir conta" aviso="Não há como desfazer." />
            </form>
          </div>
        </section>
      )}
    </>
  );
}
