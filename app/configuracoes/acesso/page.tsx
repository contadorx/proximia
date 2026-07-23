import Link from "next/link";
import { KeyRound, Layers, ShieldCheck, UserPlus } from "lucide-react";
import { exigirOrg, exigirUsuario, podeAdministrar } from "@/lib/auth";
import { listarCarteiras, nomePessoa } from "@/lib/carteiras";
import { formatarData } from "@/lib/contas";
import { MATRIZ, pessoasComAcesso } from "@/lib/acesso";
import { PAPEIS, rotuloPapel, type Papel } from "@/lib/tipos";
import { papeisOperacionais, responsabilidades } from "@/lib/responsabilidades";
import { listarEquipe } from "@/lib/equipe";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  alterarPapel,
  alternarAtivo,
  removerAcesso,
  salvarCarteirasDaPessoa,
} from "@/app/acoes/acesso";
import { convidarPessoa } from "@/app/acoes/convites";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { BotaoEnviar } from "@/components/botao-enviar";
import { SeletorMultiplo } from "@/components/seletor";
import { BotaoExcluir } from "@/components/botao-excluir";

export const dynamic = "force-dynamic";

export default async function PaginaAcesso({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const supabase = criarClienteServidor();
  const [pessoas, carteiras, papeis, vinculos, equipe, { data: vinculosCarteira }] =
    await Promise.all([
      pessoasComAcesso(org.orgId),
      listarCarteiras(org.orgId),
      papeisOperacionais(org.orgId),
      responsabilidades({ orgId: org.orgId }),
      listarEquipe(org.orgId, { incluirInativos: true }),
      supabase
        .from("carteira_membros")
        .select("carteira_id, user_id")
        .eq("org_id", org.orgId),
    ]);

  // Responsabilidade aponta para a pessoa da equipe; o acesso, para o
  // usuário. O elo entre os dois é o vínculo da equipe.
  const equipeIdDe = (userId: string) => equipe.find((e) => e.user_id === userId)?.id ?? userId;

  const administra = podeAdministrar(org.papel);
  const daPessoa = (userId: string) =>
    ((vinculosCarteira ?? []) as { carteira_id: string; user_id: string }[])
      .filter((v) => v.user_id === userId)
      .map((v) => v.carteira_id);

  const ativos = pessoas.filter((p) => p.ativo);
  const suspensos = pessoas.filter((p) => !p.ativo);
  const semResponsabilidade = ativos.filter(
    (p) => p.papel !== "leitura_ampla" && p.carteiras_respondidas === 0,
  );

  return (
    <>
      <p className="olho">
        <Link href="/configuracoes">Configurações</Link> · {org.nome}
      </p>

      <div className="cabeca-pagina">
        <div>
          <h1>Acesso e permissões</h1>
        </div>
        {administra && (
          <div className="cabeca-acoes">
            <Modal
              rotulo="Convidar pessoa"
              titulo="Convidar pessoa"
              descricao="Ela recebe um link por e-mail, válido por 14 dias e só para o endereço informado."
              icone={<UserPlus size={15} />}
            >
              <form action={convidarPessoa} className="formulario">
                <label className="campo">
                  <span>E-mail</span>
                  <input type="email" name="email" required autoFocus />
                </label>
                <label className="campo">
                  <span>Papel</span>
                  <select name="papel" defaultValue="analista">
                    {PAPEIS.filter((p) => p.valor !== "owner").map((p) => (
                      <option key={p.valor} value={p.valor}>
                        {p.rotulo} — {p.explicacao}
                      </option>
                    ))}
                  </select>
                </label>
                <BotaoEnviar>
                  Enviar convite
                </BotaoEnviar>
              </form>
            </Modal>
          </div>
        )}
      </div>

      <IntroSecao>
        Duas coisas diferentes convivem aqui. O <strong>papel</strong> define o que a pessoa vê e
        edita — é o que o banco de dados aplica. A <strong>responsabilidade</strong> define por quais
        carteiras ela responde, e é o que dá dono a alertas e compromissos. Alguém do corporativo
        pode acompanhar sem operar; alguém da unidade pode operar sem responder por tudo.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <div className="cartoes">
        <div className="cartao">
          <p className="olho">Com acesso</p>
          <p className="cartao-valor">{ativos.length}</p>
          <p className="cartao-nota">
            {suspensos.length > 0 ? `${suspensos.length} suspenso(s)` : "nenhum suspenso"}
          </p>
        </div>
        <div className="cartao">
          <p className="olho">Administram</p>
          <p className="cartao-valor">
            {ativos.filter((p) => p.papel === "owner" || p.papel === "admin").length}
          </p>
          <p className="cartao-nota">donos e administradores</p>
        </div>
        <div className="cartao">
          <p className="olho">Só leitura</p>
          <p className="cartao-valor">
            {ativos.filter((p) => p.papel === "leitura_ampla").length}
          </p>
          <p className="cartao-nota">perfil de acompanhamento</p>
        </div>
        <div className="cartao">
          <p className="olho">Sem responder por nada</p>
          <p className={semResponsabilidade.length ? "cartao-valor alerta" : "cartao-valor"}>
            {semResponsabilidade.length}
          </p>
          <p className="cartao-nota">têm acesso, mas nenhum alerta cai neles</p>
        </div>
      </div>

      <section className="painel sem-recheio">
        <div className="tabela-rolagem">
          <table className="tabela-panorama">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Papel</th>
                <th className="numero">Vê</th>
                <th className="numero">Responde por</th>
                <th className="numero">Na fila</th>
                <th>Última atividade</th>
                {administra && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {pessoas.map((p) => {
                const meus = daPessoa(p.user_id);
                const papeisDela = vinculos
                  .filter((v) => v.user_id === equipeIdDe(p.user_id))
                  .map((v) => papeis.find((x) => x.id === v.papel_id)?.nome)
                  .filter((v, i, lista) => v && lista.indexOf(v) === i);
                const euMesmo = p.user_id === usuario.id;

                return (
                  <tr key={p.user_id} className={p.ativo ? undefined : "linha-suspensa"}>
                    <td>
                      <strong>{p.nome ?? p.email ?? "sem perfil"}</strong>
                      <span className="celula-sub">
                        {[p.email, euMesmo ? "você" : null, p.ativo ? null : "suspenso"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </td>

                    <td>
                      {administra && !euMesmo ? (
                        <form action={alterarPapel} className="forma-inline">
                          <input type="hidden" name="user_id" value={p.user_id} />
                          <select name="papel" defaultValue={p.papel} className="select-compacto">
                            {PAPEIS.map((x) => (
                              <option key={x.valor} value={x.valor}>
                                {x.rotulo}
                              </option>
                            ))}
                          </select>
                          <button className="link-acao" type="submit">
                            salvar
                          </button>
                        </form>
                      ) : (
                        <span className="selo selo-neutro">{rotuloPapel(p.papel)}</span>
                      )}
                    </td>

                    <td className="numero dado">
                      {p.papel === "ponto_focal" ? (
                        <>
                          {p.carteiras_visiveis}
                          <span className="celula-sub">de {carteiras.length}</span>
                        </>
                      ) : (
                        <span className="celula-sub" style={{ marginTop: 0 }}>
                          todas
                        </span>
                      )}
                    </td>

                    <td className="numero dado">
                      {p.carteiras_respondidas > 0 ? (
                        <>
                          {p.carteiras_respondidas}
                          {papeisDela.length > 0 && (
                            <span className="celula-sub">{papeisDela.join(", ")}</span>
                          )}
                        </>
                      ) : (
                        <span className="celula-sub" style={{ marginTop: 0 }}>
                          nenhuma
                        </span>
                      )}
                    </td>

                    <td className="numero dado">
                      {p.alertas_abertos + p.compromissos_abertos === 0 ? (
                        "—"
                      ) : (
                        <>
                          {p.alertas_abertos + p.compromissos_abertos}
                          <span className="celula-sub">
                            {p.alertas_abertos} alertas · {p.compromissos_abertos} compromissos
                          </span>
                        </>
                      )}
                    </td>

                    <td className="dado" style={{ fontSize: 12 }}>
                      {p.ultimo_registro
                        ? formatarData(p.ultimo_registro.slice(0, 10))
                        : "sem registros"}
                    </td>

                    {administra && (
                      <td className="celula-sinais">
                        {p.papel === "ponto_focal" && (
                          <Modal
                            rotulo="Carteiras"
                            titulo={`Carteiras de ${p.nome ?? p.email ?? "pessoa"}`}
                            descricao="Ponto focal só enxerga o que estiver marcado aqui."
                            variante="link"
                            icone={<Layers size={13} />}
                          >
                            <form action={salvarCarteirasDaPessoa} className="formulario">
                              <input type="hidden" name="user_id" value={p.user_id} />
                              <SeletorMultiplo
                                nome="carteira"
                                rotulo="Carteiras visíveis"
                                opcoes={carteiras.map((c) => ({
                                  valor: c.id,
                                  rotulo: c.nome,
                                  detalhe: c.codigo ?? undefined,
                                }))}
                                inicial={meus}
                                rotuloTodas="Nenhuma"
                              />
                              <BotaoEnviar>
                                Salvar alcance
                              </BotaoEnviar>
                              <p className="nota">
                                Sem nenhuma marcada, a pessoa entra e não vê carteira alguma.
                              </p>
                            </form>
                          </Modal>
                        )}

                        {!euMesmo && (
                          <form action={alternarAtivo}>
                            <input type="hidden" name="user_id" value={p.user_id} />
                            <input type="hidden" name="ativar" value={p.ativo ? "0" : "1"} />
                            <button className="link-acao" type="submit">
                              {p.ativo ? "Suspender" : "Reativar"}
                            </button>
                          </form>
                        )}

                        {!euMesmo && (
                          <form action={removerAcesso}>
                            <input type="hidden" name="user_id" value={p.user_id} />
                            <BotaoExcluir
                              compacto
                              rotulo="Remover"
                              aviso="O histórico da pessoa fica."
                            />
                          </form>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {semResponsabilidade.length > 0 && (
        <p className="nota">
          <strong>
            {semResponsabilidade.map((p) => p.nome ?? p.email).join(", ")}
          </strong>{" "}
          {semResponsabilidade.length === 1 ? "tem acesso mas não responde" : "têm acesso mas não respondem"}{" "}
          por nenhuma carteira — nenhum alerta ou compromisso cai automaticamente neles. Defina em{" "}
          <Link href="/carteiras">Carteiras › Quem responde</Link>.
        </p>
      )}

      <section className="painel">
        <div className="linha-titulo">
          <h2>O que cada papel pode fazer</h2>
          <ShieldCheck size={16} style={{ color: "var(--g400)" }} />
        </div>

        <div className="tabela-rolagem">
          <table className="folha-tabela">
            <thead>
              <tr>
                <th>Papel</th>
                <th>Alcance</th>
                <th>Lê</th>
                <th>Edita</th>
                <th>Administra</th>
              </tr>
            </thead>
            <tbody>
              {MATRIZ.map((m) => (
                <tr key={m.papel}>
                  <td>
                    <strong>{rotuloPapel(m.papel as Papel)}</strong>
                  </td>
                  <td>{m.alcance}</td>
                  <td>{m.le}</td>
                  <td>{m.edita}</td>
                  <td>{m.administra}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="nota" style={{ marginTop: 16, marginBottom: 0 }}>
          Isto não é decoração: o banco de dados aplica exatamente estas regras, em cada tabela. Se a
          tela mostrar um botão que a política recusa, é a tela que está errada.
        </p>
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Regras que o sistema não deixa quebrar</h2>
          <KeyRound size={16} style={{ color: "var(--g400)" }} />
        </div>
        <ul className="lista-limpa-simples">
          <li>A organização sempre tem pelo menos um dono ativo.</li>
          <li>Ninguém altera o próprio papel, nem se desativa, nem se remove.</li>
          <li>Só quem é dono pode tornar outra pessoa dona.</li>
          <li>Suspender preserva o histórico: o que a pessoa registrou continua onde está.</li>
        </ul>
      </section>

      {suspensos.length === 0 && ativos.length === 1 && (
        <Vazio>
          Você é a única pessoa com acesso. Convide quem acompanha e quem opera — o produto foi feito
          para que o conhecimento não fique com uma pessoa só.
        </Vazio>
      )}
    </>
  );
}
