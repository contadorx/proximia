import Link from "next/link";
import { Plus } from "lucide-react";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { FASES } from "@/lib/oportunidades";
import { fasesConfiguradas } from "@/lib/pipeline";
import { REGRAS_DONO, playbooks, rotuloRegra, tarefasDosPlaybooks } from "@/lib/playbooks";
import {
  alternarPlaybook,
  criarPlaybook,
  criarTarefa,
  excluirPlaybook,
  excluirTarefa,
} from "@/app/acoes/playbooks";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { BotaoEnviar } from "@/components/botao-enviar";
import { BotaoExcluir } from "@/components/botao-excluir";

export const dynamic = "force-dynamic";

export default async function PaginaPlaybooks({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const [lista, tarefas, fases] = await Promise.all([
    playbooks(org.orgId),
    tarefasDosPlaybooks(org.orgId),
    fasesConfiguradas(org.orgId),
  ]);

  const gere = podeEscrever(org.papel) && org.papel !== "ponto_focal";
  const nomeFase = (f: string) =>
    fases.find((x) => x.fase === f)?.rotulo ??
    FASES.find((x) => x.valor === f)?.rotulo ??
    f;

  const usadas = new Set(lista.filter((p) => p.ativo).map((p) => p.fase));
  const disponiveis = (fases.length > 0 ? fases.map((f) => f.fase) : FASES.map((f) => f.valor))
    .filter((f) => !usadas.has(f));

  return (
    <>
      <p className="olho">
        <Link href="/configuracoes">Configurações</Link> · {org.nome}
      </p>

      <div className="cabeca-pagina">
        <div>
          <h1>Playbooks de cadência</h1>
        </div>
        {gere && disponiveis.length > 0 && (
          <div className="cabeca-acoes">
            <Modal
              rotulo="Novo playbook"
              titulo="Novo playbook"
              descricao="Quando a oportunidade entra na etapa, as tarefas dele viram compromissos."
              icone={<Plus size={15} />}
            >
              <form action={criarPlaybook} className="formulario">
                <label className="campo">
                  <span>Nome</span>
                  <input
                    type="text"
                    name="nome"
                    required
                    maxLength={80}
                    autoFocus
                    placeholder="Ao entrar em proposta"
                  />
                </label>
                <label className="campo">
                  <span>Etapa que dispara</span>
                  <select name="fase" required defaultValue="">
                    <option value="" disabled>
                      Escolha
                    </option>
                    {disponiveis.map((f) => (
                      <option key={f} value={f}>
                        {nomeFase(f)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="campo">
                  <span>Descrição</span>
                  <input type="text" name="descricao" maxLength={200} placeholder="opcional" />
                </label>
                <BotaoEnviar>
                  Criar playbook
                </BotaoEnviar>
              </form>
            </Modal>
          </div>
        )}
      </div>

      <IntroSecao>
        Playbook responde a <strong>&ldquo;quando isto acontece, faça aquilo&rdquo;</strong>: a
        oportunidade entra numa etapa e os compromissos daquela etapa nascem com prazo e dono. O
        dono é uma <strong>regra</strong>, não uma pessoa — assim a cadência sobrevive à troca de
        equipe.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      {lista.length === 0 ? (
        <Vazio>
          Nenhum playbook. Sem eles, compromisso só nasce sozinho de data de contrato e de cláusula
          monitorada — todo o resto continua dependendo de alguém lembrar.
        </Vazio>
      ) : (
        lista.map((p) => {
          const minhas = tarefas.filter((t) => t.playbook_id === p.id);
          return (
            <section className={p.ativo ? "painel" : "painel painel-desligado"} key={p.id}>
              <div className="linha-titulo">
                <h2>
                  {p.nome}
                  <span className="selo selo-neutro" style={{ marginLeft: 10 }}>
                    {nomeFase(p.fase)}
                  </span>
                  {!p.ativo && (
                    <span className="selo selo-atencao" style={{ marginLeft: 6 }}>
                      desligado
                    </span>
                  )}
                </h2>

                {gere && (
                  <div className="cabeca-acoes">
                    <Modal
                      rotulo="Nova tarefa"
                      titulo={`Tarefa em "${p.nome}"`}
                      descricao="Ela vira compromisso quando a oportunidade entrar nesta etapa."
                      variante="secundario"
                      icone={<Plus size={15} />}
                    >
                      <form action={criarTarefa} className="formulario">
                        <input type="hidden" name="playbook_id" value={p.id} />
                        <label className="campo">
                          <span>O que precisa ser feito</span>
                          <input type="text" name="titulo" required maxLength={160} autoFocus />
                        </label>
                        <label className="campo">
                          <span>Detalhe</span>
                          <input type="text" name="descricao" maxLength={200} placeholder="opcional" />
                        </label>
                        <div className="formulario-linha">
                          <label className="campo campo-numerico">
                            <span>Prazo (dias após entrar)</span>
                            <input type="number" name="dias_apos" min={0} max={365} defaultValue={3} />
                          </label>
                          <label className="campo campo-numerico">
                            <span>Avisar (dias antes)</span>
                            <input type="number" name="alerta_dias" min={0} max={90} defaultValue={2} />
                          </label>
                          <label className="campo campo-numerico">
                            <span>Ordem</span>
                            <input type="number" name="ordem" defaultValue={minhas.length + 1} />
                          </label>
                        </div>
                        <label className="campo">
                          <span>Quem responde</span>
                          <select name="dono_regra" defaultValue="responsavel_entidade">
                            {REGRAS_DONO.map((r) => (
                              <option key={r.valor} value={r.valor}>
                                {r.rotulo} — {r.explicacao}
                              </option>
                            ))}
                          </select>
                        </label>
                        <BotaoEnviar>
                          Incluir tarefa
                        </BotaoEnviar>
                      </form>
                    </Modal>

                    <form action={alternarPlaybook}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="ativar" value={p.ativo ? "0" : "1"} />
                      <button className="link-acao" type="submit">
                        {p.ativo ? "Desligar" : "Ligar"}
                      </button>
                    </form>

                    <form action={excluirPlaybook}>
                      <input type="hidden" name="id" value={p.id} />
                      <BotaoExcluir
                        compacto
                        rotulo="Excluir"
                        aviso="Os compromissos já criados ficam."
                      />
                    </form>
                  </div>
                )}
              </div>

              {p.descricao && <p className="nota">{p.descricao}</p>}

              {minhas.length === 0 ? (
                <Vazio>Sem tarefas ainda — este playbook não vai criar nada.</Vazio>
              ) : (
                <ul className="lista-estado">
                  {minhas.map((t) => (
                    <li key={t.id}>
                      <span className="rotulo">
                        {t.titulo}
                        <span className="dica">
                          {[
                            t.dias_apos === 0
                              ? "vence no mesmo dia"
                              : `vence ${t.dias_apos} dias depois`,
                            `avisa ${t.alerta_dias} dias antes`,
                            rotuloRegra(t.dono_regra),
                            t.descricao,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      {gere && (
                        <form action={excluirTarefa}>
                          <input type="hidden" name="id" value={t.id} />
                          <BotaoExcluir compacto rotulo="Remover" />
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}

      <section className="painel">
        <h2>Como o sistema evita encher a fila</h2>
        <ul className="lista-limpa-simples">
          <li>Só um playbook ativo por etapa.</li>
          <li>
            A tarefa não é recriada enquanto o compromisso dela estiver aberto — voltar e avançar de
            novo não duplica a fila de quem já está tocando.
          </li>
          <li>
            Concluída a tarefa, uma nova passagem pela etapa recria: é uma volta de verdade, e o
            trabalho precisa ser refeito.
          </li>
          <li>Playbook desligado para de disparar, e o que ele já criou continua onde está.</li>
        </ul>
      </section>
    </>
  );
}
