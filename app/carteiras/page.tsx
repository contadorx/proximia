import Link from "next/link";
import { Plus } from "lucide-react";
import { exigirOrg, podeEscrever } from "@/lib/auth";
import {
  faixaMaturidade,
  listarCarteiras,
  nomePessoa,
  pessoasDaOrganizacao,
  STATUS_CARTEIRA,
} from "@/lib/carteiras";
import { criarCarteira } from "@/app/acoes/carteiras";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { BotaoEnviar } from "@/components/botao-enviar";
import { FormAcao } from "@/components/form-acao";
import { CampoScore } from "@/components/campos";

export const dynamic = "force-dynamic";

export default async function PaginaCarteiras({
  searchParams,
}: {
  searchParams: { erro?: string };
}) {
  const org = await exigirOrg();
  const [carteiras, pessoas] = await Promise.all([
    listarCarteiras(org.orgId),
    pessoasDaOrganizacao(org.orgId),
  ]);
  const podeCriar = podeEscrever(org.papel) && org.papel !== "ponto_focal";

  const formulario = (
    <FormAcao action={criarCarteira}>
      <div className="formulario-linha">
        <label className="campo">
          <span>Nome</span>
          <input type="text" name="nome" required maxLength={120} autoFocus />
        </label>
        <label className="campo">
          <span>Código</span>
          <input type="text" name="codigo" maxLength={30} placeholder="opcional" />
        </label>
      </div>
      <div className="formulario-linha">
        <label className="campo">
          <span>Região</span>
          <input type="text" name="regiao" maxLength={60} placeholder="opcional" />
        </label>
        <label className="campo">
          <span>Responsável</span>
          <select name="responsavel_id" defaultValue="">
            <option value="">Definir depois</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {nomePessoa(p)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="formulario-linha">
        <CampoScore ajuda="Nota de avaliação já feita. Em branco se não houver." />
        <label className="campo">
          <span>Ciclo do score</span>
          <input type="text" name="score_ciclo" maxLength={20} placeholder="2026-1" />
        </label>
      </div>
      <BotaoEnviar>Criar carteira</BotaoEnviar>
    </FormAcao>
  );

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Carteiras</h1>
        </div>
        {podeCriar && (
          <div className="cabeca-acoes">
            <Modal
              rotulo="Nova carteira"
              titulo="Nova carteira"
              descricao="Só o nome é obrigatório. O resto pode entrar depois."
              icone={<Plus size={15} />}
            >
              {formulario}
            </Modal>
          </div>
        )}
      </div>

      <IntroSecao>
        {org.papel === "ponto_focal"
          ? "Aqui estão as carteiras em que você foi vinculado."
          : "Cada carteira agrupa as contas sob um responsável — regional, filial, praça, como sua operação chamar. Vincular alguém a uma carteira só muda o alcance de quem tem perfil de ponto focal."}
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

      {carteiras.length === 0 ? (
        <Vazio>
          Nenhuma carteira cadastrada ainda.
          {podeCriar
            ? " Use o botão acima para criar a primeira."
            : " Peça a inclusão a um administrador."}
        </Vazio>
      ) : (
        <section className="painel">
          <ul className="lista-estado">
            {carteiras.map((c) => {
              const faixa = faixaMaturidade(c.score_maturidade);
              const responsavel = pessoas.find((p) => p.id === c.responsavel_id);
              return (
                <li key={c.id}>
                  <span className="rotulo">
                    <Link href={`/carteiras/${c.id}`}>{c.nome}</Link>
                    <span className="dica">
                      {[
                        c.codigo,
                        c.regiao,
                        c.responsavel_id ? `resp. ${nomePessoa(responsavel)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "sem código, região ou responsável"}
                    </span>
                  </span>
                  {c.score_maturidade !== null && (
                    <span className="selo selo-neutro" title={faixa ?? undefined}>
                      <span className="dado">{c.score_maturidade.toFixed(0)}</span>
                      {c.score_ciclo ? ` · ${c.score_ciclo}` : ""}
                    </span>
                  )}
                  <span className={c.status === "ativa" ? "selo selo-ok" : "selo selo-neutro"}>
                    {STATUS_CARTEIRA.find((s) => s.valor === c.status)?.rotulo ?? c.status}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
