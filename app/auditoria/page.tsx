import { exigirOrg } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { acharPessoa, pessoasDaOrganizacao, nomePessoa } from "@/lib/carteiras";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { SeletorMultiplo } from "@/components/seletor";
import { paraLista, paraTexto } from "@/lib/consulta";

export const dynamic = "force-dynamic";

type Linha = {
  id: string;
  acao: "criou" | "alterou" | "excluiu";
  tabela: string;
  registro_id: string | null;
  resumo: string | null;
  mudancas: Record<string, { de: unknown; para: unknown }>;
  autor_id: string | null;
  criado_em: string;
};

const TABELAS = [
  { valor: "carteiras", rotulo: "Carteiras" },
  { valor: "contas", rotulo: "Contas" },
  { valor: "contratos", rotulo: "Contratos" },
  { valor: "contrato_clausulas", rotulo: "Cláusulas" },
  { valor: "frentes", rotulo: "Frentes" },
  { valor: "oportunidades", rotulo: "Oportunidades" },
  { valor: "compromissos", rotulo: "Compromissos" },
  { valor: "memberships", rotulo: "Acessos" },
  { valor: "convites", rotulo: "Convites" },
  { valor: "anexos", rotulo: "Anexos" },
  { valor: "maturidade_avaliacoes", rotulo: "Avaliações" },
  { valor: "maturidade_dimensoes", rotulo: "Dimensões" },
  { valor: "maturidade_perguntas", rotulo: "Perguntas" },
];

const ACOES = [
  { valor: "criou", rotulo: "Criou" },
  { valor: "alterou", rotulo: "Alterou" },
  { valor: "excluiu", rotulo: "Excluiu" },
];

const rotuloTabela = (t: string) => TABELAS.find((x) => x.valor === t)?.rotulo ?? t;

function valorLegivel(v: unknown): string {
  if (v === null || v === undefined) return "vazio";
  if (typeof v === "boolean") return v ? "sim" : "não";
  const texto = String(v);
  return texto.length > 60 ? `${texto.slice(0, 60)}…` : texto;
}

export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: { tabela?: string | string[]; acao?: string | string[]; dias?: string | string[] };
}) {
  const org = await exigirOrg();
  const dias = Number(paraTexto(searchParams.dias) ?? "30");

  const desde = new Date();
  desde.setDate(desde.getDate() - (Number.isNaN(dias) ? 30 : dias));

  const supabase = criarClienteServidor();
  let consulta = supabase
    .from("auditoria")
    .select("id, acao, tabela, registro_id, resumo, mudancas, autor_id, criado_em")
    .eq("org_id", org.orgId)
    .gte("criado_em", desde.toISOString());

  const tabelas = paraLista(searchParams.tabela);
  const acoes = paraLista(searchParams.acao);
  if (tabelas.length) consulta = consulta.in("tabela", tabelas);
  if (acoes.length) consulta = consulta.in("acao", acoes);

  const { data, error } = await consulta.order("criado_em", { ascending: false }).limit(300);
  const linhas = (data ?? []) as Linha[];
  const pessoas = await pessoasDaOrganizacao(org.orgId);

  const semAcesso = Boolean(error) || !["owner", "admin", "leitura_ampla"].includes(org.papel);

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Registro de alterações</h1>
        </div>
      </div>

      <IntroSecao>
        Quem alterou o quê, e quando. As linhas nascem por gatilho no banco:{" "}
        <strong>ninguém escreve aqui, nem edita depois</strong> — registro que a própria pessoa pode
        forjar não serve de auditoria. Guardamos apenas os campos que mudaram, não a cópia inteira do
        registro.
      </IntroSecao>

      {semAcesso ? (
        <Vazio>
          O registro de alterações é visível para quem administra a organização e para o perfil de
          acompanhamento.
        </Vazio>
      ) : (
        <>
          <form className="filtros" method="get">
            <SeletorMultiplo
              nome="tabela"
              rotulo="Onde"
              opcoes={TABELAS}
              inicial={tabelas}
              rotuloTodas="Tudo"
            />
            <SeletorMultiplo
              nome="acao"
              rotulo="O que"
              opcoes={ACOES}
              inicial={acoes}
              rotuloTodas="Todas"
            />
            <label className="campo">
              <span>Período</span>
              <select name="dias" defaultValue={String(dias)}>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="90">Últimos 90 dias</option>
                <option value="365">Último ano</option>
              </select>
            </label>
            <button className="botao botao-secundario" type="submit">
              Filtrar
            </button>
          </form>

          {linhas.length === 0 ? (
            <Vazio>Nenhuma alteração registrada no período.</Vazio>
          ) : (
            <section className="painel">
              <ul className="lista-estado">
                {linhas.map((l) => {
                  const campos = Object.entries(l.mudancas ?? {});
                  return (
                    <li key={l.id} className="linha-auditoria">
                      <span className="rotulo">
                        <strong>{rotuloTabela(l.tabela)}</strong>
                        {l.resumo ? ` · ${l.resumo}` : ""}
                        <span className="dica">
                          {new Date(l.criado_em).toLocaleString("pt-BR")} ·{" "}
                          {l.autor_id
                            ? nomePessoa(acharPessoa(pessoas, l.autor_id))
                            : "rotina automática"}
                        </span>

                        {campos.length > 0 && (
                          <span className="mudancas">
                            {campos.slice(0, 4).map(([campo, v]) => (
                              <span key={campo} className="mudanca">
                                <span className="dado">{campo}</span>
                                <span className="de">{valorLegivel(v?.de)}</span>
                                <span className="seta">→</span>
                                <span className="para">{valorLegivel(v?.para)}</span>
                              </span>
                            ))}
                            {campos.length > 4 && (
                              <span className="mudanca-mais">e mais {campos.length - 4}</span>
                            )}
                          </span>
                        )}
                      </span>

                      <span
                        className={
                          l.acao === "excluiu"
                            ? "selo selo-falta"
                            : l.acao === "criou"
                              ? "selo selo-ok"
                              : "selo selo-neutro"
                        }
                      >
                        {l.acao}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <p className="nota">
            Histórico e alertas ficam fora desta trilha de propósito: o histórico já é imutável por
            desenho, e alerta nasce de varredura, não de decisão de alguém.
          </p>
        </>
      )}
    </>
  );
}
