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
import { formatarValor } from "@/lib/contas";
import { panorama } from "@/lib/panorama";
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
  const [carteiras, pessoas, resumo] = await Promise.all([
    listarCarteiras(org.orgId),
    pessoasDaOrganizacao(org.orgId),
    panorama(org.orgId, "nome"),
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
        <Vazio
              acao={<Link className="botao botao-primario" href="/importacao">Importar por planilha</Link>}
            >
              Nenhuma carteira ainda. A carteira é a unidade que você acompanha — regional, filial ou praça — e tudo o mais se pendura nela.
            </Vazio>
      ) : (
        <section className="painel">
          <ul className="lista-estado">
            {carteiras.map((c) => {
              const faixa = faixaMaturidade(c.score_maturidade);
              const responsavel = pessoas.find((p) => p.id === c.responsavel_id);
              // A lista mostrava só código, região e responsável — nada
              // sobre o que a carteira carrega. Quem abre esta tela quer
              // decidir onde entrar, e para isso precisa ver o tamanho.
              const r = resumo.find((x) => x.carteira_id === c.id);
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
                    {r && (
                      <span className="dica">
                        {[
                          `${r.contas_total} conta(s)`,
                          Number(r.frentes_abertas) > 0
                            ? `${r.frentes_abertas} frente(s)`
                            : null,
                          Number(r.oportunidades_abertas) > 0
                            ? `${r.oportunidades_abertas} oportunidade(s)`
                            : null,
                          Number(r.base_sob_gestao) > 0
                            ? `base ${formatarValor(Number(r.base_sob_gestao))}`
                            : null,
                          Number(r.contas_potencial) + Number(r.frentes_potencial) > 0
                            ? `potencial ${formatarValor(
                                Number(r.contas_potencial) + Number(r.frentes_potencial),
                              )}`
                            : null,
                          Number(r.contratos_vencidos) > 0
                            ? `${r.contratos_vencidos} contrato(s) vencido(s)`
                            : null,
                          Number(r.compromissos_atrasados) > 0
                            ? `${r.compromissos_atrasados} atrasado(s)`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
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
