import Link from "next/link";
import { KeyRound, Plus, UserPlus } from "lucide-react";
import { exigirOrg, podeAdministrar, podeEscrever } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { PAPEIS, rotuloPapel, type Papel } from "@/lib/tipos";
import { listarFrentes, tiposDeFrente } from "@/lib/frentes";
import { vincularMembro } from "@/app/acoes/organizacoes";
import { cancelarConvite, convidarPessoa } from "@/app/acoes/convites";
import { trocarSenha } from "@/app/acoes/senha";
import { criarPapel, excluirPapel } from "@/app/acoes/responsabilidades";
import { papeisOperacionais } from "@/lib/responsabilidades";
import { BotaoExcluir } from "@/components/botao-excluir";
import { criarTipoFrente } from "@/app/acoes/frentes";
import { criarTipoOportunidade } from "@/app/acoes/oportunidades";
import { listarOportunidades, tiposDeOportunidade } from "@/lib/oportunidades";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { excluirTipoFrente, excluirTipoOportunidade } from "@/app/acoes/exclusoes";

export const dynamic = "force-dynamic";

type Pessoa = { user_id: string; papel: Papel; nome: string | null; email: string | null };

async function pessoasDaOrg(orgId: string): Promise<Pessoa[]> {
  const supabase = criarClienteServidor();

  const { data: vinculos } = await supabase
    .from("memberships")
    .select("user_id, papel")
    .eq("org_id", orgId)
    .eq("ativo", true);

  if (!vinculos?.length) return [];

  const { data: perfis } = await supabase
    .from("perfis")
    .select("id, nome, email")
    .in(
      "id",
      vinculos.map((v) => v.user_id as string),
    );

  const porId = new Map((perfis ?? []).map((p) => [p.id as string, p]));

  return vinculos.map((v) => {
    const perfil = porId.get(v.user_id as string);
    return {
      user_id: v.user_id as string,
      papel: v.papel as Papel,
      nome: (perfil?.nome as string) ?? null,
      email: (perfil?.email as string) ?? null,
    };
  });
}

export default async function PaginaConfiguracoes({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const supabase = criarClienteServidor();
  const { data: convitesBrutos } = await supabase
    .from("convites")
    .select("id, email, papel, status, expira_em, criado_em")
    .eq("org_id", org.orgId)
    .eq("status", "pendente")
    .order("criado_em", { ascending: false });
  const convites = (convitesBrutos ?? []) as {
    id: string;
    email: string;
    papel: Papel;
    status: string;
    expira_em: string;
  }[];

  const [pessoas, tipos, frentes, tiposOportunidade, oportunidades, papeis] = await Promise.all([
    pessoasDaOrg(org.orgId),
    tiposDeFrente(org.orgId),
    listarFrentes({ orgId: org.orgId }),
    tiposDeOportunidade(org.orgId),
    listarOportunidades({ orgId: org.orgId }),
    papeisOperacionais(org.orgId),
  ]);

  const administra = podeAdministrar(org.papel);
  const gereCatalogo = podeEscrever(org.papel) && org.papel !== "ponto_focal";

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Configurações</h1>
        </div>
      </div>

      <IntroSecao>
        Tudo o que é ajuste da operação fica aqui: <strong>quem tem acesso e com qual alcance</strong>,
        os tipos de frente que a sua equipe usa e os dados da organização. O resto das telas fica só
        com o trabalho do dia.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      <section className="painel">
        <div className="linha-titulo">
          <h2>Acesso e permissões</h2>
          <Link className="botao botao-secundario" href="/configuracoes/acesso">
            Gerenciar acesso
          </Link>
        </div>

        <ul className="lista-estado">
          {pessoas.slice(0, 5).map((p) => (
            <li key={p.user_id}>
              <span className="rotulo">
                {p.nome ?? p.email ?? "Pessoa sem perfil"}
                {p.email && p.nome && <span className="dica">{p.email}</span>}
              </span>
              <span className="selo selo-neutro">{rotuloPapel(p.papel)}</span>
            </li>
          ))}
        </ul>

        {pessoas.length > 5 && (
          <p className="nota" style={{ marginTop: 12 }}>
            e mais {pessoas.length - 5} — veja todas na tela de acesso.
          </p>
        )}

        {convites.length > 0 && (
          <p className="nota" style={{ marginBottom: 0 }}>
            <span className="dado">{convites.length}</span> convite(s) pendente(s).
          </p>
        )}
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Papéis de responsabilidade</h2>
          {gereCatalogo && (
            <Modal
              rotulo="Novo papel"
              titulo="Novo papel de responsabilidade"
              descricao="Ex.: responsável na unidade, apoio corporativo, ponto focal técnico."
              icone={<Plus size={15} />}
            >
              <form action={criarPapel} className="formulario">
                <label className="campo">
                  <span>Nome</span>
                  <input type="text" name="nome" required maxLength={80} autoFocus />
                </label>
                <label className="campo">
                  <span>Descrição</span>
                  <input type="text" name="descricao" maxLength={160} placeholder="opcional" />
                </label>
                <div className="formulario-linha">
                  <label className="campo campo-numerico">
                    <span>Ordem</span>
                    <input type="number" name="ordem" defaultValue={papeis.length + 1} />
                  </label>
                  <label className="campo campo-marcador">
                    <input type="checkbox" name="primario" />
                    <span>Papel primário</span>
                  </label>
                </div>
                <button className="botao botao-primario" type="submit">
                  Criar papel
                </button>
                <p className="nota">
                  O papel primário é quem responde por uma carteira quando não há dono mais
                  específico. Só pode haver um.
                </p>
              </form>
            </Modal>
          )}
        </div>

        {papeis.length === 0 ? (
          <Vazio>
            Nenhum papel cadastrado. Sem eles, alertas e compromissos caem no responsável gravado na
            ficha da carteira — funciona, mas não distingue quem opera de quem acompanha.
          </Vazio>
        ) : (
          <ul className="lista-estado">
            {papeis.map((x) => (
              <li key={x.id}>
                <span className="rotulo">
                  {x.nome}
                  {x.descricao && <span className="dica">{x.descricao}</span>}
                </span>
                {x.primario && <span className="selo selo-ok">primário</span>}
                {gereCatalogo && (
                  <form action={excluirPapel}>
                    <input type="hidden" name="id" value={x.id} />
                    <BotaoExcluir compacto rotulo="Excluir" />
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

<section className="painel">
        <div className="linha-titulo">
          <h2>Tipos de frente</h2>
          {gereCatalogo && (
            <Modal
              rotulo="Novo tipo"
              titulo="Novo tipo de frente"
              descricao="Cadastre os temas que se repetem entre carteiras, para poder comparar depois."
              icone={<Plus size={15} />}
            >
              <form action={criarTipoFrente} className="formulario">
                <label className="campo">
                  <span>Nome</span>
                  <input type="text" name="nome" required maxLength={80} autoFocus />
                </label>
                <label className="campo">
                  <span>Descrição</span>
                  <input type="text" name="descricao" maxLength={160} placeholder="opcional" />
                </label>
                <button className="botao botao-primario" type="submit">
                  Incluir tipo
                </button>
              </form>
            </Modal>
          )}
        </div>

        {tipos.length === 0 ? (
          <Vazio>
            Nenhum tipo cadastrado. Nada vem pronto no produto: o catálogo é do vocabulário da sua
            operação.
          </Vazio>
        ) : (
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
                {gereCatalogo && (
                  <form action={excluirTipoFrente}>
                    <input type="hidden" name="id" value={t.id} />
                    <BotaoExcluir compacto rotulo="Excluir" />
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Tipos de oportunidade</h2>
          {gereCatalogo && (
            <Modal
              rotulo="Novo tipo"
              titulo="Novo tipo de oportunidade"
              descricao="Ex.: expansão, novo serviço, substituição de equipamento."
              icone={<Plus size={15} />}
            >
              <form action={criarTipoOportunidade} className="formulario">
                <label className="campo">
                  <span>Nome</span>
                  <input type="text" name="nome" required maxLength={80} autoFocus />
                </label>
                <label className="campo">
                  <span>Descrição</span>
                  <input type="text" name="descricao" maxLength={160} placeholder="opcional" />
                </label>
                <button className="botao botao-primario" type="submit">
                  Incluir tipo
                </button>
              </form>
            </Modal>
          )}
        </div>

        {tiposOportunidade.length === 0 ? (
          <Vazio>Nenhum tipo cadastrado ainda.</Vazio>
        ) : (
          <ul className="lista-estado">
            {tiposOportunidade.map((t) => (
              <li key={t.id}>
                <span className="rotulo">
                  {t.nome}
                  {t.descricao && <span className="dica">{t.descricao}</span>}
                </span>
                <span className="selo selo-neutro">
                  {oportunidades.filter((o) => o.catalogo_id === t.id).length} em uso
                </span>
                {gereCatalogo && (
                  <form action={excluirTipoOportunidade}>
                    <input type="hidden" name="id" value={t.id} />
                    <BotaoExcluir compacto rotulo="Excluir" />
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Sua conta</h2>
          <Modal
            rotulo="Trocar senha"
            titulo="Trocar senha"
            descricao="A senha nova passa a valer imediatamente, aqui e nos outros dispositivos."
            variante="secundario"
            icone={<KeyRound size={15} />}
          >
            <form action={trocarSenha} className="formulario">
              <label className="campo">
                <span>Senha nova</span>
                <input type="password" name="senha" required minLength={8} autoFocus />
                <small>Pelo menos 8 caracteres.</small>
              </label>
              <label className="campo">
                <span>Repita a senha</span>
                <input type="password" name="confirmacao" required minLength={8} />
              </label>
              <button className="botao botao-primario" type="submit">
                Salvar senha
              </button>
            </form>
          </Modal>
        </div>
        <p className="nota" style={{ marginBottom: 0 }}>
          Esqueceu a senha e não consegue entrar? A tela de acesso tem o link de redefinição por
          e-mail.
        </p>
      </section>

      <section className="painel">
        <h2>Organização</h2>
        <div className="grade-prazos">
          <div>
            <p className="olho">Nome</p>
            <p className="destaque-dado">{org.nome}</p>
          </div>
          <div>
            <p className="olho">Identificador</p>
            <p className="destaque-dado dado">{org.slug}</p>
          </div>
          <div>
            <p className="olho">Seu alcance</p>
            <p className="destaque-dado">{rotuloPapel(org.papel)}</p>
          </div>
          <div>
            <p className="olho">Dados</p>
            <p className="destaque-dado" style={{ fontSize: 14 }}>
              <Link href="/importacao">Importar por CSV</Link>
            </p>
          </div>
        </div>
      </section>

      <section className="painel">
        <h2>Administração</h2>
        <ul className="lista-estado">
          <li>
            <span className="rotulo">
              <Link href="/importacao">Importação de dados</Link>
              <span className="dica">Carga de carteiras, contas, contratos e frentes por planilha</span>
            </span>
          </li>
          <li>
            <span className="rotulo">
              <Link href="/auditoria">Registro de alterações</Link>
              <span className="dica">Quem alterou o quê, e quando</span>
            </span>
          </li>
        </ul>
      </section>

      <section className="painel">
        <h2>Diagnóstico</h2>
        <p className="nota">
          Se algo parar de responder, a página de <Link href="/diagnostico">diagnóstico</Link> testa
          configuração, conexão, sessão e banco de dados, e aponta qual item falhou.
        </p>
      </section>
    </>
  );
}
