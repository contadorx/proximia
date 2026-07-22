import Link from "next/link";
import { Download, FileJson } from "lucide-react";
import { exigirOrg } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { nomePessoa, pessoasDaOrganizacao } from "@/lib/carteiras";
import { RECURSOS } from "@/lib/exportacao";
import { IntroSecao } from "@/components/intro-secao";

export const dynamic = "force-dynamic";

export default async function PaginaExportacao() {
  const org = await exigirOrg();

  const supabase = criarClienteServidor();
  const [{ data: historico }, pessoas] = await Promise.all([
    supabase
      .from("exportacoes")
      .select("id, recurso, formato, linhas, autor_id, criado_em")
      .eq("org_id", org.orgId)
      .order("criado_em", { ascending: false })
      .limit(10),
    pessoasDaOrganizacao(org.orgId),
  ]);

  const extracoes = (historico ?? []) as {
    id: string;
    recurso: string;
    formato: string;
    linhas: number | null;
    autor_id: string | null;
    criado_em: string;
  }[];

  return (
    <>
      <p className="olho">
        <Link href="/configuracoes">Configurações</Link> · {org.nome}
      </p>

      <div className="cabeca-pagina">
        <div>
          <h1>Exportação de dados</h1>
        </div>
        <div className="cabeca-acoes">
          <a className="botao botao-primario" href="/api/exportar/tudo">
            <FileJson size={15} />
            Baixar tudo (JSON)
          </a>
        </div>
      </div>

      <IntroSecao>
        Os seus dados saem daqui em formato aberto, a qualquer momento — não só no encerramento. O
        que você exporta é <strong>o que você enxerga</strong>: a mesma regra de alcance das telas
        vale aqui, então quem só acessa algumas carteiras exporta só elas.
      </IntroSecao>

      <section className="painel">
        <h2>Por recurso, em CSV</h2>
        <ul className="lista-estado">
          {RECURSOS.map((r) => (
            <li key={r.chave}>
              <span className="rotulo">
                {r.rotulo}
                <span className="dica">{r.descricao}</span>
              </span>
              <a className="link-acao" href={`/api/exportar/${r.chave}`}>
                <Download size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                Baixar
              </a>
            </li>
          ))}
        </ul>

        <p className="nota" style={{ marginTop: 16, marginBottom: 0 }}>
          Separador ponto e vírgula e acentuação em UTF-8 com marca de ordem — abre direto no Excel
          em português, sem a etapa de importação que costuma quebrar os acentos.
        </p>
      </section>

      <section className="painel">
        <h2>Cuidado com o que sai</h2>
        <ul className="lista-limpa-simples">
          <li>
            O arquivo de <strong>contatos</strong> contém dado pessoal — nome, e-mail e telefone de
            pessoas nas contas. Tratá-lo depois da exportação é responsabilidade de quem baixou.
          </li>
          <li>
            O arquivo de <strong>histórico</strong> traz o que a equipe escreveu, inclusive avaliações
            francas sobre contas e negociações.
          </li>
          <li>
            Toda exportação fica registrada com autor e data. Guardamos o registro do ato, nunca uma
            cópia do que foi levado.
          </li>
        </ul>
      </section>

      {extracoes.length > 0 && (
        <section className="painel">
          <h2>Últimas exportações</h2>
          <ul className="lista-estado">
            {extracoes.map((e) => (
              <li key={e.id}>
                <span className="rotulo">
                  {e.recurso === "tudo" ? "Pacote completo" : e.recurso}
                  <span className="dica">
                    {new Date(e.criado_em).toLocaleString("pt-BR")} ·{" "}
                    {e.autor_id ? nomePessoa(pessoas.find((p) => p.id === e.autor_id)) : "—"}
                    {e.linhas !== null ? ` · ${e.linhas.toLocaleString("pt-BR")} linhas` : ""}
                  </span>
                </span>
                <span className="selo selo-neutro">{e.formato}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
