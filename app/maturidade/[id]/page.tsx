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
} from "@/lib/maturidade";
import { concluirAvaliacao, reabrirAvaliacao, salvarRespostas } from "@/app/acoes/maturidade";
import { Vazio } from "@/components/intro-secao";

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

  const [dimensoes, perguntas, respostas, porDimensao, historico] = await Promise.all([
    listarDimensoes(org.orgId),
    listarPerguntas(org.orgId),
    respostasDaAvaliacao(avaliacao.avaliacao_id),
    scoresPorDimensao(avaliacao.avaliacao_id),
    listarResultados(org.orgId),
  ]);

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
              <button className="botao botao-primario" type="submit">
                <CheckCircle2 size={15} />
                Concluir avaliação
              </button>
            </form>
          )}
          {avaliacao.status === "concluida" && podeEscrever(org.papel) && (
            <form action={reabrirAvaliacao}>
              <input type="hidden" name="id" value={avaliacao.avaliacao_id} />
              <button className="botao botao-secundario" type="submit">
                <RotateCcw size={15} />
                Reabrir
              </button>
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
                <textarea name="observacoes" rows={3} />
              </label>
              <button className="botao botao-primario" type="submit" style={{ marginTop: 16 }}>
                Salvar respostas
              </button>
              <p className="nota" style={{ marginTop: 10, marginBottom: 0 }}>
                Pergunta deixada em branco fica fora do cálculo — não vira zero.
              </p>
            </section>
          )}
        </form>
      )}
    </>
  );
}
