import Link from "next/link";
import { Plus, Tags } from "lucide-react";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { classificacoes, porGrupo } from "@/lib/classificacoes";
import { criarClassificacao, excluirClassificacao } from "@/app/acoes/classificacoes";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { BotaoExcluir } from "@/components/botao-excluir";

export const dynamic = "force-dynamic";

export default async function PaginaClassificacoes({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const lista = await classificacoes(org.orgId);
  const grupos = porGrupo(lista);
  const gere = podeEscrever(org.papel) && org.papel !== "ponto_focal";

  return (
    <>
      <p className="olho">
        <Link href="/configuracoes">Configurações</Link> · {org.nome}
      </p>

      <div className="cabeca-pagina">
        <div>
          <h1>Classificações de conta</h1>
        </div>
        {gere && (
          <div className="cabeca-acoes">
            <Modal
              rotulo="Nova classificação"
              titulo="Nova classificação"
              descricao="O grupo é a pergunta; o valor é a resposta."
              icone={<Plus size={15} />}
            >
              <form action={criarClassificacao} className="formulario">
                <div className="formulario-linha">
                  <label className="campo">
                    <span>Grupo</span>
                    <input
                      type="text"
                      name="grupo"
                      required
                      maxLength={60}
                      autoFocus
                      placeholder="Ramo"
                      list="grupos-existentes"
                    />
                    <datalist id="grupos-existentes">
                      {grupos.map((g) => (
                        <option key={g.grupo} value={g.grupo} />
                      ))}
                    </datalist>
                    <small>Ex.: Ramo, Natureza, Porte, Regime.</small>
                  </label>
                  <label className="campo">
                    <span>Valor</span>
                    <input
                      type="text"
                      name="valor"
                      required
                      maxLength={60}
                      placeholder="Indústria"
                    />
                  </label>
                  <label className="campo campo-numerico">
                    <span>Ordem</span>
                    <input type="number" name="ordem" defaultValue={1} />
                  </label>
                </div>
                <label className="campo">
                  <span>Descrição</span>
                  <input type="text" name="descricao" maxLength={160} placeholder="opcional" />
                </label>
                <button className="botao botao-primario" type="submit">
                  Criar
                </button>
              </form>
            </Modal>
          </div>
        )}
      </div>

      <IntroSecao>
        Aqui você cria as dimensões pelas quais a sua operação enxerga as contas. O{" "}
        <strong>grupo</strong> é a pergunta — Ramo, Natureza, Porte —, e o <strong>valor</strong> é
        a resposta. Uma conta pode ter várias ao mesmo tempo, de grupos diferentes.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      {grupos.length === 0 ? (
        <Vazio>
          Nenhuma classificação cadastrada. Sem elas, a conta tem apenas o segmento em texto livre —
          que serve para ler, mas não para filtrar nem agrupar.
        </Vazio>
      ) : (
        grupos.map((g) => (
          <section className="painel" key={g.grupo}>
            <div className="linha-titulo">
              <h2>
                <Tags size={15} style={{ verticalAlign: "-2px", marginRight: 8, color: "var(--g400)" }} />
                {g.grupo}
              </h2>
              <span className="passos-contagem">{g.valores.length} valores</span>
            </div>
            <ul className="lista-estado">
              {g.valores.map((c) => (
                <li key={c.id}>
                  <span className="rotulo">
                    {c.valor}
                    {c.descricao && <span className="dica">{c.descricao}</span>}
                  </span>
                  {gere && (
                    <form action={excluirClassificacao}>
                      <input type="hidden" name="id" value={c.id} />
                      <BotaoExcluir compacto rotulo="Excluir" />
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <p className="nota">
        Por que não campos fixos: &ldquo;ramo&rdquo; e &ldquo;natureza&rdquo; parecem universais até
        o segundo assinante, que chama de outra coisa e precisa de uma terceira dimensão. Grupo e
        valor livres custam uma tela a mais e evitam uma migration por cliente.
      </p>
    </>
  );
}
