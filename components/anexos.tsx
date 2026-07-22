import { Download, ExternalLink, Link2, Paperclip, Upload } from "lucide-react";
import { nomePessoa, type Pessoa } from "@/lib/carteiras";
import { formatarData } from "@/lib/contas";
import { anexosDaEntidade, extensao, formatarTamanho } from "@/lib/anexos";
import type { EntidadeTipo } from "@/lib/registros";
import { anexarArquivo, anexarLink, baixarAnexo, removerAnexo } from "@/app/acoes/anexos";
import { Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { BotaoExcluir } from "@/components/botao-excluir";

/**
 * Anexos de uma entidade. Duas naturezas na mesma lista:
 *
 * - arquivo, que mora no Storage e sai por endereco assinado de um
 *   minuto — nao existe URL permanente para vazar;
 * - link, para o documento que ja tem casa oficial fora daqui.
 *
 * O download passa por acao de servidor de proposito, e nao por <a href>:
 * e o que permite conferir o acesso e deixar rastro antes de abrir.
 */
export async function Anexos({
  entidadeTipo,
  entidadeId,
  carteiraId,
  pessoas,
  editavel,
  volta,
}: {
  entidadeTipo: EntidadeTipo;
  entidadeId: string;
  carteiraId: string;
  pessoas: Pessoa[];
  editavel: boolean;
  volta: string;
}) {
  const anexos = await anexosDaEntidade(entidadeTipo, entidadeId);
  const autor = (id: string) => nomePessoa(pessoas.find((p) => p.id === id));

  const campos = (
    <>
      <input type="hidden" name="entidade_tipo" value={entidadeTipo} />
      <input type="hidden" name="entidade_id" value={entidadeId} />
      <input type="hidden" name="carteira_id" value={carteiraId} />
      <input type="hidden" name="volta" value={volta} />
    </>
  );

  return (
    <section className="painel">
      <div className="linha-titulo">
        <h2>
          Anexos
          {anexos.length > 0 && (
            <span className="dado passos-contagem" style={{ marginLeft: 10 }}>
              {anexos.length}
            </span>
          )}
        </h2>
        {editavel && (
          <div className="cabeca-acoes">
            <Modal
              rotulo="Anexar arquivo"
              titulo="Anexar arquivo"
              descricao="Ata, laudo, planilha da rodada — o que precisa ficar junto do assunto."
              icone={<Upload size={15} />}
            >
              <form action={anexarArquivo} className="formulario" encType="multipart/form-data">
                {campos}
                <label className="campo">
                  <span>Arquivo</span>
                  <input type="file" name="arquivo" required />
                  <small>Até 25 MB. Acima disso, anexe o link do repositório.</small>
                </label>
                <label className="campo">
                  <span>Do que se trata</span>
                  <input
                    type="text"
                    name="descricao"
                    maxLength={200}
                    placeholder="opcional — o que é e para que serve"
                  />
                </label>
                <div className="acoes-rodape">
                  <button className="botao botao-primario" type="submit">
                    Anexar
                  </button>
                </div>
              </form>
            </Modal>

            <Modal
              rotulo="Anexar link"
              titulo="Anexar link"
              descricao="Para o documento que já tem casa oficial fora daqui."
              variante="secundario"
              icone={<Link2 size={15} />}
            >
              <form action={anexarLink} className="formulario">
                {campos}
                <label className="campo">
                  <span>Nome do documento</span>
                  <input type="text" name="nome" required maxLength={160} />
                </label>
                <label className="campo">
                  <span>Endereço</span>
                  <input type="url" name="url" required placeholder="https://" />
                </label>
                <label className="campo">
                  <span>Do que se trata</span>
                  <input type="text" name="descricao" maxLength={200} placeholder="opcional" />
                </label>
                <div className="acoes-rodape">
                  <button className="botao botao-primario" type="submit">
                    Anexar
                  </button>
                </div>
              </form>
            </Modal>
          </div>
        )}
      </div>

      {anexos.length === 0 ? (
        <Vazio>
          Nada anexado aqui ainda. O que sustenta uma decisão fica junto dela — não na caixa de
          e-mail de quem participou.
        </Vazio>
      ) : (
        <ul className="lista-estado">
          {anexos.map((a) => (
            <li key={a.id}>
              <span className="rotulo">
                <form action={baixarAnexo} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="volta" value={volta} />
                  <button className="link-acao" type="submit">
                    {a.url ? <ExternalLink size={14} /> : <Download size={14} />}
                    {a.nome}
                  </button>
                </form>
                <span className="dica">
                  {[
                    a.descricao,
                    a.url ? "link externo" : formatarTamanho(a.tamanho_bytes),
                    autor(a.criado_por),
                    formatarData(a.criado_em.slice(0, 10)),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="selo selo-neutro">{extensao(a)}</span>
              {editavel && (
                <form action={removerAnexo}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="volta" value={volta} />
                  <BotaoExcluir rotulo="Remover" aviso="O arquivo sai junto." compacto />
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="nota">
        <Paperclip size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Arquivo aqui é anexo de trabalho. O acervo oficial continua no repositório da organização —
        para ele, use o link.
      </p>
    </section>
  );
}
