import Link from "next/link";
import { BellRing, RefreshCw } from "lucide-react";
import { exigirOrg, exigirUsuario, podeEscrever } from "@/lib/auth";
import { listarCarteiras, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { formatarData } from "@/lib/contas";
import { LIMITE_ALERTAS, ROTULO_TIPO, classeSeveridade, listarAlertas } from "@/lib/alertas";
import { caminhoEntidade } from "@/lib/registros";
import { reabrirAlerta, silenciarAlerta, varrerAgora } from "@/app/acoes/alertas";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Seletor, SeletorMultiplo } from "@/components/seletor";
import { Modal } from "@/components/modal";
import { BotaoEnviar } from "@/components/botao-enviar";
import { reatribuirAlerta } from "@/app/acoes/responsabilidades";
import { UserCog } from "lucide-react";
import { paraLista, paraTexto } from "@/lib/consulta";

export const dynamic = "force-dynamic";

const SEVERIDADES = [
  { valor: "alta", rotulo: "Alta" },
  { valor: "atencao", rotulo: "Atenção" },
  { valor: "informativa", rotulo: "Informativa" },
];

export default async function PaginaAlertas({
  searchParams,
}: {
  searchParams: {
    erro?: string;
    ok?: string;
    status?: string | string[];
    carteira?: string | string[];
    severidade?: string | string[];
    de?: string | string[];
  };
}) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();
  const status = paraTexto(searchParams.status) ?? "aberto";

  const [todos, carteiras, pessoas] = await Promise.all([
    listarAlertas({
      orgId: org.orgId,
      status,
      carteiras: paraLista(searchParams.carteira),
      severidades: paraLista(searchParams.severidade),
    }),
    listarCarteiras(org.orgId),
    pessoasDaOrganizacao(org.orgId),
  ]);

  // Três lentes sobre a mesma lista: o que é meu para resolver, o que eu
  // acompanho, e tudo. Sem isso, alerta vira mural que ninguém sente como
  // obrigação.
  const de = paraTexto(searchParams.de) ?? "todos";
  const alertas = todos.filter((a) => {
    if (de === "meus") return a.dono_id === usuario.id;
    if (de === "acompanho") return (a.observadores ?? []).includes(usuario.id);
    return true;
  });
  const meus = todos.filter((a) => a.dono_id === usuario.id).length;
  const acompanho = todos.filter((a) => (a.observadores ?? []).includes(usuario.id)).length;
  const semDono = todos.filter((a) => !a.dono_id).length;

  const editavel = podeEscrever(org.papel);
  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";
  const porSeveridade = (s: string) => alertas.filter((a) => a.severidade === s).length;

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Alertas</h1>
        </div>
        {editavel && (
          <div className="cabeca-acoes">
            <form action={varrerAgora}>
              <BotaoEnviar variante="secundario" rotuloEnviando="Varrendo…">
                <RefreshCw size={15} />
                Varrer agora
              </BotaoEnviar>
            </form>
          </div>
        )}
      </div>

      <IntroSecao>
        Uma vez por dia o sistema varre a operação e abre alerta para o que saiu do trilho — contrato
        vencido, janela aberta, compromisso atrasado, carteira ou frente sem movimento, oportunidade
        parada na mesma fase. <strong>Alerta some sozinho quando a causa some</strong>, e o que você
        silenciar não volta a insistir enquanto a situação for a mesma.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      {status === "aberto" && alertas.length > 0 && (
        <div className="cartoes">
          <div className="cartao">
            <p className="olho">Alta</p>
            <p className={porSeveridade("alta") ? "cartao-valor alerta" : "cartao-valor"}>
              {porSeveridade("alta")}
            </p>
            <p className="cartao-nota">prazo perdido ou a perder</p>
          </div>
          <div className="cartao">
            <p className="olho">Atenção</p>
            <p className="cartao-valor">{porSeveridade("atencao")}</p>
            <p className="cartao-nota">parado ou perto do limite</p>
          </div>
          <div className="cartao">
            <p className="olho">Informativa</p>
            <p className="cartao-valor">{porSeveridade("informativa")}</p>
            <p className="cartao-nota">vale olhar, sem urgência</p>
          </div>
          <div className="cartao">
            <p className="olho">Meus</p>
            <p className="cartao-valor">{meus}</p>
            <p className="cartao-nota">
              {acompanho > 0 ? `${acompanho} que eu acompanho` : "nenhum acompanhamento"}
            </p>
          </div>
        </div>
      )}

      <form className="filtros" method="get">
        <SeletorMultiplo
          nome="carteira"
          rotulo="Carteira"
          opcoes={carteiras.map((c) => ({
            valor: c.id,
            rotulo: c.nome,
            detalhe: c.codigo ?? undefined,
          }))}
          inicial={paraLista(searchParams.carteira)}
        />
        <SeletorMultiplo
          nome="severidade"
          rotulo="Severidade"
          opcoes={SEVERIDADES}
          inicial={paraLista(searchParams.severidade)}
        />
        <label className="campo">
          <span>De quem</span>
          <select name="de" defaultValue={de}>
            <option value="todos">Todos</option>
            <option value="meus">Meus</option>
            <option value="acompanho">Que eu acompanho</option>
          </select>
        </label>
        <label className="campo">
          <span>Situação</span>
          <select name="status" defaultValue={status}>
            <option value="aberto">Em aberto</option>
            <option value="silenciado">Silenciados</option>
            <option value="resolvido">Resolvidos</option>
          </select>
        </label>
        <button className="botao botao-secundario" type="submit">
          Filtrar
        </button>
      </form>

      {alertas.length === 0 ? (
        <Vazio>
          {status === "aberto"
            ? "Nada fora do trilho. Contratos, compromissos e frentes estão dentro do prazo."
            : "Nenhum alerta nesta situação."}
        </Vazio>
      ) : (
        <section className="painel">
          <ul className="lista-estado">
            {alertas.map((a) => (
              <li key={a.id}>
                <span className="rotulo">
                  {a.entidade_tipo && a.entidade_id ? (
                    <Link href={caminhoEntidade(a.entidade_tipo, a.entidade_id)}>{a.titulo}</Link>
                  ) : (
                    a.titulo
                  )}
                  <span className="dica">
                    {[
                      ROTULO_TIPO[a.tipo],
                      nomeCarteira(a.carteira_id),
                      a.dono_id
                        ? `responde: ${nomePessoa(pessoas.find((p) => p.id === a.dono_id))}`
                        : "sem responsável",
                      (a.observadores ?? []).includes(usuario.id) && a.dono_id !== usuario.id
                        ? "você acompanha"
                        : null,
                      a.detalhe,
                      `desde ${formatarData(a.criado_em.slice(0, 10))}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className={classeSeveridade(a.severidade)}>
                  {a.severidade === "alta"
                    ? "Alta"
                    : a.severidade === "atencao"
                      ? "Atenção"
                      : "Informativa"}
                </span>
                {editavel && a.status === "aberto" && (
                  <Modal
                    rotulo="Reatribuir"
                    titulo="Quem responde por este alerta"
                    descricao="Os demais responsáveis pela carteira continuam acompanhando."
                    variante="link"
                    icone={<UserCog size={13} />}
                  >
                    <form action={reatribuirAlerta} className="formulario">
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="volta" value="/alertas" />
                      <Seletor
                        nome="dono_id"
                        rotulo="Responsável"
                        opcoes={pessoas.map((p) => ({ valor: p.id, rotulo: nomePessoa(p) }))}
                        inicial={a.dono_id ?? ""}
                        vazio="Sem responsável"
                      />
                      <BotaoEnviar>Salvar</BotaoEnviar>
                    </form>
                  </Modal>
                )}
                {editavel && a.status === "aberto" && (
                  <form action={silenciarAlerta}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="volta" value="/alertas" />
                    <button className="link-acao" type="submit">
                      Silenciar
                    </button>
                  </form>
                )}
                {editavel && a.status === "silenciado" && (
                  <form action={reabrirAlerta}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="volta" value="/alertas" />
                    <button className="link-acao" type="submit">
                      Reabrir
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {todos.length >= LIMITE_ALERTAS && (
            <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
              Mostrando os {LIMITE_ALERTAS} mais recentes. Filtre por carteira ou severidade para
              ver o restante.
            </p>
          )}
        </section>
      )}

      <p className="nota">
        <BellRing size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        {semDono > 0 && (
          <>
            <strong>{semDono} alerta(s) sem responsável.</strong> Defina quem responde pela carteira
            em Carteiras › Quem responde, e a atribuição passa a acontecer sozinha.{" "}
          </>
        )}
        Os limites de tempo — 30 dias para carteira parada, 45 para frente, 60 para oportunidade —
        são os padrões. Se quiser outros, dá para ajustar sem mexer no produto.
      </p>
    </>
  );
}
