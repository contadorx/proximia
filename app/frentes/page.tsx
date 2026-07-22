import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { listarCarteiras, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { formatarData, formatarValor } from "@/lib/contas";
import {
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
import { CampoQuantidade, CampoValor } from "@/components/campos";

export const dynamic = "force-dynamic";

export default async function PaginaFrentes({
  searchParams,
}: {
  searchParams: { erro?: string; carteira?: string; status?: string };
}) {
  const org = await exigirOrg();
  const [frentes, carteiras, tipos, pessoas] = await Promise.all([
    listarFrentes({ orgId: org.orgId, carteiraId: searchParams.carteira, status: searchParams.status }),
    listarCarteiras(org.orgId),
    tiposDeFrente(org.orgId),
    pessoasDaOrganizacao(org.orgId),
  ]);

  const t = totais(frentes);
  const podeCriar = podeEscrever(org.papel) && carteiras.length > 0;
  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";

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
              <form action={criarFrente} className="formulario">
                <div className="formulario-linha">
                  <label className="campo">
                    <span>Título</span>
                    <input type="text" name="titulo" required maxLength={160} autoFocus />
                  </label>
                  <label className="campo">
                    <span>Carteira</span>
                    <select name="carteira_id" required defaultValue="">
                      <option value="" disabled>
                        Escolha
                      </option>
                      {carteiras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </label>
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
                  <label className="campo">
                    <span>Dono</span>
                    <select name="dono_id" defaultValue="">
                      <option value="">Definir depois</option>
                      {pessoas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {nomePessoa(p)}
                        </option>
                      ))}
                    </select>
                  </label>
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

                <button className="botao botao-primario" type="submit">
                  Criar frente
                </button>
              </form>
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
            <p className="cartao-nota">teto das frentes em aberto</p>
          </div>
          <div className="cartao">
            <p className="olho">Capturado</p>
            <p className="cartao-valor capturado">{formatarValor(t.capturado)}</p>
            <p className="cartao-nota">confirmado, não se soma ao teto</p>
          </div>
        </div>
      )}

      <form className="filtros" method="get">
        <label className="campo">
          <span>Carteira</span>
          <select name="carteira" defaultValue={searchParams.carteira ?? ""}>
            <option value="">Todas</option>
            {carteiras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Situação</span>
          <select name="status" defaultValue={searchParams.status ?? ""}>
            <option value="">Todas</option>
            {STATUS_FRENTE.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </label>
        <button className="botao botao-secundario" type="submit">
          <Search size={14} />
          Filtrar
        </button>
        {(searchParams.carteira || searchParams.status) && (
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
                <span className={classeStatus(f.status)}>{rotuloStatus(f.status)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
