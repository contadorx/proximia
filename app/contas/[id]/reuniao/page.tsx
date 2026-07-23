import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirOrg } from "@/lib/auth";
import { listarCarteiras, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { formatarData, formatarDocumento, formatarValor, obterConta } from "@/lib/contas";
import { listarContratos } from "@/lib/contratos";
import { listarCompromissos, situacao } from "@/lib/compromissos";
import { capturasDa } from "@/lib/capturas";
import { registrosDaEntidade, rotuloTipo } from "@/lib/registros";
import { listarAlertas } from "@/lib/alertas";
import { sinaisDaConta } from "@/lib/sinais";
import {
  classeTom,
  contatosDoMapa,
  lerMapa,
  papeisDecisao,
  posturasContato,
  rotuloInfluencia,
} from "@/lib/decisores";
import { montarDossie, periodoDe, porTipo } from "@/lib/dossie";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { Vazio } from "@/components/intro-secao";

export const dynamic = "force-dynamic";

const PERIODOS = [30, 90, 180, 365];

/**
 * Dossiê de reunião.
 *
 * É a resposta ao "resumo do histórico antes da reunião" sem mandar
 * histórico nenhum para fora. Nada aqui passa por modelo de terceiro:
 * é o que a operação registrou, recortado pelo período e ordenado pela
 * pergunta que se faz no carro, cinco minutos antes.
 *
 * A ficha da conta mostra tudo. Este dossiê mostra o que MUDOU desde a
 * última conversa, e o que está pendente agora — que é outra pergunta.
 *
 * Feito para imprimir: uma folha, sem controle de edição, sem menu.
 */
export default async function PaginaDossie({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { dias?: string };
}) {
  const org = await exigirOrg();
  const conta = await obterConta(params.id);
  if (!conta) notFound();

  const dias = PERIODOS.includes(Number(searchParams.dias)) ? Number(searchParams.dias) : 90;
  const periodo = periodoDe(dias);

  const [
    carteiras,
    pessoas,
    contratos,
    compromissos,
    capturas,
    registros,
    avisos,
    contatos,
    papeis,
    posturas,
  ] = await Promise.all([
    listarCarteiras(org.orgId),
    pessoasDaOrganizacao(org.orgId),
    listarContratos({ orgId: org.orgId, contaId: conta.id }),
    listarCompromissos({ orgId: org.orgId }),
    capturasDa("conta", conta.id),
    registrosDaEntidade("conta", conta.id),
    listarAlertas({ orgId: org.orgId, status: "aberto" }),
    contatosDoMapa(conta.id),
    papeisDecisao(org.orgId),
    posturasContato(org.orgId),
  ]);

  const daConta = compromissos.filter(
    (c) => c.entidade_tipo === "conta" && c.entidade_id === conta.id,
  );

  const dossie = montarDossie({
    periodo,
    registros,
    compromissos: daConta,
    capturas,
    contratos,
    hoje: new Date(),
  });

  const mapa = lerMapa(contatos, papeis, posturas);
  const papelDe = new Map(papeis.map((p) => [p.id, p]));
  const posturaDe = new Map(posturas.map((p) => [p.id, p]));

  const sinais = sinaisDaConta({
    contaId: conta.id,
    potencialBruto: conta.potencial_bruto,
    valorCapturado: conta.valor_capturado,
    contratos,
    avisosAbertos: avisos,
    compromissosAbertos: daConta.filter((c) => c.status === "aberto"),
    ultimoRegistroEm: registros[0]?.ocorrido_em ?? null,
  });

  const carteira = carteiras.find((c) => c.id === conta.carteira_id);
  const nome = (id: string | null) =>
    id ? nomePessoa(pessoas.find((p) => p.id === id)) : "sem responsável";

  return (
    <div className="folha">
      <div className="cabeca-pagina nao-imprimir">
        <div>
          <p className="olho">
            <Link href={`/contas/${conta.id}`}>{conta.nome}</Link>
          </p>
          <h1>Dossiê de reunião</h1>
        </div>
        <div className="cabeca-acoes">
          {PERIODOS.map((d) => (
            <Link
              key={d}
              className={d === dias ? "botao botao-secundario ativo" : "botao botao-secundario"}
              href={`/contas/${conta.id}/reuniao?dias=${d}`}
            >
              {d} dias
            </Link>
          ))}
          <BotaoImprimir />
        </div>
      </div>

      {/* Cabeçalho da folha: o que aparece no papel. */}
      <div className="folha-bloco">
        <p className="olho">{org.nome}</p>
        <h1>{conta.nome}</h1>
        <p className="chamada">
          {[
            carteira?.nome,
            formatarDocumento(conta.documento),
            conta.segmento,
            `período: ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`,
          ]
            .filter((v) => v && v !== "—")
            .join(" · ")}
        </p>
      </div>

      {dossie.semMovimento && (
        <p className="aviso aviso-erro">
          <strong>Sem movimento no período.</strong> Nenhum registro, nenhum compromisso concluído
          e nenhuma captura confirmada nos últimos {dias} dias
          {dossie.diasSemRegistro !== null
            ? ` — o último registro foi há ${dossie.diasSemRegistro} dias`
            : " — e não há registro nenhum nesta conta"}
          . É o primeiro assunto da reunião.
        </p>
      )}

      {/* ---------------------------------------------- quem decide */}
      <section className="folha-bloco">
        <h2>Quem decide</h2>
        {mapa.total === 0 ? (
          <Vazio>Nenhum contato mapeado. Antes da próxima, vale perguntar quem assina.</Vazio>
        ) : (
          <>
            <ul className="folha-lista">
              {contatos.map((c) => {
                const papel = c.papel_id ? papelDe.get(c.papel_id) : undefined;
                const postura = c.postura_id ? posturaDe.get(c.postura_id) : undefined;
                const chefe = c.reporta_a ? contatos.find((k) => k.id === c.reporta_a) : undefined;
                return (
                  <li key={c.id}>
                    <span className="rotulo">
                      {c.nome}
                      <span className="dica">
                        {[
                          papel?.rotulo ?? "papel não definido",
                          c.cargo,
                          c.area,
                          chefe ? `reporta a ${chefe.nome}` : null,
                          rotuloInfluencia(c.influencia),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {papel?.decide && <span className="selo selo-ok">Decide</span>}
                    {postura && <span className={classeTom(postura.tom)}>{postura.rotulo}</span>}
                  </li>
                );
              })}
            </ul>
            {mapa.contra.length > 0 && (
              <p className="nota">
                <strong>Trate antes:</strong> {mapa.contra.map((c) => c.nome).join(", ")} —
                resistência declarada no mapa.
              </p>
            )}
          </>
        )}
      </section>

      {/* ------------------------------------------ o que mudou */}
      <section className="folha-bloco">
        <h2>O que mudou nestes {dias} dias</h2>

        <div className="cartoes">
          <div className="cartao">
            <p className="olho">Capturado no período</p>
            <p className="cartao-valor capturado">{formatarValor(dossie.capturadoNoPeriodo)}</p>
            <p className="cartao-nota">
              {dossie.capturasNoPeriodo.length} lançamento(s) com data confirmada
            </p>
          </div>
          <div className="cartao">
            <p className="olho">Potencial declarado</p>
            <p className="cartao-valor teto">{formatarValor(conta.potencial_bruto)}</p>
            <p className="cartao-nota">
              {conta.potencial_bruto === null
                ? "sem estimativa registrada"
                : `${conta.potencial_origem} · ${formatarData(conta.potencial_data)}`}
            </p>
          </div>
          <div className="cartao">
            <p className="olho">Combinados cumpridos</p>
            <p className="cartao-valor">{dossie.compromissosConcluidos.length}</p>
            <p className="cartao-nota">concluídos no período</p>
          </div>
          <div className="cartao">
            <p className="olho">Conversas registradas</p>
            <p className="cartao-valor">{dossie.registrosNoPeriodo.length}</p>
            <p className="cartao-nota">
              {dossie.diasSemRegistro !== null
                ? `última há ${dossie.diasSemRegistro} dias`
                : "nenhuma registrada"}
            </p>
          </div>
        </div>

        {dossie.capturasNoPeriodo.length > 0 && (
          <>
            <p className="olho">Captura confirmada</p>
            <ul className="folha-lista">
              {dossie.capturasNoPeriodo.map((c) => (
                <li key={c.id}>
                  <span className="rotulo">
                    {c.tipo === "estorno" ? "Estorno" : "Captura"} de {formatarValor(c.valor)}
                    <span className="dica">
                      {[
                        formatarData(c.confirmado_em),
                        c.descricao,
                        c.comprovacao ? `comprovação: ${c.comprovacao}` : "sem comprovação anexada",
                        nome(c.autor_id),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {dossie.compromissosConcluidos.length > 0 && (
          <>
            <p className="olho">Combinados cumpridos</p>
            <ul className="folha-lista">
              {dossie.compromissosConcluidos.map((c) => (
                <li key={c.id}>
                  <span className="rotulo">
                    {c.titulo}
                    <span className="dica">
                      concluído em {formatarData(c.concluido_em)} · {nome(c.dono_id)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {dossie.registrosNoPeriodo.length > 0 &&
          porTipo(dossie.registrosNoPeriodo).map((grupo) => (
            <div key={grupo.tipo}>
              <p className="olho">{rotuloTipo(grupo.tipo as never)}</p>
              <ul className="folha-lista">
                {grupo.itens.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    <span className="rotulo">
                      {r.titulo ?? r.corpo.slice(0, 70)}
                      <span className="dica">
                        {formatarData(r.ocorrido_em)} · {nome(r.autor_id)}
                        {r.titulo ? ` · ${r.corpo.slice(0, 90)}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {grupo.itens.length > 8 && (
                <p className="nota">
                  e mais {grupo.itens.length - 8} — o histórico completo está na ficha.
                </p>
              )}
            </div>
          ))}
      </section>

      {/* ------------------------------------------ o que está aberto */}
      <section className="folha-bloco">
        <h2>O que está aberto agora</h2>

        {dossie.compromissosAtrasados.length === 0 &&
        dossie.compromissosProximos.length === 0 &&
        dossie.contratosEmDecisao.length === 0 &&
        sinais.length === 0 ? (
          <Vazio>Nada pendente nesta conta.</Vazio>
        ) : (
          <>
            {dossie.compromissosAtrasados.length > 0 && (
              <>
                <p className="olho">Atrasados</p>
                <ul className="folha-lista">
                  {dossie.compromissosAtrasados.map((c) => (
                    <li key={c.id}>
                      <span className="rotulo">
                        {c.titulo}
                        <span className="dica">
                          venceu em {formatarData(c.vence_em)} · {situacao(c).detalhe} ·{" "}
                          {nome(c.dono_id)}
                        </span>
                      </span>
                      <span className="selo selo-falta">atrasado</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {dossie.compromissosProximos.length > 0 && (
              <>
                <p className="olho">Nos próximos dias</p>
                <ul className="folha-lista">
                  {dossie.compromissosProximos.map((c) => (
                    <li key={c.id}>
                      <span className="rotulo">
                        {c.titulo}
                        <span className="dica">
                          {formatarData(c.vence_em)} · {nome(c.dono_id)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {dossie.contratosEmDecisao.length > 0 && (
              <>
                <p className="olho">Contratos que exigem decisão</p>
                <ul className="folha-lista">
                  {dossie.contratosEmDecisao.map(({ contrato, motivo }) => (
                    <li key={contrato.id}>
                      <span className="rotulo">
                        {contrato.numero ?? "Contrato sem número"}
                        <span className="dica">
                          {[
                            contrato.fim ? `vence ${formatarData(contrato.fim)}` : "sem data de fim",
                            motivo,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {sinais.length > 0 && (
              <>
                <p className="olho">Sinais</p>
                <ul className="folha-lista">
                  {sinais.map((s) => (
                    <li key={s.chave}>
                      <span className="rotulo">
                        {s.rotulo}
                        {s.detalhe && <span className="dica">{s.detalhe}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      <p className="nota">
        Montado a partir do que está registrado nesta conta, no período escolhido. Nenhum número
        aqui foi estimado ou resumido por terceiro: potencial é estimativa declarada com origem e
        data; capturado é evento confirmado com autor. Os dois não se somam.
      </p>
    </div>
  );
}
