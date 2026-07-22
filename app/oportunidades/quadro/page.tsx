import Link from "next/link";
import { LayoutGrid, List } from "lucide-react";
import { exigirOrg } from "@/lib/auth";
import { listarCarteiras, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { formatarValor } from "@/lib/contas";
import { formatarPayback, listarOportunidades } from "@/lib/oportunidades";
import { conversao, fasesConfiguradas, motivosDescarte, perdasPorMotivo, taxaConversao } from "@/lib/pipeline";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { SeletorMultiplo } from "@/components/seletor";
import { Ranking } from "@/components/graficos";
import { paraLista } from "@/lib/consulta";

export const dynamic = "force-dynamic";

export default async function PaginaQuadro({
  searchParams,
}: {
  searchParams: { carteira?: string | string[] };
}) {
  const org = await exigirOrg();
  const filtro = paraLista(searchParams.carteira);

  const [oportunidades, fases, linhas, motivos, carteiras, pessoas] = await Promise.all([
    listarOportunidades({ orgId: org.orgId, carteiras: filtro }),
    fasesConfiguradas(org.orgId),
    conversao(org.orgId, filtro),
    motivosDescarte(org.orgId),
    listarCarteiras(org.orgId),
    pessoasDaOrganizacao(org.orgId),
  ]);

  const t = taxaConversao(linhas);
  const perdas = perdasPorMotivo(linhas, motivos);
  const porId = new Map(linhas.map((l) => [l.oportunidade_id, l]));

  // Sem régua configurada, o quadro usa as fases do produto na ordem natural.
  const colunas = (fases.length > 0
    ? fases.filter((f) => f.ativa && f.fase !== "descartada")
    : [
        { fase: "identificacao", rotulo: "Identificação", prazo_esperado_dias: null },
        { fase: "viabilidade", rotulo: "Viabilidade", prazo_esperado_dias: null },
        { fase: "proposta", rotulo: "Proposta", prazo_esperado_dias: null },
        { fase: "negociacao", rotulo: "Negociação", prazo_esperado_dias: null },
        { fase: "aprovada", rotulo: "Aprovada", prazo_esperado_dias: null },
        { fase: "implantacao", rotulo: "Implantação", prazo_esperado_dias: null },
        { fase: "concluida", rotulo: "Concluída", prazo_esperado_dias: null },
      ]
  ).map((f) => ({
    ...f,
    itens: oportunidades.filter((o) => o.fase === f.fase),
  }));

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Quadro de conversão</h1>
        </div>
        <div className="cabeca-acoes">
          <Link className="botao botao-secundario" href="/oportunidades">
            <List size={15} />
            Lista
          </Link>
          <Link className="botao botao-secundario ativo" href="/oportunidades/quadro">
            <LayoutGrid size={15} />
            Quadro
          </Link>
          <Link className="link-acao" href="/configuracoes/pipeline">
            Etapas e prazos
          </Link>
        </div>
      </div>

      <IntroSecao>
        Uma coluna por etapa. O cartão fica marcado quando passa do{" "}
        <strong>prazo esperado da etapa</strong> — que é o mesmo limite usado pelo alerta de parada.
        A taxa de conversão considera apenas o que já saiu do funil.
      </IntroSecao>

      <div className="cartoes">
        <div className="cartao">
          <p className="olho">Em andamento</p>
          <p className="cartao-valor">{t.emAndamento}</p>
          <p className={t.atrasadas ? "cartao-nota texto-alerta" : "cartao-nota"}>
            {t.atrasadas > 0 ? `${t.atrasadas} passaram do prazo` : "todas dentro do prazo"}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Taxa de conversão</p>
          <p className="cartao-valor capturado">
            {t.taxa === null ? "—" : `${t.taxa.toFixed(0)}%`}
          </p>
          <p className="cartao-nota">
            {t.encerradas === 0
              ? "nada encerrado ainda"
              : `${t.ganhas} de ${t.encerradas} encerradas`}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Perdidas</p>
          <p className={t.perdidas ? "cartao-valor alerta" : "cartao-valor"}>{t.perdidas}</p>
          <p className="cartao-nota">com motivo registrado</p>
        </div>
        <div className="cartao">
          <p className="olho">Investimento em jogo</p>
          <p className="cartao-valor teto">
            {formatarValor(
              linhas
                .filter((l) => !l.encerrada)
                .reduce((soma, l) => soma + Number(l.investimento ?? 0), 0),
            )}
          </p>
          <p className="cartao-nota">só o que segue em andamento</p>
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
      </form>

      {oportunidades.length === 0 ? (
        <Vazio
          acao={
            <Link className="botao botao-secundario" href="/oportunidades">
              Criar oportunidade
            </Link>
          }
        >
          Nenhuma oportunidade para mostrar no quadro.
        </Vazio>
      ) : (
        <div className="quadro">
          {colunas.map((c) => (
            <section className="coluna-quadro" key={c.fase}>
              <header>
                <span className="coluna-titulo">{c.rotulo}</span>
                <span className="coluna-contagem dado">{c.itens.length}</span>
              </header>

              {c.prazo_esperado_dias && (
                <p className="coluna-prazo">até {c.prazo_esperado_dias} dias</p>
              )}

              <div className="coluna-corpo">
                {c.itens.length === 0 ? (
                  <p className="coluna-vazia">—</p>
                ) : (
                  c.itens.map((o) => {
                    const l = porId.get(o.id);
                    return (
                      <Link
                        key={o.id}
                        href={`/oportunidades/${o.id}`}
                        className={l?.atrasada ? "cartao-quadro atrasado" : "cartao-quadro"}
                      >
                        <strong>{o.titulo}</strong>
                        <span className="cartao-quadro-linha dado">
                          {formatarValor(o.investimento)}
                          {o.payback_meses !== null && ` · ${formatarPayback(o.payback_meses)}`}
                        </span>
                        <span className="cartao-quadro-linha">
                          {o.responsavel_id
                            ? nomePessoa(pessoas.find((p) => p.id === o.responsavel_id))
                            : "sem responsável"}
                        </span>
                        <span
                          className={
                            l?.atrasada ? "cartao-quadro-dias texto-alerta" : "cartao-quadro-dias"
                          }
                        >
                          {l?.dias_na_fase ?? 0} d nesta etapa
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <section className="painel">
        <div className="linha-titulo">
          <h2>Por que perdemos</h2>
          <Link className="link-acao" href="/configuracoes/pipeline">
            Editar motivos
          </Link>
        </div>

        {perdas.length === 0 ? (
          <Vazio>
            Nenhuma oportunidade descartada ainda. Quando houver, o motivo aparece agrupado aqui — é
            o relatório que mais muda comportamento de equipe.
          </Vazio>
        ) : (
          <>
            <Ranking
              itens={perdas.map((p) => ({
                rotulo: p.rotulo,
                valor: p.quantidade,
                detalhe:
                  p.valor > 0 ? `${formatarValor(p.valor)} de investimento previsto` : undefined,
              }))}
              formato="numero"
            />
            {perdas.some((p) => p.rotulo === "sem motivo classificado") && (
              <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
                Parte das perdas está sem classificação. O texto do descarte continua registrado em
                cada uma, mas só a classificação permite agrupar.
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
