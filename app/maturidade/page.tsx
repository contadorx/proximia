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
import { BotaoExcluir } from "@/components/botao-excluir";
import { excluirCiclo, excluirDimensao, excluirPergunta } from "@/app/acoes/exclusoes";
import { Modal } from "@/components/modal";
import { BotaoEnviar } from "@/components/botao-enviar";

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
  const maiorPotencial = Math.max(0, ...potenciais);

  const todosPontos = linhasPanorama.map((l) => {
    const resultado = resultados.find((r) => r.carteira_id === l.carteira_id);
    const potencial = Number(l.frentes_potencial) + Number(l.contas_potencial);
    const score = resultado?.score ?? l.score_maturidade ?? null;
    return {
      id: l.carteira_id,
      nome: l.nome,
      etiqueta: l.codigo ?? l.nome.slice(0, 12),
      score,
      potencial,
      base: Number(l.base_sob_gestao ?? 0),
      q: quadrante(score, potencial, mediana),
    };
  });

  // Sem avaliação não entra no gráfico: um ponto no chão do eixo diria que a
  // carteira tem maturidade zero, quando o que se sabe é que ela não foi
  // avaliada. São coisas diferentes e viram listas diferentes.
  const pontos = todosPontos.filter((p) => p.score !== null);
  const semAvaliacao = todosPontos.filter((p) => p.score === null);

  // A leitura que a matriz sozinha não dá: quanto de receita já existente
  // está sob responsabilidade de unidades pouco maduras. Não é previsão de
  // perda — é a conta de exposição, e ela só faz sentido porque base e
  // maturidade são medidas independentes.
  const CORTE_MATURIDADE = 50;
  const baseTotal = todosPontos.reduce((t, p) => t + p.base, 0);
  const baseExposta = pontos
    .filter((p) => (p.score ?? 0) < CORTE_MATURIDADE)
    .reduce((t, p) => t + p.base, 0);
  const carteirasExpostas = pontos.filter(
    (p) => (p.score ?? 0) < CORTE_MATURIDADE && p.base > 0,
  ).length;

  // Enquanto não houver potencial registrado em contas e frentes, o eixo
  // horizontal não tem o que mostrar — e a matriz vira uma fileira grudada
  // na esquerda. Nesse caso mostramos o ranking, que é honesto e útil.
  const temPotencial = maiorPotencial > 0 && pontos.some((p) => p.potencial > 0);
  const ranking = [...pontos].sort((a, b) => Number(b.score) - Number(a.score));

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
                  <BotaoEnviar>
                    Começar avaliação
                  </BotaoEnviar>
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
                <BotaoEnviar>
                  Criar ciclo
                </BotaoEnviar>
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
                  <BotaoEnviar>
                    <Sparkles size={15} />
                    Criar régua inicial
                  </BotaoEnviar>
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
              <BotaoEnviar variante="secundario">
                Ver ciclo
              </BotaoEnviar>
            </form>
          )}

          <section className="painel">
            <div className="linha-titulo">
              <h2>{temPotencial ? "Maturidade × potencial" : "Maturidade por carteira"}</h2>
              <span className="passos-contagem">
                {temPotencial ? "corte no potencial mediano" : `${pontos.length} carteiras avaliadas`}
              </span>
            </div>

            {pontos.length === 0 ? (
              <Vazio>Nenhuma carteira avaliada ainda neste ciclo.</Vazio>
            ) : temPotencial ? (
              <>
                <div className="matriz">
                  <div className="matriz-rotulo-y">maturidade</div>
                  <div className="matriz-area">
                    {["Estruturar", "Acelerar", "Observar", "Sustentar"].map((nome) => (
                      <div className="matriz-quadrante" key={nome}>
                        <span>{nome}</span>
                      </div>
                    ))}

                    {pontos.map((p, i) => {
                      const x = Math.min(94, (p.potencial / maiorPotencial) * 88 + 4);
                      const y = Math.min(92, Number(p.score) * 0.86 + 4);
                      return (
                        <Link
                          key={p.id}
                          href={`/carteiras/${p.id}`}
                          className="matriz-ponto"
                          style={{ left: `${x}%`, bottom: `${y}%`, zIndex: i + 1 }}
                          title={`${p.nome} · maturidade ${p.score} · potencial ${formatarValor(p.potencial)}${p.base > 0 ? ` · base sob gestão ${formatarValor(p.base)}` : ""} · ${p.q.nome}`}
                        >
                          {p.etiqueta}
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
              </>
            ) : (
              <>
                <ul className="lista-estado">
                  {ranking.map((p) => (
                    <li key={p.id}>
                      <span className="rotulo">
                        <Link href={`/carteiras/${p.id}`}>{p.nome}</Link>
                      </span>
                      <span className="barra-score" aria-hidden="true">
                        <span style={{ width: `${Math.max(2, Number(p.score))}%` }} />
                      </span>
                      <span className="dado" style={{ minWidth: 44, textAlign: "right" }}>
                        {p.score}
                      </span>
                      <span className={faixa(p.score).classe}>{faixa(p.score).rotulo}</span>
                    </li>
                  ))}
                </ul>
                <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
                  A matriz maturidade × potencial aparece assim que houver potencial registrado nas
                  contas e frentes. O potencial não é digitado aqui: ele é a soma do que já está
                  registrado, para que o eixo tenha origem rastreável.
                </p>
              </>
            )}

            {baseTotal > 0 && (
              <div className="cartoes" style={{ marginTop: 16 }}>
                <div className="cartao">
                  <p className="olho">Base sob gestão avaliada</p>
                  <p className="cartao-valor">{formatarValor(baseTotal)}</p>
                  <p className="cartao-nota">receita que estas carteiras já mantêm</p>
                </div>
                <div className="cartao">
                  <p className="olho">Sob maturidade abaixo de {CORTE_MATURIDADE}%</p>
                  <p className={baseExposta > 0 ? "cartao-valor alerta" : "cartao-valor"}>
                    {formatarValor(baseExposta)}
                  </p>
                  <p className="cartao-nota">
                    {carteirasExpostas} carteira(s) · não é previsão de perda, é exposição
                  </p>
                </div>
              </div>
            )}

            {baseExposta > 0 && (
              <p className="nota" style={{ marginTop: 12 }}>
                {/* A leitura que a matriz sozinha não dá. Base e maturidade
                    são medidas independentes — uma vem do faturamento, a
                    outra da avaliação da unidade — e por isso cruzá-las diz
                    alguma coisa. */}
                <strong>Onde a receita já existente encontra a menor estrutura.</strong> Maturidade
                baixa não significa que a receita vai cair; significa que, se cair, a unidade tem
                menos processo para perceber e reagir. É a conta de onde a manutenção da base pesa
                mais — e ela não se soma a potencial nenhum.
              </p>
            )}

            {semAvaliacao.length > 0 && (
              <p className="nota" style={{ marginTop: 12, marginBottom: 0 }}>
                Fora do gráfico por não terem avaliação:{" "}
                {semAvaliacao.map((p) => p.nome).join(", ")}.
              </p>
            )}
          </section>

          <section className="painel">
            <div className="linha-titulo">
              <h2>Avaliações do ciclo</h2>
              {gere && cicloAtual && (
                <form action={excluirCiclo}>
                  <input type="hidden" name="id" value={cicloAtual} />
                  <BotaoExcluir
                    compacto
                    rotulo="Excluir ciclo"
                    aviso="Apaga as avaliações deste ciclo."
                  />
                </form>
              )}
            </div>
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
                      <BotaoEnviar>
                        Criar dimensão
                      </BotaoEnviar>
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
                      <BotaoEnviar>
                        Criar pergunta
                      </BotaoEnviar>
                    </form>
                  </Modal>
                </div>
              )}
            </div>

            {dimensoes.map((d) => (
              <div className="bloco-dimensao" key={d.id}>
                <div className="linha-titulo" style={{ marginBottom: 6 }}>
                  <h3>{d.nome}</h3>
                  <span className="cabeca-acoes">
                    <span className="selo selo-neutro">peso {d.peso}</span>
                    {gere && (
                      <form action={excluirDimensao}>
                        <input type="hidden" name="id" value={d.id} />
                        <BotaoExcluir
                          compacto
                          rotulo="Excluir dimensão"
                          aviso="Apaga as perguntas e as respostas dela."
                        />
                      </form>
                    )}
                  </span>
                </div>
                {d.descricao && <p className="nota">{d.descricao}</p>}

                <ul className="lista-estado">
                  {perguntas
                    .filter((p) => p.dimensao_id === d.id)
                    .map((p) => (
                      <li key={p.id}>
                        <span className="rotulo">
                          {p.texto}
                          {p.ajuda && <span className="dica">{p.ajuda}</span>}
                        </span>
                        <span className="selo selo-neutro">peso {p.peso}</span>
                        {gere && (
                          <form action={excluirPergunta}>
                            <input type="hidden" name="id" value={p.id} />
                            <BotaoExcluir compacto rotulo="Excluir" />
                          </form>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
