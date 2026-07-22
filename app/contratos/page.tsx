import Link from "next/link";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { listarCarteiras } from "@/lib/carteiras";
import { formatarData, formatarValor, listarContas } from "@/lib/contas";
import {
  PERIODICIDADES,
  classeSelo,
  listarContratos,
  urgencia,
} from "@/lib/contratos";
import { criarContrato } from "@/app/acoes/contratos";
import { IntroSecao, Vazio } from "@/components/intro-secao";

export const dynamic = "force-dynamic";

const SITUACOES = [
  { valor: "vencido", rotulo: "Vencidos" },
  { valor: "janela", rotulo: "Janela aberta" },
  { valor: "acompanhar", rotulo: "Em acompanhamento" },
  { valor: "sem_prazo", rotulo: "Sem prazo" },
  { valor: "encerrado", rotulo: "Encerrados" },
];

export default async function PaginaContratos({
  searchParams,
}: {
  searchParams: { erro?: string; carteira?: string; situacao?: string };
}) {
  const org = await exigirOrg();
  const [contratos, contas, carteiras] = await Promise.all([
    listarContratos({
      orgId: org.orgId,
      carteiraId: searchParams.carteira,
      situacao: searchParams.situacao,
    }),
    listarContas({ orgId: org.orgId }),
    listarCarteiras(org.orgId),
  ]);

  const nomeConta = (id: string) => contas.find((c) => c.id === id)?.nome ?? "conta removida";
  const podeCriar = podeEscrever(org.papel) && contas.length > 0;

  const todos = await listarContratos({ orgId: org.orgId });
  const vencidos = todos.filter((c) => urgencia(c).chave === "vencido").length;
  const emJanela = todos.filter((c) => urgencia(c).chave === "janela").length;

  return (
    <>
      <p className="olho">{org.nome}</p>
      <h1>Contratos</h1>

      <IntroSecao>
        Cada contrato guarda vigência, o que foi concedido e as cláusulas que precisam de
        acompanhamento. A <strong>janela de renegociação</strong> é calculada sozinha — data de fim
        menos o aviso prévio —, e a lista vem ordenada pela urgência, não pela data de cadastro.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

      {(vencidos > 0 || emJanela > 0) && (
        <div className="tira-alerta">
          {vencidos > 0 && (
            <Link href="/contratos?situacao=vencido">
              <span className="dado">{vencidos}</span>{" "}
              {vencidos === 1 ? "contrato vencido" : "contratos vencidos"}
            </Link>
          )}
          {emJanela > 0 && (
            <Link href="/contratos?situacao=janela">
              <span className="dado">{emJanela}</span> com janela de renegociação aberta
            </Link>
          )}
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
          <select name="situacao" defaultValue={searchParams.situacao ?? ""}>
            <option value="">Todas</option>
            {SITUACOES.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </label>
        <button className="botao botao-secundario" type="submit">
          Filtrar
        </button>
        {(searchParams.carteira || searchParams.situacao) && (
          <Link className="link-acao" href="/contratos">
            Limpar
          </Link>
        )}
      </form>

      {contratos.length === 0 ? (
        <Vazio
          acao={
            contas.length === 0 ? (
              <Link className="botao" href="/contas">
                Cadastrar uma conta
              </Link>
            ) : undefined
          }
        >
          {contas.length === 0
            ? "Todo contrato pertence a uma conta. Cadastre a conta primeiro e o contrato vem em seguida."
            : "Nenhum contrato com esses filtros. Registre o primeiro no formulário abaixo — comece pelos que vencem este ano."}
        </Vazio>
      ) : (
        <section className="painel">
          <ul className="lista-estado">
            {contratos.map((c) => {
              const u = urgencia(c);
              return (
                <li key={c.id}>
                  <span className="rotulo">
                    <Link href={`/contratos/${c.id}`}>
                      {c.numero ? `${c.numero} · ` : ""}
                      {nomeConta(c.conta_id)}
                    </Link>
                    <span className="dica">
                      {[
                        c.tipo,
                        c.fim ? `vence ${formatarData(c.fim)}` : "sem data de fim",
                        u.detalhe,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {c.valor_base !== null && (
                    <span className="valor-teto">{formatarValor(c.valor_base)}</span>
                  )}
                  <span className={classeSelo(u.tom)}>{u.rotulo}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {podeCriar && (
        <section className="painel">
          <h2>Novo contrato</h2>
          <form action={criarContrato} className="formulario">
            <input type="hidden" name="volta" value="/contratos" />

            <div className="formulario-linha">
              <label className="campo">
                <span>Conta</span>
                <select name="conta_id" required defaultValue="">
                  <option value="" disabled>
                    Escolha
                  </option>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Número</span>
                <input type="text" name="numero" maxLength={60} placeholder="opcional" />
              </label>
              <label className="campo">
                <span>Tipo</span>
                <input type="text" name="tipo" maxLength={60} placeholder="como sua operação chama" />
              </label>
            </div>

            <div className="formulario-linha">
              <label className="campo">
                <span>Início</span>
                <input type="date" name="inicio" />
              </label>
              <label className="campo">
                <span>Fim</span>
                <input type="date" name="fim" />
              </label>
              <label className="campo">
                <span>Aviso prévio (dias)</span>
                <input type="number" name="aviso_previa_dias" min={0} max={730} defaultValue={90} />
                <small>Quantos dias antes do fim a conversa precisa começar.</small>
              </label>
              <label className="campo campo-marcador">
                <span>Renovação automática</span>
                <input type="checkbox" name="renovacao_automatica" />
              </label>
            </div>

            <div className="formulario-linha">
              <label className="campo">
                <span>Valor base</span>
                <input type="text" name="valor_base" inputMode="decimal" placeholder="opcional" />
              </label>
              <label className="campo">
                <span>Periodicidade</span>
                <select name="periodicidade" defaultValue="">
                  <option value="">Não definida</option>
                  {PERIODICIDADES.map((p) => (
                    <option key={p.valor} value={p.valor}>
                      {p.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Natureza do benefício</span>
                <input
                  type="text"
                  name="natureza_beneficio"
                  maxLength={120}
                  placeholder="o que foi concedido e com que fundamento"
                />
              </label>
            </div>

            <button className="botao" type="submit">
              Registrar contrato
            </button>
            <p className="nota" style={{ marginTop: 4 }}>
              As cláusulas você registra na ficha do contrato, logo depois.
            </p>
          </form>
        </section>
      )}
    </>
  );
}
