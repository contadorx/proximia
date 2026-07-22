import { nomePessoa, type Pessoa } from "@/lib/carteiras";
import { formatarData } from "@/lib/contas";
import {
  TIPOS_REGISTRO,
  registrosDaEntidade,
  rotuloTipo,
  type EntidadeTipo,
} from "@/lib/registros";
import { criarRegistro, editarRegistro } from "@/app/acoes/registros";
import { Vazio } from "@/components/intro-secao";

/**
 * Historico de uma entidade. Cada linha mostra quem escreveu e quando.
 * Editar nao apaga: gera uma versao nova e a anterior continua no banco.
 */
export async function Historico({
  entidadeTipo,
  entidadeId,
  carteiraId,
  pessoas,
  editavel,
}: {
  entidadeTipo: EntidadeTipo;
  entidadeId: string;
  carteiraId: string;
  pessoas: Pessoa[];
  editavel: boolean;
}) {
  const registros = await registrosDaEntidade(entidadeTipo, entidadeId);
  const hoje = new Date().toISOString().slice(0, 10);
  const autor = (id: string) => nomePessoa(pessoas.find((p) => p.id === id));

  return (
    <section className="painel">
      <div className="linha-titulo">
        <h2>Histórico</h2>
        {registros.length > 0 && (
          <span className="dado passos-contagem">
            {registros.length} {registros.length === 1 ? "registro" : "registros"}
          </span>
        )}
      </div>

      {registros.length === 0 ? (
        <Vazio>
          Nada registrado ainda. O que for escrito aqui fica com autor e data, e continua existindo
          mesmo que a pessoa saia — é isso que separa memória da operação de memória de alguém.
        </Vazio>
      ) : (
        <ol className="linha-tempo">
          {registros.map((r) => (
            <li key={r.id}>
              <div className="registro-cabeca">
                <span className="selo selo-neutro">{rotuloTipo(r.tipo)}</span>
                <span className="dado registro-data">{formatarData(r.ocorrido_em)}</span>
                <span className="registro-autor">{autor(r.autor_id)}</span>
                {r.versao > 1 && <span className="registro-versao dado">v{r.versao}</span>}
              </div>

              {r.titulo && <p className="registro-titulo">{r.titulo}</p>}
              <p className="registro-corpo">{r.corpo}</p>

              {editavel && (
                <details className="registro-editar">
                  <summary>Editar</summary>
                  <form action={editarRegistro} className="formulario">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="entidade_tipo" value={entidadeTipo} />
                    <input type="hidden" name="entidade_id" value={entidadeId} />
                    <div className="formulario-linha">
                      <label className="campo">
                        <span>Tipo</span>
                        <select name="tipo" defaultValue={r.tipo}>
                          {TIPOS_REGISTRO.map((t) => (
                            <option key={t.valor} value={t.valor}>
                              {t.rotulo}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="campo">
                        <span>Título</span>
                        <input type="text" name="titulo" defaultValue={r.titulo ?? ""} maxLength={160} />
                      </label>
                      <label className="campo">
                        <span>Quando</span>
                        <input type="date" name="ocorrido_em" defaultValue={r.ocorrido_em} />
                      </label>
                    </div>
                    <label className="campo">
                      <span>Conteúdo</span>
                      <textarea name="corpo" rows={3} defaultValue={r.corpo} required />
                    </label>
                    <button className="botao botao-secundario" type="submit">
                      Salvar como nova versão
                    </button>
                    <p className="nota">
                      A versão atual continua guardada. Nada é sobrescrito.
                    </p>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}

      {editavel && (
        <form action={criarRegistro} className="formulario" style={{ marginTop: 22 }}>
          <input type="hidden" name="entidade_tipo" value={entidadeTipo} />
          <input type="hidden" name="entidade_id" value={entidadeId} />
          <input type="hidden" name="carteira_id" value={carteiraId} />

          <div className="formulario-linha">
            <label className="campo">
              <span>Tipo</span>
              <select name="tipo" defaultValue="nota">
                {TIPOS_REGISTRO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo} — {t.explicacao}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Título</span>
              <input type="text" name="titulo" maxLength={160} placeholder="opcional" />
            </label>
            <label className="campo">
              <span>Quando</span>
              <input type="date" name="ocorrido_em" defaultValue={hoje} />
            </label>
          </div>

          <label className="campo">
            <span>O que aconteceu</span>
            <textarea name="corpo" rows={3} required placeholder="Escreva como contaria a alguém que assume amanhã." />
          </label>

          <button className="botao" type="submit">
            Registrar
          </button>
        </form>
      )}
    </section>
  );
}
