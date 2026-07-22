import Link from "next/link";
import { exigirOrg, exigirUsuario, podeEscrever } from "@/lib/auth";
import { listarCarteiras, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { formatarData } from "@/lib/contas";
import {
  classeSituacao,
  listarCompromissos,
  rotuloOrigem,
  situacao,
  type Compromisso,
} from "@/lib/compromissos";
import { caminhoEntidade } from "@/lib/registros";
import {
  criarCompromisso,
  gerarCompromissosPendentes,
  mudarStatusCompromisso,
} from "@/app/acoes/compromissos";
import { IntroSecao, Vazio } from "@/components/intro-secao";

export const dynamic = "force-dynamic";

function Lista({
  itens,
  pessoas,
  carteiras,
  editavel,
}: {
  itens: Compromisso[];
  pessoas: { id: string; nome: string | null; email: string | null }[];
  carteiras: { id: string; nome: string }[];
  editavel: boolean;
}) {
  return (
    <ul className="lista-estado">
      {itens.map((c) => {
        const s = situacao(c);
        const carteira = carteiras.find((x) => x.id === c.carteira_id)?.nome ?? "—";
        return (
          <li key={c.id}>
            <span className="rotulo">
              <Link href={caminhoEntidade(c.entidade_tipo, c.entidade_id)}>{c.titulo}</Link>
              <span className="dica">
                {[
                  formatarData(c.vence_em),
                  s.detalhe,
                  carteira,
                  c.dono_id ? nomePessoa(pessoas.find((p) => p.id === c.dono_id)) : "sem dono",
                  c.origem !== "manual" ? rotuloOrigem(c.origem) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className={classeSituacao(s.tom)}>{s.rotulo}</span>
            {editavel && c.status === "aberto" && (
              <form action={mudarStatusCompromisso}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="status" value="concluido" />
                <input type="hidden" name="volta" value="/compromissos" />
                <button className="link-acao" type="submit">
                  Concluir
                </button>
              </form>
            )}
            {editavel && c.status === "concluido" && (
              <form action={mudarStatusCompromisso}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="status" value="aberto" />
                <input type="hidden" name="volta" value="/compromissos" />
                <button className="link-acao" type="submit">
                  Reabrir
                </button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function PaginaCompromissos({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string; carteira?: string; ver?: string };
}) {
  const org = await exigirOrg();
  const usuario = await exigirUsuario();

  const [todos, carteiras, pessoas] = await Promise.all([
    listarCompromissos({ orgId: org.orgId, carteiraId: searchParams.carteira }),
    listarCarteiras(org.orgId),
    pessoasDaOrganizacao(org.orgId),
  ]);

  const editavel = podeEscrever(org.papel);
  const abertos = todos.filter((c) => c.status === "aberto");
  const meus = abertos.filter((c) => c.dono_id === usuario.id);
  const atrasados = abertos.filter((c) => situacao(c).chave === "vencido");
  const proximos = abertos.filter((c) => {
    const chave = situacao(c).chave;
    return chave === "hoje" || chave === "alerta";
  });
  const adiante = abertos.filter((c) => situacao(c).chave === "adiante");
  const concluidos = todos.filter((c) => c.status === "concluido").slice(0, 10);
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <>
      <p className="olho">{org.nome}</p>
      <h1>Compromissos</h1>

      <IntroSecao>
        O que foi combinado vira <strong>data com dono</strong>. Contratos e cláusulas monitoradas
        geram os seus sozinhos: a janela de renegociação e a antecedência de cada cláusula viram
        compromisso sem ninguém precisar lembrar.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <section className="painel">
        <div className="grade-prazos">
          <div>
            <p className="olho">Atrasados</p>
            <p className="dado destaque-dado" style={{ color: atrasados.length ? "var(--alerta)" : undefined }}>
              {atrasados.length}
            </p>
          </div>
          <div>
            <p className="olho">Próximos dias</p>
            <p className="dado destaque-dado">{proximos.length}</p>
          </div>
          <div>
            <p className="olho">Meus, em aberto</p>
            <p className="dado destaque-dado">{meus.length}</p>
          </div>
          <div>
            <p className="olho">Total em aberto</p>
            <p className="dado destaque-dado">{abertos.length}</p>
          </div>
        </div>
      </section>

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
        <button className="botao botao-secundario" type="submit">
          Filtrar
        </button>
        {searchParams.carteira && (
          <Link className="link-acao" href="/compromissos">
            Limpar
          </Link>
        )}
      </form>

      {atrasados.length > 0 && (
        <section className="painel painel-alerta">
          <h2>Atrasados</h2>
          <Lista itens={atrasados} pessoas={pessoas} carteiras={carteiras} editavel={editavel} />
        </section>
      )}

      {meus.length > 0 && (
        <section className="painel painel-destaque">
          <h2>Meus compromissos</h2>
          <Lista itens={meus} pessoas={pessoas} carteiras={carteiras} editavel={editavel} />
        </section>
      )}

      <section className="painel">
        <h2>Próximos</h2>
        {proximos.length === 0 && adiante.length === 0 ? (
          <Vazio>
            Nada em aberto. Registre um compromisso abaixo, ou traga os contratos — cada vigência
            gera o seu automaticamente.
          </Vazio>
        ) : (
          <Lista
            itens={[...proximos, ...adiante]}
            pessoas={pessoas}
            carteiras={carteiras}
            editavel={editavel}
          />
        )}
      </section>

      {concluidos.length > 0 && (
        <section className="painel">
          <h2>Concluídos recentemente</h2>
          <Lista itens={concluidos} pessoas={pessoas} carteiras={carteiras} editavel={editavel} />
        </section>
      )}

      {editavel && carteiras.length > 0 && (
        <section className="painel">
          <h2>Novo compromisso</h2>
          <form action={criarCompromisso} className="formulario">
            <input type="hidden" name="volta" value="/compromissos" />
            <input type="hidden" name="entidade_tipo" value="carteira" />

            <div className="formulario-linha">
              <label className="campo">
                <span>O que precisa ser feito</span>
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
                <span>Data</span>
                <input type="date" name="vence_em" required defaultValue={hoje} />
              </label>
              <label className="campo">
                <span>Dono</span>
                <select name="dono_id" defaultValue={usuario.id}>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {nomePessoa(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Avisar (dias antes)</span>
                <input type="number" name="alerta_dias" min={0} max={365} defaultValue={7} />
              </label>
            </div>

            <label className="campo">
              <span>Detalhe</span>
              <input type="text" name="descricao" maxLength={200} placeholder="opcional" />
            </label>

            <button className="botao" type="submit">
              Registrar compromisso
            </button>
          </form>
        </section>
      )}

      {org.papel !== "ponto_focal" && podeEscrever(org.papel) && (
        <section className="painel">
          <h2>Contratos anteriores a esta função</h2>
          <p className="nota" style={{ marginBottom: 16 }}>
            Contratos e cláusulas cadastrados antes desta etapa não passaram pela geração automática.
            Rode uma vez para trazer os que faltam — repetir não duplica nada.
          </p>
          <form action={gerarCompromissosPendentes}>
            <button className="botao botao-secundario" type="submit">
              Gerar os que faltam
            </button>
          </form>
        </section>
      )}
    </>
  );
}
