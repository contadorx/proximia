import Link from "next/link";
import { Building2, Plus, Settings2, ShieldCheck, UserPlus } from "lucide-react";
import { exigirUsuario } from "@/lib/auth";
import { formatarData, formatarValor } from "@/lib/contas";
import {
  agruparErros,
  diasSemUso,
  disponibilidadeDosUltimos,
  errosRecentes,
  lerDisponibilidade,
  operadoresDaPlataforma,
  saudeDaRotina,
  situacaoDoDono,
  painelNegocio,
  planos,
  seloStatus,
  souOperador,
} from "@/lib/negocio";
import {
  assumirOperacao,
  atualizarAssinatura,
  criarAssinante,
  promoverOperador,
  removerOperador,
} from "@/app/acoes/negocio";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { BarrasMensais } from "@/components/graficos";
import { BotaoEnviar } from "@/components/botao-enviar";
import { CampoValor } from "@/components/campos";

export const dynamic = "force-dynamic";

export default async function PaginaNegocio({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string };
}) {
  const usuario = await exigirUsuario();
  const operador = await souOperador();

  // Instalação nova: enquanto não houver operador, quem está autenticado
  // pode assumir. Depois disso a porta fecha.
  if (!operador) {
    return (
      <div className="coluna-estreita">
        <p className="olho">Operação da plataforma</p>
        <h1>Painel do negócio</h1>
        <p className="chamada">
          Esta área é de quem opera o produto — não de quem usa uma organização. Ela mostra
          assinantes, planos, receita recorrente e uso real.
        </p>

        {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

        <div className="painel">
          <h2>Assumir a operação</h2>
          <p className="nota">
            Se esta instalação ainda não tem operador, você pode assumir agora. Havendo um, só ele
            promove outra pessoa.
          </p>
          <form action={assumirOperacao} className="formulario">
            <label className="campo">
              <span>E-mail</span>
              <input type="email" name="email" required defaultValue={usuario.email ?? ""} />
            </label>
            <BotaoEnviar>
              Assumir
            </BotaoEnviar>
          </form>
        </div>
      </div>
    );
  }

  const [painel, listaPlanos, operadores, disponibilidade, rotina, erros] = await Promise.all([
    painelNegocio(),
    planos(),
    operadoresDaPlataforma(),
    disponibilidadeDosUltimos(30),
    saudeDaRotina(),
    errosRecentes(7),
  ]);
  if (!painel) return <Vazio>Não foi possível carregar o painel agora.</Vazio>;

  const leituraDisp = lerDisponibilidade(disponibilidade);
  const gruposErro = agruparErros(erros);

  const serie = painel.serie.map((s) => ({
    mes: s.mes,
    rotulo: new Date(`${s.mes}-02`).toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    valor: Number(s.novos),
  }));

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">Operação da plataforma</p>
          <h1>Painel do negócio</h1>
        </div>
        <div className="cabeca-acoes">
          <Modal
            rotulo="Quem opera"
            titulo="Quem opera a plataforma"
            descricao="Enxerga a lista de assinantes e a assinatura de cada um — nunca os dados deles."
            variante="secundario"
            icone={<ShieldCheck size={15} />}
            largo
          >
            <ul className="lista-estado">
              {operadores.map((o) => (
                <li key={o.user_id}>
                  <span className="rotulo">
                    {o.nome}
                    <span className="dica">
                      {o.email} · desde {formatarData(o.criado_em.slice(0, 10))}
                    </span>
                  </span>
                  {o.sou_eu ? (
                    <span className="selo selo-neutro">você</span>
                  ) : (
                    <form action={removerOperador}>
                      <input type="hidden" name="user_id" value={o.user_id} />
                      <button className="link-acao" type="submit">
                        Remover
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>

            <form action={promoverOperador} className="formulario" style={{ marginTop: 18 }}>
              <label className="campo">
                <span>Promover quem já tem acesso</span>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="pessoa@suaempresa.com.br"
                />
                <small>
                  A pessoa precisa já ter criado o acesso no Proximia — promover não cria conta.
                </small>
              </label>
              <BotaoEnviar rotuloEnviando="Promovendo…">
                <UserPlus size={15} />
                Promover
              </BotaoEnviar>
            </form>

            <p className="nota" style={{ marginBottom: 0 }}>
              {operadores.length === 1 ? (
                <>
                  <strong>Hoje só você opera.</strong> Vale promover uma segunda pessoa: se a sua
                  conta for perdida ou apagada, não sobra ninguém para promover — e resolver isso
                  exige acesso ao banco.
                </>
              ) : (
                <>
                  Ninguém remove o próprio acesso, e a plataforma nunca fica sem operador: a última
                  pessoa da lista não pode ser removida, nem apagando o usuário no Supabase.
                </>
              )}
            </p>
          </Modal>

          <Modal
            rotulo="Novo assinante"
            titulo="Criar organização de um cliente"
            descricao="A organização nasce em avaliação e a pessoa recebe um link para assumi-la."
            icone={<Plus size={15} />}
            largo
          >
            <form action={criarAssinante} className="formulario">
              <div className="formulario-linha">
                <label className="campo">
                  <span>Nome da organização</span>
                  <input type="text" name="nome" required maxLength={120} autoFocus />
                </label>
                <label className="campo">
                  <span>Identificador</span>
                  <input type="text" name="slug" maxLength={40} placeholder="derivamos do nome" />
                </label>
              </div>

              <label className="campo">
                <span>E-mail de quem vai administrar</span>
                <input type="email" name="email_dono" required />
                <small>
                  Ela recebe um convite de dono. Ninguém da plataforma precisa entrar na operação
                  dela.
                </small>
              </label>

              <div className="formulario-linha">
                <label className="campo">
                  <span>Plano</span>
                  <select name="plano_id" defaultValue="">
                    <option value="">Definir depois</option>
                    {listaPlanos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                        {p.limite_carteiras ? ` — até ${p.limite_carteiras} carteiras` : " — sem limite"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="campo campo-numerico">
                  <span>Avaliação (dias)</span>
                  <input type="number" name="dias_avaliacao" min={0} max={365} defaultValue={30} />
                </label>
                <label className="campo campo-marcador">
                  <input type="checkbox" name="conta_teste" />
                  <span>Conta de teste</span>
                </label>
              </div>

              <BotaoEnviar>
                Criar assinante
              </BotaoEnviar>
              <p className="nota">
                Conta de teste fica fora de toda métrica — sem isso, a demonstração do próprio time
                infla a receita e o número deixa de servir para decidir.
              </p>
            </form>
          </Modal>
        </div>
      </div>

      <IntroSecao>
        Aqui é a <strong>operação do produto</strong>, não de uma carteira. Você enxerga a ficha
        comercial de cada assinante e o uso que ele faz — nunca os dados dele: administrar assinatura
        não é motivo para ler a operação de ninguém.
      </IntroSecao>

      
      {/* ---------- operação: o que sustenta a promessa dos Termos ---------- */}
      <section className="painel">
        <div className="linha-titulo">
          <h2>Operação</h2>
          <span className="passos-contagem">últimos 30 dias</span>
        </div>

        <ul className="lista-estado">
          <li>
            <span className="rotulo">
              Disponibilidade
              <span className="dica">{leituraDisp.frase}</span>
            </span>
            <span className={leituraDisp.classe}>
              {leituraDisp.estado === "sem_medicao"
                ? "sem medição"
                : `${disponibilidade?.disponibilidade_defensavel_pct}%`}
            </span>
          </li>

          {disponibilidade && disponibilidade.minutos_medidos > 0 && (
            <li>
              <span className="rotulo">
                Cobertura da medição
                <span className="dica">
                  {disponibilidade.minutos_medidos} de {disponibilidade.minutos_esperados} minutos
                  registrados · sobre o que respondeu, {disponibilidade.disponibilidade_pct}%
                </span>
              </span>
              <span
                className={
                  disponibilidade.cobertura_pct >= 95 ? "selo selo-ok" : "selo selo-neutro"
                }
              >
                {disponibilidade.cobertura_pct}%
              </span>
            </li>
          )}

          <li>
            <span className="rotulo">
              Rotina diária
              <span className="dica">
                {rotina?.detalhe ?? "não foi possível consultar o diário da rotina."}
              </span>
            </span>
            <span
              className={
                rotina?.situacao === "ok"
                  ? "selo selo-ok"
                  : rotina?.situacao === "parcial"
                    ? "selo selo-neutro"
                    : "selo selo-falta"
              }
            >
              {rotina?.situacao ?? "desconhecida"}
            </span>
          </li>
        </ul>

        <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
          A disponibilidade conta <strong>minuto sem medição como fora do ar</strong> — é o número
          que se defende diante de um cliente cobrando o crédito previsto nos Termos. O outro,
          calculado só sobre o que respondeu, aparece ao lado da cobertura e serve para outra
          pergunta: quando respondeu, respondeu bem? Quem mede é um monitor externo batendo em{" "}
          <code>/api/saude?ping=…</code>: monitor rodando aqui dentro não registraria a própria
          queda, que é justamente o que interessa.
        </p>
      </section>

      {/* ---------- erros que chegaram do navegador ---------- */}
      <section className="painel">
        <div className="linha-titulo">
          <h2>Erros na tela dos assinantes</h2>
          <span className="passos-contagem">últimos 7 dias · {erros.length} ocorrência(s)</span>
        </div>

        {gruposErro.length === 0 ? (
          <Vazio>
            Nenhum erro reportado. A tela de erro do produto manda o relato sozinha — silêncio aqui
            é silêncio de verdade, não falta de instrumentação.
          </Vazio>
        ) : (
          <ul className="lista-estado">
            {gruposErro.slice(0, 12).map((g) => (
              <li key={`${g.tipo}-${g.mensagem}`}>
                <span className="rotulo">
                  {g.mensagem}
                  <span className="dica">
                    {[
                      g.tipo,
                      g.rotas.length > 0 ? g.rotas.join(", ") : null,
                      g.organizacoes > 0
                        ? `${g.organizacoes} organização(ões)`
                        : "fora de sessão",
                      `última em ${formatarData(g.ultima.slice(0, 10))}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className={g.ocorrencias > 10 ? "selo selo-falta" : "selo selo-neutro"}>
                  {g.ocorrencias}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
          Agrupado por mensagem: cem ocorrências do mesmo erro são um problema, não cem. O relato
          leva rota, tipo e mensagem técnica — <strong>nunca dado de negócio</strong>: nome de
          conta, valor e texto de registro são removidos antes de sair do navegador do assinante, e
          há teste que trava isso. Guardamos trinta dias.
        </p>
      </section>
{searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <div className="cartoes">
        <div className="cartao">
          <p className="olho">Receita recorrente</p>
          <p className="cartao-valor capturado">{formatarValor(painel.receita_recorrente)}</p>
          <p className="cartao-nota">{painel.assinantes.ativa} assinantes ativos</p>
        </div>
        <div className="cartao">
          <p className="olho">Em avaliação</p>
          <p className="cartao-valor teto">{formatarValor(painel.receita_em_avaliacao)}</p>
          <p className="cartao-nota">
            {painel.assinantes.avaliacao} contas ·{" "}
            {painel.avaliacoes_vencendo > 0
              ? `${painel.avaliacoes_vencendo} vencendo em 7 dias`
              : "nenhuma vencendo"}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Assinantes</p>
          <p className="cartao-valor">{painel.assinantes.total}</p>
          <p className="cartao-nota">
            {painel.novos_30d} novos em 30 dias · {painel.assinantes.teste} de teste
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Suspensas</p>
          <p className={painel.assinantes.suspensa ? "cartao-valor alerta" : "cartao-valor"}>
            {painel.assinantes.suspensa}
          </p>
          <p className="cartao-nota">{painel.assinantes.encerrada} encerradas</p>
        </div>
      </div>

      {serie.length > 0 && (
        <section className="painel">
          <div className="linha-titulo">
            <h2>Novos assinantes por mês</h2>
            <span className="passos-contagem">últimos seis meses</span>
          </div>
          {/* formato "numero": é contagem de assinantes, não dinheiro —
              o rótulo padrão anunciava "pico R$ 3" para três contas. */}
          <BarrasMensais
            serie={serie}
            formato="numero"
            rotulo="Novos assinantes por mês nos últimos seis meses"
          />
        </section>
      )}

      <section className="painel sem-recheio">
        <div className="tabela-rolagem">
          <table className="tabela-panorama">
            <thead>
              <tr>
                <th>Assinante</th>
                <th>Situação</th>
                <th>Plano</th>
                <th className="numero">Mensal</th>
                <th className="numero">Uso</th>
                <th>Datas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {painel.lista.map((a) => {
                const selo = seloStatus(a.status);
                const parado = diasSemUso(a);
                const dono = situacaoDoDono(a);
                return (
                  <tr key={a.id} className={a.conta_teste ? "linha-suspensa" : undefined}>
                    <td>
                      <strong>{a.nome}</strong>
                      <span className="celula-sub">
                        {[
                          a.slug,
                          a.conta_teste ? "conta de teste" : null,
                          a.observacao_interna,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {/* Quem é o dono, e sobretudo se ele já entrou:
                          convite pendente há semanas é assinante que nunca
                          começou, não assinante devagar. */}
                      <span
                        className={
                          dono.estado === "ativo" ? "celula-sub" : "celula-sub texto-alerta"
                        }
                      >
                        {dono.frase}
                      </span>
                    </td>
                    <td>
                      <span className={selo.classe}>{selo.rotulo}</span>
                    </td>
                    <td>{a.plano ?? "—"}</td>
                    <td className="numero dado">{formatarValor(a.valor_mensal)}</td>
                    <td className="numero dado">
                      {a.carteiras} / {a.pessoas}
                      <span className="celula-sub">
                        {parado === null
                          ? "nunca registrou"
                          : parado > 30
                            ? `parado há ${parado} d`
                            : `ativo há ${parado} d`}
                      </span>
                    </td>
                    <td className="dado" style={{ fontSize: 12 }}>
                      {a.avaliacao_ate && (
                        <>
                          avaliação até {formatarData(a.avaliacao_ate)}
                          <br />
                        </>
                      )}
                      {a.proximo_vencimento
                        ? `vence ${formatarData(a.proximo_vencimento)}`
                        : "sem vencimento"}
                    </td>
                    <td>
                      <Modal
                        rotulo="Assinatura"
                        titulo={a.nome}
                        descricao="Situação, plano, valor e datas."
                        variante="link"
                        icone={<Settings2 size={13} />}
                      >
                        <form action={atualizarAssinatura} className="formulario">
                          <input type="hidden" name="org_id" value={a.id} />

                          <div className="formulario-linha">
                            <label className="campo">
                              <span>Situação</span>
                              <select name="status" defaultValue={a.status}>
                                <option value="avaliacao">Em avaliação</option>
                                <option value="ativa">Ativa</option>
                                <option value="suspensa">Suspensa</option>
                                <option value="encerrada">Encerrada</option>
                              </select>
                              <small>Suspensa bloqueia registro; leitura e exportação seguem.</small>
                            </label>
                            <label className="campo">
                              <span>Plano</span>
                              <select name="plano_id" defaultValue={a.plano_id ?? ""}>
                                <option value="">Sem plano</option>
                                {listaPlanos.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.nome}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <div className="formulario-linha">
                            <CampoValor
                              nome="valor_mensal"
                              rotulo="Valor mensal"
                              inicial={a.valor_mensal ?? 0}
                            />
                            <label className="campo">
                              <span>Ciclo</span>
                              <select name="ciclo" defaultValue={a.ciclo}>
                                <option value="mensal">Mensal</option>
                                <option value="trimestral">Trimestral</option>
                                <option value="anual">Anual</option>
                              </select>
                            </label>
                            <label className="campo campo-marcador">
                              <input type="checkbox" name="conta_teste" defaultChecked={a.conta_teste} />
                              <span>Conta de teste</span>
                            </label>
                          </div>

                          <div className="formulario-linha">
                            <label className="campo">
                              <span>Avaliação até</span>
                              <input type="date" name="avaliacao_ate" defaultValue={a.avaliacao_ate ?? ""} />
                            </label>
                            <label className="campo">
                              <span>Próximo vencimento</span>
                              <input
                                type="date"
                                name="proximo_vencimento"
                                defaultValue={a.proximo_vencimento ?? ""}
                              />
                            </label>
                          </div>

                          <label className="campo">
                            <span>Observação interna</span>
                            <input
                              type="text"
                              name="observacao_interna"
                              maxLength={200}
                              defaultValue={a.observacao_interna ?? ""}
                              placeholder="não aparece para o assinante"
                            />
                          </label>

                          <BotaoEnviar>Salvar assinatura</BotaoEnviar>
                        </form>
                      </Modal>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Planos</h2>
          <Building2 size={16} style={{ color: "var(--g400)" }} />
        </div>
        <ul className="lista-estado">
          {listaPlanos.map((p) => (
            <li key={p.id}>
              <span className="rotulo">
                {p.nome}
                <span className="dica">
                  {[
                    p.descricao,
                    p.limite_carteiras ? `até ${p.limite_carteiras} carteiras` : "sem limite de carteiras",
                    p.limite_pessoas ? `até ${p.limite_pessoas} pessoas` : "sem limite de pessoas",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="dado">{formatarValor(p.valor_mensal)}</span>
            </li>
          ))}
        </ul>
        <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
          Os planos vêm sem preço de propósito — precificação é decisão sua, e um número inventado
          aqui vira referência sem querer. O limite existe para dimensionar o plano, e hoje ele
          informa: não bloqueia uso de quem já está dentro.
        </p>
      </section>
    </>
  );
}
