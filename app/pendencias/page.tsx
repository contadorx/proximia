import Link from "next/link";
import { BellRing, Plus, RefreshCw, Search, UserCog, Users } from "lucide-react";
import { exigirOrg, exigirUsuario, podeEscrever } from "@/lib/auth";
import { listarCarteiras, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { formatarData } from "@/lib/contas";
import {
  LIMITE_COMPROMISSOS,
  classeSituacao,
  listarCompromissos,
  rotuloOrigem,
  situacao,
  type Compromisso,
} from "@/lib/compromissos";
import { LIMITE_ALERTAS, ROTULO_TIPO, classeSeveridade, listarAlertas } from "@/lib/alertas";
import { carteirasDaPessoa } from "@/lib/responsabilidades";
import { minhaEquipeId } from "@/lib/equipe";
import { alvosDisponiveis, mapaDeNomes, rotuloTipo } from "@/lib/alvos";
import { caminhoEntidade } from "@/lib/registros";
import {
  criarCompromisso,
  distribuirCompromissos,
  gerarCompromissosPendentes,
  mudarStatusCompromisso,
  reatribuirCompromisso,
} from "@/app/acoes/compromissos";
import { reabrirAlerta, silenciarAlerta, varrerAgora } from "@/app/acoes/alertas";
import { reatribuirAlerta } from "@/app/acoes/responsabilidades";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { Seletor, SeletorMultiplo } from "@/components/seletor";
import { BotaoEnviar } from "@/components/botao-enviar";
import { FormAcao } from "@/components/form-acao";
import { paraLista, paraTexto } from "@/lib/consulta";

export const dynamic = "force-dynamic";

/**
 * Pendências — a porta única para "o que eu preciso resolver".
 *
 * Duas naturezas, duas seções, nunca uma lista só:
 *
 *   · Compromisso é promessa: alguém criou, alguém conclui, e a conclusão
 *     vira histórico.
 *   · Aviso é estado derivado: nasce e some sozinho com a causa, e a ação
 *     é silenciar — que não é concluir e não vira histórico.
 *
 * Fundir as duas listas ensinaria o comportamento errado: numa lista onde
 * metade dos itens some sozinha, a pessoa aprende que "as coisas somem" e
 * para de concluir — e a conclusão é o que alimenta histórico, esforço e
 * carga. Além disso, "compromisso atrasado" é um dos tipos de aviso: na
 * lista única o mesmo item apareceria duas vezes.
 *
 * O que se funde é a ENTRADA: um destino no menu, e um conjunto único de
 * lentes e filtro de carteira valendo para as duas seções ao mesmo tempo.
 * Antes, a lente "das minhas carteiras" existia em Compromissos e não em
 * Alertas — por isso "o que está atrasado na minha unidade" obrigava a
 * visitar duas telas com filtros diferentes.
 *
 * As rotas /compromissos e /alertas continuam existindo e apontam para cá,
 * então nenhum link antigo de e-mail ou follow-up quebra.
 */
export default async function PaginaPendencias({
  searchParams,
}: {
  searchParams: {
    erro?: string;
    ok?: string;
    lente?: string | string[];
    carteira?: string | string[];
    situacao?: string | string[];
    severidade?: string | string[];
    dono?: string | string[];
    alvo?: string | string[];
  };
}) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  // "Meu" é a pessoa da equipe ligada a esta sessão — quem responde por
  // uma carteira e quem tem login são cadastros diferentes.
  const equipeId = (await minhaEquipeId(org.orgId, usuario.id)) ?? usuario.id;

  const situacaoAvisos = paraTexto(searchParams.situacao) ?? "aberto";
  const lente = paraTexto(searchParams.lente) ?? "todos";
  const filtroCarteiras = paraLista(searchParams.carteira);
  const filtroSeveridades = paraLista(searchParams.severidade);
  const filtroDono = paraTexto(searchParams.dono);
  const filtroAlvo = paraTexto(searchParams.alvo);

  // Abertos e concluídos em consultas separadas: uma consulta só, ordenada
  // pelo vencimento e com teto, dava a vaga aos mais antigos.
  const [abertosTodos, concluidosTodos, avisosTodos, carteiras, pessoas, minhasCarteiras, alvos] =
    await Promise.all([
      listarCompromissos({ orgId: org.orgId, status: "aberto" }),
      listarCompromissos({ orgId: org.orgId, status: "concluido", ordem: "recentes" }),
      listarAlertas({
        orgId: org.orgId,
        status: situacaoAvisos,
        carteiras: filtroCarteiras,
        severidades: filtroSeveridades,
      }),
      listarCarteiras(org.orgId),
      pessoasDaOrganizacao(org.orgId),
      carteirasDaPessoa(org.orgId, equipeId),
      alvosDisponiveis(org.orgId),
    ]);

  const compromissosTodos = [...abertosTodos, ...concluidosTodos];
  const nomes = mapaDeNomes(alvos);
  const nomeAlvo = (tipo: string, id: string) => nomes.get(`${tipo}:${id}`);
  const editavel = podeEscrever(org.papel);
  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";
  const nome = (id: string | null) =>
    id ? nomePessoa(pessoas.find((p) => p.id === id)) : "sem responsável";
  const hoje = new Date().toISOString().slice(0, 10);

  // Carteiras que a pessoa carrega: onde responde por papel, mais as que a
  // têm como responsável na ficha. A mesma régua vale para as duas seções.
  const minhas = new Set([
    ...minhasCarteiras,
    ...carteiras.filter((c) => c.responsavel_id === usuario.id).map((c) => c.id),
  ]);

  const passaLente = (carteiraId: string, donoId: string | null) => {
    if (lente === "meus") return donoId === equipeId;
    if (lente === "unidade") return minhas.has(carteiraId);
    return true;
  };

  // A volta das ações carrega os filtros atuais: concluir ou silenciar um
  // item não pode custar a lente que a pessoa escolheu.
  const consulta = new URLSearchParams();
  if (lente !== "todos") consulta.set("lente", lente);
  for (const c of filtroCarteiras) consulta.append("carteira", c);
  for (const s of filtroSeveridades) consulta.append("severidade", s);
  if (situacaoAvisos !== "aberto") consulta.set("situacao", situacaoAvisos);
  if (filtroDono) consulta.set("dono", filtroDono);
  if (filtroAlvo) consulta.set("alvo", filtroAlvo);
  const volta = `/pendencias${consulta.size ? `?${consulta.toString()}` : ""}`;

  /* ---------------------------------------------------- compromissos */

  const compromissos = compromissosTodos.filter((c) => {
    if (!passaLente(c.carteira_id, c.dono_id)) return false;
    if (filtroCarteiras.length && !filtroCarteiras.includes(c.carteira_id)) return false;
    if (filtroDono && c.dono_id !== filtroDono) return false;
    if (filtroAlvo && `${c.entidade_tipo}:${c.entidade_id}` !== filtroAlvo) return false;
    return true;
  });

  const abertos = compromissos.filter((c) => c.status === "aberto");
  const atrasados = abertos.filter((c) => situacao(c).chave === "vencido");
  const proximos = abertos.filter((c) => {
    const chave = situacao(c).chave;
    return chave === "hoje" || chave === "alerta";
  });
  const adiante = abertos.filter((c) => situacao(c).chave === "adiante");
  const concluidos = compromissos.filter((c) => c.status === "concluido").slice(0, 10);
  const compromissosSemDono = abertosTodos.filter((c) => !c.dono_id).length;

  /* ---------------------------------------------------------- avisos */

  const ordem = { alta: 0, atencao: 1, informativa: 2 } as const;
  const avisos = avisosTodos
    .filter((a) => passaLente(a.carteira_id, a.dono_id))
    .sort(
      (a, b) =>
        (ordem[a.severidade as keyof typeof ordem] ?? 3) -
        (ordem[b.severidade as keyof typeof ordem] ?? 3),
    );
  const avisosAltos = avisos.filter((a) => a.severidade === "alta").length;

  // Avisos agrupados por TIPO, em blocos que abrem e fecham.
  //
  // Numa lista corrida, contrato vencido, carteira parada e conta sem
  // decisor disputam a mesma atenção — e são assuntos diferentes, que se
  // resolvem com pessoas diferentes. Agrupados, a pessoa escolhe o tema e
  // trata em bloco. O primeiro grupo abre; os demais ficam fechados, para
  // a tela caber numa olhada.
  const gruposAviso = (() => {
    const mapa = new Map<string, typeof avisos>();
    for (const a of avisos) {
      const lista = mapa.get(a.tipo) ?? [];
      lista.push(a);
      mapa.set(a.tipo, lista);
    }
    return [...mapa.entries()]
      .map(([tipo, itens]) => ({
        tipo,
        itens,
        altos: itens.filter((x) => x.severidade === "alta").length,
      }))
      .sort((a, b) => b.altos - a.altos || b.itens.length - a.itens.length);
  })();
  const avisosSemDono = avisosTodos.filter((a) => !a.dono_id).length;

  const rotuloLente =
    lente === "meus" ? "meus" : lente === "unidade" ? "das minhas carteiras" : null;

  function ListaCompromissos({ itens }: { itens: Compromisso[] }) {
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
                    <input type="hidden" name="volta" value={volta} />
                    <Seletor
                      nome="dono_id"
                      rotulo="Responsável"
                      opcoes={pessoas.map((p) => ({ valor: p.id, rotulo: nomePessoa(p) }))}
                      inicial={c.dono_id ?? ""}
                      vazio="Sem responsável"
                    />
                    <BotaoEnviar>Salvar</BotaoEnviar>
                  </form>
                </Modal>
              )}

              {editavel && c.status === "aberto" && (
                <form action={mudarStatusCompromisso}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="status" value="concluido" />
                  <input type="hidden" name="volta" value={volta} />
                  <button className="link-acao" type="submit">
                    Concluir
                  </button>
                </form>
              )}

              {editavel && c.status === "concluido" && (
                <form action={mudarStatusCompromisso}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="status" value="aberto" />
                  <input type="hidden" name="volta" value={volta} />
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
          <h1>Pendências</h1>
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
              <FormAcao action={criarCompromisso}>
                <input type="hidden" name="volta" value={volta} />
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
                    ajuda="Uma conta, um contrato, uma frente — ou a carteira, se for geral. Com um registro escolhido, o compromisso nasce na carteira dele."
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
                    inicial={equipeId}
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
                <BotaoEnviar>Registrar compromisso</BotaoEnviar>
              </FormAcao>
            </Modal>
          )}

          {editavel && compromissosSemDono > 0 && (
            <form action={distribuirCompromissos}>
              <input type="hidden" name="volta" value={volta} />
              <BotaoEnviar variante="secundario" rotuloEnviando="Distribuindo…">
                <Users size={15} />
                Distribuir {compromissosSemDono} sem dono
              </BotaoEnviar>
            </form>
          )}

          {editavel && (
            <form action={varrerAgora}>
              <input type="hidden" name="volta" value={volta} />
              <BotaoEnviar variante="secundario" rotuloEnviando="Varrendo…">
                <RefreshCw size={15} />
                Varrer agora
              </BotaoEnviar>
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
                <BotaoEnviar rotuloEnviando="Gerando…">Gerar os que faltam</BotaoEnviar>
              </form>
            </Modal>
          )}
        </div>
      </div>

      <IntroSecao>
        Tudo o que pede ação, num lugar só — em duas listas que não se misturam.{" "}
        <strong>Compromisso é promessa</strong>: tem dono, tem data, e concluir vira histórico.{" "}
        <strong>Aviso é o sistema falando</strong>: nasce e some sozinho com a causa, e silenciar só
        pede que ele pare de insistir. A lente e a carteira escolhidas valem para as duas listas.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <div className="cartoes">
        <div className="cartao">
          <p className="olho">Compromissos atrasados</p>
          <p className={atrasados.length ? "cartao-valor alerta" : "cartao-valor"}>
            {atrasados.length}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Nos próximos dias</p>
          <p className="cartao-valor">{proximos.length}</p>
        </div>
        <div className="cartao">
          <p className="olho">Avisos em aberto</p>
          <p className={avisosAltos > 0 ? "cartao-valor alerta" : "cartao-valor"}>
            {situacaoAvisos === "aberto" ? avisos.length : "—"}
          </p>
          <p className="cartao-nota">
            {avisosAltos > 0 ? `${avisosAltos} de severidade alta` : "nenhum de severidade alta"}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Sem responsável</p>
          <p
            className={
              compromissosSemDono + avisosSemDono ? "cartao-valor alerta" : "cartao-valor"
            }
          >
            {compromissosSemDono + avisosSemDono}
          </p>
          <p className="cartao-nota">
            {compromissosSemDono + avisosSemDono > 0
              ? `${compromissosSemDono} compromissos · ${avisosSemDono} avisos`
              : "tudo tem dono"}
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
          nome="severidade"
          rotulo="Severidade do aviso"
          opcoes={[
            { valor: "alta", rotulo: "Alta" },
            { valor: "atencao", rotulo: "Atenção" },
            { valor: "informativa", rotulo: "Informativa" },
          ]}
          inicial={filtroSeveridades}
        />
        {situacaoAvisos !== "aberto" && (
          <input type="hidden" name="situacao" value={situacaoAvisos} />
        )}
        <button className="botao botao-secundario" type="submit">
          <Search size={14} />
          Filtrar
        </button>
        {(lente !== "todos" ||
          filtroCarteiras.length > 0 ||
          filtroSeveridades.length > 0 ||
          filtroDono ||
          filtroAlvo) && (
          <Link className="link-acao" href="/pendencias">
            Limpar
          </Link>
        )}
      </form>

      {(filtroAlvo || filtroDono) && (
        <p className="nota">
          Mostrando compromissos
          {filtroAlvo ? ` de ${nomes.get(filtroAlvo) ?? "um registro específico"}` : ""}
          {filtroDono ? ` de ${nome(filtroDono)}` : ""} —{" "}
          <Link href="/pendencias">ver tudo</Link>.
        </p>
      )}

      <section className="painel" id="compromissos">
        <div className="linha-titulo">
          <h2>Compromissos{rotuloLente ? ` — ${rotuloLente}` : ""}</h2>
        </div>

        {atrasados.length > 0 && (
          <div className="subgrupo">
            <p className="olho">Atrasados</p>
            <ListaCompromissos itens={atrasados} />
          </div>
        )}

        <div className="subgrupo">
          <p className="olho">Próximos</p>
          {proximos.length === 0 && adiante.length === 0 ? (
            <Vazio>
              Nada em aberto nesta lente. Troque para &ldquo;todos&rdquo; ou registre um
              compromisso.
            </Vazio>
          ) : (
            <ListaCompromissos itens={[...proximos, ...adiante]} />
          )}
        </div>

        {concluidos.length > 0 && (
          <div className="subgrupo">
            <p className="olho">Concluídos recentemente</p>
            <ListaCompromissos itens={concluidos} />
          </div>
        )}

        {abertosTodos.length >= LIMITE_COMPROMISSOS && (
          <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
            Mostrando os {LIMITE_COMPROMISSOS} primeiros por vencimento. Filtre por carteira para
            ver o restante.
          </p>
        )}
      </section>

      <section className="painel" id="avisos">
        <div className="linha-titulo">
          <h2>Avisos do sistema{rotuloLente ? ` — ${rotuloLente}` : ""}</h2>
          <span className="passos-contagem">
            <Link
              className={situacaoAvisos === "aberto" ? "link-acao ativo" : "link-acao"}
              href="/pendencias#avisos"
            >
              Em aberto
            </Link>
            {" · "}
            <Link
              className={situacaoAvisos === "silenciado" ? "link-acao ativo" : "link-acao"}
              href="/pendencias?situacao=silenciado#avisos"
            >
              Silenciados
            </Link>
            {" · "}
            <Link
              className={situacaoAvisos === "resolvido" ? "link-acao ativo" : "link-acao"}
              href="/pendencias?situacao=resolvido#avisos"
            >
              Resolvidos
            </Link>
          </span>
        </div>

        {avisos.length === 0 ? (
          <Vazio>
            {situacaoAvisos === "aberto"
              ? "Nada fora do trilho. Contratos, compromissos e frentes estão dentro do prazo."
              : "Nenhum aviso nesta situação."}
          </Vazio>
        ) : (
          <>
            {gruposAviso.map((g, indice) => (
              <details
                className="grupo-aviso"
                key={g.tipo}
                open={indice === 0}
              >
                <summary>
                  <span className="grupo-aviso-titulo">{ROTULO_TIPO[g.tipo as never]}</span>
                  <span className="grupo-aviso-contagem">
                    {g.itens.length}
                    {g.altos > 0 ? ` · ${g.altos} de severidade alta` : ""}
                  </span>
                </summary>
                <ul className="lista-estado">
                  {g.itens.map((a) => (
                    <li key={a.id}>
                      <span className="rotulo">
                        {a.entidade_tipo && a.entidade_id ? (
                          <Link href={caminhoEntidade(a.entidade_tipo, a.entidade_id)}>{a.titulo}</Link>
                        ) : (
                          a.titulo
                        )}
                        <span className="dica">
                          {[
                            // O tipo virou título do bloco: repetir aqui
                            // seria ruído.
                            nomeCarteira(a.carteira_id),
                            a.dono_id ? `responde: ${nome(a.dono_id)}` : "sem responsável",
                            (a.observadores ?? []).includes(equipeId) && a.dono_id !== equipeId
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
                          titulo="Quem responde por este aviso"
                          descricao="Os demais responsáveis pela carteira continuam acompanhando."
                          variante="link"
                          icone={<UserCog size={13} />}
                        >
                          <form action={reatribuirAlerta} className="formulario">
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="volta" value={volta} />
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
                          <input type="hidden" name="volta" value={volta} />
                          <button className="link-acao" type="submit">
                            Silenciar
                          </button>
                        </form>
                      )}
                      {editavel && a.status === "silenciado" && (
                        <form action={reabrirAlerta}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="volta" value={volta} />
                          <button className="link-acao" type="submit">
                            Reabrir
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            {avisosTodos.length >= LIMITE_ALERTAS && (
              <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
                Mostrando os {LIMITE_ALERTAS} mais recentes. Filtre por carteira ou severidade para
                ver o restante.
              </p>
            )}
          </>
        )}

        <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
          <BellRing size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          Uma vez por dia o sistema varre a operação e abre aviso para o que saiu do trilho.{" "}
          <strong>Silenciar não é concluir</strong>: o sistema só para de insistir enquanto a
          situação durar, e isso não vira histórico. O aviso some sozinho quando a causa some.
          {avisosSemDono > 0 && (
            <>
              {" "}
              <strong>{avisosSemDono} aviso(s) sem responsável</strong> — defina quem responde pela
              carteira em Carteiras › Quem responde, e a atribuição passa a acontecer sozinha.
            </>
          )}{" "}
          Os limites de tempo — 30 dias para carteira parada, 45 para frente, 60 para oportunidade —
          são os padrões.
        </p>
      </section>
    </>
  );
}
