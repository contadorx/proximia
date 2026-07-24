import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import {
  ESCALA,
  dimensoes as listarDimensoes,
  faixa,
  obterAvaliacao,
  perguntas as listarPerguntas,
  respostasDaAvaliacao,
  resultados as listarResultados,
  scoresPorDimensao,
  lacunasDaAvaliacao,
  planoDaCarteira,
} from "@/lib/maturidade";
import { concluirAvaliacao, reabrirAvaliacao, salvarRespostas } from "@/app/acoes/maturidade";
import { criarItemPlano } from "@/app/acoes/plano";
import { listarEquipe } from "@/lib/equipe";
import { Modal } from "@/components/modal";
import { Seletor } from "@/components/seletor";
import { Vazio } from "@/components/intro-secao";
import { BotaoEnviar } from "@/components/botao-enviar";
import { criarClienteServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PaginaAvaliacao({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const avaliacao = await obterAvaliacao(params.id);
  if (!avaliacao) notFound();

  const [dimensoes, perguntas, respostas, porDimensao, historico, { data: detalhe }] =
    await Promise.all([
      listarDimensoes(org.orgId),
      listarPerguntas(org.orgId),
      respostasDaAvaliacao(avaliacao.avaliacao_id),
      scoresPorDimensao(avaliacao.avaliacao_id),
      listarResultados(org.orgId),
      // A visão de resultado não carrega as observações; elas moram na
      // própria avaliação — e precisam voltar ao formulário, senão cada
      // "Salvar respostas" apagava o que havia sido escrito.
      criarClienteServidor()
        .from("maturidade_avaliacoes")
        .select("observacoes")
        .eq("id", params.id)
        .maybeSingle(),
    ]);

  const [lacunas, plano, equipe] = await Promise.all([
    lacunasDaAvaliacao(avaliacao.avaliacao_id),
    planoDaCarteira(avaliacao.carteira_id),
    listarEquipe(org.orgId),
  ]);
  const jaNoPlano = new Set(plano.map((i) => i.pergunta_id));
  const observacoes = ((detalhe as { observacoes: string | null } | null)?.observacoes ?? "").trim();

  const editavel = podeEscrever(org.papel) && avaliacao.status === "rascunho";
  const f = faixa(avaliacao.score);
  const resposta = (perguntaId: string) => respostas.find((r) => r.pergunta_id === perguntaId);

  const anteriores = historico
    .filter(
      (h) =>
        h.carteira_id === avaliacao.carteira_id &&
        h.avaliacao_id !== avaliacao.avaliacao_id &&
        h.score !== null,
    )
    .sort((a, b) => b.ciclo_referencia.localeCompare(a.ciclo_referencia));

  const anterior = anteriores[0];
  const variacao =
    anterior && avaliacao.score !== null ? Number(avaliacao.score) - Number(anterior.score) : null;

  return (
    <>
      <p className="olho">
        <Link href="/maturidade">Maturidade</Link> · ciclo {avaliacao.ciclo_nome}
      </p>

      <div className="cabeca-pagina">
        <div>
          <h1>{avaliacao.carteira_nome}</h1>
          <p className="chamada" style={{ marginBottom: 0 }}>
            {avaliacao.respondidas} de {avaliacao.total_perguntas} perguntas respondidas ·{" "}
            {avaliacao.status === "concluida" ? "avaliação concluída" : "em rascunho"}
          </p>
        </div>
        <div className="cabeca-acoes">
          {avaliacao.status === "rascunho" && podeEscrever(org.papel) && (
            <form action={concluirAvaliacao}>
              <input type="hidden" name="id" value={avaliacao.avaliacao_id} />
              <BotaoEnviar>
                <CheckCircle2 size={15} />
                Concluir avaliação
              </BotaoEnviar>
            </form>
          )}
          {avaliacao.status === "concluida" && podeEscrever(org.papel) && (
            <form action={reabrirAvaliacao}>
              <input type="hidden" name="id" value={avaliacao.avaliacao_id} />
              <BotaoEnviar variante="secundario">
                <RotateCcw size={15} />
                Reabrir
              </BotaoEnviar>
            </form>
          )}
        </div>
      </div>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <div className="cartoes">
        <div className="cartao">
          <p className="olho">Score</p>
          <p className="cartao-valor">{avaliacao.score !== null ? avaliacao.score : "—"}</p>
          <p className="cartao-nota">{f.rotulo.toLowerCase()}</p>
        </div>
        <div className="cartao">
          <p className="olho">Ciclo anterior</p>
          <p className="cartao-valor">{anterior?.score ?? "—"}</p>
          <p className="cartao-nota">{anterior ? anterior.ciclo_nome : "sem histórico"}</p>
        </div>
        <div className="cartao">
          <p className="olho">Variação</p>
          <p
            className={
              variacao === null
                ? "cartao-valor"
                : variacao >= 0
                  ? "cartao-valor capturado"
                  : "cartao-valor alerta"
            }
          >
            {variacao === null ? "—" : `${variacao > 0 ? "+" : ""}${variacao.toFixed(1)}`}
          </p>
          <p className="cartao-nota">pontos desde o ciclo anterior</p>
        </div>
        <div className="cartao">
          <p className="olho">Respondidas</p>
          <p className="cartao-valor">
            {avaliacao.respondidas}
            <span style={{ fontSize: 14, color: "var(--g400)" }}>/{avaliacao.total_perguntas}</span>
          </p>
        </div>
      </div>

      {porDimensao.length > 0 && (
        <section className="painel">
          <h2>Por dimensão</h2>
          <ul className="lista-estado">
            {porDimensao.map((d) => (
              <li key={d.dimensao_id}>
                <span className="rotulo">
                  {d.dimensao}
                  <span className="dica">{d.respondidas} respostas</span>
                </span>
                <span className="barra-score" aria-hidden="true">
                  <span style={{ width: `${Math.max(2, Number(d.score ?? 0))}%` }} />
                </span>
                <span className="dado" style={{ minWidth: 42, textAlign: "right" }}>
                  {d.score ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dimensoes.length === 0 ? (
        <Vazio>A régua ainda não tem dimensões.</Vazio>
      ) : (
        <form action={salvarRespostas}>
          <input type="hidden" name="avaliacao_id" value={avaliacao.avaliacao_id} />

          {dimensoes.map((d) => {
            const daDimensao = perguntas.filter((p) => p.dimensao_id === d.id && p.ativo);
            if (daDimensao.length === 0) return null;

            return (
              <section className="painel" key={d.id}>
                <div className="linha-titulo">
                  <h2>{d.nome}</h2>
                  <span className="selo selo-neutro">peso {d.peso}</span>
                </div>
                {d.descricao && <p className="nota">{d.descricao}</p>}

                <ul className="lista-perguntas">
                  {daDimensao.map((p) => {
                    const r = resposta(p.id);
                    return (
                      <li key={p.id}>
                        <p className="pergunta-texto">{p.texto}</p>
                        {p.ajuda && <p className="nota">{p.ajuda}</p>}

                        <div className="escala">
                          {ESCALA.map((e) => (
                            <label
                              key={e.nota}
                              className={r?.nota === e.nota ? "escala-item marcado" : "escala-item"}
                              title={e.explicacao}
                            >
                              <input
                                type="radio"
                                name={`nota_${p.id}`}
                                value={e.nota}
                                defaultChecked={r?.nota === e.nota}
                                disabled={!editavel}
                              />
                              <span className="escala-nota dado">{e.nota}</span>
                              <span className="escala-rotulo">{e.rotulo}</span>
                            </label>
                          ))}
                        </div>

                        <input
                          type="text"
                          name={`obs_${p.id}`}
                          defaultValue={r?.observacao ?? ""}
                          placeholder="observação (opcional)"
                          disabled={!editavel}
                          className="campo-observacao"
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {editavel && (
            <section className="painel">
              <label className="campo">
                <span>Observações da avaliação</span>
                <textarea name="observacoes" rows={3} defaultValue={observacoes} />
                <small>O que estiver aqui é salvo junto com as respostas.</small>
              </label>
              <div style={{ marginTop: 16 }}>
                <BotaoEnviar>Salvar respostas</BotaoEnviar>
              </div>
              <p className="nota" style={{ marginTop: 10, marginBottom: 0 }}>
                Pergunta deixada em branco fica fora do cálculo — não vira zero.
              </p>
            </section>
          )}
        </form>
      )}

      {!editavel && observacoes && (
        <section className="painel">
          <h2>Observações da avaliação</h2>
          <p className="nota" style={{ marginBottom: 0 }}>
            {observacoes}
          </p>
        </section>
      )}

      {/* ---------- plano de avanço ---------- */}
      <section className="painel">
        <div className="linha-titulo">
          <h2>Por onde avançar</h2>
          <span className="passos-contagem">
            {lacunas.length} lacuna(s) · ordenadas pelo que devolvem ao score
          </span>
        </div>

        <p className="nota" style={{ marginTop: 0 }}>
          {/* A prioridade não é opinião: sai da régua que a operação
              montou. Pergunta de peso alto com nota baixa devolve mais
              pontos que três de peso baixo — e a conta está feita. */}
          A ordem é <strong>calculada</strong>: cada lacuna mostra quantos pontos do score ela
          devolve se for levada ao máximo, usando o peso da pergunta e o da dimensão que vocês
          definiram. A de cima não é a de nota mais baixa — é a que rende mais.
        </p>

        {lacunas.length === 0 ? (
          <Vazio>Nenhuma lacuna nesta avaliação: todas as perguntas estão no máximo.</Vazio>
        ) : (
          <ul className="lista-estado">
            {lacunas.map((l) => (
              <li key={l.pergunta_id}>
                <span className="rotulo">
                  {l.pergunta}
                  <span className="dica">
                    {l.dimensao} · nota {l.nota} de 4 · peso {l.peso_combinado}
                  </span>
                </span>
                <span className="selo selo-neutro" title="pontos do score que esta lacuna devolve">
                  +{l.pontos_recuperaveis}
                </span>
                {jaNoPlano.has(l.pergunta_id) ? (
                  <span className="selo selo-ok">no plano</span>
                ) : (
                  editavel && (
                    <Modal
                      rotulo="Planejar"
                      titulo="Incluir no plano de avanço"
                      descricao={l.pergunta}
                      variante="link"
                    >
                      <form action={criarItemPlano} className="formulario">
                        <input type="hidden" name="avaliacao_id" value={avaliacao.avaliacao_id} />
                        <input type="hidden" name="pergunta_id" value={l.pergunta_id} />
                        <label className="campo">
                          <span>O que será feito</span>
                          <textarea name="acao" rows={3} required maxLength={400} autoFocus />
                          <small>
                            Uma ação concreta, não uma intenção. Ela vira compromisso na carteira.
                          </small>
                        </label>
                        <div className="formulario-linha">
                          <Seletor
                            nome="dono_id"
                            rotulo="Dono"
                            opcoes={equipe.map((e) => ({ valor: e.id, rotulo: e.nome }))}
                            vazio="Definir depois"
                          />
                          <label className="campo">
                            <span>Prazo</span>
                            <input type="date" name="prazo" />
                          </label>
                        </div>
                        <BotaoEnviar>Incluir no plano</BotaoEnviar>
                      </form>
                    </Modal>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {plano.length > 0 && (
        <section className="painel">
          <div className="linha-titulo">
            <h2>Plano em andamento</h2>
            <span className="passos-contagem">{plano.length} item(ns)</span>
          </div>
          <ul className="lista-estado">
            {plano.map((i) => (
              <li key={i.id}>
                <span className="rotulo">
                  {i.acao}
                  <span className="dica">
                    {[
                      i.pergunta,
                      `nota na origem: ${i.nota_origem}`,
                      i.nota_atual !== null ? `agora: ${i.nota_atual} (${i.ciclo_atual})` : null,
                      i.prazo ? `prazo ${i.prazo}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  className={
                    i.movimento === "melhorou"
                      ? "selo selo-ok"
                      : i.movimento === "piorou"
                        ? "selo selo-falta"
                        : "selo selo-neutro"
                  }
                >
                  {i.movimento}
                </span>
              </li>
            ))}
          </ul>
          <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
            Cada item guarda a nota de quando a lacuna foi vista. No ciclo seguinte, a comparação é
            automática — é isso que transforma um diagnóstico anual em ciclo, em vez de dois
            retratos soltos.
          </p>
        </section>
      )}
    </>
  );
}
