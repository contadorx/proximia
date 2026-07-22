import Link from "next/link";
import { ExternalLink, Eye, Pencil, Plus, ShieldAlert } from "lucide-react";
import { exigirOrg, podeGerirCarteiras } from "@/lib/auth";
import { listarCarteiras } from "@/lib/carteiras";
import { formatarData } from "@/lib/contas";
import {
  acessosPorPortal,
  enderecoPortal,
  listarPortais,
  situacaoPortal,
  type Portal,
} from "@/lib/portais";
import { ajustarPortal, criarPortal, encerrarPortal } from "@/app/acoes/portais";
import { IntroSecao, Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { Seletor } from "@/components/seletor";
import { Copiar } from "@/components/copiar";
import { paraTexto } from "@/lib/consulta";

export const dynamic = "force-dynamic";

const VALIDADES = [
  { valor: "30", rotulo: "30 dias" },
  { valor: "90", rotulo: "90 dias" },
  { valor: "180", rotulo: "180 dias" },
  { valor: "365", rotulo: "1 ano" },
];

/** Chaves de exibição, na ordem em que aparecem no formulário. */
function Chaves({ portal }: { portal?: Portal }) {
  const itens: { nome: string; rotulo: string; ajuda: string; padrao: boolean }[] = [
    {
      nome: "mostrar_contratos",
      rotulo: "Contratos que exigem decisão",
      ajuda: "Vencidos e com janela aberta. Sem valores.",
      padrao: portal?.mostrar_contratos ?? true,
    },
    {
      nome: "mostrar_pendencias",
      rotulo: "Pendências em aberto",
      ajuda: "O que está combinado e ainda não aconteceu.",
      padrao: portal?.mostrar_pendencias ?? true,
    },
    {
      nome: "mostrar_valores",
      rotulo: "Potencial e capturado",
      ajuda:
        "Desligado por padrão. Potencial é teto estimado — do lado de fora, teto estimado costuma virar número cobrado.",
      padrao: portal?.mostrar_valores ?? false,
    },
    {
      nome: "mostrar_autores",
      rotulo: "Nome de quem registrou",
      ajuda: "Desligado por padrão. A entrega interessa a quem recebe; quem digitou é assunto interno.",
      padrao: portal?.mostrar_autores ?? false,
    },
  ];

  return (
    <div className="lista-colunas">
      {itens.map((i) => (
        <label className="campo campo-marcador" key={i.nome}>
          <input type="checkbox" name={i.nome} defaultChecked={i.padrao} />
          <span>
            {i.rotulo}
            <small>{i.ajuda}</small>
          </span>
        </label>
      ))}
    </div>
  );
}

export default async function PaginaPortais({
  searchParams,
}: {
  searchParams: { erro?: string; ok?: string; novo?: string; carteira?: string | string[] };
}) {
  const org = await exigirOrg();
  const carteiraFiltro = paraTexto(searchParams.carteira);

  const [portais, carteiras, acessos] = await Promise.all([
    listarPortais(org.orgId, carteiraFiltro),
    listarCarteiras(org.orgId),
    acessosPorPortal(org.orgId),
  ]);

  const pode = podeGerirCarteiras(org.papel);
  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? "carteira";
  const ativos = portais.filter((p) => p.status === "ativo" && new Date(p.expira_em) > new Date());
  const abertosAlgumaVez = portais.filter((p) => acessos.has(p.id)).length;

  return (
    <>
      <div className="cabeca-pagina">
        <div>
          <p className="olho">{org.nome}</p>
          <h1>Portais</h1>
        </div>
        {pode && (
          <div className="cabeca-acoes">
            <Modal
              rotulo="Novo link"
              titulo="Abrir link externo"
              descricao="Uma carteira, um endereço com segredo, somente leitura."
              largo
              icone={<Plus size={15} />}
            >
              <form action={criarPortal} className="formulario">
                <Seletor
                  nome="carteira_id"
                  rotulo="Carteira"
                  opcoes={carteiras.map((c) => ({
                    valor: c.id,
                    rotulo: c.nome,
                    detalhe: c.codigo ?? undefined,
                  }))}
                  inicial={carteiraFiltro}
                  obrigatorio
                  ajuda="O link mostra esta carteira e nenhuma outra."
                />

                <div className="formulario-linha">
                  <label className="campo">
                    <span>Título</span>
                    <input
                      type="text"
                      name="titulo"
                      maxLength={120}
                      placeholder="opcional — o que o visitante lê no topo"
                    />
                  </label>
                  <label className="campo">
                    <span>Para quem</span>
                    <input
                      type="text"
                      name="destinatario"
                      maxLength={120}
                      placeholder="opcional — só para você saber a quem mandou"
                    />
                  </label>
                </div>

                <div className="formulario-linha">
                  <label className="campo">
                    <span>Validade</span>
                    <select name="validade_dias" defaultValue="90">
                      {VALIDADES.map((v) => (
                        <option key={v.valor} value={v.valor}>
                          {v.rotulo}
                        </option>
                      ))}
                    </select>
                    <small>Passado o prazo, o endereço deixa de abrir sozinho.</small>
                  </label>
                  <label className="campo">
                    <span>Entregas dos últimos</span>
                    <select name="dias_periodo" defaultValue="90">
                      <option value="30">30 dias</option>
                      <option value="90">90 dias</option>
                      <option value="180">180 dias</option>
                      <option value="365">365 dias</option>
                    </select>
                  </label>
                </div>

                <Chaves />

                <div className="acoes-rodape">
                  <button className="botao botao-primario" type="submit">
                    Criar link
                  </button>
                </div>
              </form>
            </Modal>
          </div>
        )}
      </div>

      <IntroSecao>
        A situação da carteira, aberta por quem não tem acesso ao sistema — a unidade, a área
        parceira, o cliente. É a mesma página de sempre, <strong>sempre atual</strong>, em vez de um
        PDF que nasce velho e some no e-mail. O link expira, pode ser encerrado a qualquer momento e
        vale para uma carteira só. Cada abertura fica registrada.
      </IntroSecao>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}
      {searchParams.ok && <p className="aviso aviso-ok">{searchParams.ok}</p>}

      {portais.length > 0 && (
        <div className="cartoes">
          <div className="cartao">
            <p className="olho">Links ativos</p>
            <p className="cartao-valor">{ativos.length}</p>
          </div>
          <div className="cartao">
            <p className="olho">Já abertos</p>
            <p className="cartao-valor">{abertosAlgumaVez}</p>
            <p className="cartao-nota">de {portais.length} criados</p>
          </div>
          <div className="cartao">
            <p className="olho">Aberturas</p>
            <p className="cartao-valor">
              {[...acessos.values()].reduce((t, a) => t + a.total, 0)}
            </p>
          </div>
          <div className="cartao">
            <p className="olho">Com valores expostos</p>
            <p className={ativos.some((p) => p.mostrar_valores) ? "cartao-valor alerta" : "cartao-valor"}>
              {ativos.filter((p) => p.mostrar_valores).length}
            </p>
            <p className="cartao-nota">potencial visível de fora</p>
          </div>
        </div>
      )}

      {portais.length === 0 ? (
        <Vazio
          acao={
            !pode ? undefined : (
              <p className="nota">
                Comece por uma carteira em que o acompanhamento já é pedido por e-mail.
              </p>
            )
          }
        >
          Nenhum link externo aberto. Enquanto isso, mostrar a situação para fora continua exigindo
          gerar arquivo e mandar por e-mail — e ninguém fica sabendo se foi lido.
        </Vazio>
      ) : (
        <section className="painel">
          <ul className="lista-estado">
            {portais.map((p) => {
              const s = situacaoPortal(p);
              const uso = acessos.get(p.id);
              const endereco = enderecoPortal(p.token);
              const vivo = p.status === "ativo" && new Date(p.expira_em) > new Date();

              return (
                <li key={p.id} className={searchParams.novo === p.id ? "painel-destaque" : undefined}>
                  <span className="rotulo">
                    {p.titulo ?? `Situação de ${nomeCarteira(p.carteira_id)}`}
                    <span className="dica">
                      {[
                        nomeCarteira(p.carteira_id),
                        p.destinatario ? `para ${p.destinatario}` : null,
                        uso
                          ? `${uso.total} abertura(s) · última em ${formatarData(uso.ultimo.slice(0, 10))}`
                          : "nunca aberto",
                        p.mostrar_valores ? "mostra valores" : null,
                        s.detalhe,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {vivo && (
                      <span className="dica dado" style={{ wordBreak: "break-all" }}>
                        {endereco || `/portal/${p.token}`}
                      </span>
                    )}
                  </span>

                  <span className={s.classe}>{s.rotulo}</span>

                  {vivo && (
                    <>
                      <Copiar texto={endereco || `/portal/${p.token}`} rotulo="Copiar endereço" />
                      <Link className="link-acao" href={`/portal/${p.token}`} target="_blank">
                        <Eye size={14} />
                        Ver como o visitante vê
                      </Link>
                    </>
                  )}

                  {pode && vivo && (
                    <Modal
                      rotulo="Ajustar"
                      titulo="Ajustar link"
                      descricao="O endereço continua o mesmo. Muda o que ele mostra."
                      variante="link"
                      largo
                      icone={<Pencil size={14} />}
                    >
                      <form action={ajustarPortal} className="formulario">
                        <input type="hidden" name="id" value={p.id} />
                        <div className="formulario-linha">
                          <label className="campo">
                            <span>Título</span>
                            <input type="text" name="titulo" defaultValue={p.titulo ?? ""} maxLength={120} />
                          </label>
                          <label className="campo">
                            <span>Para quem</span>
                            <input
                              type="text"
                              name="destinatario"
                              defaultValue={p.destinatario ?? ""}
                              maxLength={120}
                            />
                          </label>
                          <label className="campo">
                            <span>Renovar validade</span>
                            <select name="validade_dias" defaultValue="0">
                              <option value="0">Manter o prazo atual</option>
                              {VALIDADES.map((v) => (
                                <option key={v.valor} value={v.valor}>
                                  Mais {v.rotulo}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <Chaves portal={p} />
                        <div className="acoes-rodape">
                          <button className="botao botao-primario" type="submit">
                            Salvar
                          </button>
                        </div>
                      </form>
                    </Modal>
                  )}

                  {pode && vivo && (
                    <form action={encerrarPortal}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="link-acao link-perigo" type="submit">
                        Encerrar
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="nota">
        <ShieldAlert size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Quem tem o endereço abre sem senha — é a natureza do link com segredo, e é o que torna ele
        utilizável por quem não vai criar acesso. Trate como documento enviado: prazo curto, e
        encerre quando o assunto fechar. Encerrar não apaga o registro de quem já abriu.
      </p>

      {!process.env.NEXT_PUBLIC_APP_URL && portais.length > 0 && (
        <p className="aviso aviso-erro">
          <ExternalLink size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          Cadastre <span className="dado">NEXT_PUBLIC_APP_URL</span> no ambiente para o endereço sair
          completo, pronto para colar num e-mail. Sem ela, só o caminho aparece.
        </p>
      )}
    </>
  );
}
