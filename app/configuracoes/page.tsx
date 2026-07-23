import Link from "next/link";
import { KeyRound, Mail, Plus, UserPlus, Users } from "lucide-react";
import { exigirOrg, podeAdministrar, podeEscrever } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { PAPEIS, rotuloPapel, type Papel } from "@/lib/tipos";
import { listarFrentes, tiposDeFrente } from "@/lib/frentes";
import { vincularMembro } from "@/app/acoes/organizacoes";
import { cancelarConvite, convidarPessoa } from "@/app/acoes/convites";
import { trocarSenha } from "@/app/acoes/senha";
import { salvarPreferenciaAviso } from "@/app/acoes/avisos";
import { alternarAnexos } from "@/app/acoes/classificacoes";
import { anexosPermitidos } from "@/lib/classificacoes";
import { exigirUsuario } from "@/lib/auth";
import { criarPapel, excluirPapel } from "@/app/acoes/responsabilidades";
import { papeisOperacionais } from "@/lib/responsabilidades";
import { BotaoExcluir } from "@/components/botao-excluir";
import { criarTipoFrente } from "@/app/acoes/frentes";
import { criarTipoOportunidade } from "@/app/acoes/oportunidades";
import { listarOportunidades, tiposDeOportunidade } from "@/lib/oportunidades";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { BotaoEnviar } from "@/components/botao-enviar";
import { FormAcao } from "@/components/form-acao";
import { excluirTipoFrente, excluirTipoOportunidade } from "@/app/acoes/exclusoes";
import { listarEquipe } from "@/lib/equipe";
import {
  alternarPessoaEquipe,
  criarPessoaEquipe,
  editarPessoaEquipe,
  excluirPessoaEquipe,
} from "@/app/acoes/equipe";
import { enviarEmailTeste } from "@/app/acoes/email";
import { provedorConfigurado } from "@/lib/email";

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
  const usuario = await exigirUsuario();
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

  const permiteAnexos = await anexosPermitidos(org.orgId);
  const { data: preferencia } = await supabase
    .from("preferencias_aviso")
    .select("resumo_diario, apenas_alta")
    .eq("org_id", org.orgId)
    .eq("user_id", usuario.id)
    .maybeSingle();


  const [pessoas, tipos, frentes, tiposOportunidade, oportunidades, papeis, equipe] =
    await Promise.all([
      pessoasDaOrg(org.orgId),
      tiposDeFrente(org.orgId),
      listarFrentes({ orgId: org.orgId }),
      tiposDeOportunidade(org.orgId),
      listarOportunidades({ orgId: org.orgId }),
      papeisOperacionais(org.orgId),
      listarEquipe(org.orgId, { incluirInativos: true }),
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
          <h2>
            <Users size={15} style={{ verticalAlign: "-2px", marginRight: 8, color: "var(--g400)" }} />
            Equipe
          </h2>
          {gereCatalogo && (
            <Modal
              rotulo="Nova pessoa"
              titulo="Nova pessoa na equipe"
              descricao="Ela já pode responder por carteiras e compromissos — o acesso ao sistema é outro passo, por convite."
              icone={<Plus size={15} />}
            >
              <FormAcao action={criarPessoaEquipe}>
                <label className="campo">
                  <span>Nome</span>
                  <input type="text" name="nome" required maxLength={120} autoFocus />
                </label>
                <label className="campo">
                  <span>E-mail</span>
                  <input type="email" name="email" maxLength={160} placeholder="opcional — é o que liga a pessoa ao convite depois" />
                  <small>
                    Se ela aceitar um convite com este e-mail, o cadastro vira um só: tudo o que
                    ela respondia continua dela.
                  </small>
                </label>
                <label className="campo">
                  <span>Observação</span>
                  <input type="text" name="observacao" maxLength={160} placeholder="opcional" />
                </label>
                <BotaoEnviar>Incluir na equipe</BotaoEnviar>
              </FormAcao>
            </Modal>
          )}
        </div>

        <p className="nota" style={{ marginBottom: equipe.length ? 14 : 0 }}>
          Responder é diferente de entrar: aqui ficam as pessoas da operação, <strong>com ou sem
          login</strong>. É esta lista que aparece nos seletores de responsável e dono — dá para
          começar a registrar antes de qualquer convite.
        </p>

        {equipe.length === 0 ? (
          <Vazio>
            Ninguém cadastrado ainda. Inclua as pessoas da operação para as carteiras, contas e
            compromissos nascerem com dono — o convite de acesso pode vir depois.
          </Vazio>
        ) : (
          <ul className="lista-estado">
            {equipe.map((p) => (
              <li key={p.id}>
                <span className="rotulo">
                  {p.nome}
                  <span className="dica">
                    {[p.email, p.observacao].filter(Boolean).join(" · ") || "sem e-mail"}
                  </span>
                </span>
                {p.user_id ? (
                  <span className="selo selo-ok">com acesso</span>
                ) : (
                  <span className="selo selo-neutro">sem acesso — convide quando quiser</span>
                )}
                {!p.ativo && <span className="selo selo-atencao">desativada</span>}
                {gereCatalogo && (
                  <Modal rotulo="Editar" titulo={`Editar ${p.nome}`} variante="link">
                    <FormAcao action={editarPessoaEquipe}>
                      <input type="hidden" name="id" value={p.id} />
                      <label className="campo">
                        <span>Nome</span>
                        <input type="text" name="nome" defaultValue={p.nome} required maxLength={120} />
                      </label>
                      <label className="campo">
                        <span>E-mail</span>
                        <input
                          type="email"
                          name="email"
                          defaultValue={p.email ?? ""}
                          maxLength={160}
                          disabled={Boolean(p.user_id)}
                        />
                        {p.user_id && (
                          <small>Pessoa com acesso: o e-mail é o do login e não muda por aqui.</small>
                        )}
                      </label>
                      <label className="campo">
                        <span>Observação</span>
                        <input type="text" name="observacao" defaultValue={p.observacao ?? ""} maxLength={160} />
                      </label>
                      <BotaoEnviar>Salvar</BotaoEnviar>
                    </FormAcao>
                  </Modal>
                )}
                {gereCatalogo && (
                  <form action={alternarPessoaEquipe}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="ativar" value={p.ativo ? "0" : "1"} />
                    <BotaoEnviar variante="link">{p.ativo ? "Desativar" : "Reativar"}</BotaoEnviar>
                  </form>
                )}
                {administra && !p.user_id && (
                  <form action={excluirPessoaEquipe}>
                    <input type="hidden" name="id" value={p.id} />
                    <BotaoExcluir compacto rotulo="Excluir" aviso="Se ela responde por algo, prefira desativar." />
                  </form>
                )}
              </li>
            ))}
          </ul>
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
                <BotaoEnviar>
                  Criar papel
                </BotaoEnviar>
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
                <BotaoEnviar>
                  Incluir tipo
                </BotaoEnviar>
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
                <BotaoEnviar>
                  Incluir tipo
                </BotaoEnviar>
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
          <h2>Governança de documentos</h2>
          {administra && (
            <form action={alternarAnexos}>
              <input type="hidden" name="permitir" value={permiteAnexos ? "0" : "1"} />
              <BotaoEnviar variante="secundario">
                {permiteAnexos ? "Ligar anexo zero" : "Permitir anexos"}
              </BotaoEnviar>
            </form>
          )}
        </div>
        <p className="nota" style={{ marginBottom: 0 }}>
          {permiteAnexos ? (
            <>
              Arquivos podem ser guardados no sistema, em armazenamento privado. Se a política da
              sua organização exige que documento viva apenas no repositório oficial,{" "}
              <strong>ligue o anexo zero</strong>: o produto passa a aceitar somente links, e a
              recusa vale no banco de dados, não só na tela.
            </>
          ) : (
            <>
              <strong>Anexo zero ligado.</strong> Nenhum arquivo novo é guardado; documentos entram
              por link para o repositório oficial. O que já estava guardado continua acessível.
            </>
          )}
        </p>
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>Resumo diário por e-mail</h2>
        </div>
        <form action={salvarPreferenciaAviso} className="formulario">
          <div className="formulario-linha">
            <label className="campo campo-marcador">
              <input
                type="checkbox"
                name="resumo_diario"
                defaultChecked={preferencia?.resumo_diario ?? true}
              />
              <span>Receber o resumo do dia</span>
            </label>
            <label className="campo campo-marcador">
              <input
                type="checkbox"
                name="apenas_alta"
                defaultChecked={preferencia?.apenas_alta ?? false}
              />
              <span>Só quando houver alerta de severidade alta</span>
            </label>
            <BotaoEnviar variante="secundario">
              Salvar preferência
            </BotaoEnviar>
          </div>
        </form>
        <p className="nota" style={{ marginBottom: 0 }}>
          O e-mail sai uma vez por dia, com o que está na sua mão — e{" "}
          <strong>só quando há algo para agir</strong>. Dia sem pendência não gera mensagem: resumo
          que chega dizendo &ldquo;está tudo bem&rdquo; ensina a ignorar o que chega.
        </p>
      </section>

      <section className="painel">
        <div className="linha-titulo">
          <h2>
            <Mail size={15} style={{ verticalAlign: "-2px", marginRight: 8, color: "var(--g400)" }} />
            E-mail transacional (Brevo)
          </h2>
          {administra && provedorConfigurado() && (
            <form action={enviarEmailTeste}>
              <BotaoEnviar variante="secundario" rotuloEnviando="Enviando…">
                Enviar e-mail de teste para mim
              </BotaoEnviar>
            </form>
          )}
        </div>

        {provedorConfigurado() ? (
          <p className="nota">
            <span className="selo selo-ok">configurado</span>{" "}
            Convites, extratos e o resumo diário saem pela Brevo, como{" "}
            <span className="dado">{process.env.EMAIL_REMETENTE}</span>. Use o teste acima para
            provar a entrega — se cair no spam, verifique o remetente (SPF/DKIM) no painel da
            Brevo.
          </p>
        ) : (
          <p className="nota">
            <span className="selo selo-atencao">em modo simulado</span>{" "}
            Nada sai de verdade: os envios ficam registrados como &ldquo;simulado&rdquo; e são
            tentados de novo quando o provedor entrar. Para ligar: no painel da Brevo, gere uma
            chave em <span className="dado">SMTP &amp; API › API keys</span> e verifique o
            remetente; no deploy (Vercel), cadastre <span className="dado">BREVO_API_KEY</span> e{" "}
            <span className="dado">EMAIL_REMETENTE</span> (e, se quiser,{" "}
            <span className="dado">EMAIL_REMETENTE_NOME</span>); <strong>refaça o deploy</strong> e
            volte aqui para o teste. A situação também aparece no{" "}
            <Link href="/diagnostico">diagnóstico</Link>.
          </p>
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
              <BotaoEnviar>
                Salvar senha
              </BotaoEnviar>
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
              <Link href="/configuracoes/classificacoes">Classificações de conta</Link>
              <span className="dica">Ramo, natureza, porte — as dimensões que a sua operação usa</span>
            </span>
          </li>
          <li>
            <span className="rotulo">
              <Link href="/configuracoes/playbooks">Playbooks de cadência</Link>
              <span className="dica">Compromissos que nascem quando a oportunidade muda de etapa</span>
            </span>
          </li>
          <li>
            <span className="rotulo">
              <Link href="/configuracoes/pipeline">Pipeline de conversão</Link>
              <span className="dica">Etapas, prazo esperado de cada uma e motivos de perda</span>
            </span>
          </li>
          <li>
            <span className="rotulo">
              <Link href="/configuracoes/exportacao">Exportação de dados</Link>
              <span className="dica">Seus dados em CSV ou JSON, a qualquer momento</span>
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
