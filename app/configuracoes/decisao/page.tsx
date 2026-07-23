import Link from "next/link";
import { Network, Plus } from "lucide-react";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { papeisDecisao, posturasContato, classeTom } from "@/lib/decisores";
import {
  alternarItemDecisao,
  criarPapelDecisao,
  criarPosturaContato,
  semearCatalogoDecisao,
} from "@/app/acoes/decisao";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { FormAcao } from "@/components/form-acao";
import { BotaoEnviar } from "@/components/botao-enviar";

export const dynamic = "force-dynamic";

export default async function PaginaCatalogoDecisao({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const [papeis, posturas] = await Promise.all([
    papeisDecisao(org.orgId),
    posturasContato(org.orgId),
  ]);
  const gere = podeEscrever(org.papel) && org.papel !== "ponto_focal";
  const vazio = papeis.length === 0 && posturas.length === 0;

  return (
    <>
      <p className="olho">
        <Link href="/configuracoes">Configurações</Link> · {org.nome}
      </p>

      <div className="cabeca-pagina">
        <div>
          <h1>
            <Network size={18} style={{ verticalAlign: "-3px", marginRight: 8 }} />
            Papéis na decisão
          </h1>
        </div>
        {gere && !vazio && (
          <div className="cabeca-acoes">
            <Modal
              rotulo="Novo papel"
              titulo="Novo papel na decisão"
              descricao="O nome é seu. A pergunta que o produto faz é uma só: este papel decide?"
              icone={<Plus size={15} />}
            >
              <FormAcao action={criarPapelDecisao}>
                <label className="campo">
                  <span>Nome do papel</span>
                  <input type="text" name="rotulo" required maxLength={60} autoFocus />
                </label>
                <label className="campo">
                  <span>Descrição</span>
                  <input type="text" name="descricao" maxLength={160} placeholder="opcional" />
                </label>
                <label className="campo campo-marcador">
                  <span>Quem tem este papel decide</span>
                  <input type="checkbox" name="decide" />
                </label>
                <label className="campo campo-numerico">
                  <span>Ordem</span>
                  <input type="number" name="ordem" defaultValue={0} min={0} max={99} />
                </label>
                <BotaoEnviar>Criar papel</BotaoEnviar>
              </FormAcao>
            </Modal>

            <Modal
              rotulo="Nova postura"
              titulo="Nova postura"
              descricao="Como esta pessoa se posiciona em relação a nós."
              variante="secundario"
              icone={<Plus size={15} />}
            >
              <FormAcao action={criarPosturaContato}>
                <label className="campo">
                  <span>Nome da postura</span>
                  <input type="text" name="rotulo" required maxLength={60} autoFocus />
                </label>
                <label className="campo">
                  <span>Descrição</span>
                  <input type="text" name="descricao" maxLength={160} placeholder="opcional" />
                </label>
                <label className="campo">
                  <span>Para que lado joga</span>
                  <select name="tom" defaultValue="neutro">
                    <option value="favoravel">A favor</option>
                    <option value="neutro">Neutra</option>
                    <option value="contrario">Contra</option>
                  </select>
                </label>
                <label className="campo campo-numerico">
                  <span>Ordem</span>
                  <input type="number" name="ordem" defaultValue={0} min={0} max={99} />
                </label>
                <BotaoEnviar>Criar postura</BotaoEnviar>
              </FormAcao>
            </Modal>
          </div>
        )}
      </div>

      <IntroSecao>
        Estes são <strong>os seus</strong> papéis e posturas — &ldquo;Diretor de Operações&rdquo; ou
        &ldquo;Gestor de Utilidades&rdquo; muda de setor para setor, e o produto não tem opinião
        sobre isso. O que ele lê de cada item é só a marcação ao lado:{" "}
        <strong>este papel decide?</strong> e <strong>esta postura joga a favor ou contra?</strong>{" "}
        É com essas duas respostas que a ficha da conta diz quem decide e quem é contra, e que os
        avisos de mapa funcionam sem o produto saber o seu vocabulário.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      {vazio ? (
        <Vazio
          acao={
            gere ? (
              <form action={semearCatalogoDecisao}>
                <BotaoEnviar rotuloEnviando="Criando…">Criar sugestões iniciais</BotaoEnviar>
              </form>
            ) : undefined
          }
        >
          Nenhum papel cadastrado. Comece pelas sugestões e ajuste ao seu vocabulário — nada aqui é
          fixo.
        </Vazio>
      ) : (
        <>
          <section className="painel">
            <h2>Papéis na decisão</h2>
            {papeis.length === 0 ? (
              <Vazio>Nenhum papel cadastrado.</Vazio>
            ) : (
              <ul className="lista-estado">
                {papeis.map((p) => (
                  <li key={p.id} className={p.ativo ? undefined : "inativo"}>
                    <span className="rotulo">
                      {p.rotulo}
                      <span className="dica">
                        {[p.descricao, p.ativo ? null : "desativado"].filter(Boolean).join(" · ") ||
                          "sem descrição"}
                      </span>
                    </span>
                    {p.decide ? (
                      <span className="selo selo-ok">Decide</span>
                    ) : (
                      <span className="selo selo-neutro">Não decide</span>
                    )}
                    {gere && (
                      <form action={alternarItemDecisao}>
                        <input type="hidden" name="tabela" value="contato_papeis" />
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="ativo" value={p.ativo ? "1" : "0"} />
                        <button className="link-acao" type="submit">
                          {p.ativo ? "Desativar" : "Reativar"}
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="nota" style={{ marginBottom: 0 }}>
              Desativar tira o papel dos seletores e mantém quem já foi classificado com ele —
              excluir apagaria a classificação de contatos que já existem.
            </p>
          </section>

          <section className="painel">
            <h2>Posturas</h2>
            {posturas.length === 0 ? (
              <Vazio>Nenhuma postura cadastrada.</Vazio>
            ) : (
              <ul className="lista-estado">
                {posturas.map((p) => (
                  <li key={p.id} className={p.ativo ? undefined : "inativo"}>
                    <span className="rotulo">
                      {p.rotulo}
                      <span className="dica">
                        {[p.descricao, p.ativo ? null : "desativada"].filter(Boolean).join(" · ") ||
                          "sem descrição"}
                      </span>
                    </span>
                    <span className={classeTom(p.tom)}>
                      {p.tom === "favoravel" ? "A favor" : p.tom === "contrario" ? "Contra" : "Neutra"}
                    </span>
                    {gere && (
                      <form action={alternarItemDecisao}>
                        <input type="hidden" name="tabela" value="contato_posturas" />
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="ativo" value={p.ativo ? "1" : "0"} />
                        <button className="link-acao" type="submit">
                          {p.ativo ? "Desativar" : "Reativar"}
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
