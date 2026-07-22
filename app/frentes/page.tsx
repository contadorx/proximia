import Link from "next/link";
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
import { criarFrente, criarTipoFrente } from "@/app/acoes/frentes";
import { IntroSecao, Vazio } from "@/components/intro-secao";

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
  const podeGerirCatalogo = org.papel !== "ponto_focal" && podeEscrever(org.papel);
  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";

  return (
    <>
      <p className="olho">{org.nome}</p>
      <h1>Frentes</h1>

      <IntroSecao>
        Frente é <strong>trabalho de volume agregado por carteira</strong>: uma linha por tema, com
        quantidade de casos, potencial, capturado, dono e próxima etapa. A base de trabalho continua
        onde sempre esteve — aqui fica o link para ela. Conta grande tem ficha própria; volume tem
        frente.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

      {frentes.length > 0 && (
        <section className="painel">
          <div className="grade-prazos">
            <div>
              <p className="olho">Frentes em aberto</p>
              <p className="dado destaque-dado">{t.ativas}</p>
            </div>
            <div>
              <p className="olho">Casos representados</p>
              <p className="dado destaque-dado">{t.casos.toLocaleString("pt-BR")}</p>
            </div>
            <div>
              <p className="olho">Potencial estimado</p>
              <p className="dado destaque-dado valor-teto" style={{ fontSize: 16 }}>
                {formatarValor(t.potencial)}
              </p>
            </div>
            <div>
              <p className="olho">Capturado</p>
              <p className="dado destaque-dado valor-capturado" style={{ fontSize: 16 }}>
                {formatarValor(t.capturado)}
              </p>
            </div>
          </div>
          <p className="nota" style={{ marginTop: 14 }}>
            Potencial é teto estimado das frentes em aberto; capturado é o que já se confirmou. Os
            dois não se somam.
          </p>
        </section>
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
              <Link className="botao" href="/carteiras">
                Criar carteira
              </Link>
            ) : undefined
          }
        >
          {carteiras.length === 0
            ? "Toda frente pertence a uma carteira. Crie a carteira primeiro."
            : "Nenhuma frente registrada. Comece pelo tema que hoje ocupa mais tempo da equipe — uma linha basta."}
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

      {podeCriar && (
        <section className="painel">
          <h2>Nova frente</h2>
          <form action={criarFrente} className="formulario">
            <div className="formulario-linha">
              <label className="campo">
                <span>Título</span>
                <input type="text" name="titulo" required maxLength={160} />
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
                    .filter((t) => t.ativo)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
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
              <label className="campo">
                <span>Casos</span>
                <input type="number" name="qtd_casos" min={0} placeholder="quantos itens" />
              </label>
            </div>

            <div className="formulario-linha">
              <label className="campo">
                <span>Potencial estimado</span>
                <input type="text" name="potencial_bruto" inputMode="decimal" />
              </label>
              <label className="campo">
                <span>Origem da estimativa</span>
                <input
                  type="text"
                  name="potencial_origem"
                  maxLength={160}
                  placeholder="de onde veio esse número"
                />
              </label>
              <label className="campo">
                <span>Próxima etapa</span>
                <input type="text" name="proxima_etapa" maxLength={160} />
              </label>
              <label className="campo">
                <span>Prazo</span>
                <input type="date" name="prazo" />
              </label>
            </div>

            <button className="botao" type="submit">
              Criar frente
            </button>
          </form>
        </section>
      )}

      {podeGerirCatalogo && (
        <section className="painel">
          <h2>Tipos de frente</h2>
          <p className="nota" style={{ marginBottom: 16 }}>
            O catálogo é da sua operação: nenhum tipo vem pronto no produto. Cadastre os temas que se
            repetem entre carteiras para poder comparar depois.
          </p>

          {tipos.length > 0 && (
            <ul className="lista-estado">
              {tipos.map((t) => (
                <li key={t.id}>
                  <span className="rotulo">
                    {t.nome}
                    {t.descricao && <span className="dica">{t.descricao}</span>}
                  </span>
                  <span className="selo selo-neutro">
                    {frentes.filter((f) => f.catalogo_id === t.id).length} em uso
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form action={criarTipoFrente} className="formulario formulario-linha" style={{ marginTop: 18 }}>
            <label className="campo">
              <span>Nome</span>
              <input type="text" name="nome" required maxLength={80} />
            </label>
            <label className="campo">
              <span>Descrição</span>
              <input type="text" name="descricao" maxLength={160} placeholder="opcional" />
            </label>
            <button className="botao botao-secundario" type="submit">
              Incluir tipo
            </button>
          </form>
        </section>
      )}
    </>
  );
}
