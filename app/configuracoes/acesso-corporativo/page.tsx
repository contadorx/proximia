import Link from "next/link";
import { Building2, Plus, ShieldCheck } from "lucide-react";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarData } from "@/lib/contas";
import { rotuloPapel, type Papel } from "@/lib/tipos";
import {
  atualizarDominio,
  cadastrarDominio,
  removerDominio,
} from "@/app/acoes/acesso-corporativo";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { FormAcao } from "@/components/form-acao";
import { BotaoEnviar } from "@/components/botao-enviar";

export const dynamic = "force-dynamic";

type Dominio = {
  id: string;
  dominio: string;
  sso_provider_id: string | null;
  exige_sso: boolean;
  provisiona: boolean;
  papel_padrao: Papel;
  verificado_em: string | null;
  criado_em: string;
};

const PAPEIS: Papel[] = ["ponto_focal", "analista", "admin"];

export default async function PaginaAcessoCorporativo({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string };
}) {
  const org = await exigirOrg();
  const supabase = criarClienteServidor();
  const gere = podeEscrever(org.papel) && org.papel !== "ponto_focal";

  const { data } = await supabase
    .from("org_dominios")
    .select("id, dominio, sso_provider_id, exige_sso, provisiona, papel_padrao, verificado_em, criado_em")
    .order("dominio");

  const dominios = (data ?? []) as Dominio[];

  return (
    <>
      <p className="olho">
        <Link href="/configuracoes">Configurações</Link> · {org.nome}
      </p>

      <div className="cabeca-pagina">
        <div>
          <h1>
            <ShieldCheck size={18} style={{ verticalAlign: "-3px", marginRight: 8 }} />
            Acesso corporativo
          </h1>
        </div>
        {gere && (
          <div className="cabeca-acoes">
            <Modal
              rotulo="Cadastrar domínio"
              titulo="Cadastrar domínio da organização"
              descricao="O domínio de e-mail que a sua empresa usa."
              icone={<Plus size={15} />}
            >
              <FormAcao action={cadastrarDominio}>
                <label className="campo">
                  <span>Domínio</span>
                  <input
                    type="text"
                    name="dominio"
                    required
                    maxLength={120}
                    autoFocus
                    placeholder="acme.com.br"
                  />
                  <small>Só o domínio, sem arroba.</small>
                </label>
                <label className="campo">
                  <span>Identificador do provedor no Supabase</span>
                  <input type="text" name="provider" maxLength={120} placeholder="opcional agora" />
                  <small>
                    Sai do painel do Supabase, em Authentication › SSO. Pode ficar em branco e ser
                    preenchido depois.
                  </small>
                </label>
                <label className="campo">
                  <span>Papel de quem entrar pela primeira vez</span>
                  <select name="papel" defaultValue="ponto_focal">
                    {PAPEIS.map((p) => (
                      <option key={p} value={p}>
                        {rotuloPapel(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <BotaoEnviar>Cadastrar</BotaoEnviar>
              </FormAcao>
            </Modal>
          </div>
        )}
      </div>

      <IntroSecao>
        Aqui a sua organização liga o login ao provedor de identidade da empresa — Entra ID, Okta,
        Google Workspace, o que estiver em uso. <strong>O protocolo é do Supabase Auth</strong>,
        que faz e mantém a parte de SAML; o que fica registrado aqui é a ligação entre o{" "}
        <strong>domínio de e-mail</strong> e esta organização, mais a regra de quem entra pela
        primeira vez. Quem já entra com e-mail e senha continua entrando, a menos que você marque a
        exigência.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      {dominios.length === 0 ? (
        <Vazio>
          Nenhum domínio cadastrado. Sem domínio, a entrada continua sendo e-mail e senha — que é o
          padrão e segue funcionando.
        </Vazio>
      ) : (
        dominios.map((d) => (
          <section className="painel" key={d.id}>
            <div className="linha-titulo">
              <h2>
                <Building2 size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                {d.dominio}
              </h2>
              <span className="passos-contagem">
                cadastrado em {formatarData(d.criado_em.slice(0, 10))}
              </span>
            </div>

            <ul className="lista-estado">
              <li>
                <span className="rotulo">
                  Provedor no Supabase
                  <span className="dica">
                    {d.sso_provider_id ?? "não configurado — sem ele o SSO não entra"}
                  </span>
                </span>
                <span className={d.sso_provider_id ? "selo selo-ok" : "selo selo-falta"}>
                  {d.sso_provider_id ? "configurado" : "faltando"}
                </span>
              </li>
              <li>
                <span className="rotulo">
                  Exige acesso corporativo
                  <span className="dica">
                    {d.exige_sso
                      ? "quem tem e-mail deste domínio só entra pelo provedor"
                      : "convivência: e-mail e senha continuam valendo"}
                  </span>
                </span>
                <span className={d.exige_sso ? "selo selo-ok" : "selo selo-neutro"}>
                  {d.exige_sso ? "sim" : "não"}
                </span>
              </li>
              <li>
                <span className="rotulo">
                  Provisiona na primeira entrada
                  <span className="dica">
                    {d.provisiona
                      ? `cria acesso como ${rotuloPapel(d.papel_padrao).toLowerCase()} para quem entrar pelo SSO`
                      : "novo usuário continua dependendo de convite"}
                  </span>
                </span>
                <span className={d.provisiona ? "selo selo-ok" : "selo selo-neutro"}>
                  {d.provisiona ? "sim" : "não"}
                </span>
              </li>
              <li>
                <span className="rotulo">
                  Verificação de propriedade
                  <span className="dica">
                    {d.verificado_em
                      ? `verificado em ${formatarData(d.verificado_em.slice(0, 10))}`
                      : "ainda não verificamos que este domínio é seu — o provisionamento só acontece para quem entra pelo seu provedor, que é o que protege na prática"}
                  </span>
                </span>
                <span className={d.verificado_em ? "selo selo-ok" : "selo selo-neutro"}>
                  {d.verificado_em ? "verificado" : "não verificado"}
                </span>
              </li>
            </ul>

            {gere && (
              <div className="cabeca-acoes" style={{ marginTop: 14 }}>
                <Modal
                  rotulo="Configurar"
                  titulo={`Acesso corporativo de ${d.dominio}`}
                  descricao="Exigir SSO e provisionar dependem do provedor configurado."
                  variante="secundario"
                >
                  <FormAcao action={atualizarDominio}>
                    <input type="hidden" name="id" value={d.id} />
                    <label className="campo">
                      <span>Identificador do provedor no Supabase</span>
                      <input
                        type="text"
                        name="provider"
                        defaultValue={d.sso_provider_id ?? ""}
                        maxLength={120}
                      />
                    </label>
                    <label className="campo campo-marcador">
                      <span>Exigir acesso corporativo neste domínio</span>
                      <input type="checkbox" name="exige_sso" defaultChecked={d.exige_sso} />
                    </label>
                    <label className="campo campo-marcador">
                      <span>Criar acesso na primeira entrada pelo SSO</span>
                      <input type="checkbox" name="provisiona" defaultChecked={d.provisiona} />
                    </label>
                    <label className="campo">
                      <span>Papel de quem entrar pela primeira vez</span>
                      <select name="papel" defaultValue={d.papel_padrao}>
                        {PAPEIS.map((p) => (
                          <option key={p} value={p}>
                            {rotuloPapel(p)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="nota">
                      Provisionar não é o mesmo que confiar no domínio: o acesso só nasce para quem
                      a sua empresa autenticou no provedor. Ter um e-mail parecido não basta.
                    </p>
                    <BotaoEnviar>Salvar</BotaoEnviar>
                  </FormAcao>
                </Modal>

                <form action={removerDominio}>
                  <input type="hidden" name="id" value={d.id} />
                  <BotaoEnviar variante="secundario" rotuloEnviando="Removendo…">
                    Remover domínio
                  </BotaoEnviar>
                </form>
              </div>
            )}
          </section>
        ))
      )}

      <section className="painel">
        <h2>Como ligar</h2>
        <ol className="lista-passos">
          <li>
            No painel do Supabase, em Authentication › SSO, cadastre o provedor da sua empresa com
            os metadados que a área de identidade fornecer.
          </li>
          <li>Copie o identificador do provedor e cole no domínio aqui.</li>
          <li>
            Teste a entrada com uma pessoa que já tem acesso: na tela de login, digite o e-mail e o
            botão de acesso corporativo aparece.
          </li>
          <li>
            Funcionando, ligue <strong>provisionar</strong> e, se a política da empresa pedir,{" "}
            <strong>exigir</strong>. Nesta ordem: exigir antes de testar tranca todo mundo do lado
            de fora.
          </li>
        </ol>
      </section>
    </>
  );
}
