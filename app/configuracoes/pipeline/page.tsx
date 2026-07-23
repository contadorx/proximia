import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { fasesConfiguradas, motivosDescarte } from "@/lib/pipeline";
import { formatarTaxa, taxaDaOrganizacao } from "@/lib/financeiro";
import { salvarTaxaDesconto } from "@/app/acoes/financeiro";
import { criarMotivo, criarReguaFases, excluirMotivo, salvarFase } from "@/app/acoes/pipeline";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { BotaoEnviar } from "@/components/botao-enviar";
import { BotaoExcluir } from "@/components/botao-excluir";

export const dynamic = "force-dynamic";

export default async function PaginaPipeline({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const [fases, motivos, taxa] = await Promise.all([
    fasesConfiguradas(org.orgId),
    motivosDescarte(org.orgId),
    taxaDaOrganizacao(org.orgId),
  ]);

  const gere = podeEscrever(org.papel) && org.papel !== "ponto_focal";

  return (
    <>
      <p className="olho">
        <Link href="/configuracoes">Configurações</Link> · {org.nome}
      </p>

      <div className="cabeca-pagina">
        <div>
          <h1>Pipeline de conversão</h1>
        </div>
      </div>

      <IntroSecao>
        As etapas do funil são do produto — é a forma de uma conversão em qualquer setor. O que é seu
        é o <strong>nome</strong> de cada uma, o <strong>ritmo</strong> esperado e quais estão em
        uso. O prazo vira o limite do alerta de parada: passou dele, a oportunidade aparece.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <section className="painel">
        <div className="linha-titulo">
          <h2>Etapas</h2>
        </div>

        {fases.length === 0 ? (
          <Vazio
            acao={
              gere ? (
                <form action={criarReguaFases}>
                  <BotaoEnviar>
                    <Sparkles size={15} />
                    Criar régua de etapas
                  </BotaoEnviar>
                </form>
              ) : undefined
            }
          >
            Sem etapas configuradas, o alerta de parada usa um limite único de 60 dias para todas.
            Crie a régua para dar ritmo próprio a cada etapa.
          </Vazio>
        ) : (
          <ul className="lista-estado">
            {fases.map((f) => (
              <li key={f.id}>
                <span className="rotulo">
                  {f.rotulo}
                  <span className="dica">
                    {[
                      f.prazo_esperado_dias
                        ? `esperado até ${f.prazo_esperado_dias} dias`
                        : "sem prazo — não gera alerta de parada",
                      f.ativa ? null : "fora de uso",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>

                {gere && (
                  <Modal
                    rotulo="Editar"
                    titulo={`Etapa: ${f.rotulo}`}
                    descricao="Nome, ritmo esperado e se ela está em uso."
                    variante="link"
                  >
                    <form action={salvarFase} className="formulario">
                      <input type="hidden" name="id" value={f.id} />
                      <label className="campo">
                        <span>Nome da etapa</span>
                        <input type="text" name="rotulo" defaultValue={f.rotulo} required maxLength={60} />
                      </label>
                      <div className="formulario-linha">
                        <label className="campo campo-numerico">
                          <span>Prazo esperado (dias)</span>
                          <input
                            type="number"
                            name="prazo_esperado_dias"
                            min={1}
                            max={730}
                            defaultValue={f.prazo_esperado_dias ?? ""}
                          />
                          <small>Em branco: não gera alerta de parada.</small>
                        </label>
                        <label className="campo campo-marcador">
                          <input type="checkbox" name="ativa" defaultChecked={f.ativa} />
                          <span>Em uso</span>
                        </label>
                      </div>
                      <BotaoEnviar>
                        Salvar etapa
                      </BotaoEnviar>
                    </form>
                  </Modal>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
          Implantação nasce sem prazo de propósito: ela depende de obra e fornecedor, não do ritmo
          comercial — cobrar ritmo ali gera alerta que ninguém consegue resolver.
        </p>
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Custo de capital</h2>
          <span className="passos-contagem">hoje: {formatarTaxa(taxa)}</span>
        </div>

        <p className="nota">
          É a taxa que o dinheiro da sua operação precisa render para valer a pena. Ela desconta o
          tempo nas análises: com ela, o sistema calcula valor presente, taxa interna de retorno e
          payback descontado de cada oportunidade.
        </p>

        {gere && (
          <form action={salvarTaxaDesconto} className="formulario">
            <div className="formulario-linha">
              <label className="campo campo-numerico">
                <span>Taxa ao ano (%)</span>
                <input
                  type="text"
                  name="taxa"
                  inputMode="decimal"
                  defaultValue={(taxa * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                  required
                />
              </label>
              <label className="campo">
                <span>De onde veio esse número</span>
                <input
                  type="text"
                  name="observacao"
                  maxLength={160}
                  placeholder="ex.: custo médio de capital aprovado pela diretoria"
                />
              </label>
              <BotaoEnviar>
                Salvar taxa
              </BotaoEnviar>
            </div>
          </form>
        )}

        <p className="nota" style={{ marginBottom: 0 }}>
          O padrão de 12% ao ano é ponto de partida, não recomendação — cravar um número seria opinar
          sobre o seu negócio. Mudar a taxa recalcula todas as análises na hora.
        </p>
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Motivos de perda</h2>
          {gere && (
            <Modal
              rotulo="Novo motivo"
              titulo="Novo motivo de perda"
              descricao="Ex.: preço acima do aceitável, cliente optou por solução própria, sem orçamento no ano."
              icone={<Plus size={15} />}
            >
              <form action={criarMotivo} className="formulario">
                <label className="campo">
                  <span>Motivo</span>
                  <input type="text" name="nome" required maxLength={80} autoFocus />
                </label>
                <label className="campo">
                  <span>Descrição</span>
                  <input type="text" name="descricao" maxLength={160} placeholder="opcional" />
                </label>
                <label className="campo campo-numerico">
                  <span>Ordem</span>
                  <input type="number" name="ordem" defaultValue={motivos.length + 1} />
                </label>
                <BotaoEnviar>
                  Criar motivo
                </BotaoEnviar>
              </form>
            </Modal>
          )}
        </div>

        {motivos.length === 0 ? (
          <Vazio>
            Sem catálogo, o motivo do descarte continua obrigatório em texto livre — mas não dá para
            agrupar. &ldquo;Por que perdemos&rdquo; só vira aprendizado quando some em categorias.
          </Vazio>
        ) : (
          <ul className="lista-estado">
            {motivos.map((m) => (
              <li key={m.id}>
                <span className="rotulo">
                  {m.nome}
                  {m.descricao && <span className="dica">{m.descricao}</span>}
                </span>
                {gere && (
                  <form action={excluirMotivo}>
                    <input type="hidden" name="id" value={m.id} />
                    <BotaoExcluir compacto rotulo="Excluir" />
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
