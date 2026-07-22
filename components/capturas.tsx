import { Plus, RotateCcw } from "lucide-react";
import { capturasDa, saldo } from "@/lib/capturas";
import { formatarData, formatarValor } from "@/lib/contas";
import { nomePessoa, type Pessoa } from "@/lib/carteiras";
import { registrarCaptura, excluirCaptura } from "@/app/acoes/capturas";
import { Vazio } from "@/components/intro-secao";
import { Modal } from "@/components/modal";
import { BotaoExcluir } from "@/components/botao-excluir";
import { CampoValor } from "@/components/campos";

/**
 * Lançamentos de captura de uma entidade.
 *
 * O valor capturado não é mais um campo que se edita: é a soma do que
 * está aqui. Errou, registra estorno — o saldo muda e os dois lançamentos
 * ficam, que é o que torna o número defensável fora de casa.
 */
export async function Capturas({
  entidadeTipo,
  entidadeId,
  carteiraId,
  potencial,
  pessoas,
  editavel,
}: {
  entidadeTipo: "conta" | "frente";
  entidadeId: string;
  carteiraId: string;
  potencial: number | null;
  pessoas: Pessoa[];
  editavel: boolean;
}) {
  const lista = await capturasDa(entidadeTipo, entidadeId);
  const total = saldo(lista);
  const hoje = new Date().toISOString().slice(0, 10);
  const legado = lista.filter((c) => c.origem === "legado").length;

  const formulario = (tipo: "captura" | "estorno") => (
    <form action={registrarCaptura} className="formulario">
      <input type="hidden" name="entidade_tipo" value={entidadeTipo} />
      <input type="hidden" name="entidade_id" value={entidadeId} />
      <input type="hidden" name="carteira_id" value={carteiraId} />
      <input type="hidden" name="tipo" value={tipo} />

      <div className="formulario-linha">
        <CampoValor nome="valor" rotulo={tipo === "estorno" ? "Valor a estornar" : "Valor confirmado"} />
        <label className="campo">
          <span>Confirmado em</span>
          <input type="date" name="confirmado_em" required defaultValue={hoje} />
          <small>A data que coloca o valor no mês certo.</small>
        </label>
      </div>

      <label className="campo">
        <span>{tipo === "estorno" ? "Motivo do estorno" : "O que foi confirmado"}</span>
        <input
          type="text"
          name="descricao"
          maxLength={200}
          placeholder={tipo === "estorno" ? "ex.: faturamento cancelado" : "ex.: primeira parcela faturada"}
        />
      </label>

      <label className="campo">
        <span>Comprovação</span>
        <input type="text" name="comprovacao" maxLength={200} placeholder="número da nota, contrato, link — opcional" />
      </label>

      <button className="botao botao-primario" type="submit">
        {tipo === "estorno" ? "Registrar estorno" : "Registrar captura"}
      </button>
    </form>
  );

  return (
    <section className="painel">
      <div className="linha-titulo">
        <h2>Capturado</h2>
        {editavel && (
          <div className="cabeca-acoes">
            <Modal
              rotulo="Registrar captura"
              titulo="Registrar captura"
              descricao="Valor confirmado, com data e comprovação."
              icone={<Plus size={15} />}
            >
              {formulario("captura")}
            </Modal>
            {total > 0 && (
              <Modal
                rotulo="Estornar"
                titulo="Registrar estorno"
                descricao="Corrige sem apagar: o saldo muda e os dois lançamentos ficam."
                variante="link"
                icone={<RotateCcw size={13} />}
              >
                {formulario("estorno")}
              </Modal>
            )}
          </div>
        )}
      </div>

      <div className="grade-prazos">
        <div>
          <p className="olho">Saldo confirmado</p>
          <p className="dado destaque-dado valor-capturado" style={{ fontSize: 19 }}>
            {formatarValor(total)}
          </p>
          <p className="nota">
            {lista.length} {lista.length === 1 ? "lançamento" : "lançamentos"}
          </p>
        </div>
        <div>
          <p className="olho">Potencial estimado</p>
          <p className="dado destaque-dado valor-teto" style={{ fontSize: 19 }}>
            {formatarValor(potencial)}
          </p>
          <p className="nota">teto, não meta</p>
        </div>
        <div>
          <p className="olho">Conversão</p>
          <p className="dado destaque-dado" style={{ fontSize: 19 }}>
            {potencial && potencial > 0 ? `${Math.round((total / potencial) * 100)}%` : "—"}
          </p>
          <p className="nota">
            {potencial && potencial > 0 ? "do teto estimado" : "sem estimativa registrada"}
          </p>
        </div>
      </div>

      {lista.length === 0 ? (
        <Vazio>
          Nenhum valor confirmado ainda. Quando algo se confirmar, registre aqui com a data — é o que
          coloca o valor no mês certo e dá autor ao número.
        </Vazio>
      ) : (
        <ul className="lista-estado" style={{ marginTop: 18 }}>
          {lista.map((c) => (
            <li key={c.id}>
              <span className="rotulo">
                {c.descricao ?? (c.tipo === "estorno" ? "Estorno" : "Captura")}
                <span className="dica">
                  {[
                    c.confirmado_em ? formatarData(c.confirmado_em) : "sem data de confirmação",
                    c.autor_id ? nomePessoa(pessoas.find((p) => p.id === c.autor_id)) : null,
                    c.comprovacao,
                    c.origem === "legado" ? "registrado antes do controle por lançamentos" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>

              <span className={c.tipo === "estorno" ? "valor-teto" : "valor-capturado"}>
                {c.tipo === "estorno" ? "−" : "+"}
                {formatarValor(c.valor)}
              </span>

              {c.tipo === "estorno" && <span className="selo selo-neutro">estorno</span>}

              {editavel && (
                <form action={excluirCaptura}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="entidade_tipo" value={entidadeTipo} />
                  <input type="hidden" name="entidade_id" value={entidadeId} />
                  <BotaoExcluir compacto rotulo="Excluir" aviso="Prefira estornar." />
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {legado > 0 && (
        <p className="nota" style={{ marginTop: 14, marginBottom: 0 }}>
          {legado === 1 ? "Um lançamento veio" : `${legado} lançamentos vieram`} do valor que já
          estava no campo antes deste controle. Se algum estiver sem data, preencher a data correta
          exige registrar um estorno e uma captura nova — assim a correção fica visível.
        </p>
      )}
    </section>
  );
}
