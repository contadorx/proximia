import Link from "next/link";
import { Plus, RefreshCw, Search, UserCog, Users } from "lucide-react";
import { exigirOrg, exigirUsuario, podeEscrever } from "@/lib/auth";
import { listarCarteiras, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { formatarData } from "@/lib/contas";
import {
  classeSituacao,
  listarCompromissos,
  rotuloOrigem,
  situacao,
  type Compromisso,
} from "@/lib/compromissos";
import { carteirasDaPessoa } from "@/lib/responsabilidades";
import { alvosDisponiveis, mapaDeNomes, rotuloTipo } from "@/lib/alvos";
import { caminhoEntidade } from "@/lib/registros";
import {
  criarCompromisso,
  distribuirCompromissos,
  gerarCompromissosPendentes,
  mudarStatusCompromisso,
  reatribuirCompromisso,
} from "@/app/acoes/compromissos";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { Seletor, SeletorMultiplo } from "@/components/seletor";
import { paraLista, paraTexto, temFiltro } from "@/lib/consulta";

export const dynamic = "force-dynamic";

export default async function PaginaCompromissos({
  searchParams,
}: {
  searchParams: {
    erro?: string;
    ok?: string;
    carteira?: string | string[];
    dono?: string | string[];
    lente?: string | string[];
    tipo?: string | string[];
    alvo?: string | string[];
  };
}) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const [todos, carteiras, pessoas, minhasCarteiras, alvos] = await Promise.all([
    listarCompromissos({ orgId: org.orgId }),
    listarCarteiras(org.orgId),
    pessoasDaOrganizacao(org.orgId),
    carteirasDaPessoa(org.orgId, usuario.id),
    alvosDisponiveis(org.orgId),
  ]);

  const nomes = mapaDeNomes(alvos);
  const nomeAlvo = (tipo: string, id: string) => nomes.get(`${tipo}:${id}`);

  const editavel = podeEscrever(org.papel);
  const lente = paraTexto(searchParams.lente) ?? "todos";
  const filtroCarteiras = paraLista(searchParams.carteira);
  const filtroDonos = paraLista(searchParams.dono);
  const filtroTipos = paraLista(searchParams.tipo);
  const filtroAlvo = paraTexto(searchParams.alvo);

  // Carteiras que a pessoa carrega: onde ela responde por papel, mais as
  // que a têm como responsável na ficha.
  const minhas = new Set([
    ...minhasCarteiras,
    ...carteiras.filter((c) => c.responsavel_id === usuario.id).map((c) => c.id),
  ]);

  const filtrados = todos.filter((c) => {
    if (lente === "meus" && c.dono_id !== usuario.id) return false;
    if (lente === "unidade" && !minhas.has(c.carteira_id)) return false;
    if (filtroCarteiras.length && !filtroCarteiras.includes(c.carteira_id)) return false;
    if (filtroDonos.length && !filtroDonos.includes(c.dono_id ?? "")) return false;
    if (filtroTipos.length && !filtroTipos.includes(c.entidade_tipo)) return false;
    if (filtroAlvo && `${c.entidade_tipo}:${c.entidade_id}` !== filtroAlvo) return false;
    return true;
  });

  const abertos = filtrados.filter((c) => c.status === "aberto");
  const atrasados = abertos.filter((c) => situacao(c).chave === "vencido");
  const proximos = abertos.filter((c) => {
    const chave = situacao(c).chave;
    return chave === "hoje" || chave === "alerta";
  });
  const adiante = abertos.filter((c) => situacao(c).chave === "adiante");
  const concluidos = filtrados.filter((c) => c.status === "concluido").slice(0, 10);
  const semDono = todos.filter((c) => c.status === "aberto" && !c.dono_id).length;

  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";
  const nome = (id: string | null) =>
    id ? nomePessoa(pessoas.find((p) => p.id === id)) : "sem responsável";
  const hoje = new Date().toISOString().slice(0, 10);

  /* ---------- carga por pessoa ---------- */

  const carga = pessoas
    .map((p) => {
      const dele = todos.filter((c) => c.status === "aberto" && c.dono_id === p.id);
      return {
        id: p.id,
        nome: nomePessoa(p),
        abertos: dele.length,
        atrasados: dele.filter((c) => situacao(c).chave === "vencido").length,
        proximos: dele.filter((c) => {
          const chave = situacao(c).chave;
          return chave === "hoje" || chave === "alerta";
        }).length,
      };
    })
    .filter((p) => p.abertos > 0)
    .sort((a, b) => b.atrasados - a.atrasados || b.abertos - a.abertos);

  function Lista({ itens }: { itens: Compromisso[] }) {
    return (
      <ul className="lista-estado">
        {itens.map((c) => {
          const s = situacao(c);
          return (
            <li key={c.id}>
              <span className="rotulo">
                <Link href={caminhoEntidade(c.entidade_tipo, c.entidade_id)}>{c.titulo}</Link>
                <span className="dica">
                  {[
                    formatarData(c.vence_em),
                    s.detalhe,
                    // O que o compromisso trata vem antes de onde ele mora:
                    // "Alfa Indústria" diz mais que "Regional Norte".
                    nomeAlvo(c.entidade_tipo, c.entidade_id)
                      ? `${rotuloTipo(c.entidade_tipo)}: ${nomeAlvo(c.entidade_tipo, c.entidade_id)}`
                      : null,
                    nomeCarteira(c.carteira_id),
                    nome(c.dono_id),
                    c.origem !== "manual" ? rotuloOrigem(c.origem) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className={classeSituacao(s.tom)}>{s.rotulo}</span>

              {editavel && c.status === "aberto" && (
                <Modal
                  rotulo="Reatribuir"
                  titulo="Quem responde por este compromisso"
                  variante="link"
                  icone={<UserCog size={13} />}
                >
                  <form action={reatribuirCompromisso} className="formulario">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="volta" value="/compromissos" />
                    <Seletor
                      nome="dono_id"
                      rotulo="Responsável"
                      opcoes={pessoas.map((p) => ({ valor: p.id, rotulo: nomePessoa(p) }))}
                      inicial={c.dono_id ?? ""}
                      vazio="Sem responsável"
                    />
                    <button className="botao botao-primario" type="submit">
                      Salvar
                    </button>
                  </form>
                </Modal>
              )}

              {editavel && c.status === "aberto" && (
                <form action={mudarStatusCompromisso}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="status" value="concluido" />
                  <input type="hidden" name="volta" value="/compromissos" />
                  <button className="link-acao" type="submit">
                    Concluir
                  </button>
                </form>
              )}

              {editavel && c.status === "concluido" && (
                <form action={mudarStatusCompromisso}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="status" value="aberto" />
                  <input type="hidden" name="volta" value="/compromissos" />
                  <button className="link-acao" type="submit">
                    Reabrir
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Compromissos</h1>
        </div>
        <div className="cabeca-acoes">
          {editavel && carteiras.length > 0 && (
            <Modal
              rotulo="Novo compromisso"
              titulo="Novo compromisso"
              descricao="O que foi combinado vira data com dono."
              icone={<Plus size={15} />}
              largo
            >
              <form action={criarCompromisso} className="formulario">
                <input type="hidden" name="volta" value="/compromissos" />
                <div className="formulario-linha">
                  <label className="campo">
                    <span>O que precisa ser feito</span>
                    <input type="text" name="titulo" required maxLength={160} autoFocus />
                  </label>
                  <Seletor
                    nome="carteira_id"
                    rotulo="Carteira"
                    opcoes={carteiras.map((c) => ({
                      valor: c.id,
                      rotulo: c.nome,
                      detalhe: c.codigo ?? undefined,
                    }))}
                    vazio="Escolha a carteira"
                    obrigatorio
                  />
                </div>
                <div className="formulario-linha">
                  <Seletor
                    nome="alvo"
                    rotulo="Refere-se a"
                    opcoes={alvos.map((a) => ({
                      valor: a.valor,
                      rotulo: a.nome,
                      detalhe: a.rotuloTipo,
                    }))}
                    vazio="A carteira inteira"
                    ajuda="Uma conta, um contrato, uma frente — ou a carteira, se for geral."
                  />
                </div>
                <div className="formulario-linha">
                  <label className="campo">
                    <span>Data</span>
                    <input type="date" name="vence_em" required defaultValue={hoje} />
                  </label>
                  <Seletor
                    nome="dono_id"
                    rotulo="Dono"
                    opcoes={pessoas.map((p) => ({ valor: p.id, rotulo: nomePessoa(p) }))}
                    inicial={usuario.id}
                    vazio={null}
                    obrigatorio
                  />
                  <label className="campo campo-numerico">
                    <span>Avisar (dias antes)</span>
                    <input type="number" name="alerta_dias" min={0} max={365} defaultValue={7} />
                  </label>
                </div>
                <label className="campo">
                  <span>Detalhe</span>
                  <input type="text" name="descricao" maxLength={200} placeholder="opcional" />
                </label>
                <button className="botao botao-primario" type="submit">
                  Registrar compromisso
                </button>
              </form>
            </Modal>
          )}

          {editavel && semDono > 0 && (
            <form action={distribuirCompromissos}>
              <button className="botao botao-secundario" type="submit">
                <Users size={15} />
                Distribuir {semDono} sem dono
              </button>
            </form>
          )}

          {org.papel !== "ponto_focal" && editavel && (
            <Modal
              rotulo="Gerar pendentes"
              titulo="Gerar compromissos dos contratos"
              descricao="Contratos e cláusulas cadastrados antes desta função não passaram pela geração automática."
              variante="secundario"
              icone={<RefreshCw size={15} />}
            >
              <p className="nota">
                Rode uma vez para trazer os que faltam. Repetir não duplica nada — cada contrato e
                cada cláusula tem no máximo um compromisso automático.
              </p>
              <form action={gerarCompromissosPendentes}>
                <button className="botao botao-primario" type="submit">
                  Gerar os que faltam
                </button>
              </form>
            </Modal>
          )}
        </div>
      </div>

      <IntroSecao>
        O que foi combinado vira <strong>data com dono</strong>. Use as lentes para separar o que é
        seu, o que é da sua unidade e o que é da rede inteira — contrato e cláusula monitorada geram
        os seus compromissos sozinhos.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <div className="cartoes">
        <div className="cartao">
          <p className="olho">Atrasados</p>
          <p className={atrasados.length ? "cartao-valor alerta" : "cartao-valor"}>
            {atrasados.length}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Próximos dias</p>
          <p className="cartao-valor">{proximos.length}</p>
        </div>
        <div className="cartao">
          <p className="olho">Meus, em aberto</p>
          <p className="cartao-valor">
            {todos.filter((c) => c.status === "aberto" && c.dono_id === usuario.id).length}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Sem responsável</p>
          <p className={semDono ? "cartao-valor alerta" : "cartao-valor"}>{semDono}</p>
          <p className="cartao-nota">
            {semDono > 0 ? "compromisso sem dono é lembrete" : "todos têm dono"}
          </p>
        </div>
      </div>

      <form className="filtros" method="get">
        <label className="campo">
          <span>Lente</span>
          <select name="lente" defaultValue={lente}>
            <option value="todos">Todos</option>
            <option value="meus">Meus</option>
            <option value="unidade">Das minhas carteiras</option>
          </select>
        </label>
        <SeletorMultiplo
          nome="carteira"
          rotulo="Carteira"
          opcoes={carteiras.map((c) => ({
            valor: c.id,
            rotulo: c.nome,
            detalhe: c.codigo ?? undefined,
          }))}
          inicial={filtroCarteiras}
        />
        <SeletorMultiplo
          nome="tipo"
          rotulo="Refere-se a"
          opcoes={[
            { valor: "carteira", rotulo: "Carteira" },
            { valor: "conta", rotulo: "Conta" },
            { valor: "contrato", rotulo: "Contrato" },
            { valor: "frente", rotulo: "Frente" },
            { valor: "oportunidade", rotulo: "Oportunidade" },
          ]}
          inicial={filtroTipos}
          rotuloTodas="Tudo"
        />
        <Seletor
          nome="alvo"
          rotulo="Registro específico"
          opcoes={alvos.map((a) => ({
            valor: a.valor,
            rotulo: a.nome,
            detalhe: a.rotuloTipo,
          }))}
          inicial={filtroAlvo ?? ""}
          vazio="Qualquer um"
        />
        <SeletorMultiplo
          nome="dono"
          rotulo="Responsável"
          opcoes={pessoas.map((p) => ({ valor: p.id, rotulo: nomePessoa(p) }))}
          inicial={filtroDonos}
        />
        <button className="botao botao-secundario" type="submit">
          <Search size={14} />
          Filtrar
        </button>
        {(temFiltro(searchParams.carteira, searchParams.dono, searchParams.tipo, searchParams.alvo) ||
          lente !== "todos") && (
          <Link className="link-acao" href="/compromissos">
            Limpar
          </Link>
        )}
      </form>

      {atrasados.length > 0 && (
        <section className="painel painel-alerta">
          <h2>Atrasados</h2>
          <Lista itens={atrasados} />
        </section>
      )}

      <section className="painel">
        <h2>Próximos</h2>
        {proximos.length === 0 && adiante.length === 0 ? (
          <Vazio>
            Nada em aberto nesta lente. Troque para &ldquo;todos&rdquo; ou registre um compromisso.
          </Vazio>
        ) : (
          <Lista itens={[...proximos, ...adiante]} />
        )}
      </section>

      {carga.length > 0 && lente === "todos" && filtroDonos.length === 0 && (
        <section className="painel">
          <div className="linha-titulo">
            <h2>Carga por pessoa</h2>
            <Link className="link-acao" href="/panorama?lente=responsavel">
              Ver no panorama
            </Link>
          </div>
          <ul className="lista-estado">
            {carga.map((p) => (
              <li key={p.id}>
                <span className="rotulo">
                  {p.nome}
                  <span className="dica">
                    {p.abertos} em aberto
                    {p.proximos > 0 ? ` · ${p.proximos} nos próximos dias` : ""}
                  </span>
                </span>
                {p.atrasados > 0 ? (
                  <span className="selo selo-falta">
                    <span className="dado">{p.atrasados}</span> atrasados
                  </span>
                ) : (
                  <span className="selo selo-ok">em dia</span>
                )}
                <Link className="link-acao" href={`/compromissos?dono=${p.id}`}>
                  Ver
                </Link>
              </li>
            ))}
          </ul>
          <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
            Conta quem tem compromisso em aberto. Quem não aparece está sem nada na fila — o que
            pode ser bom sinal ou sinal de que ninguém atribuiu.
          </p>
        </section>
      )}

      {concluidos.length > 0 && (
        <section className="painel">
          <h2>Concluídos recentemente</h2>
          <Lista itens={concluidos} />
        </section>
      )}
    </>
  );
}
