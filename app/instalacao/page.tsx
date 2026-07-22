import { checarAmbiente, ambienteCompleto } from "@/lib/env";

export const dynamic = "force-dynamic";

const TRILHA: { fase: string; titulo: string; feito: boolean }[] = [
  { fase: "F0", titulo: "Esqueleto do aplicativo e conexão com o banco", feito: true },
  { fase: "F1", titulo: "Acesso, organizações e papéis", feito: true },
  { fase: "F2", titulo: "Carteiras", feito: true },
  { fase: "F3", titulo: "Contas nomeadas", feito: true },
  { fase: "F4", titulo: "Contratos e cláusulas monitoradas", feito: true },
  { fase: "F5", titulo: "Frentes de trabalho", feito: true },
  { fase: "F6", titulo: "Timeline e memória institucional", feito: true },
  { fase: "F7", titulo: "Compromissos e alertas", feito: true },
  { fase: "F8", titulo: "Painel multi-carteira", feito: true },
  { fase: "F9", titulo: "Situação da carteira (imprimível)", feito: true },
  { fase: "F10", titulo: "Importação de dados", feito: true },
  { fase: "F12", titulo: "Oportunidades com investimento e retorno", feito: true },
  { fase: "F13", titulo: "Extrato periódico automático por e-mail", feito: true },
  { fase: "F14", titulo: "Motor de maturidade com ciclos e evolução", feito: true },
  { fase: "F16", titulo: "Seletor com busca e filtro múltiplo", feito: true },
  { fase: "F17", titulo: "Panorama e extrato com oportunidades", feito: true },
  { fase: "F18", titulo: "Convite de acesso por e-mail", feito: true },
  { fase: "F19", titulo: "Alertas proativos", feito: true },
  { fase: "F20", titulo: "Anexos em armazenamento privado", feito: true },
  { fase: "F21", titulo: "Registro de alterações", feito: true },
  { fase: "F22", titulo: "Portal da unidade", feito: true },
  { fase: "F23", titulo: "Primeiro acesso e recuperação de senha", feito: true },
  { fase: "B24", titulo: "Navegação e espinha de responsabilidade", feito: true },
  { fase: "B25", titulo: "Painel de decisão", feito: true },
  { fase: "B26", titulo: "Panorama por unidade e por responsável", feito: true },
  { fase: "B27", titulo: "Filas de trabalho com dono e carga", feito: true },
  { fase: "B28", titulo: "Gestão de acesso e permissões", feito: true },
  { fase: "B29", titulo: "Evento de captura", feito: true },
  { fase: "B30", titulo: "Pipeline de conversão", feito: true },
  { fase: "B31", titulo: "Playbooks de cadência", feito: true },
];

export default function PaginaInstalacao() {
  const checagens = checarAmbiente();
  const pronto = ambienteCompleto();

  return (
    <>
      <p className="olho">Estado da instalação</p>
      <h1>{pronto ? "Aplicativo configurado" : "Falta configurar a conexão"}</h1>
      <p className="chamada">
        {pronto
          ? "As credenciais estão no lugar. O próximo passo é aplicar a migração 0000 no banco e seguir para o acesso e as organizações."
          : "Preencha as variáveis marcadas abaixo em .env.local (desenvolvimento) ou nas variáveis de ambiente do deploy. Enquanto elas faltarem, o aplicativo sobe, mas não lê nem grava nada."}
      </p>

      <section className="painel">
        <h2>Configuração</h2>
        <ul className="lista-estado">
          {checagens.map((c) => (
            <li key={c.nome}>
              <span className="rotulo">
                {c.nome}
                <span className="dica">{c.dica}</span>
              </span>
              <span
                className={
                  c.presente ? "selo selo-ok" : c.obrigatoria ? "selo selo-falta" : "selo selo-neutro"
                }
              >
                {c.presente ? "definida" : c.obrigatoria ? "faltando" : "opcional"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="painel">
        <h2>Publicação na Vercel</h2>
        <p className="nota">
          As variáveis que começam com <span className="dado">NEXT_PUBLIC_</span> entram no pacote
          no momento da compilação. Se você as cadastrou depois de publicar, refaça o deploy — sem
          isso o aplicativo continua rodando com a configuração antiga. Em Deployments, use
          Redeploy.
        </p>
      </section>

      <section className="painel">
        <h2>Banco de dados</h2>
        <p className="nota">
          As migrações ficam em <span className="dado">supabase/migrations</span> e são aplicadas em
          ordem numérica pelo editor SQL do Supabase, uma de cada vez. Migração já aplicada não se
          edita: correção vira arquivo novo. Nesta fase existe apenas a{" "}
          <span className="dado">0000_extensoes.sql</span>, que habilita a geração de identificadores.
        </p>
      </section>

      <section className="painel">
        <h2>Trilha de construção</h2>
        <ul className="trilha">
          {TRILHA.map((t) => (
            <li key={t.fase}>
              <span className={t.feito ? "marca-fase feito" : "marca-fase"}>{t.fase}</span>
              <span>{t.titulo}</span>
              <span className={t.feito ? "selo selo-ok" : "selo selo-neutro"} style={{ marginLeft: "auto" }}>
                {t.feito ? "no ar" : "a construir"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
