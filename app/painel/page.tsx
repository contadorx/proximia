import Link from "next/link";
import { exigirOrg } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { rotuloPapel, type Papel } from "@/lib/tipos";
import { listarCarteiras } from "@/lib/carteiras";
import { formatarData, listarContas } from "@/lib/contas";
import { classeSelo, listarContratos, urgencia } from "@/lib/contratos";
import { classeStatus, listarFrentes, rotuloStatus, totais } from "@/lib/frentes";
import {
  classeSituacao,
  listarCompromissos,
  precisaAtencao,
  situacao,
} from "@/lib/compromissos";
import { caminhoEntidade } from "@/lib/registros";
import { mudarStatusCompromisso } from "@/app/acoes/compromissos";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { PrimeirosPassos, type Passo } from "@/components/primeiros-passos";

export const dynamic = "force-dynamic";

type Pessoa = { user_id: string; papel: Papel; nome: string | null; email: string | null };

async function pessoasDaOrg(orgId: string): Promise<Pessoa[]> {
  const supabase = criarClienteServidor();

  const { data: vinculos } = await supabase
    .from("memberships")
    .select("user_id, papel")
    .eq("org_id", orgId)
    .eq("ativo", true);

  if (!vinculos?.length) return [];

  const { data: perfis } = await supabase
    .from("perfis")
    .select("id, nome, email")
    .in(
      "id",
      vinculos.map((v) => v.user_id as string),
    );

  const porId = new Map((perfis ?? []).map((p) => [p.id as string, p]));

  return vinculos.map((v) => {
    const perfil = porId.get(v.user_id as string);
    return {
      user_id: v.user_id as string,
      papel: v.papel as Papel,
      nome: (perfil?.nome as string) ?? null,
      email: (perfil?.email as string) ?? null,
    };
  });
}

export default async function PaginaPainel({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();

  const [pessoas, carteiras, contas, contratos, frentes, compromissos] = await Promise.all([
    pessoasDaOrg(org.orgId),
    listarCarteiras(org.orgId),
    listarContas({ orgId: org.orgId }),
    listarContratos({ orgId: org.orgId }),
    listarFrentes({ orgId: org.orgId }),
    listarCompromissos({ orgId: org.orgId, status: "aberto" }),
  ]);

  const compromissosAtencao = compromissos.filter(precisaAtencao).slice(0, 8);

  const emAndamento = frentes
    .filter((f) => f.status === "em_execucao" || f.status === "em_analise")
    .slice(0, 6);
  const totalFrentes = totais(frentes);
  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";

  const urgentes = contratos
    .map((c) => ({ contrato: c, u: urgencia(c) }))
    .filter((x) => x.u.chave === "vencido" || x.u.chave === "janela")
    .slice(0, 6);

  const nomeConta = (id: string) => contas.find((c) => c.id === id)?.nome ?? "conta removida";

  // Detecção real: cada etapa fica marcada porque o dado existe.
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
      chave: "frente",
      titulo: "Registre as frentes em andamento",
      descricao: "Uma linha por tema de volume, com dono e próxima etapa — é o que responde \u201Co que está rodando?\u201D.",
      cta: "Criar frente",
      href: "/frentes",
      feito: frentes.length > 0,
    },
    {
      chave: "clausula",
      titulo: "Marque o que precisa ser acompanhado",
      descricao: "Cláusula monitorada com data de referência é o que vira aviso.",
      cta: "Abrir contratos",
      href: "/contratos",
      feito: contratos.some((c) => c.janela_renegociacao !== null),
      opcional: true,
    },
    {
      chave: "equipe",
      titulo: "Inclua quem acompanha com você",
      descricao: "A gestão entra como acompanhamento: vê tudo, não altera nada.",
      cta: "Incluir pessoa",
      href: "/painel",
      feito: pessoas.length > 1,
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
        Você está como <strong>{rotuloPapel(org.papel).toLowerCase()}</strong>. Esta tela reúne o
        que precisa de atenção agora e quem tem acesso à organização.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <PrimeirosPassos passos={passos} />

      <section className={compromissosAtencao.length ? "painel painel-alerta" : "painel"}>
        <div className="linha-titulo">
          <h2>Compromissos do período</h2>
          {compromissos.length > 0 && (
            <Link className="link-acao" href="/compromissos">
              Ver todos
            </Link>
          )}
        </div>

        {compromissosAtencao.length === 0 ? (
          <Vazio>
            {compromissos.length === 0
              ? "Nenhum compromisso em aberto. Contratos com vigência geram os seus sozinhos."
              : "Nada vencido nem vencendo nos próximos dias."}
          </Vazio>
        ) : (
          <ul className="lista-estado">
            {compromissosAtencao.map((c) => {
              const s = situacao(c);
              return (
                <li key={c.id}>
                  <span className="rotulo">
                    <Link href={caminhoEntidade(c.entidade_tipo, c.entidade_id)}>{c.titulo}</Link>
                    <span className="dica">
                      {formatarData(c.vence_em)} · {s.detalhe} ·{" "}
                      {nomeCarteira(c.carteira_id)}
                    </span>
                  </span>
                  <span className={classeSituacao(s.tom)}>{s.rotulo}</span>
                  <form action={mudarStatusCompromisso}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="status" value="concluido" />
                    <input type="hidden" name="volta" value="/painel" />
                    <button className="link-acao" type="submit">
                      Concluir
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={urgentes.length ? "painel painel-alerta" : "painel"}>
        <div className="linha-titulo">
          <h2>Contratos que precisam de atenção</h2>
          {contratos.length > 0 && (
            <Link className="link-acao" href="/contratos">
              Ver todos os contratos
            </Link>
          )}
        </div>

        {urgentes.length === 0 ? (
          <Vazio>
            {contratos.length === 0
              ? "Nenhum contrato registrado ainda. Quando houver, os prazos vencidos e as janelas abertas aparecem aqui."
              : "Nenhum contrato vencido nem com janela aberta. O que estava combinado está em dia."}
          </Vazio>
        ) : (
          <ul className="lista-estado">
            {urgentes.map(({ contrato, u }) => (
              <li key={contrato.id}>
                <span className="rotulo">
                  <Link href={`/contratos/${contrato.id}`}>
                    {contrato.numero ? `${contrato.numero} · ` : ""}
                    {nomeConta(contrato.conta_id)}
                  </Link>
                  <span className="dica">
                    {contrato.fim ? `vence ${formatarData(contrato.fim)} · ` : ""}
                    {u.detalhe}
                  </span>
                </span>
                <span className={classeSelo(u.tom)}>{u.rotulo}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Em andamento</h2>
          {frentes.length > 0 && (
            <Link className="link-acao" href="/frentes">
              Ver todas as frentes
            </Link>
          )}
        </div>

        {emAndamento.length === 0 ? (
          <Vazio>
            Nenhuma frente em análise ou execução. Quando houver, aparece aqui quem conduz e qual é
            a próxima etapa.
          </Vazio>
        ) : (
          <>
            <ul className="lista-estado">
              {emAndamento.map((f) => (
                <li key={f.id}>
                  <span className="rotulo">
                    <Link href={`/frentes/${f.id}`}>{f.titulo}</Link>
                    <span className="dica">
                      {[
                        nomeCarteira(f.carteira_id),
                        f.qtd_casos !== null ? `${f.qtd_casos.toLocaleString("pt-BR")} casos` : null,
                        f.proxima_etapa,
                        f.prazo ? `prazo ${formatarData(f.prazo)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className={classeStatus(f.status)}>{rotuloStatus(f.status)}</span>
                </li>
              ))}
            </ul>
            <p className="nota" style={{ marginTop: 14 }}>
              {totalFrentes.ativas} frentes em aberto representando{" "}
              <span className="dado">{totalFrentes.casos.toLocaleString("pt-BR")}</span> casos.
            </p>
          </>
        )}
      </section>

      <section className="painel">
        <h2>Pessoas com acesso</h2>
        <ul className="lista-estado">
          {pessoas.map((p) => (
            <li key={p.user_id}>
              <span className="rotulo">
                {p.nome ?? p.email ?? "Pessoa sem perfil"}
                {p.email && p.nome && <span className="dica">{p.email}</span>}
              </span>
              <span className="selo selo-neutro">{rotuloPapel(p.papel)}</span>
            </li>
          ))}
        </ul>

        <p className="nota" style={{ marginTop: 16, marginBottom: 0 }}>
          Alcance e inclusão de pessoas ficam em <Link href="/configuracoes">configurações</Link>.
        </p>
      </section>
    </>
  );
}
