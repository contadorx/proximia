import Link from "next/link";
import { Plus, UserPlus } from "lucide-react";
import { exigirOrg, podeAdministrar, podeEscrever } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { PAPEIS, rotuloPapel, type Papel } from "@/lib/tipos";
import { listarFrentes, tiposDeFrente } from "@/lib/frentes";
import { vincularMembro } from "@/app/acoes/organizacoes";
import { criarTipoFrente } from "@/app/acoes/frentes";
import { criarTipoOportunidade } from "@/app/acoes/oportunidades";
import { listarOportunidades, tiposDeOportunidade } from "@/lib/oportunidades";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";

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

export default async function PaginaConfiguracoes({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const [pessoas, tipos, frentes, tiposOportunidade, oportunidades] = await Promise.all([
    pessoasDaOrg(org.orgId),
    tiposDeFrente(org.orgId),
    listarFrentes({ orgId: org.orgId }),
    tiposDeOportunidade(org.orgId),
    listarOportunidades({ orgId: org.orgId }),
  ]);

  const administra = podeAdministrar(org.papel);
  const gereCatalogo = podeEscrever(org.papel) && org.papel !== "ponto_focal";

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Configurações</h1>
        </div>
      </div>

      <IntroSecao>
        Tudo o que é ajuste da operação fica aqui: <strong>quem tem acesso e com qual alcance</strong>,
        os tipos de frente que a sua equipe usa e os dados da organização. O resto das telas fica só
        com o trabalho do dia.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <section className="painel">
        <div className="linha-titulo">
          <h2>Pessoas e alcance</h2>
          {administra && (
            <Modal
              rotulo="Incluir pessoa"
              titulo="Incluir pessoa na organização"
              descricao="A pessoa precisa ter criado o acesso antes, com o mesmo e-mail."
              icone={<UserPlus size={15} />}
            >
              <form action={vincularMembro} className="formulario">
                <input type="hidden" name="org_id" value={org.orgId} />
                <label className="campo">
                  <span>E-mail</span>
                  <input type="email" name="email" required autoFocus />
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
                <button className="botao botao-primario" type="submit">
                  Incluir
                </button>
              </form>
            </Modal>
          )}
        </div>

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
          Ponto focal enxerga apenas as carteiras em que estiver vinculado — o vínculo é feito na
          ficha de cada <Link href="/carteiras">carteira</Link>.
        </p>
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Tipos de frente</h2>
          {gereCatalogo && (
            <Modal
              rotulo="Novo tipo"
              titulo="Novo tipo de frente"
              descricao="Cadastre os temas que se repetem entre carteiras, para poder comparar depois."
              icone={<Plus size={15} />}
            >
              <form action={criarTipoFrente} className="formulario">
                <label className="campo">
                  <span>Nome</span>
                  <input type="text" name="nome" required maxLength={80} autoFocus />
                </label>
                <label className="campo">
                  <span>Descrição</span>
                  <input type="text" name="descricao" maxLength={160} placeholder="opcional" />
                </label>
                <button className="botao botao-primario" type="submit">
                  Incluir tipo
                </button>
              </form>
            </Modal>
          )}
        </div>

        {tipos.length === 0 ? (
          <Vazio>
            Nenhum tipo cadastrado. Nada vem pronto no produto: o catálogo é do vocabulário da sua
            operação.
          </Vazio>
        ) : (
          <ul className="lista-estado">
            {tipos.map((t) => (
              <li key={t.id}>
                <span className="rotulo">
                  {t.nome}
                  {t.descricao && <span className="dica">{t.descricao}</span>}
                </span>
                <span className="selo selo-neutro">
                  {frentes.filter((f) => f.catalogo_id === t.id).length} em uso
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Tipos de oportunidade</h2>
          {gereCatalogo && (
            <Modal
              rotulo="Novo tipo"
              titulo="Novo tipo de oportunidade"
              descricao="Ex.: expansão, novo serviço, substituição de equipamento."
              icone={<Plus size={15} />}
            >
              <form action={criarTipoOportunidade} className="formulario">
                <label className="campo">
                  <span>Nome</span>
                  <input type="text" name="nome" required maxLength={80} autoFocus />
                </label>
                <label className="campo">
                  <span>Descrição</span>
                  <input type="text" name="descricao" maxLength={160} placeholder="opcional" />
                </label>
                <button className="botao botao-primario" type="submit">
                  Incluir tipo
                </button>
              </form>
            </Modal>
          )}
        </div>

        {tiposOportunidade.length === 0 ? (
          <Vazio>Nenhum tipo cadastrado ainda.</Vazio>
        ) : (
          <ul className="lista-estado">
            {tiposOportunidade.map((t) => (
              <li key={t.id}>
                <span className="rotulo">
                  {t.nome}
                  {t.descricao && <span className="dica">{t.descricao}</span>}
                </span>
                <span className="selo selo-neutro">
                  {oportunidades.filter((o) => o.catalogo_id === t.id).length} em uso
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="painel">
        <h2>Organização</h2>
        <div className="grade-prazos">
          <div>
            <p className="olho">Nome</p>
            <p className="destaque-dado">{org.nome}</p>
          </div>
          <div>
            <p className="olho">Identificador</p>
            <p className="destaque-dado dado">{org.slug}</p>
          </div>
          <div>
            <p className="olho">Seu alcance</p>
            <p className="destaque-dado">{rotuloPapel(org.papel)}</p>
          </div>
          <div>
            <p className="olho">Dados</p>
            <p className="destaque-dado" style={{ fontSize: 14 }}>
              <Link href="/importacao">Importar por CSV</Link>
            </p>
          </div>
        </div>
      </section>

      <section className="painel">
        <h2>Diagnóstico</h2>
        <p className="nota">
          Se algo parar de responder, a página de <Link href="/diagnostico">diagnóstico</Link> testa
          configuração, conexão, sessão e banco de dados, e aponta qual item falhou.
        </p>
      </section>
    </>
  );
}
