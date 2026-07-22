import Link from "next/link";
import { exigirOrg, podeAdministrar } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { PAPEIS, rotuloPapel, type Papel } from "@/lib/tipos";
import { listarCarteiras } from "@/lib/carteiras";
import { formatarData, listarContas } from "@/lib/contas";
import { classeSelo, listarContratos, urgencia } from "@/lib/contratos";
import { vincularMembro } from "@/app/acoes/organizacoes";
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

  const [pessoas, carteiras, contas, contratos] = await Promise.all([
    pessoasDaOrg(org.orgId),
    listarCarteiras(org.orgId),
    listarContas({ orgId: org.orgId }),
    listarContratos({ orgId: org.orgId }),
  ]);

  const administra = podeAdministrar(org.papel);
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
      <p className="olho">{org.nome}</p>
      <h1>Painel</h1>

      <IntroSecao>
        Você está como <strong>{rotuloPapel(org.papel).toLowerCase()}</strong>. Esta tela reúne o
        que precisa de atenção agora e quem tem acesso à organização.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <PrimeirosPassos passos={passos} />

      <section className={urgentes.length ? "painel painel-alerta" : "painel"}>
        <div className="linha-titulo">
          <h2>Precisa de atenção</h2>
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

        {administra && (
          <form action={vincularMembro} className="formulario formulario-linha" style={{ marginTop: 20 }}>
            <input type="hidden" name="org_id" value={org.orgId} />
            <label className="campo">
              <span>E-mail</span>
              <input type="email" name="email" required />
            </label>
            <label className="campo">
              <span>Alcance</span>
              <select name="papel" defaultValue="analista">
                {PAPEIS.filter((p) => p.valor !== "owner").map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo} — {p.explicacao}
                  </option>
                ))}
              </select>
            </label>
            <button className="botao" type="submit">
              Incluir
            </button>
            <p className="nota" style={{ flexBasis: "100%", marginTop: 4 }}>
              A pessoa precisa ter criado o acesso antes, com o mesmo e-mail.
            </p>
          </form>
        )}
      </section>
    </>
  );
}
