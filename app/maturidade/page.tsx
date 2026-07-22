import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { listarCarteiras } from "@/lib/carteiras";
import { formatarValor } from "@/lib/contas";
import { panorama } from "@/lib/panorama";
import {
  ciclos as listarCiclos,
  dimensoes as listarDimensoes,
  faixa,
  perguntas as listarPerguntas,
  quadrante,
  resultados as listarResultados,
} from "@/lib/maturidade";
import {
  criarCiclo,
  criarDimensao,
  criarPergunta,
  criarReguaInicial,
  iniciarAvaliacao,
} from "@/app/acoes/maturidade";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";

export const dynamic = "force-dynamic";

export default async function PaginaMaturidade({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string; ciclo?: string };
}) {
  const org = await exigirOrg();

  const [ciclos, dimensoes, perguntas, carteiras, linhasPanorama] = await Promise.all([
    listarCiclos(org.orgId),
    listarDimensoes(org.orgId),
    listarPerguntas(org.orgId),
    listarCarteiras(org.orgId),
    panorama(org.orgId, "nome"),
  ]);

  const cicloAtual = searchParams.ciclo ?? ciclos[0]?.id;
  const resultados = cicloAtual ? await listarResultados(org.orgId, cicloAtual) : [];
  const gere = podeEscrever(org.papel) && org.papel !== "ponto_focal";

  // Matriz: maturidade contra potencial, com a mediana como corte.
  const potenciais = linhasPanorama.map(
    (l) => Number(l.frentes_potencial) + Number(l.contas_potencial),
  );
  const ordenados = [...potenciais].sort((a, b) => a - b);
  const mediana = ordenados.length
    ? ordenados[Math.floor(ordenados.length / 2)]
    : 0;
  const maiorPotencial = Math.max(1, ...potenciais);

  const pontos = linhasPanorama.map((l) => {
    const resultado = resultados.find((r) => r.carteira_id === l.carteira_id);
    const potencial = Number(l.frentes_potencial) + Number(l.contas_potencial);
    const score = resultado?.score ?? l.score_maturidade ?? null;
    return {
      id: l.carteira_id,
      nome: l.nome,
      score,
      potencial,
      q: quadrante(score, potencial, mediana),
    };
  });

  const semQuestionario = dimensoes.length === 0;

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Maturidade</h1>
        </div>
        {gere && (
          <div className="cabeca-acoes">
            {ciclos.length > 0 && carteiras.length > 0 && !semQuestionario && (
              <Modal
                rotulo="Avaliar carteira"
                titulo="Nova avaliação"
                descricao="Uma avaliação por carteira em cada ciclo."
                icone={<Plus size={15} />}
              >
                <form action={iniciarAvaliacao} className="formulario">
                  <label className="campo">
                    <span>Carteira</span>
                    <select name="carteira_id" required defaultValue="" autoFocus>
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
                    <span>Ciclo</span>
                    <select name="ciclo_id" required defaultValue={cicloAtual}>
                      {ciclos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="botao botao-primario" type="submit">
                    Começar avaliação
                  </button>
                </form>
              </Modal>
            )}

            <Modal
              rotulo="Novo ciclo"
              titulo="Novo ciclo de avaliação"
              descricao="Comparar carteiras só faz sentido dentro do mesmo ciclo."
              variante="secundario"
              icone={<Plus size={15} />}
            >
              <form action={criarCiclo} className="formulario">
                <label className="campo">
                  <span>Nome</span>
                  <input type="text" name="nome" required maxLength={40} placeholder="2026-2" autoFocus />
                </label>
                <label className="campo">
                  <span>Data de referência</span>
                  <input
                    type="date"
                    name="referencia"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </label>
                <button className="botao botao-primario" type="submit">
                  Criar ciclo
                </button>
              </form>
            </Modal>
          </div>
        )}
      </div>

      <IntroSecao>
        A régua é sua: dimensões e perguntas são cadastradas por você, cada uma com peso. As
        respostas vão de 0 a 4 e o <strong>score é a média ponderada do que foi respondido</strong> —
        pergunta em branco fica fora da conta, não vira zero. Ao concluir, o score vai para a
        carteira e aparece no panorama e no extrato.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      {semQuestionario ? (
        <section className="painel">
          <h2>Comece pela régua</h2>
          <Vazio
            acao={
              gere ? (
                <form action={criarReguaInicial}>
                  <button className="botao botao-primario" type="submit">
                    <Sparkles size={15} />
                    Criar régua inicial
                  </button>
                </form>
              ) : undefined
            }
          >
            Nenhuma dimensão cadastrada. Você pode criar tudo do zero ou começar por uma régua
            inicial genérica — cinco dimensões que qualquer operação de conta-chave tem — e reescrever
            as perguntas depois.
          </Vazio>
        </section>
      ) : (
        <>
          {ciclos.length > 0 && (
            <form className="filtros" method="get">
              <label className="campo">
                <span>Ciclo</span>
                <select name="ciclo" defaultValue={cicloAtual}>
                  {ciclos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <button className="botao botao-secundario" type="submit">
                Ver ciclo
              </button>
            </form>
          )}

          <section className="painel">
            <div className="linha-titulo">
              <h2>Maturidade × potencial</h2>
              <span className="passos-contagem">corte no potencial mediano</span>
            </div>

            <div className="matriz">
              <div className="matriz-rotulo-y">maturidade</div>
              <div className="matriz-area">
                {["Estruturar", "Acelerar", "Observar", "Sustentar"].map((nome) => (
                  <div className="matriz-quadrante" key={nome}>
                    <span>{nome}</span>
                  </div>
                ))}

                {pontos.map((p) => {
                  const x = Math.min(96, (p.potencial / maiorPotencial) * 92 + 2);
                  const y = Math.min(94, (p.score ?? 0) * 0.9 + 2);
                  return (
                    <Link
                      key={p.id}
                      href={`/carteiras/${p.id}`}
                      className="matriz-ponto"
                      style={{ left: `${x}%`, bottom: `${y}%` }}
                      title={`${p.nome} · maturidade ${p.score ?? "sem avaliação"} · potencial ${formatarValor(p.potencial)} · ${p.q.nome}`}
                    >
                      <span>{p.nome}</span>
                    </Link>
                  );
                })}
              </div>
              <div className="matriz-rotulo-x">potencial estimado</div>
            </div>

            <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
              Acelerar: base pronta e muito a capturar. Estruturar: muito a capturar, base ainda
              frágil. Sustentar: base boa, potencial menor. Observar: pouco de cada.
            </p>
          </section>

          <section className="painel">
            <h2>Avaliações do ciclo</h2>
            {resultados.length === 0 ? (
              <Vazio>
                {ciclos.length === 0
                  ? "Crie um ciclo para começar a avaliar."
                  : "Nenhuma carteira avaliada neste ciclo ainda."}
              </Vazio>
            ) : (
              <ul className="lista-estado">
                {resultados.map((r) => {
                  const f = faixa(r.score);
                  return (
                    <li key={r.avaliacao_id}>
                      <span className="rotulo">
                        <Link href={`/maturidade/${r.avaliacao_id}`}>{r.carteira_nome}</Link>
                        <span className="dica">
                          {r.respondidas} de {r.total_perguntas} perguntas respondidas
                          {r.status === "concluida" ? " · concluída" : " · em rascunho"}
                        </span>
                      </span>
                      <span className="dado destaque-dado" style={{ fontSize: 15 }}>
                        {r.score !== null ? `${r.score}` : "—"}
                      </span>
                      <span className={f.classe}>{f.rotulo}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="painel">
            <div className="linha-titulo">
              <h2>Régua</h2>
              {gere && (
                <div className="cabeca-acoes">
                  <Modal
                    rotulo="Nova dimensão"
                    titulo="Nova dimensão"
                    descricao="O peso diz quanto ela vale no score."
                    variante="secundario"
                    icone={<Plus size={15} />}
                  >
                    <form action={criarDimensao} className="formulario">
                      <label className="campo">
                        <span>Nome</span>
                        <input type="text" name="nome" required maxLength={80} autoFocus />
                      </label>
                      <label className="campo">
                        <span>Descrição</span>
                        <input type="text" name="descricao" maxLength={200} />
                      </label>
                      <div className="formulario-linha">
                        <label className="campo campo-numerico">
                          <span>Peso</span>
                          <input type="text" name="peso" defaultValue="1" inputMode="decimal" />
                          <small>De 0,1 a 10. Padrão 1.</small>
                        </label>
                        <label className="campo campo-numerico">
                          <span>Ordem</span>
                          <input type="number" name="ordem" defaultValue={dimensoes.length + 1} />
                        </label>
                      </div>
                      <button className="botao botao-primario" type="submit">
                        Criar dimensão
                      </button>
                    </form>
                  </Modal>

                  <Modal
                    rotulo="Nova pergunta"
                    titulo="Nova pergunta"
                    descricao="Escreva de forma que a resposta 0 a 4 faça sentido."
                    variante="secundario"
                    icone={<Plus size={15} />}
                  >
                    <form action={criarPergunta} className="formulario">
                      <label className="campo">
                        <span>Dimensão</span>
                        <select name="dimensao_id" required defaultValue="">
                          <option value="" disabled>
                            Escolha
                          </option>
                          {dimensoes.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nome}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="campo">
                        <span>Pergunta</span>
                        <input type="text" name="texto" required maxLength={240} />
                      </label>
                      <label className="campo">
                        <span>Ajuda</span>
                        <input type="text" name="ajuda" maxLength={240} placeholder="opcional" />
                      </label>
                      <div className="formulario-linha">
                        <label className="campo campo-numerico">
                          <span>Peso</span>
                          <input type="text" name="peso" defaultValue="1" inputMode="decimal" />
                        </label>
                        <label className="campo campo-numerico">
                          <span>Ordem</span>
                          <input type="number" name="ordem" defaultValue={perguntas.length + 1} />
                        </label>
                      </div>
                      <button className="botao botao-primario" type="submit">
                        Criar pergunta
                      </button>
                    </form>
                  </Modal>
                </div>
              )}
            </div>

            <ul className="lista-estado">
              {dimensoes.map((d) => (
                <li key={d.id}>
                  <span className="rotulo">
                    {d.nome}
                    <span className="dica">
                      {perguntas.filter((p) => p.dimensao_id === d.id).length} perguntas
                      {d.descricao ? ` · ${d.descricao}` : ""}
                    </span>
                  </span>
                  <span className="selo selo-neutro">peso {d.peso}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
