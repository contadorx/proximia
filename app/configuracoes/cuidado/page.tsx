import Link from "next/link";
import { exigirOrg, podeAdministrar } from "@/lib/auth";
import { reguaDaOrg } from "@/lib/cuidado";
import { semearRegua, salvarRegua } from "@/app/acoes/cuidado";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { BotaoEnviar } from "@/components/botao-enviar";

export const dynamic = "force-dynamic";

/**
 * A régua do índice de cuidado.
 *
 * Esta tela é o ponto do recurso. O índice não vale por ser sofisticado —
 * vale por ser AJUSTÁVEL e por cada item ser verificável. Uma operação
 * que nunca usa contrato de demanda desliga os dois critérios de
 * contrato; outra, que vive deles, sobe o peso. As duas ficam com um
 * número que significa alguma coisa para elas.
 */
export default async function PaginaCuidado({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const criterios = await reguaDaOrg(org.orgId);
  const administra = podeAdministrar(org.papel);

  const ativos = criterios.filter((c) => c.ativo);
  const pesoTotal = ativos.reduce((t, c) => t + c.peso, 0);

  return (
    <>
      <p className="olho">
        <Link href="/configuracoes">Configurações</Link> · {org.nome}
      </p>
      <h1>Cuidado da conta</h1>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <IntroSecao>
        O índice de cuidado responde uma pergunta só: <strong>quanto do checklist que vocês
        definiram está verdadeiro em cada conta</strong>. Ele não prevê perda nem estima risco — e
        essa diferença importa, porque previsão convida a discutir o modelo, enquanto checklist
        convida a resolver o que falta.{" "}
        <strong>Todo item é verificado pelo próprio sistema</strong>, sem julgamento humano no
        cálculo; o que é de vocês são os pesos e quais itens contam.
      </IntroSecao>

      {criterios.length === 0 ? (
        <Vazio
          acao={
            administra ? (
              <form action={semearRegua}>
                <BotaoEnviar>Criar a régua sugerida</BotaoEnviar>
              </form>
            ) : undefined
          }
        >
          Nenhuma régua configurada. A sugerida traz doze critérios verificáveis, com pesos que são
          um ponto de partida defensável — e que vocês vão querer ajustar.
        </Vazio>
      ) : (
        <form action={salvarRegua}>
          <section className="painel">
            <div className="linha-titulo">
              <h2>Critérios</h2>
              <span className="passos-contagem">
                {ativos.length} ativo(s) · peso total {pesoTotal}
              </span>
            </div>

            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Critério</th>
                    <th className="numero">Peso</th>
                    <th className="numero">Período</th>
                    <th>Conta</th>
                  </tr>
                </thead>
                <tbody>
                  {criterios.map((c) => (
                    <tr key={c.id} className={c.ativo ? undefined : "linha-suspensa"}>
                      <td>
                        <input type="hidden" name="id" value={c.id} />
                        <strong>{c.rotulo}</strong>
                        {c.descricao && <span className="celula-sub">{c.descricao}</span>}
                      </td>
                      <td className="numero">
                        <select
                          name={`peso_${c.id}`}
                          defaultValue={String(c.peso)}
                          className="select-compacto"
                          disabled={!administra}
                        >
                          {[1, 2, 3, 4, 5].map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="numero">
                        {c.chave === "registro_recente" ? (
                          <input
                            type="number"
                            name={`parametro_${c.id}`}
                            defaultValue={c.parametro ?? 90}
                            min={1}
                            max={730}
                            className="campo-numero-curto"
                            disabled={!administra}
                            aria-label="dias"
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <label className="campo-marcador">
                          <input
                            type="checkbox"
                            name={`ativo_${c.id}`}
                            defaultChecked={c.ativo}
                            disabled={!administra}
                          />
                          <span>{c.ativo ? "sim" : "não"}</span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {administra && (
              <div style={{ marginTop: 18 }}>
                <BotaoEnviar>Salvar régua</BotaoEnviar>
              </div>
            )}

            <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
              O peso é relativo: o índice é a soma dos pesos cumpridos dividida pela soma de todos
              os ativos. Escala de 1 a 5 é curta de propósito — escala longa vira discussão sobre
              decimal, e não sobre o que importa. Critério desligado sai da conta inteiramente,
              não vale como zero.
            </p>
          </section>
        </form>
      )}

      <section className="painel">
        <h2>Por que estes doze, e não outros</h2>
        <p className="nota" style={{ marginTop: 0 }}>
          Cada critério da lista é uma pergunta que o banco de dados responde sozinho — tem decisor
          mapeado, houve registro no período, existe contrato vigente. Não há campo de texto livre
          nem avaliação subjetiva dentro do cálculo, e é isso que permite abrir qualquer ponto do
          índice e conferir de onde ele veio.
        </p>
        <p className="nota">
          Se vocês precisarem de um critério que não está aqui, ele só entra depois que o produto
          souber verificá-lo. Critério que depende de alguém marcar uma caixinha à mão volta a ser
          opinião — e opinião com peso é exatamente o que este índice existe para evitar.
        </p>
      </section>
    </>
  );
}
