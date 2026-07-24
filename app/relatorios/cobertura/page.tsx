import Link from "next/link";
import { Grid3x3 } from "lucide-react";
import { exigirOrg } from "@/lib/auth";
import { listarCarteiras } from "@/lib/carteiras";
import { tiposDeOportunidade } from "@/lib/oportunidades";
import {
  classeEstado,
  coberturaDaOrg,
  montarMatriz,
  resumoPorCarteira,
  simboloEstado,
} from "@/lib/cobertura";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { SeletorMultiplo } from "@/components/seletor";
import { paraLista } from "@/lib/consulta";

export const dynamic = "force-dynamic";

/**
 * Cobertura: contas × tipos de iniciativa.
 *
 * Fica dentro de Relatórios, e não no primeiro nível do menu, por
 * escolha: é leitura de planejamento — daquelas que se faz uma vez por
 * ciclo — e o menu já foi reduzido de catorze para doze de propósito.
 */
export default async function PaginaCobertura({
  searchParams,
}: {
  searchParams: { carteira?: string | string[] };
}) {
  const org = await exigirOrg();
  const filtro = paraLista(searchParams.carteira);

  const [carteiras, tipos, celulas, resumo] = await Promise.all([
    listarCarteiras(org.orgId),
    tiposDeOportunidade(org.orgId),
    coberturaDaOrg(org.orgId, filtro),
    resumoPorCarteira(org.orgId),
  ]);

  const tiposAtivos = tipos
    .filter((t) => t.ativo)
    .map((t) => ({ id: t.id, nome: t.nome }));

  const matriz = montarMatriz(celulas, tiposAtivos);
  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";

  const totalLacunas = matriz.reduce((s, l) => s + l.lacunas, 0);
  const totalCelulas = matriz.length * tiposAtivos.length;

  return (
    <>
      <p className="olho">
        <Link href="/relatorios">Relatórios</Link> · {org.nome}
      </p>

      <div className="cabeca-pagina">
        <div>
          <h1>
            <Grid3x3 size={18} style={{ verticalAlign: "-3px", marginRight: 8 }} />
            Cobertura por conta
          </h1>
        </div>
      </div>

      <IntroSecao>
        Quais iniciativas a sua operação já tentou em cada conta — e quais nunca foram tentadas.
        A linha vazia é <strong>pergunta a fazer, não receita a projetar</strong>: pode não haver
        nada ali, e por isso o produto não multiplica lacuna por valor nenhum. Iniciativa
        descartada aparece como <strong>assunto já tratado</strong>, não como espaço em branco —
        insistir onde já se ouviu não é oportunidade, é desgaste.
      </IntroSecao>

      {tiposAtivos.length === 0 ? (
        <Vazio
          acao={
            <Link className="botao botao-primario" href="/configuracoes/pipeline">
              Cadastrar tipos de iniciativa
            </Link>
          }
        >
          Sem tipos de iniciativa cadastrados não há o que cruzar. Os tipos são o vocabulário da
          sua operação — extensão de rede, água de reúso, revisão cadastral — e é você quem os
          define.
        </Vazio>
      ) : matriz.length === 0 ? (
        <Vazio
          acao={
            <Link className="botao botao-primario" href="/contas">
              Ver contas
            </Link>
          }
        >
          Nenhuma conta ativa nesta seleção.
        </Vazio>
      ) : (
        <>
          <div className="cartoes">
            <div className="cartao">
              <p className="olho">Contas na matriz</p>
              <p className="cartao-valor">{matriz.length}</p>
              <p className="cartao-nota">× {tiposAtivos.length} tipo(s) de iniciativa</p>
            </div>
            <div className="cartao">
              <p className="olho">Combinações nunca tentadas</p>
              <p className="cartao-valor">{totalLacunas}</p>
              <p className="cartao-nota">
                de {totalCelulas} — cada uma é uma pergunta, não um valor
              </p>
            </div>
            <div className="cartao">
              <p className="olho">Contas sem nenhuma iniciativa</p>
              <p className="cartao-valor">
                {matriz.filter((l) => l.lacunas === tiposAtivos.length).length}
              </p>
              <p className="cartao-nota">nenhum tipo tentado ainda</p>
            </div>
          </div>

          <form className="filtros" method="get">
            <SeletorMultiplo
              nome="carteira"
              rotulo="Carteira"
              opcoes={carteiras.map((c) => ({
                valor: c.id,
                rotulo: c.nome,
                detalhe: c.codigo ?? undefined,
              }))}
              inicial={filtro}
            />
            <button className="botao botao-secundario" type="submit">
              Filtrar
            </button>
            {filtro.length > 0 && (
              <Link className="link-acao" href="/relatorios/cobertura">
                Limpar
              </Link>
            )}
          </form>

          <section className="painel">
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Conta</th>
                    {tiposAtivos.map((t) => (
                      <th key={t.id}>{t.nome}</th>
                    ))}
                    <th className="numero">Nunca tentadas</th>
                  </tr>
                </thead>
                <tbody>
                  {matriz.map((linha) => (
                    <tr key={linha.contaId}>
                      <td>
                        <Link href={`/contas/${linha.contaId}`}>{linha.conta}</Link>
                        {linha.criticidade === "alta" && (
                          <span className="celula-sub">criticidade alta</span>
                        )}
                      </td>
                      {linha.celulas.map((c) => (
                        <td key={c.catalogoId} title={c.detalhe}>
                          <span className={classeEstado(c.estado)}>
                            {simboloEstado(c.estado) || "—"}
                          </span>
                        </td>
                      ))}
                      <td className="numero dado">{linha.lacunas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
              ✓ já houve iniciativa concluída · • em andamento · × tentada e descartada ·
              — nunca tentada. Passe o cursor para ver o detalhe de cada célula.
            </p>
          </section>

          <section className="painel">
            <h2>Por carteira</h2>
            <ul className="lista-estado">
              {resumo
                .slice()
                .sort((a, b) => (a.cobertura_pct ?? 0) - (b.cobertura_pct ?? 0))
                .map((r) => (
                  <li key={r.carteira_id}>
                    <span className="rotulo">
                      {nomeCarteira(r.carteira_id)}
                      <span className="dica">
                        {r.contas} conta(s) × {r.tipos} tipo(s) · {r.lacunas} combinação(ões) nunca
                        tentada(s)
                      </span>
                    </span>
                    <span
                      className={
                        (r.cobertura_pct ?? 0) >= 50 ? "selo selo-ok" : "selo selo-neutro"
                      }
                    >
                      {r.cobertura_pct ?? 0}%
                    </span>
                  </li>
                ))}
            </ul>
            <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
              A porcentagem é <strong>contagem de combinações já tentadas</strong>, não previsão de
              nada. Cobertura baixa pode ser carteira nova, ou catálogo largo demais para o perfil
              daquelas contas — vale olhar antes de tratar como meta.
            </p>
          </section>
        </>
      )}
    </>
  );
}
