import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { exigirOrg, exigirUsuario } from "@/lib/auth";
import { listarCarteiras } from "@/lib/carteiras";
import { formatarData, formatarValor, listarContas } from "@/lib/contas";
import { classeSelo, listarContratos, urgencia } from "@/lib/contratos";
import { listarFrentes, totais } from "@/lib/frentes";
import { FASES, listarOportunidades, rotuloFase } from "@/lib/oportunidades";
import { classeSituacao, listarCompromissos, precisaAtencao, situacao } from "@/lib/compromissos";
import { ROTULO_TIPO, classeSeveridade, listarAlertas } from "@/lib/alertas";
import { capturaMensal, capturaSemData, variacao } from "@/lib/captura";
import { faixa } from "@/lib/maturidade";
import { caminhoEntidade } from "@/lib/registros";
import { mudarStatusCompromisso } from "@/app/acoes/compromissos";
import { silenciarAlerta } from "@/app/acoes/alertas";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { PrimeirosPassos, type Passo } from "@/components/primeiros-passos";
import { BarrasMensais, Distribuicao, Funil } from "@/components/graficos";

export const dynamic = "force-dynamic";

export default async function PaginaPainel({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const [carteiras, contas, contratos, frentes, oportunidades, compromissos, alertas, serie, semData] =
    await Promise.all([
      listarCarteiras(org.orgId),
      listarContas({ orgId: org.orgId }),
      listarContratos({ orgId: org.orgId }),
      listarFrentes({ orgId: org.orgId }),
      listarOportunidades({ orgId: org.orgId }),
      listarCompromissos({ orgId: org.orgId, status: "aberto" }),
      listarAlertas({ orgId: org.orgId, status: "aberto" }),
      capturaMensal(org.orgId),
      capturaSemData(org.orgId),
    ]);

  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";
  const nomeConta = (id: string) => contas.find((c) => c.id === id)?.nome ?? "conta removida";

  /* ---------- números do topo ---------- */

  const mesAtual = serie[serie.length - 1]?.valor ?? 0;
  const mesAnterior = serie[serie.length - 2]?.valor ?? 0;
  const varCaptura = variacao(mesAtual, mesAnterior);
  const t = totais(frentes);
  const potencialTotal =
    t.potencial + contas.reduce((soma, c) => soma + Number(c.potencial_bruto ?? 0), 0);

  const alta = alertas.filter((a) => a.severidade === "alta").length;
  const meus = alertas.filter((a) => a.dono_id === usuario.id).length;
  const atrasados = compromissos.filter((c) => situacao(c).chave === "vencido");
  const proximos = compromissos.filter((c) => precisaAtencao(c) && situacao(c).chave !== "vencido");

  /* ---------- distribuição de maturidade ---------- */

  const avaliadas = carteiras.filter((c) => c.score_maturidade !== null);
  const faixas = [
    { rotulo: "Avançada", classe: "ok", quantidade: 0 },
    { rotulo: "Intermediária", classe: "neutra", quantidade: 0 },
    { rotulo: "Em estruturação", classe: "atencao", quantidade: 0 },
    { rotulo: "Inicial", classe: "alerta", quantidade: 0 },
  ];
  for (const c of avaliadas) {
    const nome = faixa(c.score_maturidade).rotulo;
    const alvo = faixas.find((f) => f.rotulo === nome);
    if (alvo) alvo.quantidade += 1;
  }

  /* ---------- funil de oportunidades ---------- */

  const etapas = FASES.filter((f) => f.valor !== "descartada" && f.valor !== "concluida").map((f) => {
    const daFase = oportunidades.filter((o) => o.fase === f.valor);
    return {
      rotulo: f.rotulo,
      quantidade: daFase.length,
      valor: daFase.reduce((soma, o) => soma + Number(o.investimento ?? 0), 0),
    };
  });

  /* ---------- pendências, agrupadas ---------- */

  const contratosAtencao = contratos.filter((c) => {
    const chave = urgencia(c).chave;
    return chave === "vencido" || chave === "janela";
  });

  const porTipoAlerta = alertas.reduce<Record<string, typeof alertas>>((mapa, a) => {
    (mapa[a.tipo] ??= []).push(a);
    return mapa;
  }, {});

  const grupos = [
    {
      chave: "alertas",
      titulo: "Alertas em aberto",
      quantidade: alertas.length,
      grave: alta > 0,
      link: "/alertas",
      subgrupos: Object.entries(porTipoAlerta).map(([tipo, lista]) => ({
        titulo: ROTULO_TIPO[tipo as keyof typeof ROTULO_TIPO] ?? tipo,
        itens: lista.map((a) => ({
          id: a.id,
          texto: a.titulo,
          detalhe: `${nomeCarteira(a.carteira_id)}${a.detalhe ? ` · ${a.detalhe}` : ""}`,
          href: a.entidade_tipo && a.entidade_id ? caminhoEntidade(a.entidade_tipo, a.entidade_id) : null,
          selo: a.severidade === "alta" ? "Alta" : a.severidade === "atencao" ? "Atenção" : "Info",
          classe: classeSeveridade(a.severidade),
          acao: { tipo: "silenciar" as const, id: a.id },
        })),
      })),
    },
    {
      chave: "compromissos",
      titulo: "Compromissos que pedem ação",
      quantidade: atrasados.length + proximos.length,
      grave: atrasados.length > 0,
      link: "/compromissos",
      subgrupos: [
        { titulo: "Atrasados", lista: atrasados },
        { titulo: "Nos próximos dias", lista: proximos },
      ]
        .filter((s) => s.lista.length > 0)
        .map((s) => ({
          titulo: s.titulo,
          itens: s.lista.map((c) => {
            const sit = situacao(c);
            return {
              id: c.id,
              texto: c.titulo,
              detalhe: `${formatarData(c.vence_em)} · ${sit.detalhe} · ${nomeCarteira(c.carteira_id)}`,
              href: caminhoEntidade(c.entidade_tipo, c.entidade_id),
              selo: sit.rotulo,
              classe: classeSituacao(sit.tom),
              acao: { tipo: "concluir" as const, id: c.id },
            };
          }),
        })),
    },
    {
      chave: "contratos",
      titulo: "Contratos que exigem decisão",
      quantidade: contratosAtencao.length,
      grave: contratosAtencao.some((c) => urgencia(c).chave === "vencido"),
      link: "/contratos",
      subgrupos: [
        {
          titulo: "Vencidos e em janela",
          itens: contratosAtencao.map((c) => {
            const u = urgencia(c);
            return {
              id: c.id,
              texto: `${c.numero ? `${c.numero} · ` : ""}${nomeConta(c.conta_id)}`,
              detalhe: `${c.fim ? `vence ${formatarData(c.fim)} · ` : ""}${u.detalhe}`,
              href: `/contratos/${c.id}`,
              selo: u.rotulo,
              classe: classeSelo(u.tom),
              acao: null,
            };
          }),
        },
      ],
    },
  ].filter((g) => g.quantidade > 0);

  /* ---------- primeiros passos ---------- */

  const passos: Passo[] = [
    {
      chave: "carteira",
      titulo: "Cadastre a primeira carteira",
      descricao: "É por ela que o trabalho é agrupado e acompanhado.",
      cta: "Criar carteira",
      href: "/carteiras",
      feito: carteiras.length > 0,
    },
    {
      chave: "conta",
      titulo: "Registre as contas que merecem gestão individual",
      descricao: "As maiores, as com contrato, as em prospecção e as que você precisa defender.",
      cta: "Cadastrar conta",
      href: "/contas",
      feito: contas.length > 0,
    },
    {
      chave: "contrato",
      titulo: "Traga os contratos com prazo a vencer",
      descricao: "Comece pelos que vencem este ano — é onde o esquecimento custa mais caro.",
      cta: "Registrar contrato",
      href: "/contratos",
      feito: contratos.length > 0,
    },
    {
      chave: "responsavel",
      titulo: "Diga quem responde por cada carteira",
      descricao: "Sem isso, o alerta nasce sem dono e vira aviso que ninguém precisa resolver.",
      cta: "Definir responsáveis",
      href: "/carteiras",
      feito: alertas.length === 0 || alertas.some((a) => a.dono_id !== null),
    },
    {
      chave: "frente",
      titulo: "Registre as frentes em andamento",
      descricao: "Uma linha por tema de volume, com dono e próxima etapa.",
      cta: "Criar frente",
      href: "/frentes",
      feito: frentes.length > 0,
      opcional: true,
    },
  ];

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Painel</h1>
        </div>
        <div className="cabeca-acoes">
          <Link className="botao botao-secundario" href="/panorama">
            Ver panorama
          </Link>
        </div>
      </div>

      <IntroSecao>
        O retrato do dia: <strong>o que mudou</strong> nos números e <strong>o que pede ação</strong>{" "}
        agora. As pendências vêm agrupadas por tipo — abra a que você for resolver.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <PrimeirosPassos passos={passos} />

      <div className="cartoes">
        <div className="cartao">
          <p className="olho">Capturado no mês</p>
          <p className="cartao-valor capturado">{formatarValor(mesAtual)}</p>
          <p className={varCaptura?.tom === "alerta" ? "cartao-nota texto-alerta" : "cartao-nota"}>
            {varCaptura?.texto ?? "sem captura confirmada no período"}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Potencial em aberto</p>
          <p className="cartao-valor teto">{formatarValor(potencialTotal)}</p>
          <p className="cartao-nota">{t.ativas} frentes e {contas.length} contas</p>
        </div>
        <div className="cartao">
          <p className="olho">Alertas</p>
          <p className={alta > 0 ? "cartao-valor alerta" : "cartao-valor"}>{alertas.length}</p>
          <p className="cartao-nota">
            {alta > 0 ? `${alta} de severidade alta · ` : ""}
            {meus} {meus === 1 ? "seu" : "seus"}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Compromissos atrasados</p>
          <p className={atrasados.length ? "cartao-valor alerta" : "cartao-valor"}>
            {atrasados.length}
          </p>
          <p className="cartao-nota">{compromissos.length} em aberto no total</p>
        </div>
      </div>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Captura confirmada por mês</h2>
          <span className="passos-contagem">últimos 12 meses</span>
        </div>

        {serie.every((p) => p.valor === 0) ? (
          <Vazio>
            Nada confirmado com data ainda. O valor entra nesta curva quando você preenche a data de
            confirmação na conta, na frente ou na oportunidade.
          </Vazio>
        ) : (
          <BarrasMensais serie={serie} />
        )}

        {semData > 0 && (
          <p className="nota" style={{ marginTop: 12, marginBottom: 0 }}>
            <span className="dado">{formatarValor(semData)}</span> de captura registrada{" "}
            <strong>sem data de confirmação</strong> não aparece aqui. Preencher a data coloca o
            valor no mês certo, em vez de somar tudo hoje e criar um pico falso.
          </p>
        )}
      </section>

      <div className="duas-colunas">
        <section className="painel">
          <div className="linha-titulo">
            <h2>Maturidade das carteiras</h2>
            <Link className="link-acao" href="/maturidade">
              Ver avaliações
            </Link>
          </div>
          {avaliadas.length === 0 ? (
            <Vazio>Nenhuma carteira avaliada ainda.</Vazio>
          ) : (
            <>
              <Distribuicao faixas={faixas} />
              <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
                {avaliadas.length} de {carteiras.length} carteiras avaliadas.
              </p>
            </>
          )}
        </section>

        <section className="painel">
          <div className="linha-titulo">
            <h2>Oportunidades por fase</h2>
            <Link className="link-acao" href="/oportunidades">
              Ver todas
            </Link>
          </div>
          {oportunidades.length === 0 ? (
            <Vazio>Nenhuma oportunidade registrada.</Vazio>
          ) : (
            <>
              <Funil etapas={etapas} />
              <p className="nota" style={{ marginTop: 12, marginBottom: 0 }}>
                O valor é o investimento previsto em cada fase — estimativa, não compromisso.
              </p>
            </>
          )}
        </section>
      </div>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Precisa de ação</h2>
          <span className="passos-contagem">
            {grupos.reduce((soma, g) => soma + g.quantidade, 0)} itens
          </span>
        </div>

        {grupos.length === 0 ? (
          <Vazio>
            Nada fora do trilho. Contratos, compromissos e frentes estão dentro do prazo.
          </Vazio>
        ) : (
          grupos.map((g) => (
            <details className="grupo-pendencia" key={g.chave}>
              <summary>
                <span className="grupo-titulo">{g.titulo}</span>
                <span className={g.grave ? "selo selo-falta" : "selo selo-neutro"}>
                  {g.quantidade}
                </span>
                <Link className="link-acao grupo-link" href={g.link}>
                  abrir tela <ArrowRight size={12} />
                </Link>
              </summary>

              {g.subgrupos.map((s) => (
                <div className="subgrupo" key={s.titulo}>
                  <p className="olho">{s.titulo}</p>
                  <ul className="lista-estado">
                    {s.itens.slice(0, 8).map((i) => (
                      <li key={i.id}>
                        <span className="rotulo">
                          {i.href ? <Link href={i.href}>{i.texto}</Link> : i.texto}
                          <span className="dica">{i.detalhe}</span>
                        </span>
                        <span className={i.classe}>{i.selo}</span>
                        {i.acao?.tipo === "concluir" && (
                          <form action={mudarStatusCompromisso}>
                            <input type="hidden" name="id" value={i.acao.id} />
                            <input type="hidden" name="status" value="concluido" />
                            <input type="hidden" name="volta" value="/painel" />
                            <button className="link-acao" type="submit">
                              Concluir
                            </button>
                          </form>
                        )}
                        {i.acao?.tipo === "silenciar" && (
                          <form action={silenciarAlerta}>
                            <input type="hidden" name="id" value={i.acao.id} />
                            <input type="hidden" name="volta" value="/painel" />
                            <button className="link-acao" type="submit">
                              Silenciar
                            </button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                  {s.itens.length > 8 && (
                    <p className="nota" style={{ marginBottom: 0 }}>
                      e mais {s.itens.length - 8} — veja na tela cheia.
                    </p>
                  )}
                </div>
              ))}
            </details>
          ))
        )}
      </section>
    </>
  );
}
