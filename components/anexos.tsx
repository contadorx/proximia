import { Download, Paperclip, Upload } from "lucide-react";
import { anexosDa, formatarTamanho } from "@/lib/anexos";
import { formatarData } from "@/lib/contas";
import { nomePessoa, type Pessoa } from "@/lib/carteiras";
import type { EntidadeTipo } from "@/lib/registros";
import { baixarAnexo, enviarAnexo, excluirAnexo } from "@/app/acoes/anexos";
import { Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { BotaoExcluir } from "@/components/botao-excluir";

/**
 * Anexos de uma entidade. O arquivo fica em bucket privado; o download
 * sai por link assinado que vale um minuto.
 */
export async function Anexos({
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
  const anexos = await anexosDa(entidadeTipo, entidadeId);

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
          <Modal
            rotulo="Enviar arquivo"
            titulo="Enviar arquivo"
            descricao="Até 20 MB. PDF, imagem, planilha, documento ou texto."
            icone={<Upload size={15} />}
          >
            <form action={enviarAnexo} className="formulario">
              <input type="hidden" name="entidade_tipo" value={entidadeTipo} />
              <input type="hidden" name="entidade_id" value={entidadeId} />
              <input type="hidden" name="carteira_id" value={carteiraId} />
              <label className="campo">
                <span>Arquivo</span>
                <input type="file" name="arquivo" required />
              </label>
              <label className="campo">
                <span>Descrição</span>
                <input type="text" name="descricao" maxLength={160} placeholder="opcional" />
              </label>
              <button className="botao botao-primario" type="submit">
                Enviar
              </button>
              <p className="nota">
                O arquivo fica em armazenamento privado, acessível apenas a quem tem acesso a esta
                carteira.
              </p>
            </form>
          </Modal>
        )}
      </div>

      {anexos.length === 0 ? (
        <Vazio>
          Nenhum arquivo aqui. Contrato assinado, estudo, orçamento, ata — o que precisa estar junto
          do registro em vez de perdido numa pasta.
        </Vazio>
      ) : (
        <ul className="lista-estado">
          {anexos.map((a) => (
            <li key={a.id}>
              <span className="rotulo">
                <Paperclip size={13} style={{ verticalAlign: "-2px", marginRight: 6, color: "var(--g400)" }} />
                {a.nome}
                <span className="dica">
                  {[
                    formatarTamanho(a.tamanho),
                    formatarData(a.criado_em.slice(0, 10)),
                    a.criado_por ? nomePessoa(pessoas.find((p) => p.id === a.criado_por)) : null,
                    a.descricao,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>

              <form action={baixarAnexo}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="entidade_tipo" value={entidadeTipo} />
                <input type="hidden" name="entidade_id" value={entidadeId} />
                <button className="link-acao" type="submit">
                  <Download size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  Baixar
                </button>
              </form>

              {editavel && (
                <form action={excluirAnexo}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="entidade_tipo" value={entidadeTipo} />
                  <input type="hidden" name="entidade_id" value={entidadeId} />
                  <BotaoExcluir compacto rotulo="Excluir" />
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
