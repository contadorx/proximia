import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirOrg, exigirUsuario, podeEscrever } from "@/lib/auth";
import { listarCarteiras, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import {
  CRITICIDADES,
  RELACOES,
  contatosDaConta,
  formatarData,
  formatarDocumento,
  formatarValor,
  obterConta,
} from "@/lib/contas";
import { classeSelo, listarContratos, urgencia } from "@/lib/contratos";
import { atualizarConta, criarContato, excluirContato } from "@/app/acoes/contas";
import { Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { BotaoExcluir } from "@/components/botao-excluir";
import { excluirConta } from "@/app/acoes/exclusoes";
import { Pencil } from "lucide-react";
import { Historico } from "@/components/historico";
import { Anexos } from "@/components/anexos";
import { Compromissos } from "@/components/compromissos";
import { Capturas } from "@/components/capturas";
import { classeFase, formatarPayback, listarOportunidades, rotuloFase } from "@/lib/oportunidades";


export const dynamic = "force-dynamic";

export default async function PaginaConta({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();
  const conta = await obterConta(params.id);
  if (!conta) notFound();

  const [carteiras, pessoas, contatos, contratos, oportunidades] = await Promise.all([
    listarCarteiras(org.orgId),
    pessoasDaOrganizacao(org.orgId),
    contatosDaConta(conta.id),
    listarContratos({ orgId: org.orgId, contaId: conta.id }),
    listarOportunidades({ orgId: org.orgId, contaId: conta.id }),
  ]);

  const editavel = podeEscrever(org.papel);
  const podeExcluir = org.papel !== "ponto_focal" && podeEscrever(org.papel);
  const id = conta.id;
  const carteira = carteiras.find((c) => c.id === conta.carteira_id);

  return (
    <>
      <p className="olho">
        <Link href="/contas">Contas</Link>
        {carteira && (
          <>
            {" · "}
            <Link href={`/carteiras/${carteira.id}`}>{carteira.nome}</Link>
          </>
        )}
      </p>
      <h1>{conta.nome}</h1>
      <p className="chamada">
        {[conta.razao_social, formatarDocumento(conta.documento), conta.segmento]
          .filter((v) => v && v !== "—")
          .join(" · ") || "Sem razão social, CNPJ ou segmento registrados."}
      </p>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <section className="painel">
        <h2>Potencial e realizado</h2>
        <div className="dois-valores">
          <div>
            <p className="olho">Potencial estimado</p>
            <p className="numero-grande valor-teto">{formatarValor(conta.potencial_bruto)}</p>
            <p className="nota">
              {conta.potencial_bruto === null
                ? "Nenhuma estimativa registrada."
                : `${conta.potencial_origem} · apurado em ${formatarData(conta.potencial_data)}`}
            </p>
          </div>
          <div>
            <p className="olho">Capturado</p>
            <p className="numero-grande valor-capturado">{formatarValor(conta.valor_capturado)}</p>
            <p className="nota">
              {conta.valor_capturado === null
                ? "Nada confirmado ainda."
                : `Confirmado em ${formatarData(conta.capturado_confirmado_em)}`}
            </p>
          </div>
        </div>
        <p className="nota" style={{ marginTop: 16 }}>
          Os dois números têm naturezas diferentes e não se somam. Potencial é teto estimado, com
          origem e data; capturado é o que já se confirmou.
        </p>
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Contratos</h2>
          <Link className="link-acao" href="/contratos">
            Registrar contrato
          </Link>
        </div>
        {contratos.length === 0 ? (
          <Vazio>Nenhum contrato registrado para esta conta.</Vazio>
        ) : (
          <ul className="lista-estado">
            {contratos.map((ct) => {
              const u = urgencia(ct);
              return (
                <li key={ct.id}>
                  <span className="rotulo">
                    <Link href={`/contratos/${ct.id}`}>{ct.numero ?? "Contrato sem número"}</Link>
                    <span className="dica">
                      {[ct.tipo, ct.fim ? `vence ${formatarData(ct.fim)}` : null, u.detalhe]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className={classeSelo(u.tom)}>{u.rotulo}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {oportunidades.length > 0 && (
        <section className="painel">
          <h2>Oportunidades</h2>
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
        <h2>Contatos</h2>
        {contatos.length === 0 ? (
          <p className="nota">Nenhum contato registrado.</p>
        ) : (
          <ul className="lista-estado">
            {contatos.map((c) => (
              <li key={c.id}>
                <span className="rotulo">
                  {c.nome}
                  <span className="dica">
                    {[c.cargo, c.email, c.telefone].filter(Boolean).join(" · ") || "sem dados de contato"}
                  </span>
                </span>
                {c.principal && <span className="selo selo-ok">Principal</span>}
                {editavel && (
                  <form action={excluirContato}>
                    <input type="hidden" name="conta_id" value={conta.id} />
                    <input type="hidden" name="id" value={c.id} />
                    <button className="link-acao" type="submit">
                      Remover
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {editavel && (
          <form action={criarContato} className="formulario formulario-linha" style={{ marginTop: 20 }}>
            <input type="hidden" name="conta_id" value={conta.id} />
            <label className="campo">
              <span>Nome</span>
              <input type="text" name="nome" required maxLength={120} />
            </label>
            <label className="campo">
              <span>Cargo</span>
              <input type="text" name="cargo" maxLength={80} />
            </label>
            <label className="campo">
              <span>E-mail</span>
              <input type="email" name="email" maxLength={120} />
            </label>
            <label className="campo">
              <span>Telefone</span>
              <input type="text" name="telefone" maxLength={40} />
            </label>
            <label className="campo campo-marcador">
              <span>Principal</span>
              <input type="checkbox" name="principal" />
            </label>
            <button className="botao botao-primario" type="submit">
              Incluir contato
            </button>
          </form>
        )}
      </section>

      {editavel && (
        <Modal rotulo="Editar conta" titulo="Editar conta" descricao="Potencial exige origem declarada." largo icone={<Pencil size={15} />} variante="secundario">
          <form action={atualizarConta} className="formulario">
            <input type="hidden" name="id" value={conta.id} />

            <div className="formulario-linha">
              <label className="campo">
                <span>Nome</span>
                <input type="text" name="nome" defaultValue={conta.nome} required maxLength={160} />
              </label>
              <label className="campo">
                <span>Razão social</span>
                <input
                  type="text"
                  name="razao_social"
                  defaultValue={conta.razao_social ?? ""}
                  maxLength={160}
                />
              </label>
              <label className="campo">
                <span>CNPJ</span>
                <input type="text" name="documento" defaultValue={conta.documento ?? ""} maxLength={20} />
              </label>
            </div>

            <div className="formulario-linha">
              <label className="campo">
                <span>Relação</span>
                <select name="relacao" defaultValue={conta.relacao}>
                  {RELACOES.map((r) => (
                    <option key={r.valor} value={r.valor}>
                      {r.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Criticidade</span>
                <select name="criticidade" defaultValue={conta.criticidade}>
                  {CRITICIDADES.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Situação</span>
                <select name="status" defaultValue={conta.status}>
                  <option value="ativa">Ativa</option>
                  <option value="encerrada">Encerrada</option>
                </select>
              </label>
              <label className="campo">
                <span>Responsável</span>
                <select name="responsavel_id" defaultValue={conta.responsavel_id ?? ""}>
                  <option value="">Sem responsável</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {nomePessoa(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Segmento</span>
                <input type="text" name="segmento" defaultValue={conta.segmento ?? ""} maxLength={80} />
              </label>
            </div>

            <div className="formulario-linha">
              <label className="campo">
                <span>Potencial estimado</span>
                <input
                  type="text"
                  name="potencial_bruto"
                  inputMode="decimal"
                  defaultValue={conta.potencial_bruto ?? ""}
                />
              </label>
              <label className="campo">
                <span>Origem da estimativa</span>
                <input
                  type="text"
                  name="potencial_origem"
                  defaultValue={conta.potencial_origem ?? ""}
                  maxLength={160}
                  placeholder="de onde veio esse número"
                />
              </label>
              <label className="campo">
                <span>Data da apuração</span>
                <input type="date" name="potencial_data" defaultValue={conta.potencial_data ?? ""} />
              </label>
            </div>
              <p className="nota">
                O valor capturado não é mais editado aqui: ele é a soma dos lançamentos registrados
                no bloco &ldquo;Capturado&rdquo;, cada um com data, autor e comprovação.
              </p>

            <label className="campo">
              <span>Observações</span>
              <textarea name="observacoes" rows={4} defaultValue={conta.observacoes ?? ""} />
            </label>

            <button className="botao botao-primario" type="submit">
              Salvar alterações
            </button>
          </form>
        </Modal>
      )}

      <Capturas
        entidadeTipo="conta"
        entidadeId={conta.id}
        carteiraId={conta.carteira_id}
        potencial={conta.potencial_bruto}
        pessoas={pessoas}
        editavel={editavel}
      />

      <Anexos
        entidadeTipo="conta"
        entidadeId={conta.id}
        carteiraId={conta.carteira_id}
        pessoas={pessoas}
        editavel={editavel}
      />

      <Compromissos
        entidadeTipo="conta"
        entidadeId={conta.id}
        carteiraId={conta.carteira_id}
        pessoas={pessoas}
        editavel={editavel}
        usuarioId={usuario.id}
        volta={`/contas/${conta.id}`}
      />

      <Historico
        entidadeTipo="conta"
        entidadeId={conta.id}
        carteiraId={conta.carteira_id}
        pessoas={pessoas}
        editavel={editavel}
      />

      {podeExcluir && (
        <section className="painel">
          <div className="zona-perigo" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
            <h2>Excluir conta</h2>
            <p className="nota">Apaga também os contratos, contatos e o histórico desta conta.</p>
            <form action={excluirConta}>
              <input type="hidden" name="id" value={id} />
              <BotaoExcluir rotulo="Excluir conta" aviso="Não há como desfazer." />
            </form>
          </div>
        </section>
      )}
    </>
  );
}
