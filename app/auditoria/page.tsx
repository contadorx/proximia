import { ShieldCheck, Trash2 } from "lucide-react";
import { exigirOrg, podeAdministrar } from "@/lib/auth";
import { nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import {
  ACOES,
  classeAcao,
  descreverCampos,
  listarAuditoria,
  rotuloAcao,
  rotuloEntidadeAuditada,
  type Acao,
} from "@/lib/auditoria";
import { limparTrilha } from "@/app/acoes/auditoria";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { SeletorMultiplo } from "@/components/seletor";
import { Modal } from "@/components/modal";
import { paraLista, paraTexto } from "@/lib/consulta";

export const dynamic = "force-dynamic";

const JANELAS = [
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
  { valor: "90", rotulo: "Últimos 90 dias" },
  { valor: "0", rotulo: "Tudo o que estiver guardado" },
];

export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: {
    erro?: string;
    ok?: string;
    acao?: string | string[];
    pessoa?: string | string[];
    janela?: string | string[];
  };
}) {
  const org = await exigirOrg();

  // A RLS já barra quem não é administrador — a consulta voltaria vazia.
  // Dizer isso na tela é melhor do que mostrar uma lista vazia sem motivo.
  if (!podeAdministrar(org.papel)) {
    return (
      <>
        <div className="cabeca-pagina">
          <div>
            <p className="olho">{org.nome}</p>
            <h1>Registro de acesso</h1>
          </div>
        </div>
        <Vazio>
          A trilha de acesso é visível apenas para quem administra a organização. Seu perfil é{" "}
          {org.papel === "leitura_ampla" ? "de acompanhamento" : "de operação"}.
        </Vazio>
      </>
    );
  }

  const janela = paraTexto(searchParams.janela) ?? "30";
  const desde =
    janela === "0"
      ? undefined
      : new Date(Date.now() - Number(janela) * 86400000).toISOString();

  const [linhas, pessoas] = await Promise.all([
    listarAuditoria({
      orgId: org.orgId,
      acoes: paraLista(searchParams.acao),
      pessoas: paraLista(searchParams.pessoa),
      desde,
    }),
    pessoasDaOrganizacao(org.orgId),
  ]);

  const quem = (linha: { user_id: string | null; origem: string }) => {
    if (linha.origem === "portal") return "visitante do portal";
    if (linha.origem === "rotina") return "rotina do sistema";
    if (!linha.user_id) return "sistema";
    return nomePessoa(pessoas.find((p) => p.id === linha.user_id));
  };

  const momento = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const porAcao = (a: Acao) => linhas.filter((l) => l.acao === a).length;
  const exclusoes = porAcao("excluiu");
  const leituras = linhas.filter((l) => ["leu", "baixou", "exportou", "abriu_portal"].includes(l.acao)).length;

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Registro de acesso</h1>
        </div>
        <div className="cabeca-acoes">
          <Modal
            rotulo="Descartar antigos"
            titulo="Descartar o que passou do prazo"
            descricao="Trilha que cresce para sempre vira passivo. Quem administra define o prazo."
            variante="secundario"
            icone={<Trash2 size={15} />}
          >
            <form action={limparTrilha} className="formulario">
              <label className="campo">
                <span>Guardar os últimos</span>
                <select name="dias" defaultValue="365">
                  <option value="90">90 dias</option>
                  <option value="180">180 dias</option>
                  <option value="365">365 dias</option>
                  <option value="730">730 dias</option>
                </select>
                <small>
                  Tudo mais antigo é descartado. O descarte em si fica registrado — inclusive quem o
                  fez.
                </small>
              </label>
              <div className="acoes-rodape">
                <button className="botao botao-perigo" type="submit">
                  Descartar
                </button>
              </div>
            </form>
          </Modal>
        </div>
      </div>

      <IntroSecao>
        Quem alterou o quê, quando, e quem abriu o que não é seu. A trilha{" "}
        <strong>só aceita acréscimo</strong>: não há como editar nem apagar linha — nem por aqui,
        nem por quem administra. Ela guarda o nome dos campos tocados, nunca o conteúdo anterior:
        registro de acesso não é uma segunda cópia dos dados.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      {linhas.length > 0 && (
        <div className="cartoes">
          <div className="cartao">
            <p className="olho">Eventos no período</p>
            <p className="cartao-valor">{linhas.length}</p>
          </div>
          <div className="cartao">
            <p className="olho">Alterações</p>
            <p className="cartao-valor">{porAcao("alterou")}</p>
          </div>
          <div className="cartao">
            <p className="olho">Exclusões</p>
            <p className={exclusoes ? "cartao-valor alerta" : "cartao-valor"}>{exclusoes}</p>
            <p className="cartao-nota">o que não volta</p>
          </div>
          <div className="cartao">
            <p className="olho">Leituras e downloads</p>
            <p className="cartao-valor">{leituras}</p>
          </div>
        </div>
      )}

      <form className="filtros" method="get">
        <SeletorMultiplo
          nome="pessoa"
          rotulo="Pessoa"
          opcoes={pessoas.map((p) => ({ valor: p.id, rotulo: nomePessoa(p) }))}
          inicial={paraLista(searchParams.pessoa)}
        />
        <SeletorMultiplo
          nome="acao"
          rotulo="Ação"
          opcoes={ACOES.map((a) => ({ valor: a.valor, rotulo: a.rotulo }))}
          inicial={paraLista(searchParams.acao)}
        />
        <label className="campo">
          <span>Período</span>
          <select name="janela" defaultValue={janela}>
            {JANELAS.map((j) => (
              <option key={j.valor} value={j.valor}>
                {j.rotulo}
              </option>
            ))}
          </select>
        </label>
        <button className="botao botao-secundario" type="submit">
          Filtrar
        </button>
      </form>

      {linhas.length === 0 ? (
        <Vazio>
          Nada registrado neste recorte. Se a trilha estiver vazia por completo, confira se a
          migration <span className="dado">0016_auditoria.sql</span> foi aplicada — o registro só
          começa a valer a partir dela, e não alcança o que aconteceu antes.
        </Vazio>
      ) : (
        <section className="painel">
          <div className="tabela-rolagem">
            <table className="tabela-panorama">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>Ação</th>
                  <th>Sobre</th>
                  <th>O que mudou</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const mudou = descreverCampos(l.campos);
                  return (
                    <tr key={l.id}>
                      <td className="dado">{momento(l.criado_em)}</td>
                      <td>{quem(l)}</td>
                      <td>
                        <span className={classeAcao(l.acao)}>{rotuloAcao(l.acao)}</span>
                      </td>
                      <td>
                        {rotuloEntidadeAuditada(l.entidade_tipo)}
                        {l.resumo && <span className="celula-sub">{l.resumo}</span>}
                      </td>
                      <td>{mudou || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="nota">
        <ShieldCheck size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Histórico e compromissos automáticos ficam de fora de propósito: o histórico já nasce com
        autor e versão, e o compromisso automático é gerado aos montes por gatilho — auditar os dois
        enterraria o que importa.
      </p>
    </>
  );
}
