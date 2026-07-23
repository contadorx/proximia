import Link from "next/link";
import { CalendarPlus, UserCog } from "lucide-react";
import { formatarData } from "@/lib/contas";
import { nomePessoa, type Pessoa } from "@/lib/carteiras";
import {
  classeSituacao,
  listarCompromissos,
  rotuloOrigem,
  situacao,
} from "@/lib/compromissos";
import type { EntidadeTipo } from "@/lib/registros";
import {
  criarCompromisso,
  mudarStatusCompromisso,
  reatribuirCompromisso,
} from "@/app/acoes/compromissos";
import { Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { Seletor } from "@/components/seletor";
import { BotaoEnviar } from "@/components/botao-enviar";
import { FormAcao } from "@/components/form-acao";

/**
 * Compromissos de uma entidade, no mesmo tratamento que histórico e
 * anexos já tinham. Ficava só na tela geral, e por isso quem estava
 * trabalhando numa conta não via o que havia sido combinado nela.
 */
export async function Compromissos({
  entidadeTipo,
  entidadeId,
  carteiraId,
  pessoas,
  editavel,
  usuarioId,
  volta,
}: {
  entidadeTipo: EntidadeTipo;
  entidadeId: string;
  carteiraId: string;
  pessoas: Pessoa[];
  editavel: boolean;
  usuarioId: string;
  volta: string;
}) {
  const compromissos = await listarCompromissos({
    orgId: "", // filtrado pela RLS; o alcance vem da sessão
    entidadeTipo,
    entidadeId,
  });

  const abertos = compromissos.filter((c) => c.status === "aberto");
  const concluidos = compromissos.filter((c) => c.status === "concluido").slice(0, 5);
  const atrasados = abertos.filter((c) => situacao(c).chave === "vencido").length;
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <section className={atrasados > 0 ? "painel painel-alerta" : "painel"}>
      <div className="linha-titulo">
        <h2>
          Compromissos
          {abertos.length > 0 && (
            <span className="dado passos-contagem" style={{ marginLeft: 10 }}>
              {abertos.length} em aberto
              {atrasados > 0 ? ` · ${atrasados} atrasado(s)` : ""}
            </span>
          )}
        </h2>

        {editavel && (
          <Modal
            rotulo="Novo compromisso"
            titulo="Novo compromisso"
            descricao="Já vinculado a este registro."
            icone={<CalendarPlus size={15} />}
          >
            <FormAcao action={criarCompromisso}>
              <input type="hidden" name="volta" value={volta} />
              <input type="hidden" name="carteira_id" value={carteiraId} />
              <input type="hidden" name="alvo" value={`${entidadeTipo}:${entidadeId}`} />

              <label className="campo">
                <span>O que precisa ser feito</span>
                <input type="text" name="titulo" required maxLength={160} autoFocus />
              </label>

              <div className="formulario-linha">
                <label className="campo">
                  <span>Data</span>
                  <input type="date" name="vence_em" required defaultValue={hoje} />
                </label>
                <Seletor
                  nome="dono_id"
                  rotulo="Dono"
                  opcoes={pessoas.map((p) => ({ valor: p.id, rotulo: nomePessoa(p) }))}
                  inicial={usuarioId}
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
      </div>

      {abertos.length === 0 ? (
        <Vazio>
          Nada em aberto aqui. O que for combinado nesta conversa vira data com dono — é o que
          impede a promessa de virar lembrança.
        </Vazio>
      ) : (
        <ul className="lista-estado">
          {abertos.map((c) => {
            const s = situacao(c);
            return (
              <li key={c.id}>
                <span className="rotulo">
                  {c.titulo}
                  <span className="dica">
                    {[
                      formatarData(c.vence_em),
                      s.detalhe,
                      c.dono_id ? nomePessoa(pessoas.find((p) => p.id === c.dono_id)) : "sem dono",
                      c.origem !== "manual" ? rotuloOrigem(c.origem) : null,
                      c.descricao,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>

                <span className={classeSituacao(s.tom)}>{s.rotulo}</span>

                {editavel && (
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

                {editavel && (
                  <form action={mudarStatusCompromisso}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="status" value="concluido" />
                    <input type="hidden" name="volta" value={volta} />
                    <button className="link-acao" type="submit">
                      Concluir
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {concluidos.length > 0 && (
        <>
          <h3 style={{ marginTop: 20 }}>Concluídos</h3>
          <ul className="lista-estado">
            {concluidos.map((c) => (
              <li key={c.id}>
                <span className="rotulo">
                  {c.titulo}
                  <span className="dica">
                    {formatarData(c.vence_em)}
                    {c.dono_id ? ` · ${nomePessoa(pessoas.find((p) => p.id === c.dono_id))}` : ""}
                  </span>
                </span>
                <span className="selo selo-ok">concluído</span>
                {editavel && (
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
            ))}
          </ul>
        </>
      )}

      {abertos.length > 0 && (
        <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
          <Link href={`/compromissos?alvo=${entidadeTipo}:${entidadeId}`}>
            Ver na tela de compromissos
          </Link>
        </p>
      )}
    </section>
  );
}
