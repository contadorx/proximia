import Link from "next/link";
import { KeyRound, Plus } from "lucide-react";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { MODELOS } from "@/lib/importacao";
import { formatarData } from "@/lib/contas";
import { criarChaveApi, revogarChaveApi } from "@/app/acoes/chaves";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { FormAcao } from "@/components/form-acao";
import { BotaoEnviar } from "@/components/botao-enviar";

export const dynamic = "force-dynamic";

type Chave = {
  id: string;
  nome: string;
  prefixo: string;
  limite_por_minuto: number;
  criada_em: string;
  ultimo_uso: string | null;
  revogada_em: string | null;
};

type Chamada = {
  id: string;
  recurso: string;
  modo: string;
  linhas_recebidas: number;
  linhas_gravadas: number;
  linhas_recusadas: number;
  situacao: string;
  detalhe: string | null;
  criada_em: string;
};

export default async function PaginaChavesApi({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string; nova?: string };
}) {
  const org = await exigirOrg();
  const supabase = criarClienteServidor();
  const gere = podeEscrever(org.papel) && org.papel !== "ponto_focal";

  const [{ data: chavesData }, { data: chamadasData }] = await Promise.all([
    supabase
      .from("chaves_api")
      .select("id, nome, prefixo, limite_por_minuto, criada_em, ultimo_uso, revogada_em")
      .order("criada_em", { ascending: false }),
    supabase
      .from("chamadas_api")
      .select(
        "id, recurso, modo, linhas_recebidas, linhas_gravadas, linhas_recusadas, situacao, detalhe, criada_em",
      )
      .order("criada_em", { ascending: false })
      .limit(30),
  ]);

  const chaves = (chavesData ?? []) as Chave[];
  const chamadas = (chamadasData ?? []) as Chamada[];
  const ativas = chaves.filter((c) => !c.revogada_em);
  const recursos = Object.keys(MODELOS);

  const exemplo = `curl -X POST https://SEU-ENDERECO/api/entrada/contas \\
  -H "Authorization: Bearer ${searchParams.nova ?? "pxm_xxxxxxxx_sua_chave_aqui"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "conferencia": true,
    "linhas": [
      { "nome": "Alfa Indústria", "carteira": "RN", "potencial_bruto": "480000",
        "potencial_origem": "estudo tarifário", "potencial_data": "12/03/2026" }
    ]
  }'`;

  return (
    <>
      <p className="olho">
        <Link href="/configuracoes">Configurações</Link> · {org.nome}
      </p>

      <div className="cabeca-pagina">
        <div>
          <h1>
            <KeyRound size={18} style={{ verticalAlign: "-3px", marginRight: 8 }} />
            Entrada de dados por API
          </h1>
        </div>
        {gere && (
          <div className="cabeca-acoes">
            <Modal
              rotulo="Nova chave"
              titulo="Nova chave de API"
              descricao="A chave aparece uma única vez. Copie e guarde onde seu sistema lê segredo."
              icone={<Plus size={15} />}
            >
              <FormAcao action={criarChaveApi}>
                <label className="campo">
                  <span>Nome</span>
                  <input
                    type="text"
                    name="nome"
                    required
                    maxLength={60}
                    autoFocus
                    placeholder="Motor de cálculo, ERP, planilha do time…"
                  />
                </label>
                <label className="campo campo-numerico">
                  <span>Limite de chamadas por minuto</span>
                  <input type="number" name="limite" defaultValue={60} min={1} max={6000} />
                </label>
                <p className="nota">
                  O limite protege a sua operação de uma carga desgovernada do outro lado. Sessenta
                  por minuto cobre integração normal com folga.
                </p>
                <BotaoEnviar>Criar chave</BotaoEnviar>
              </FormAcao>
            </Modal>
          </div>
        )}
      </div>

      <IntroSecao>
        Aqui o seu sistema empurra dados para dentro do Proximia — as mesmas linhas que a planilha
        aceita, com a <strong>mesma conferência linha a linha</strong>. Não é conector de nenhum
        sistema específico: é a porta. Quem entende de faturamento, consumo ou cálculo é o seu
        motor; o Proximia recebe o resultado apurado.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      {searchParams.nova && (
        <section className="painel painel-alerta">
          <h2>Copie a chave agora</h2>
          <p className="nota">
            Esta é a única vez que ela aparece. No banco fica apenas um resumo criptográfico — nem o
            suporte consegue recuperá-la depois. Perdeu, crie outra e revogue esta.
          </p>
          <pre className="bloco-codigo">{searchParams.nova}</pre>
          <p className="nota" style={{ marginBottom: 0 }}>
            Depois de copiar, <Link href="/configuracoes/api">recarregue a tela</Link> para tirar a
            chave do endereço.
          </p>
        </section>
      )}

      <section className="painel">
        <h2>Chaves</h2>
        {chaves.length === 0 ? (
          <Vazio>
            Nenhuma chave criada. Sem chave, a porta existe mas ninguém entra — é o estado seguro.
          </Vazio>
        ) : (
          <ul className="lista-estado">
            {chaves.map((c) => (
              <li key={c.id} className={c.revogada_em ? "inativo" : undefined}>
                <span className="rotulo">
                  {c.nome}
                  <span className="dica">
                    {[
                      c.prefixo + "…",
                      `${c.limite_por_minuto}/min`,
                      `criada em ${formatarData(c.criada_em.slice(0, 10))}`,
                      c.ultimo_uso
                        ? `último uso em ${formatarData(c.ultimo_uso.slice(0, 10))}`
                        : "nunca usada",
                      c.revogada_em ? "REVOGADA" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {c.revogada_em ? (
                  <span className="selo selo-falta">Revogada</span>
                ) : (
                  <span className="selo selo-ok">Ativa</span>
                )}
                {gere && !c.revogada_em && (
                  <form action={revogarChaveApi}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="link-acao" type="submit">
                      Revogar
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="painel">
        <h2>Como chamar</h2>

        <p>
          Cada chamada envia um lote de linhas para um recurso. O endereço é{" "}
          <code>POST /api/entrada/&#123;recurso&#125;</code> e a chave vai no cabeçalho{" "}
          <code>Authorization: Bearer</code>.
        </p>

        <div className="subgrupo">
          <p className="olho">Recursos aceitos</p>
          <ul className="lista-estado">
            {recursos.map((r) => (
              <li key={r}>
                <span className="rotulo">
                  <code>/api/entrada/{r}</code>
                  <span className="dica">{MODELOS[r as keyof typeof MODELOS].explicacao}</span>
                </span>
                <Link className="link-acao" href={`/api/entrada/${r}`}>
                  ver campos
                </Link>
              </li>
            ))}
          </ul>
          <p className="nota">
            Abrir o endereço com GET devolve os campos do recurso, quais são obrigatórios e um
            exemplo — o mesmo contrato da planilha, sem sair daqui.
          </p>
        </div>

        <div className="subgrupo">
          <p className="olho">Exemplo pronto para copiar</p>
          <pre className="bloco-codigo">{exemplo}</pre>
          <p className="nota">
            Com <code>&quot;conferencia&quot;: true</code> nada é gravado: a resposta diz o que
            entraria e o que seria recusado, linha a linha. É assim que o sistema de origem testa
            antes de mandar de verdade. Tire a conferência para gravar.
          </p>
        </div>

        <div className="subgrupo">
          <p className="olho">O que esperar de volta</p>
          <ul className="lista-estado">
            <li>
              <span className="rotulo">
                200
                <span className="dica">
                  Processado. O corpo traz recebidas, gravadas e recusadas com o motivo de cada
                  recusa.
                </span>
              </span>
            </li>
            <li>
              <span className="rotulo">
                401
                <span className="dica">Chave ausente, inválida ou revogada.</span>
              </span>
            </li>
            <li>
              <span className="rotulo">
                403
                <span className="dica">
                  Assinatura suspensa: a organização segue consultando e exportando, mas não recebe
                  dados novos.
                </span>
              </span>
            </li>
            <li>
              <span className="rotulo">
                429
                <span className="dica">
                  Passou do limite por minuto desta chave. Espere e repita.
                </span>
              </span>
            </li>
          </ul>
          <p className="nota" style={{ marginBottom: 0 }}>
            A organização nunca é informada na chamada — o Proximia descobre pela chave. É o que
            impede uma integração mal configurada de escrever na casa de outro assinante.
          </p>
        </div>
      </section>

      <section className="painel">
        <h2>Últimas chamadas</h2>
        {chamadas.length === 0 ? (
          <Vazio>Nenhuma chamada registrada ainda.</Vazio>
        ) : (
          <ul className="lista-estado">
            {chamadas.map((c) => (
              <li key={c.id}>
                <span className="rotulo">
                  {c.recurso}
                  {c.modo === "conferencia" ? " (conferência)" : ""}
                  <span className="dica">
                    {[
                      `${c.linhas_recebidas} recebida(s)`,
                      c.modo === "gravar" ? `${c.linhas_gravadas} gravada(s)` : null,
                      c.linhas_recusadas > 0 ? `${c.linhas_recusadas} recusada(s)` : null,
                      c.detalhe,
                      formatarData(c.criada_em.slice(0, 10)),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  className={
                    c.situacao === "ok"
                      ? "selo selo-ok"
                      : c.situacao === "parcial"
                        ? "selo selo-neutro"
                        : "selo selo-falta"
                  }
                >
                  {c.situacao}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="nota" style={{ marginBottom: 0 }}>
          Toda chamada fica registrada, inclusive a recusada — quem integra precisa poder responder
          &ldquo;mandei e não entrou, por quê?&rdquo; sem depender de log de servidor.
          {ativas.length === 0 && chaves.length > 0
            ? " Todas as chaves estão revogadas: nada entra por aqui agora."
            : ""}
        </p>
      </section>
    </>
  );
}
