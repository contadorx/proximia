import Link from "next/link";
import { Pencil } from "lucide-react";
import { Modal } from "@/components/modal";
import { Seletor } from "@/components/seletor";
import { Vazio } from "@/components/intro-secao";
import { BotaoExcluir } from "@/components/botao-excluir";
import { excluirCarteira } from "@/app/acoes/exclusoes";
import { Mail, Send, Share2, RefreshCw } from "lucide-react";
import { criarClienteServidor } from "@/lib/supabase/server";
import { periodos } from "@/lib/periodo";
import { salvarCadencia, enviarExtratoAgora } from "@/app/acoes/extrato";
import { salvarPortal, trocarEndereco } from "@/app/acoes/portal";
import { portalDaCarteira } from "@/lib/portal";
import { papeisOperacionais, responsabilidades } from "@/lib/responsabilidades";
import { atribuirResponsavel, removerResponsavel } from "@/app/acoes/responsabilidades";
import { UserCog } from "lucide-react";
import { formatarData } from "@/lib/contas";
import { notFound } from "next/navigation";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import {
  faixaMaturidade,
  nomePessoa,
  obterCarteira,
  pessoasDaCarteira,
  pessoasDaOrganizacao,
  STATUS_CARTEIRA,
} from "@/lib/carteiras";
import { formatarValor, listarContas, rotuloRelacao } from "@/lib/contas";
import { Historico } from "@/components/historico";
import { classeStatus, listarFrentes, rotuloStatus } from "@/lib/frentes";
import { classeFase, formatarPayback, listarOportunidades, rotuloFase } from "@/lib/oportunidades";
import {
  atualizarCarteira,
  desvincularPessoaCarteira,
  vincularPessoaCarteira,
} from "@/app/acoes/carteiras";

export const dynamic = "force-dynamic";

export default async function PaginaCarteira({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const carteira = await obterCarteira(params.id);

  // A RLS já esconde carteira de outra organização ou fora do alcance:
  // se não veio nada, para quem pediu ela não existe.
  if (!carteira) notFound();

  const [pessoasOrg, pessoasCart, contas, frentes, oportunidades] = await Promise.all([
    pessoasDaOrganizacao(org.orgId),
    pessoasDaCarteira(carteira.id),
    listarContas({ orgId: org.orgId, carteiraId: carteira.id }),
    listarFrentes({ orgId: org.orgId, carteiraId: carteira.id }),
    listarOportunidades({ orgId: org.orgId, carteiraId: carteira.id }),
  ]);

  const { data: enviosBrutos } = await criarClienteServidor()
    .from("envios")
    .select("id, origem, destinatarios, periodo_inicio, periodo_fim, status, detalhe, criado_em")
    .eq("carteira_id", carteira.id)
    .order("criado_em", { ascending: false })
    .limit(5);
  const envios = (enviosBrutos ?? []) as {
    id: string;
    origem: string;
    destinatarios: string[];
    periodo_inicio: string;
    periodo_fim: string;
    status: string;
    detalhe: string | null;
    criado_em: string;
  }[];
  const portal = await portalDaCarteira(carteira.id);
  const [papeis, respons] = await Promise.all([
    papeisOperacionais(org.orgId),
    responsabilidades({ orgId: org.orgId, carteiraId: carteira.id }),
  ]);
  const destinatariosAtuais = ((carteira as unknown as {
    extrato_destinatarios?: string[];
  }).extrato_destinatarios ?? []) as string[];
  const cadenciaAtual = ((carteira as unknown as { cadencia_extrato?: string }).cadencia_extrato ??
    "nenhuma") as string;
  const diaAtual = ((carteira as unknown as { extrato_dia?: number }).extrato_dia ?? 1) as number;

  const podeEditar = podeEscrever(org.papel) && org.papel !== "ponto_focal";
  const podeExcluir = org.papel === "owner" || org.papel === "admin";
  const id = carteira.id;
  const faixa = faixaMaturidade(carteira.score_maturidade);
  const disponiveis = pessoasOrg.filter((p) => !pessoasCart.some((v) => v.id === p.id));

  return (
    <>
      <p className="olho">
        <Link href="/carteiras">Carteiras</Link> · {org.nome}
      </p>
      <h1>{carteira.nome}</h1>
      <p className="chamada">
        {[
          carteira.codigo,
          carteira.regiao,
          carteira.score_maturidade !== null
            ? `maturidade ${carteira.score_maturidade.toFixed(0)}${faixa ? ` · ${faixa.toLowerCase()}` : ""}${carteira.score_ciclo ? ` · ciclo ${carteira.score_ciclo}` : ""}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Sem código, região ou score registrados."}
      </p>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <section className="painel">
        <h2>Contas desta carteira</h2>
        {contas.length === 0 ? (
          <p className="nota">
            Nenhuma conta ainda. <Link href="/contas">Cadastre a primeira</Link>.
          </p>
        ) : (
          <ul className="lista-estado">
            {contas.map((c) => (
              <li key={c.id}>
                <span className="rotulo">
                  <Link href={`/contas/${c.id}`}>{c.nome}</Link>
                  <span className="dica">{rotuloRelacao(c.relacao)}</span>
                </span>
                <span className="par-valores">
                  <span className="valor-teto">teto {formatarValor(c.potencial_bruto)}</span>
                  <span className="valor-capturado">capt. {formatarValor(c.valor_capturado)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p style={{ marginTop: -8, marginBottom: 24 }}>
        <Link className="botao botao-secundario" href={`/carteiras/${carteira.id}/situacao`}>
          Ver situação da carteira (imprimível)
        </Link>
      </p>

      <section className="painel">
        <h2>Frentes desta carteira</h2>
        {frentes.length === 0 ? (
          <p className="nota">
            Nenhuma frente. <Link href="/frentes">Registre a primeira</Link>.
          </p>
        ) : (
          <ul className="lista-estado">
            {frentes.map((f) => (
              <li key={f.id}>
                <span className="rotulo">
                  <Link href={`/frentes/${f.id}`}>{f.titulo}</Link>
                  <span className="dica">
                    {[f.qtd_casos !== null ? `${f.qtd_casos} casos` : null, f.proxima_etapa]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className={classeStatus(f.status)}>{rotuloStatus(f.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {oportunidades.length > 0 && (
        <section className="painel">
          <h2>Oportunidades desta carteira</h2>
          <ul className="lista-estado">
            {oportunidades.map((o) => (
              <li key={o.id}>
                <span className="rotulo">
                  <Link href={`/oportunidades/${o.id}`}>{o.titulo}</Link>
                  <span className="dica">
                    investimento {formatarValor(o.investimento)} · payback{" "}
                    {formatarPayback(o.payback_meses)}
                  </span>
                </span>
                <span className={classeFase(o.fase)}>{rotuloFase(o.fase)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="painel">
        <div className="linha-titulo">
          <h2>Quem responde</h2>
          {podeEditar && papeis.length > 0 && (
            <Modal
              rotulo="Definir responsável"
              titulo="Definir responsável"
              descricao="Uma carteira pode ter mais de um responsável, em papéis diferentes."
              variante="secundario"
              icone={<UserCog size={15} />}
            >
              <form action={atribuirResponsavel} className="formulario">
                <input type="hidden" name="carteira_id" value={carteira.id} />
                <Seletor
                  nome="user_id"
                  rotulo="Pessoa"
                  opcoes={pessoasOrg.map((p) => ({ valor: p.id, rotulo: nomePessoa(p) }))}
                  vazio="Escolha a pessoa"
                  obrigatorio
                />
                <Seletor
                  nome="papel_id"
                  rotulo="Papel"
                  opcoes={papeis
                    .filter((x) => x.ativo)
                    .map((x) => ({
                      valor: x.id,
                      rotulo: x.nome,
                      detalhe: x.primario ? "papel primário" : (x.descricao ?? undefined),
                    }))}
                  vazio="Escolha o papel"
                  obrigatorio
                />
                <label className="campo">
                  <span>Observação</span>
                  <input type="text" name="observacao" maxLength={160} placeholder="opcional" />
                </label>
                <button className="botao botao-primario" type="submit">
                  Definir
                </button>
              </form>
            </Modal>
          )}
        </div>

        {papeis.length === 0 ? (
          <Vazio
            acao={
              podeEditar ? (
                <Link className="botao botao-secundario" href="/configuracoes">
                  Cadastrar papéis
                </Link>
              ) : undefined
            }
          >
            Nenhum papel de responsabilidade cadastrado ainda. Os papéis são da sua operação —
            &ldquo;responsável na unidade&rdquo;, &ldquo;apoio corporativo&rdquo;, o que fizer
            sentido — e ficam em Configurações.
          </Vazio>
        ) : respons.length === 0 ? (
          <Vazio>
            Ninguém definido. Enquanto isso, alertas e compromissos desta carteira caem no
            responsável cadastrado na ficha, se houver.
          </Vazio>
        ) : (
          <ul className="lista-estado">
            {respons.map((r) => {
              const papel = papeis.find((x) => x.id === r.papel_id);
              return (
                <li key={r.id}>
                  <span className="rotulo">
                    {nomePessoa(pessoasOrg.find((p) => p.id === r.user_id))}
                    <span className="dica">
                      {[papel?.nome, r.observacao].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {papel?.primario && <span className="selo selo-ok">responde primeiro</span>}
                  {podeEditar && (
                    <form action={removerResponsavel}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="carteira_id" value={carteira.id} />
                      <BotaoExcluir compacto rotulo="Remover" />
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
          Responder é diferente de enxergar. Quem responde recebe os alertas; quem tem acesso está
          no bloco abaixo.
        </p>
      </section>

      <section className="painel">
        <h2>Quem acompanha</h2>
        <p className="nota" style={{ marginBottom: 18 }}>
          Vincular uma pessoa aqui é o que define o alcance de quem tem perfil de ponto focal: ela
          passa a enxergar esta carteira e nenhuma outra. Quem é analista ou administrador já vê
          todas.
        </p>

        {pessoasCart.length === 0 ? (
          <p className="nota">Ninguém vinculado ainda.</p>
        ) : (
          <ul className="lista-estado">
            {pessoasCart.map((p) => (
              <li key={p.id}>
                <span className="rotulo">
                  {nomePessoa(p)}
                  {p.email && p.nome && <span className="dica">{p.email}</span>}
                </span>
                {podeEditar && (
                  <form action={desvincularPessoaCarteira}>
                    <input type="hidden" name="carteira_id" value={carteira.id} />
                    <input type="hidden" name="user_id" value={p.id} />
                    <button className="link-acao" type="submit">
                      Remover
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {podeEditar && disponiveis.length > 0 && (
          <form action={vincularPessoaCarteira} className="formulario formulario-linha" style={{ marginTop: 20 }}>
            <input type="hidden" name="carteira_id" value={carteira.id} />
            <label className="campo">
              <span>Incluir pessoa</span>
              <select name="user_id" defaultValue="">
                <option value="" disabled>
                  Escolha na lista
                </option>
                {disponiveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nomePessoa(p)}
                  </option>
                ))}
              </select>
            </label>
            <button className="botao botao-primario" type="submit">
              Vincular
            </button>
          </form>
        )}
      </section>

      {podeEditar ? (
        <Modal rotulo="Editar carteira" titulo="Editar carteira" descricao="Alterações valem para toda a organização." largo icone={<Pencil size={15} />} variante="secundario">
          <form action={atualizarCarteira} className="formulario">
            <input type="hidden" name="id" value={carteira.id} />

            <div className="formulario-linha">
              <label className="campo">
                <span>Nome</span>
                <input type="text" name="nome" defaultValue={carteira.nome} required maxLength={120} />
              </label>
              <label className="campo">
                <span>Código</span>
                <input type="text" name="codigo" defaultValue={carteira.codigo ?? ""} maxLength={30} />
              </label>
              <label className="campo">
                <span>Região</span>
                <input type="text" name="regiao" defaultValue={carteira.regiao ?? ""} maxLength={60} />
              </label>
            </div>

            <div className="formulario-linha">
              <label className="campo">
                <span>Situação</span>
                <select name="status" defaultValue={carteira.status}>
                  {STATUS_CARTEIRA.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Responsável</span>
                <select name="responsavel_id" defaultValue={carteira.responsavel_id ?? ""}>
                  <option value="">Sem responsável</option>
                  {pessoasOrg.map((p) => (
                    <option key={p.id} value={p.id}>
                      {nomePessoa(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Score</span>
                <input
                  type="text"
                  name="score_maturidade"
                  inputMode="decimal"
                  defaultValue={carteira.score_maturidade ?? ""}
                />
              </label>
              <label className="campo">
                <span>Ciclo</span>
                <input type="text" name="score_ciclo" defaultValue={carteira.score_ciclo ?? ""} maxLength={20} />
              </label>
            </div>

            <label className="campo">
              <span>Observações</span>
              <textarea name="observacoes" rows={4} defaultValue={carteira.observacoes ?? ""} />
            </label>

            <button className="botao botao-primario" type="submit">
              Salvar alterações
            </button>
          </form>
        </Modal>
      ) : (
        carteira.observacoes && (
          <section className="painel">
            <h2>Observações</h2>
            <p className="nota">{carteira.observacoes}</p>
          </section>
        )
      )}

      <section className="painel">
        <div className="linha-titulo">
          <h2>Extrato periódico</h2>
          {podeEscrever(org.papel) && (
            <div className="cabeca-acoes">
              <Modal
                rotulo="Configurar envio"
                titulo="Extrato periódico desta carteira"
                descricao="Cadência, dia do mês e quem recebe."
                variante="secundario"
                icone={<Mail size={15} />}
              >
                <form action={salvarCadencia} className="formulario">
                  <input type="hidden" name="id" value={carteira.id} />
                  <div className="formulario-linha">
                    <label className="campo">
                      <span>Cadência</span>
                      <select name="cadencia_extrato" defaultValue={cadenciaAtual}>
                        <option value="nenhuma">Não enviar</option>
                        <option value="quinzenal">Quinzenal</option>
                        <option value="mensal">Mensal</option>
                        <option value="trimestral">Trimestral (jan, abr, jul, out)</option>
                      </select>
                    </label>
                    <label className="campo campo-numerico">
                      <span>Dia do mês</span>
                      <input type="number" name="extrato_dia" min={1} max={28} defaultValue={diaAtual} />
                      <small>Até 28: 29, 30 e 31 não existem em todo mês.</small>
                    </label>
                  </div>
                  <label className="campo">
                    <span>Destinatários</span>
                    <textarea
                      name="destinatarios"
                      rows={3}
                      defaultValue={destinatariosAtuais.join("\n")}
                      placeholder="um e-mail por linha"
                    />
                  </label>
                  <button className="botao botao-primario" type="submit">
                    Salvar cadência
                  </button>
                </form>
              </Modal>

              <Modal
                rotulo="Enviar agora"
                titulo="Enviar extrato agora"
                descricao="Escolha o período. Sem provedor configurado, o envio fica registrado como simulado."
                icone={<Send size={15} />}
              >
                <form action={enviarExtratoAgora} className="formulario">
                  <input type="hidden" name="id" value={carteira.id} />
                  <label className="campo">
                    <span>Período</span>
                    <select name="periodo" defaultValue="mes">
                      {periodos().map((pp) => (
                        <option key={pp.chave} value={pp.chave}>
                          {pp.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="campo">
                    <span>Destinatários</span>
                    <textarea
                      name="destinatarios"
                      rows={2}
                      defaultValue={destinatariosAtuais.join("\n")}
                      placeholder="um e-mail por linha"
                    />
                    <small>Em branco, usa os destinatários salvos.</small>
                  </label>
                  <button className="botao botao-primario" type="submit">
                    Enviar
                  </button>
                </form>
              </Modal>
            </div>
          )}
        </div>

        <p className="nota">
          {cadenciaAtual === "nenhuma"
            ? "Sem envio automático. O extrato continua disponível na tela e para impressão."
            : `Envio ${cadenciaAtual} no dia ${diaAtual}, para ${destinatariosAtuais.length} destinatário(s).`}
        </p>

        {envios.length > 0 && (
          <ul className="lista-estado">
            {envios.map((e) => (
              <li key={e.id}>
                <span className="rotulo">
                  {formatarData(e.criado_em.slice(0, 10))} · {e.origem === "manual" ? "manual" : "automático"}
                  <span className="dica">
                    {formatarData(e.periodo_inicio)} a {formatarData(e.periodo_fim)} ·{" "}
                    {e.destinatarios.length} destinatário(s)
                    {e.detalhe ? ` · ${e.detalhe}` : ""}
                  </span>
                </span>
                <span
                  className={
                    e.status === "enviado"
                      ? "selo selo-ok"
                      : e.status === "falhou"
                        ? "selo selo-falta"
                        : "selo selo-atencao"
                  }
                >
                  {e.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Portal da unidade</h2>
          {podeEditar && (
            <div className="cabeca-acoes">
              <Modal
                rotulo={portal ? "Configurar portal" : "Criar portal"}
                titulo="Portal da unidade"
                descricao="Um endereço só de leitura para a unidade acompanhar a própria carteira, sem precisar de usuário."
                variante="secundario"
                icone={<Share2 size={15} />}
              >
                <form action={salvarPortal} className="formulario">
                  <input type="hidden" name="carteira_id" value={carteira.id} />
                  <label className="campo">
                    <span>Título da página</span>
                    <input
                      type="text"
                      name="titulo"
                      defaultValue={portal?.titulo ?? ""}
                      maxLength={120}
                      placeholder={carteira.nome}
                    />
                  </label>
                  <label className="campo">
                    <span>Mensagem de abertura</span>
                    <textarea
                      name="mensagem"
                      rows={3}
                      defaultValue={portal?.mensagem ?? ""}
                      placeholder="opcional — aparece no topo da página"
                    />
                  </label>
                  <div className="formulario-linha">
                    <label className="campo">
                      <span>Expira em</span>
                      <input type="date" name="expira_em" defaultValue={portal?.expira_em ?? ""} />
                      <small>Em branco, não expira.</small>
                    </label>
                    <label className="campo campo-marcador">
                      <input type="checkbox" name="ativo" defaultChecked={portal?.ativo ?? true} />
                      <span>Ativo</span>
                    </label>
                    <label className="campo campo-marcador">
                      <input
                        type="checkbox"
                        name="mostrar_valores"
                        defaultChecked={portal?.mostrar_valores ?? true}
                      />
                      <span>Mostrar valores</span>
                    </label>
                  </div>
                  <button className="botao botao-primario" type="submit">
                    Salvar
                  </button>
                  <p className="nota">
                    Sem valores, a página mostra frentes, prazos e entregas sem os números de
                    dinheiro — útil quando o valor não deve circular fora de casa.
                  </p>
                </form>
              </Modal>

              {portal && (
                <Modal
                  rotulo="Trocar endereço"
                  titulo="Trocar o endereço do portal"
                  descricao="O link atual para de funcionar na hora."
                  variante="link"
                  icone={<RefreshCw size={13} />}
                >
                  <p className="nota">
                    Use quando o link tiver circulado além de quem devia. Quem estiver com o
                    endereço antigo passa a ver a mensagem de indisponível, e você envia o novo.
                  </p>
                  <form action={trocarEndereco}>
                    <input type="hidden" name="id" value={portal.id} />
                    <input type="hidden" name="carteira_id" value={carteira.id} />
                    <button className="botao botao-perigo" type="submit">
                      Trocar endereço
                    </button>
                  </form>
                </Modal>
              )}
            </div>
          )}
        </div>

        {!portal ? (
          <p className="nota">
            Nenhum portal criado. Ele dá à unidade um endereço próprio, somente leitura, com as
            frentes, os prazos e o que foi entregue — sem contatos, sem nomes de pessoas e sem
            acesso ao resto da operação.
          </p>
        ) : (
          <>
            <p className="nota">
              {portal.ativo ? "Ativo" : "Desativado"} ·{" "}
              {portal.mostrar_valores ? "com valores" : "sem valores"} ·{" "}
              {portal.expira_em ? `expira em ${formatarData(portal.expira_em)}` : "sem prazo"} ·{" "}
              {portal.acessos} {portal.acessos === 1 ? "acesso" : "acessos"}
              {portal.ultimo_acesso
                ? ` · último em ${formatarData(portal.ultimo_acesso.slice(0, 10))}`
                : ""}
            </p>
            <p className="campo-endereco dado">/portal/{portal.token}</p>
            <p className="nota" style={{ marginBottom: 0 }}>
              Endereço completo: o domínio do aplicativo seguido do caminho acima. Qualquer pessoa
              com o link abre a página — trate-o como senha.
            </p>
          </>
        )}
      </section>

      <Historico
        entidadeTipo="carteira"
        entidadeId={carteira.id}
        carteiraId={carteira.id}
        pessoas={pessoasOrg}
        editavel={podeEscrever(org.papel)}
      />

      {podeExcluir && (
        <section className="painel">
          <div className="zona-perigo" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
            <h2>Excluir carteira</h2>
            <p className="nota">Excluir a carteira apaga junto as contas, contratos, frentes, oportunidades, compromissos e todo o histórico ligados a ela.</p>
            <form action={excluirCarteira}>
              <input type="hidden" name="id" value={id} />
              <BotaoExcluir rotulo="Excluir carteira" aviso="Não há como desfazer." />
            </form>
          </div>
        </section>
      )}
    </>
  );
}
