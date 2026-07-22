import Link from "next/link";
import { exigirOrg } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarData } from "@/lib/contas";
import { MODELOS, type TipoImportacao } from "@/lib/importacao";
import { conferirArquivo } from "@/app/acoes/importacao";
import { IntroSecao, Vazio } from "@/components/intro-secao";

export const dynamic = "force-dynamic";

type Importacao = {
  id: string;
  tipo: TipoImportacao;
  arquivo_nome: string | null;
  status: "conferida" | "concluida" | "descartada";
  linhas_total: number;
  linhas_ok: number;
  linhas_erro: number;
  linhas_gravadas: number;
  criado_em: string;
};

export default async function PaginaImportacao({
  searchParams,
}: {
  searchParams: { erro?: string; tipo?: string };
}) {
  const org = await exigirOrg();

  const supabase = criarClienteServidor();
  const { data } = await supabase
    .from("importacoes")
    .select("id, tipo, arquivo_nome, status, linhas_total, linhas_ok, linhas_erro, linhas_gravadas, criado_em")
    .eq("org_id", org.orgId)
    .order("criado_em", { ascending: false })
    .limit(20);

  const anteriores = (data ?? []) as Importacao[];
  const tipoEscolhido = (searchParams.tipo as TipoImportacao) ?? "carteiras";

  return (
    <>
      <p className="olho">{org.nome}</p>
      <h1>Importação</h1>

      <IntroSecao>
        A carga acontece em <strong>duas etapas</strong>: primeiro o arquivo é conferido linha a
        linha e você vê o que entra e o que foi recusado; só depois, com o relatório na tela, você
        confirma. Ordem recomendada: carteiras, contas, contratos, frentes.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

      <section className="painel">
        <h2>Enviar arquivo</h2>
        <form action={conferirArquivo} className="formulario">
          <div className="formulario-linha">
            <label className="campo">
              <span>O que está importando</span>
              <select name="tipo" defaultValue={tipoEscolhido}>
                {(Object.keys(MODELOS) as TipoImportacao[]).map((t) => (
                  <option key={t} value={t}>
                    {MODELOS[t].rotulo} — {MODELOS[t].explicacao}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Arquivo CSV</span>
              <input type="file" name="arquivo" accept=".csv,text/csv,text/plain" />
              <small>Separador ponto e vírgula ou vírgula. Datas em DD/MM/AAAA.</small>
            </label>
          </div>

          <label className="campo">
            <span>Ou cole o conteúdo</span>
            <textarea
              name="colado"
              rows={4}
              placeholder="Cole aqui as linhas copiadas da planilha, com o cabeçalho na primeira."
            />
          </label>

          <button className="botao botao-primario" type="submit">
            Conferir arquivo
          </button>
          <p className="nota" style={{ marginTop: 4 }}>
            Nada é gravado nesta etapa.
          </p>
        </form>
      </section>

      <section className="painel">
        <h2>Modelos e colunas</h2>
        <p className="nota" style={{ marginBottom: 16 }}>
          Baixe o modelo, preencha na sua planilha e salve como CSV. Colunas fora da lista são
          ignoradas; acentos e maiúsculas no cabeçalho não atrapalham.
        </p>

        {(Object.keys(MODELOS) as TipoImportacao[]).map((t) => (
          <div key={t} className="bloco-modelo">
            <div className="linha-titulo">
              <h3>{MODELOS[t].rotulo}</h3>
              <a className="link-acao" href={`/importacao/modelo?tipo=${t}`}>
                Baixar modelo
              </a>
            </div>
            <p className="lista-colunas">
              {MODELOS[t].colunas.map((c) => (
                <span key={c.chave} className={c.obrigatoria ? "coluna obrigatoria" : "coluna"}>
                  {c.rotulo}
                  {c.obrigatoria ? "*" : ""}
                </span>
              ))}
            </p>
          </div>
        ))}
        <p className="nota">* obrigatória</p>
      </section>

      <section className="painel">
        <h2>Cargas anteriores</h2>
        {anteriores.length === 0 ? (
          <Vazio>Nenhuma importação feita ainda.</Vazio>
        ) : (
          <ul className="lista-estado">
            {anteriores.map((i) => (
              <li key={i.id}>
                <span className="rotulo">
                  <Link href={`/importacao/${i.id}`}>
                    {MODELOS[i.tipo]?.rotulo ?? i.tipo} · {i.arquivo_nome ?? "sem nome"}
                  </Link>
                  <span className="dica">
                    {formatarData(i.criado_em.slice(0, 10))} · {i.linhas_total} linhas ·{" "}
                    {i.linhas_ok} válidas · {i.linhas_erro} recusadas
                    {i.status === "concluida" ? ` · ${i.linhas_gravadas} gravadas` : ""}
                  </span>
                </span>
                <span
                  className={
                    i.status === "concluida"
                      ? "selo selo-ok"
                      : i.status === "descartada"
                        ? "selo selo-neutro"
                        : "selo selo-falta"
                  }
                >
                  {i.status === "concluida"
                    ? "Concluída"
                    : i.status === "descartada"
                      ? "Descartada"
                      : "Aguardando confirmação"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
