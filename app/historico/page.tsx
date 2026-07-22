import Link from "next/link";
import { exigirOrg } from "@/lib/auth";
import { listarCarteiras, nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { formatarData } from "@/lib/contas";
import {
  TIPOS_REGISTRO,
  caminhoEntidade,
  historico,
  rotuloEntidade,
  rotuloTipo,
} from "@/lib/registros";
import { IntroSecao, Vazio } from "@/components/intro-secao";

export const dynamic = "force-dynamic";

const PERIODOS = [
  { valor: "30", rotulo: "Últimos 30 dias" },
  { valor: "90", rotulo: "Últimos 90 dias" },
  { valor: "365", rotulo: "Último ano" },
  { valor: "", rotulo: "Tudo" },
];

function desdeDias(dias: string | undefined): string | undefined {
  if (!dias) return undefined;
  const n = Number(dias);
  if (Number.isNaN(n)) return undefined;
  const data = new Date();
  data.setDate(data.getDate() - n);
  return data.toISOString().slice(0, 10);
}

export default async function PaginaHistorico({
  searchParams,
}: {
  searchParams: { carteira?: string; tipo?: string; periodo?: string };
}) {
  const org = await exigirOrg();
  const periodo = searchParams.periodo ?? "90";

  const [registros, carteiras, pessoas] = await Promise.all([
    historico({
      orgId: org.orgId,
      carteiraId: searchParams.carteira,
      tipo: searchParams.tipo,
      desde: desdeDias(periodo),
    }),
    listarCarteiras(org.orgId),
    pessoasDaOrganizacao(org.orgId),
  ]);

  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "—";
  const autor = (id: string) => nomePessoa(pessoas.find((p) => p.id === id));

  // Agrupa por dia para a leitura ficar próxima de um diário de bordo.
  const porDia = registros.reduce<Record<string, typeof registros>>((mapa, r) => {
    (mapa[r.ocorrido_em] ??= []).push(r);
    return mapa;
  }, {});

  return (
    <>
      <p className="olho">{org.nome}</p>
      <h1>Histórico</h1>

      <IntroSecao>
        Tudo o que foi registrado nas carteiras, contas, contratos e frentes, do mais recente para o
        mais antigo. Cada linha tem <strong>autor e data</strong>, e edição não apaga nada: gera uma
        versão nova.
      </IntroSecao>

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
          <span>Tipo</span>
          <select name="tipo" defaultValue={searchParams.tipo ?? ""}>
            <option value="">Todos</option>
            {TIPOS_REGISTRO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Período</span>
          <select name="periodo" defaultValue={periodo}>
            {PERIODOS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </label>
        <button className="botao botao-secundario" type="submit">
          Filtrar
        </button>
      </form>

      {registros.length === 0 ? (
        <Vazio>
          Nenhum registro no período. O histórico se enche sozinho conforme a equipe registra
          reuniões, decisões e entregas nas fichas.
        </Vazio>
      ) : (
        <section className="painel">
          {Object.entries(porDia).map(([dia, doDia]) => (
            <div key={dia} className="grupo-dia">
              <p className="olho">{formatarData(dia)}</p>
              <ol className="linha-tempo">
                {doDia.map((r) => (
                  <li key={r.id}>
                    <div className="registro-cabeca">
                      <span className="selo selo-neutro">{rotuloTipo(r.tipo)}</span>
                      <Link href={caminhoEntidade(r.entidade_tipo, r.entidade_id)}>
                        {rotuloEntidade(r.entidade_tipo)}
                      </Link>
                      <span className="registro-autor">
                        {nomeCarteira(r.carteira_id)} · {autor(r.autor_id)}
                      </span>
                      {r.versao > 1 && <span className="registro-versao dado">v{r.versao}</span>}
                    </div>
                    {r.titulo && <p className="registro-titulo">{r.titulo}</p>}
                    <p className="registro-corpo">{r.corpo}</p>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
