import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { listarCarteiras, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { formatarData, formatarValor } from "@/lib/contas";
import {
  STATUS_FRENTE,
  classeStatus,
  obterFrente,
  rotuloStatus,
  tiposDeFrente,
} from "@/lib/frentes";
import { atualizarFrente, incluirLink, removerLink } from "@/app/acoes/frentes";
import { Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { BotaoExcluir } from "@/components/botao-excluir";
import { excluirFrente } from "@/app/acoes/exclusoes";
import { Pencil } from "lucide-react";
import { Historico } from "@/components/historico";
import { Anexos } from "@/components/anexos";

export const dynamic = "force-dynamic";

export default async function PaginaFrente({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const frente = await obterFrente(params.id);
  if (!frente) notFound();

  const [carteiras, pessoas, tipos] = await Promise.all([
    listarCarteiras(org.orgId),
    pessoasDaOrganizacao(org.orgId),
    tiposDeFrente(org.orgId),
  ]);

  const editavel = podeEscrever(org.papel);
  const podeExcluir = org.papel !== "ponto_focal" && podeEscrever(org.papel);
  const id = frente.id;
  const carteira = carteiras.find((c) => c.id === frente.carteira_id);
  const links = frente.links ?? [];

  return (
    <>
      <p className="olho">
        <Link href="/frentes">Frentes</Link>
        {carteira && (
          <>
            {" · "}
            <Link href={`/carteiras/${carteira.id}`}>{carteira.nome}</Link>
          </>
        )}
      </p>

      <div className="linha-titulo">
        <h1>{frente.titulo}</h1>
        <span className={classeStatus(frente.status)}>{rotuloStatus(frente.status)}</span>
      </div>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      {frente.status === "descartada" && frente.motivo_descarte && (
        <div className="intro-secao" style={{ borderLeftColor: "var(--alerta)" }}>
          <strong>Descartada:</strong> {frente.motivo_descarte}
        </div>
      )}

      <section className="painel">
        <div className="grade-prazos">
          <div>
            <p className="olho">Casos</p>
            <p className="dado destaque-dado">
              {frente.qtd_casos !== null ? frente.qtd_casos.toLocaleString("pt-BR") : "—"}
            </p>
          </div>
          <div>
            <p className="olho">Potencial estimado</p>
            <p className="dado destaque-dado valor-teto" style={{ fontSize: 16 }}>
              {formatarValor(frente.potencial_bruto)}
            </p>
            <p className="nota">
              {frente.potencial_bruto === null
                ? "Sem estimativa."
                : `${frente.potencial_origem} · ${formatarData(frente.potencial_data)}`}
            </p>
          </div>
          <div>
            <p className="olho">Capturado</p>
            <p className="dado destaque-dado valor-capturado" style={{ fontSize: 16 }}>
              {formatarValor(frente.valor_capturado)}
            </p>
            <p className="nota">
              {frente.valor_capturado === null
                ? "Nada confirmado."
                : `Confirmado em ${formatarData(frente.capturado_confirmado_em)}`}
            </p>
          </div>
          <div>
            <p className="olho">Dono e prazo</p>
            <p className="dado destaque-dado" style={{ fontSize: 15 }}>
              {frente.dono_id ? nomePessoa(pessoas.find((p) => p.id === frente.dono_id)) : "sem dono"}
            </p>
            <p className="nota">{frente.prazo ? formatarData(frente.prazo) : "sem prazo"}</p>
          </div>
        </div>

        {frente.proxima_etapa && (
          <p className="nota" style={{ marginTop: 16 }}>
            Próxima etapa: {frente.proxima_etapa}
          </p>
        )}
      </section>

      <section className="painel">
        <h2>Base de trabalho</h2>
        {links.length === 0 ? (
          <Vazio>
            Nenhum link ainda. A planilha, a consulta ou a pasta com os casos continua onde está —
            aqui fica só o endereço, para quem abrir a frente chegar nela em um clique.
          </Vazio>
        ) : (
          <ul className="lista-estado">
            {links.map((l, i) => (
              <li key={`${l.url}-${i}`}>
                <span className="rotulo">
                  <a href={l.url} target="_blank" rel="noreferrer">
                    {l.rotulo}
                  </a>
                  <span className="dica">{l.url}</span>
                </span>
                {editavel && (
                  <form action={removerLink}>
                    <input type="hidden" name="id" value={frente.id} />
                    <input type="hidden" name="posicao" value={i} />
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
          <form action={incluirLink} className="formulario formulario-linha" style={{ marginTop: 18 }}>
            <input type="hidden" name="id" value={frente.id} />
            <label className="campo">
              <span>Nome do link</span>
              <input type="text" name="rotulo" required maxLength={80} placeholder="Planilha de trabalho" />
            </label>
            <label className="campo">
              <span>Endereço</span>
              <input type="url" name="url" required placeholder="https://" />
            </label>
            <button className="botao botao-secundario" type="submit">
              Incluir link
            </button>
          </form>
        )}
      </section>

      {editavel && (
        <Modal rotulo="Editar frente" titulo="Editar frente" descricao="Descarte exige motivo." largo icone={<Pencil size={15} />} variante="secundario">
          <form action={atualizarFrente} className="formulario">
            <input type="hidden" name="id" value={frente.id} />

            <div className="formulario-linha">
              <label className="campo">
                <span>Título</span>
                <input type="text" name="titulo" defaultValue={frente.titulo} required maxLength={160} />
              </label>
              <label className="campo">
                <span>Tipo</span>
                <select name="catalogo_id" defaultValue={frente.catalogo_id ?? ""}>
                  <option value="">Sem tipo</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Situação</span>
                <select name="status" defaultValue={frente.status}>
                  {STATUS_FRENTE.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Dono</span>
                <select name="dono_id" defaultValue={frente.dono_id ?? ""}>
                  <option value="">Sem dono</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {nomePessoa(p)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="campo">
              <span>Motivo do descarte</span>
              <input
                type="text"
                name="motivo_descarte"
                defaultValue={frente.motivo_descarte ?? ""}
                maxLength={200}
                placeholder="obrigatório apenas se a situação for descartada"
              />
              <small>Frente descartada sem motivo apaga o aprendizado — o sistema não aceita.</small>
            </label>

            <div className="formulario-linha">
              <label className="campo">
                <span>Casos</span>
                <input type="number" name="qtd_casos" min={0} defaultValue={frente.qtd_casos ?? ""} />
              </label>
              <label className="campo">
                <span>Próxima etapa</span>
                <input
                  type="text"
                  name="proxima_etapa"
                  defaultValue={frente.proxima_etapa ?? ""}
                  maxLength={160}
                />
              </label>
              <label className="campo">
                <span>Prazo</span>
                <input type="date" name="prazo" defaultValue={frente.prazo ?? ""} />
              </label>
            </div>

            <div className="formulario-linha">
              <label className="campo">
                <span>Potencial estimado</span>
                <input
                  type="text"
                  name="potencial_bruto"
                  inputMode="decimal"
                  defaultValue={frente.potencial_bruto ?? ""}
                />
              </label>
              <label className="campo">
                <span>Origem da estimativa</span>
                <input
                  type="text"
                  name="potencial_origem"
                  defaultValue={frente.potencial_origem ?? ""}
                  maxLength={160}
                />
              </label>
              <label className="campo">
                <span>Data da apuração</span>
                <input type="date" name="potencial_data" defaultValue={frente.potencial_data ?? ""} />
              </label>
            </div>

            <div className="formulario-linha">
              <label className="campo">
                <span>Capturado</span>
                <input
                  type="text"
                  name="valor_capturado"
                  inputMode="decimal"
                  defaultValue={frente.valor_capturado ?? ""}
                />
              </label>
              <label className="campo">
                <span>Confirmado em</span>
                <input
                  type="date"
                  name="capturado_confirmado_em"
                  defaultValue={frente.capturado_confirmado_em ?? ""}
                />
              </label>
            </div>

            <label className="campo">
              <span>Observações</span>
              <textarea name="observacoes" rows={4} defaultValue={frente.observacoes ?? ""} />
            </label>

            <button className="botao botao-primario" type="submit">
              Salvar alterações
            </button>
          </form>
        </Modal>
      )}
      <Historico
        entidadeTipo="frente"
        entidadeId={frente.id}
        carteiraId={frente.carteira_id}
        pessoas={pessoas}
        editavel={editavel}
      />

      <Anexos
        entidadeTipo="frente"
        entidadeId={frente.id}
        carteiraId={frente.carteira_id}
        pessoas={pessoas}
        editavel={editavel}
        volta={`/frentes/${frente.id}`}
      />

      {podeExcluir && (
        <section className="painel">
          <div className="zona-perigo" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
            <h2>Excluir frente</h2>
            <p className="nota">Apaga o histórico registrado nela. Se a frente não se sustenta, prefira descartar com motivo — o aprendizado fica.</p>
            <form action={excluirFrente}>
              <input type="hidden" name="id" value={id} />
              <BotaoExcluir rotulo="Excluir frente" aviso="Não há como desfazer." />
            </form>
          </div>
        </section>
      )}
    </>
  );
}
