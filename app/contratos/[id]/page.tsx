import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { formatarData, formatarValor, obterConta } from "@/lib/contas";
import {
  PERIODICIDADES,
  STATUS_CONTRATO,
  TIPOS_CLAUSULA,
  classeSelo,
  clausulasDoContrato,
  clausulasEmAlerta,
  diasAte,
  obterContrato,
  urgencia,
} from "@/lib/contratos";
import { atualizarContrato, criarClausula, excluirClausula } from "@/app/acoes/contratos";
import { Vazio } from "@/components/intro-secao";

export const dynamic = "force-dynamic";

export default async function PaginaContrato({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string; ok?: string };
}) {
  await exigirOrg();
  const contrato = await obterContrato(params.id);
  if (!contrato) notFound();

  const org = await exigirOrg();
  const [conta, clausulas] = await Promise.all([
    obterConta(contrato.conta_id),
    clausulasDoContrato(contrato.id),
  ]);

  const editavel = podeEscrever(org.papel);
  const u = urgencia(contrato);
  const alertas = clausulasEmAlerta(clausulas);

  return (
    <>
      <p className="olho">
        <Link href="/contratos">Contratos</Link>
        {conta && (
          <>
            {" · "}
            <Link href={`/contas/${conta.id}`}>{conta.nome}</Link>
          </>
        )}
      </p>
      <h1>{contrato.numero ?? "Contrato sem número"}</h1>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <section className={u.tom === "alerta" ? "painel painel-alerta" : "painel"}>
        <div className="linha-titulo">
          <h2>Prazos</h2>
          <span className={classeSelo(u.tom)}>{u.rotulo}</span>
        </div>

        <div className="grade-prazos">
          <div>
            <p className="olho">Vigência</p>
            <p className="dado destaque-dado">
              {formatarData(contrato.inicio)} — {formatarData(contrato.fim)}
            </p>
          </div>
          <div>
            <p className="olho">Janela de renegociação</p>
            <p className="dado destaque-dado">{formatarData(contrato.janela_renegociacao)}</p>
            <p className="nota">
              {contrato.aviso_previa_dias > 0
                ? `${contrato.aviso_previa_dias} dias de aviso prévio`
                : "Sem aviso prévio registrado"}
            </p>
          </div>
          <div>
            <p className="olho">Renovação</p>
            <p className="dado destaque-dado">
              {contrato.renovacao_automatica ? "Automática" : "Manual"}
            </p>
            <p className="nota">
              {contrato.renovacao_automatica
                ? "Renova sozinho se ninguém agir dentro do prazo."
                : "Exige ação antes do fim para continuar valendo."}
            </p>
          </div>
          <div>
            <p className="olho">Valor base</p>
            <p className="dado destaque-dado">{formatarValor(contrato.valor_base)}</p>
            <p className="nota">
              {PERIODICIDADES.find((p) => p.valor === contrato.periodicidade)?.rotulo ??
                "Periodicidade não definida"}
            </p>
          </div>
        </div>

        {u.detalhe && <p className="nota" style={{ marginTop: 16 }}>{u.detalhe}.</p>}

        {contrato.natureza_beneficio && (
          <p className="nota" style={{ marginTop: 12 }}>
            Benefício concedido: {contrato.natureza_beneficio}
          </p>
        )}

        {contrato.link_documento && (
          <p style={{ marginTop: 12 }}>
            <a href={contrato.link_documento} target="_blank" rel="noreferrer">
              Abrir o documento
            </a>
          </p>
        )}
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Cláusulas</h2>
          {alertas.length > 0 && (
            <span className="selo selo-falta">{alertas.length} em alerta</span>
          )}
        </div>

        {clausulas.length === 0 ? (
          <Vazio>
            Nenhuma cláusula registrada. Registre aqui o que precisa ser acompanhado — compromisso
            de volume, fidelidade, reajuste, condicionante — para que o prazo não dependa de memória.
          </Vazio>
        ) : (
          <ul className="lista-estado">
            {clausulas.map((c) => {
              const dias = diasAte(c.data_referencia);
              const emAlerta = alertas.some((a) => a.id === c.id);
              return (
                <li key={c.id}>
                  <span className="rotulo">
                    {c.descricao}
                    <span className="dica">
                      {[
                        TIPOS_CLAUSULA.find((t) => t.valor === c.tipo)?.rotulo,
                        c.data_referencia ? `referência ${formatarData(c.data_referencia)}` : null,
                        c.monitorada ? `aviso ${c.antecedencia_dias} dias antes` : null,
                        dias !== null && c.monitorada
                          ? dias < 0
                            ? `passou há ${Math.abs(dias)} dias`
                            : `faltam ${dias} dias`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {c.monitorada && (
                    <span className={emAlerta ? "selo selo-falta" : "selo selo-neutro"}>
                      {emAlerta ? "Alerta" : "Monitorada"}
                    </span>
                  )}
                  {editavel && (
                    <form action={excluirClausula}>
                      <input type="hidden" name="contrato_id" value={contrato.id} />
                      <input type="hidden" name="id" value={c.id} />
                      <button className="link-acao" type="submit">
                        Remover
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {editavel && (
          <form action={criarClausula} className="formulario" style={{ marginTop: 22 }}>
            <input type="hidden" name="contrato_id" value={contrato.id} />
            <div className="formulario-linha">
              <label className="campo">
                <span>Tipo</span>
                <select name="tipo" defaultValue="compromisso_volume">
                  {TIPOS_CLAUSULA.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.rotulo} — {t.explicacao}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Descrição</span>
                <input type="text" name="descricao" required maxLength={200} />
              </label>
            </div>
            <div className="formulario-linha">
              <label className="campo campo-marcador">
                <span>Acompanhar</span>
                <input type="checkbox" name="monitorada" />
              </label>
              <label className="campo">
                <span>Data de referência</span>
                <input type="date" name="data_referencia" />
              </label>
              <label className="campo">
                <span>Avisar quantos dias antes</span>
                <input type="number" name="antecedencia_dias" min={0} max={730} defaultValue={30} />
              </label>
              <button className="botao" type="submit">
                Incluir cláusula
              </button>
            </div>
          </form>
        )}
      </section>

      {editavel && (
        <section className="painel">
          <h2>Dados do contrato</h2>
          <form action={atualizarContrato} className="formulario">
            <input type="hidden" name="id" value={contrato.id} />

            <div className="formulario-linha">
              <label className="campo">
                <span>Número</span>
                <input type="text" name="numero" defaultValue={contrato.numero ?? ""} maxLength={60} />
              </label>
              <label className="campo">
                <span>Tipo</span>
                <input type="text" name="tipo" defaultValue={contrato.tipo ?? ""} maxLength={60} />
              </label>
              <label className="campo">
                <span>Modalidade</span>
                <input
                  type="text"
                  name="modalidade"
                  defaultValue={contrato.modalidade ?? ""}
                  maxLength={60}
                />
              </label>
              <label className="campo">
                <span>Situação</span>
                <select name="status" defaultValue={contrato.status}>
                  {STATUS_CONTRATO.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="formulario-linha">
              <label className="campo">
                <span>Início</span>
                <input type="date" name="inicio" defaultValue={contrato.inicio ?? ""} />
              </label>
              <label className="campo">
                <span>Fim</span>
                <input type="date" name="fim" defaultValue={contrato.fim ?? ""} />
              </label>
              <label className="campo">
                <span>Aviso prévio (dias)</span>
                <input
                  type="number"
                  name="aviso_previa_dias"
                  min={0}
                  max={730}
                  defaultValue={contrato.aviso_previa_dias}
                />
              </label>
              <label className="campo campo-marcador">
                <span>Renovação automática</span>
                <input
                  type="checkbox"
                  name="renovacao_automatica"
                  defaultChecked={contrato.renovacao_automatica}
                />
              </label>
            </div>

            <div className="formulario-linha">
              <label className="campo">
                <span>Valor base</span>
                <input
                  type="text"
                  name="valor_base"
                  inputMode="decimal"
                  defaultValue={contrato.valor_base ?? ""}
                />
              </label>
              <label className="campo">
                <span>Periodicidade</span>
                <select name="periodicidade" defaultValue={contrato.periodicidade ?? ""}>
                  <option value="">Não definida</option>
                  {PERIODICIDADES.map((p) => (
                    <option key={p.valor} value={p.valor}>
                      {p.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Natureza do benefício</span>
                <input
                  type="text"
                  name="natureza_beneficio"
                  defaultValue={contrato.natureza_beneficio ?? ""}
                  maxLength={120}
                />
              </label>
            </div>

            <label className="campo">
              <span>Link do documento</span>
              <input
                type="url"
                name="link_documento"
                defaultValue={contrato.link_documento ?? ""}
                placeholder="endereço no repositório oficial"
              />
              <small>O arquivo fica no seu repositório. Aqui guardamos o link rastreável.</small>
            </label>

            <label className="campo">
              <span>Observações</span>
              <textarea name="observacoes" rows={4} defaultValue={contrato.observacoes ?? ""} />
            </label>

            <button className="botao" type="submit">
              Salvar alterações
            </button>
          </form>
        </section>
      )}
    </>
  );
}
