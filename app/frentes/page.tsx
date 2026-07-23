import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { listarCarteiras, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { formatarData, formatarValor } from "@/lib/contas";
import {
  LIMITE_FRENTES,
  STATUS_FRENTE,
  classeStatus,
  listarFrentes,
  rotuloStatus,
  tiposDeFrente,
  totais,
} from "@/lib/frentes";
import { criarFrente } from "@/app/acoes/frentes";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { Seletor, SeletorMultiplo } from "@/components/seletor";
import { BotaoEnviar } from "@/components/botao-enviar";
import { FormAcao } from "@/components/form-acao";
import { paraLista, temFiltro } from "@/lib/consulta";
import { CampoQuantidade, CampoValor } from "@/components/campos";

export const dynamic = "force-dynamic";

export default async function PaginaFrentes({
  searchParams,
}: {
  searchParams: { erro?: string; carteira?: string | string[]; status?: string | string[] };
}) {
  const org = await exigirOrg();
  const [frentes, carteiras, tipos, pessoas] = await Promise.all([
    listarFrentes({
      orgId: org.orgId,
      carteiras: paraLista(searchParams.carteira),
      status: paraLista(searchParams.status),
    }),
    listarCarteiras(org.orgId),
    tiposDeFrente(org.orgId),
    pessoasDaOrganizacao(org.orgId),
  ]);

  const t = totais(frentes);
  const podeCriar = podeEscrever(org.papel) && carteiras.length > 0;
  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";
  const opcoesCarteira = carteiras.map((c) => ({
    valor: c.id,
    rotulo: c.nome,
    detalhe: c.codigo ?? undefined,
  }));
  const opcoesPessoa = pessoas.map((p) => ({ valor: p.id, rotulo: nomePessoa(p) }));

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Frentes</h1>
        </div>
        {podeCriar && (
          <div className="cabeca-acoes">
            <Modal
              rotulo="Nova frente"
              titulo="Nova frente"
              descricao="Uma linha por tema de volume. A base de trabalho continua onde está — o link entra depois."
              icone={<Plus size={15} />}
              largo
            >
              <FormAcao action={criarFrente}>
                <div className="formulario-linha">
                  <label className="campo">
                    <span>Título</span>
                    <input type="text" name="titulo" required maxLength={160} autoFocus />
                  </label>
                  <div className="formulario-linha">
                    <label className="campo">
                      <span>Natureza</span>
                      <select name="natureza" defaultValue="captura">
                        <option value="captura">Captura — receita nova</option>
                        <option value="protecao">Proteção — receita que já existe</option>
                      </select>
                      <small>Proteção não soma ao potencial a capturar.</small>
                    </label>
                    <label className="campo">
                      <span>Prioridade</span>
                      <select name="prioridade" defaultValue="3">
                        <option value="1">1 · Máxima</option>
                        <option value="2">2 · Alta</option>
                        <option value="3">3 · Média</option>
                        <option value="4">4 · Baixa</option>
                        <option value="5">5 · Mínima</option>
                      </select>
                    </label>
                  </div>
                  <Seletor
                    nome="carteira_id"
                    rotulo="Carteira"
                    opcoes={opcoesCarteira}
                    vazio="Escolha a carteira"
                    obrigatorio
                  />
                  <label className="campo">
                    <span>Tipo</span>
                    <select name="catalogo_id" defaultValue="">
                      <option value="">Sem tipo</option>
                      {tipos
                        .filter((x) => x.ativo)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.nome}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                <div className="formulario-linha">
                  <label className="campo">
                    <span>Situação</span>
                    <select name="status" defaultValue="identificada">
                      {STATUS_FRENTE.filter((s) => s.valor !== "descartada").map((s) => (
                        <option key={s.valor} value={s.valor}>
                          {s.rotulo} — {s.explicacao}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Seletor
                    nome="dono_id"
                    rotulo="Dono"
                    opcoes={opcoesPessoa}
                    vazio="Definir depois"
                  />
                  <CampoQuantidade nome="qtd_casos" rotulo="Casos" ajuda="Quantos itens a frente representa." />
                </div>

                <div className="formulario-linha">
                  <CampoValor nome="potencial_bruto" rotulo="Potencial estimado" />
                  <label className="campo">
                    <span>Origem da estimativa</span>
                    <input
                      type="text"
                      name="potencial_origem"
                      maxLength={160}
                      placeholder="de onde veio esse número"
                    />
                  </label>
                </div>

                <div className="formulario-linha">
                  <label className="campo">
                    <span>Próxima etapa</span>
                    <input type="text" name="proxima_etapa" maxLength={160} />
                  </label>
                  <label className="campo">
                    <span>Prazo</span>
                    <input type="date" name="prazo" />
                  </label>
                </div>

                <BotaoEnviar>Criar frente</BotaoEnviar>
              </FormAcao>
            </Modal>
          </div>
        )}
      </div>

      <IntroSecao>
        Frente é <strong>trabalho de volume agregado por carteira</strong>: uma linha por tema, com
        quantidade de casos, potencial, capturado, dono e próxima etapa. Conta grande tem ficha
        própria; volume tem frente. Os tipos ficam em{" "}
        <Link href="/configuracoes">configurações</Link>.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

      {frentes.length > 0 && (
        <div className="cartoes">
          <div className="cartao">
            <p className="olho">Frentes em aberto</p>
            <p className="cartao-valor">{t.ativas}</p>
          </div>
          <div className="cartao">
            <p className="olho">Casos representados</p>
            <p className="cartao-valor">{t.casos.toLocaleString("pt-BR")}</p>
          </div>
          <div className="cartao">
            <p className="olho">Potencial estimado</p>
            <p className="cartao-valor teto">{formatarValor(t.potencial)}</p>
            <p className="cartao-nota">só captura — proteção não entra neste teto</p>
          </div>
          {t.protecao > 0 && (
            <div className="cartao">
              <p className="olho">Em proteção</p>
              <p className="cartao-valor" style={{ color: "var(--ambar)" }}>
                {formatarValor(t.protecao)}
              </p>
              <p className="cartao-nota">receita que já existe e pode ser perdida</p>
            </div>
          )}
          <div className="cartao">
            <p className="olho">Capturado</p>
            <p className="cartao-valor capturado">{formatarValor(t.capturado)}</p>
            <p className="cartao-nota">confirmado, não se soma ao teto</p>
          </div>
        </div>
      )}

      <form className="filtros" method="get">
        <SeletorMultiplo
          nome="carteira"
          rotulo="Carteira"
          opcoes={opcoesCarteira}
          inicial={paraLista(searchParams.carteira)}
        />
        <SeletorMultiplo
          nome="status"
          rotulo="Situação"
          opcoes={STATUS_FRENTE.map((s) => ({ valor: s.valor, rotulo: s.rotulo }))}
          inicial={paraLista(searchParams.status)}
        />
        <button className="botao botao-secundario" type="submit">
          <Search size={14} />
          Filtrar
        </button>
        {temFiltro(searchParams.carteira, searchParams.status) && (
          <Link className="link-acao" href="/frentes">
            Limpar
          </Link>
        )}
      </form>

      {frentes.length === 0 ? (
        <Vazio
          acao={
            carteiras.length === 0 ? (
              <Link className="botao botao-secundario" href="/carteiras">
                Criar carteira
              </Link>
            ) : undefined
          }
        >
          {carteiras.length === 0
            ? "Toda frente pertence a uma carteira. Crie a carteira primeiro."
            : "Nenhuma frente registrada. Comece pelo tema que hoje ocupa mais tempo da equipe."}
        </Vazio>
      ) : (
        <section className="painel">
          <ul className="lista-estado">
            {frentes.map((f) => (
              <li key={f.id}>
                <span className="rotulo">
                  <Link href={`/frentes/${f.id}`}>{f.titulo}</Link>
                  <span className="dica">
                    {[
                      nomeCarteira(f.carteira_id),
                      f.qtd_casos !== null ? `${f.qtd_casos.toLocaleString("pt-BR")} casos` : null,
                      f.dono_id ? nomePessoa(pessoas.find((p) => p.id === f.dono_id)) : "sem dono",
                      f.proxima_etapa,
                      f.prazo ? `prazo ${formatarData(f.prazo)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="par-valores">
                  <span className="valor-teto">teto {formatarValor(f.potencial_bruto)}</span>
                  <span className="valor-capturado">capt. {formatarValor(f.valor_capturado)}</span>
                </span>
                {f.natureza === "protecao" && <span className="selo selo-atencao">proteção</span>}
                <span className={classeStatus(f.status)}>{rotuloStatus(f.status)}</span>
              </li>
            ))}
          </ul>
          {frentes.length >= LIMITE_FRENTES && (
            <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
              Mostrando as primeiras {LIMITE_FRENTES}. Os cartões acima somam só o que está na
              lista — refine o filtro por carteira ou situação para ver o restante.
            </p>
          )}
        </section>
      )}
    </>
  );
}
