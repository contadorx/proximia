import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { exigirOrg, exigirUsuario } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarCarteiras } from "@/lib/carteiras";
import { formatarValor, listarContas } from "@/lib/contas";
import { listarContratos, urgencia } from "@/lib/contratos";
import { listarFrentes } from "@/lib/frentes";
import { FASES, listarOportunidades, rotuloFase } from "@/lib/oportunidades";
import { listarCompromissos, precisaAtencao, situacao } from "@/lib/compromissos";
import { listarAlertas } from "@/lib/alertas";
import { capturaMensal, capturaSemData, variacao } from "@/lib/captura";
import { panorama, totaisGerais } from "@/lib/panorama";
import { resultados as resultadosMaturidade } from "@/lib/maturidade";
import { minhaEquipeId } from "@/lib/equipe";
import { faixa } from "@/lib/maturidade";
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

  const [
    carteiras,
    contas,
    contratos,
    frentes,
    oportunidades,
    compromissos,
    alertas,
    serie,
    semData,
    resumo,
    equipeId,
    { data: contaOrg },
    avaliacoes,
  ] = await Promise.all([
    listarCarteiras(org.orgId),
    listarContas({ orgId: org.orgId }),
    listarContratos({ orgId: org.orgId }),
    listarFrentes({ orgId: org.orgId }),
    listarOportunidades({ orgId: org.orgId }),
    listarCompromissos({ orgId: org.orgId, status: "aberto" }),
    listarAlertas({ orgId: org.orgId, status: "aberto" }),
    capturaMensal(org.orgId),
    capturaSemData(org.orgId),
    panorama(org.orgId, "nome"),
    minhaEquipeId(org.orgId, usuario.id),
    criarClienteServidor()
      .from("orgs")
      .select("assinatura_status")
      .eq("id", org.orgId)
      .maybeSingle(),
    resultadosMaturidade(org.orgId),
  ]);
  const situacaoConta = (contaOrg as { assinatura_status: string } | null)?.assinatura_status;

  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";

  /* ---------- números do topo ---------- */

  const mesAtual = serie[serie.length - 1]?.valor ?? 0;
  const mesAnterior = serie[serie.length - 2]?.valor ?? 0;
  const varCaptura = variacao(mesAtual, mesAnterior);

  // Os totais vêm da visão agregada, não das listas (que têm teto de
  // linhas): o número do card continua certo com 3.000 contas. E o teto
  // é só captura — proteção é receita a defender, não a conquistar, e as
  // duas não se somam.
  const tg = totaisGerais(resumo);
  const potencialTotal = tg.potencial;
  const protecaoTotal = tg.protecao;

  const alta = alertas.filter((a) => a.severidade === "alta").length;
  // "Meus" compara com a pessoa da equipe, não com o login: o dono das
  // fichas é gente da operação, que pode ter sido cadastrada antes do acesso.
  const meuId = equipeId ?? usuario.id;
  const meus = alertas.filter((a) => a.dono_id === meuId).length;
  const atrasados = compromissos.filter((c) => situacao(c).chave === "vencido");
  const proximos = compromissos.filter((c) => precisaAtencao(c) && situacao(c).chave !== "vencido");

  /* ---------- distribuição de maturidade ---------- */

  // O painel mostrava só o score PUBLICADO — o que a carteira carimba ao
  // concluir a avaliação. Com 18 avaliações importadas e nenhuma
  // concluída, o bloco ficava vazio e parecia que a maturidade não
  // existia. Agora vale o publicado e, na falta dele, o calculado a
  // partir das respostas já registradas. A diferença é dita na tela:
  // avaliação em andamento não é a mesma coisa que resultado fechado.
  const scoreCalculado = new Map<string, number>();
  for (const r of avaliacoes) {
    if (r.score !== null && r.score !== undefined) {
      const atual = scoreCalculado.get(r.carteira_id);
      if (atual === undefined) scoreCalculado.set(r.carteira_id, Number(r.score));
    }
  }

  const comScore = carteiras.map((c) => ({
    ...c,
    score: c.score_maturidade ?? scoreCalculado.get(c.id) ?? null,
    publicado: c.score_maturidade !== null,
  }));

  const avaliadas = comScore.filter((c) => c.score !== null);
  const emAndamento = avaliadas.filter((c) => !c.publicado).length;
  const faixas = [
    { rotulo: "Avançada", classe: "ok", quantidade: 0 },
    { rotulo: "Intermediária", classe: "neutra", quantidade: 0 },
    { rotulo: "Em estruturação", classe: "atencao", quantidade: 0 },
    { rotulo: "Inicial", classe: "alerta", quantidade: 0 },
  ];
  for (const c of avaliadas) {
    const nome = faixa(c.score).rotulo;
    const alvo = faixas.find((f) => f.rotulo === nome);
    if (alvo) alvo.quantidade += 1;
  }

  /* ---------- oportunidades: o que está em jogo ---------- */

  // Retorno mensal estimado das oportunidades ainda abertas. É estimativa
  // declarada — não é receita, não é captura, e por isso aparece com a
  // cor de teto, junto do investimento que a acompanha.
  const abertas = oportunidades.filter(
    (o) => o.fase !== "concluida" && o.fase !== "descartada",
  );
  const oportunidadesAbertas = abertas.length;
  const retornoEmAberto = abertas.reduce((t, o) => t + Number(o.resultado_mensal ?? 0), 0);
  const investimentoEmAberto = abertas.reduce((t, o) => t + Number(o.investimento ?? 0), 0);

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


  // Resumo, não fila de trabalho.
  //
  // Este bloco listava os itens um a um, com ação inline de concluir e
  // silenciar — virando a terceira porta para "o que eu preciso
  // resolver", ao lado de Alertas e Compromissos. Agora que Pendências é
  // a porta única, o Painel volta a ser retrato do dia: diz quanto tem e
  // de que tipo, e manda resolver no lugar certo. Nada some — cada linha
  // leva para a seção correspondente.
  const grupos = [
    {
      chave: "compromissos",
      titulo: "Compromissos que pedem ação",
      quantidade: atrasados.length + proximos.length,
      grave: atrasados.length > 0,
      link: "/pendencias#compromissos",
      nota:
        atrasados.length > 0
          ? `${atrasados.length} atrasado(s) · ${proximos.length} nos próximos dias`
          : `${proximos.length} nos próximos dias`,
    },
    {
      chave: "alertas",
      titulo: "Avisos do sistema em aberto",
      quantidade: alertas.length,
      grave: alta > 0,
      link: "/pendencias#avisos",
      nota: alta > 0 ? `${alta} de severidade alta · ${meus} seu(s)` : `${meus} seu(s)`,
    },
    {
      chave: "contratos",
      titulo: "Contratos que exigem decisão",
      quantidade: contratosAtencao.length,
      grave: contratosAtencao.some((c) => urgencia(c).chave === "vencido"),
      link: "/contratos",
      nota: "vencidos e em janela de renegociação",
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
            Ver comparativo
          </Link>
        </div>
      </div>

      <IntroSecao>
        O retrato do dia: <strong>o que mudou</strong> nos números e <strong>o que pede ação</strong>{" "}
        agora. As pendências vêm agrupadas por tipo — abra a que você for resolver.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      {situacaoConta && situacaoConta !== "ativa" && situacaoConta !== "avaliacao" && (
        <p className="aviso aviso-erro">
          <strong>Esta organização está com o acesso suspenso.</strong> Você continua consultando e
          exportando os dados; novos registros ficam bloqueados até a regularização.
        </p>
      )}

      <PrimeirosPassos passos={passos} />

      <div className="cartoes">
        {/* A base vem primeiro: manter o que já existe é metade do
            trabalho de gestão, e é a metade que não aparecia. */}
        {tg.base > 0 && (
          <div className="cartao">
            <p className="olho">Base sob gestão</p>
            <p className="cartao-valor">{formatarValor(tg.base)}</p>
            <p className="cartao-nota">
              o que os clientes já pagam · {tg.contasComReceita} conta(s) informada(s)
            </p>
          </div>
        )}
        <div className="cartao">
          <p className="olho">Capturado no mês</p>
          <p className="cartao-valor capturado">{formatarValor(mesAtual)}</p>
          <p className={varCaptura?.tom === "alerta" ? "cartao-nota texto-alerta" : "cartao-nota"}>
            {varCaptura?.texto ?? "sem captura confirmada no período"}
          </p>
        </div>
        {retornoEmAberto > 0 && (
          <div className="cartao">
            <p className="olho">Retorno em análise</p>
            <p className="cartao-valor teto">{formatarValor(retornoEmAberto)}</p>
            <p className="cartao-nota">
              {oportunidadesAbertas} oportunidade(s) aberta(s) · resultado mensal estimado
              {investimentoEmAberto > 0
                ? ` · ${formatarValor(investimentoEmAberto)} de investimento`
                : ""}
            </p>
          </div>
        )}
        <div className="cartao">
          <p className="olho">Potencial estimado (captura)</p>
          <p className="cartao-valor teto">{formatarValor(potencialTotal)}</p>
          <p className="cartao-nota">
            {tg.frentes} frentes e {tg.contas} contas
            {protecaoTotal > 0 ? ` · ${formatarValor(protecaoTotal)} em proteção, fora do teto` : ""}
          </p>
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
                {emAndamento > 0 && (
                  <>
                    {" "}
                    <strong>{emAndamento} ainda em andamento</strong> — o score já é calculado a
                    partir das respostas registradas, mas só vira resultado publicado quando a
                    avaliação for concluída em <Link href="/maturidade">Maturidade</Link>.
                  </>
                )}
              </p>
            </>
          )}
        </section>

        <section className="painel">
          <div className="linha-titulo">
            <h2>Oportunidades por fase</h2>
            <Link className="link-acao" href="/oportunidades/quadro">
              Ver no quadro
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
          <Link className="link-acao" href="/pendencias">
            Ver pendências <ArrowRight size={12} />
          </Link>
        </div>

        {grupos.length === 0 ? (
          <Vazio>
            Nada fora do trilho. Contratos, compromissos e frentes estão dentro do prazo.
          </Vazio>
        ) : (
          <ul className="lista-estado">
            {grupos.map((g) => (
              <li key={g.chave}>
                <span className="rotulo">
                  <Link href={g.link}>{g.titulo}</Link>
                  <span className="dica">{g.nota}</span>
                </span>
                <span className={g.grave ? "selo selo-falta" : "selo selo-neutro"}>
                  {g.quantidade}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
