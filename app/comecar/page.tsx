import Link from "next/link";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { exigirUsuario, vinculosDoUsuario } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarCarteiras } from "@/lib/carteiras";
import {
  criarPrimeiraCarteira,
  criarPrimeiraOrganizacao,
  salvarNome,
} from "@/app/acoes/comecar";
import { BotaoEnviar } from "@/components/botao-enviar";

export const dynamic = "force-dynamic";

/**
 * Primeiro acesso. O passo mostrado não vem da URL, e sim do que já
 * existe no banco: quem fecha o navegador no meio volta exatamente de
 * onde parou, e quem já terminou não vê esta tela de novo.
 */
export default async function PaginaComecar({
  searchParams,
}: {
  searchParams: { erro?: string; passo?: string };
}) {
  const usuario = await exigirUsuario();

  const supabase = criarClienteServidor();
  const { data: perfil } = await supabase
    .from("perfis")
    .select("nome")
    .eq("id", usuario.id)
    .maybeSingle();

  const nome = ((perfil?.nome as string) ?? "").trim();
  const vinculos = await vinculosDoUsuario();
  const org = vinculos[0];
  const carteiras = org ? await listarCarteiras(org.orgId) : [];

  // Tudo pronto: esta tela não tem mais o que fazer.
  if (nome && org && carteiras.length > 0) redirect("/painel");

  const passo = !nome ? "nome" : !org ? "organizacao" : "carteira";

  const passos = [
    { chave: "nome", rotulo: "Seu nome", feito: Boolean(nome) },
    { chave: "organizacao", rotulo: "Organização", feito: Boolean(org) },
    { chave: "carteira", rotulo: "Primeira carteira", feito: carteiras.length > 0 },
  ];

  return (
    <div className="coluna-estreita">
      <p className="olho">Primeiro acesso</p>
      <h1>Vamos deixar pronto em três passos</h1>
      <p className="chamada">
        Leva dois minutos. Dá para parar no meio e voltar depois — a tela lembra onde você estava.
      </p>

      <ol className="trilha-passos">
        {passos.map((p, i) => (
          <li
            key={p.chave}
            className={p.feito ? "trilha-passo feito" : p.chave === passo ? "trilha-passo atual" : "trilha-passo"}
          >
            <span className="trilha-marca">{p.feito ? <Check size={13} /> : i + 1}</span>
            {p.rotulo}
          </li>
        ))}
      </ol>

      {searchParams.erro && <p className="aviso aviso-erro">{searchParams.erro}</p>}

      {passo === "nome" && (
        <div className="painel">
          <h2>Como podemos te chamar?</h2>
          <p className="nota">
            É o nome que aparece ao lado do que você registrar — em decisões, entregas e
            compromissos. Dá para mudar depois.
          </p>
          <form action={salvarNome} className="formulario">
            <label className="campo">
              <span>Seu nome</span>
              <input
                type="text"
                name="nome"
                required
                minLength={2}
                maxLength={80}
                autoFocus
                autoComplete="name"
                defaultValue={nome}
              />
            </label>
            <BotaoEnviar>
              Continuar
            </BotaoEnviar>
          </form>
        </div>
      )}

      {passo === "organizacao" && (
        <div className="painel">
          <h2>Qual é a sua organização?</h2>
          <p className="nota">
            É o espaço onde ficam as carteiras, as contas e os contratos. Você entra como dono e
            pode convidar o time depois.
          </p>
          <form action={criarPrimeiraOrganizacao} className="formulario">
            <label className="campo">
              <span>Nome da organização</span>
              <input
                type="text"
                name="nome"
                required
                minLength={2}
                maxLength={120}
                autoFocus
                placeholder="Como a empresa é conhecida"
              />
            </label>
            <label className="campo">
              <span>Identificador</span>
              <input type="text" name="slug" maxLength={40} placeholder="opcional — derivamos do nome" />
              <small>Só letras, números e hífen. Usado em endereços internos.</small>
            </label>
            <BotaoEnviar>
              Criar organização
            </BotaoEnviar>
          </form>
        </div>
      )}

      {passo === "carteira" && org && (
        <div className="painel">
          <h2>Sua primeira carteira</h2>
          <p className="nota">
            Carteira é como o trabalho se agrupa: uma regional, uma filial, uma praça, uma célula —
            o nome é o da sua operação. Comece por uma; as outras entram depois, inclusive por
            importação de planilha.
          </p>
          <form action={criarPrimeiraCarteira} className="formulario">
            <input type="hidden" name="org_id" value={org.orgId} />
            <div className="formulario-linha">
              <label className="campo">
                <span>Nome da carteira</span>
                <input type="text" name="nome" required maxLength={120} autoFocus />
              </label>
              <label className="campo">
                <span>Código</span>
                <input type="text" name="codigo" maxLength={30} placeholder="opcional" />
              </label>
            </div>
            <BotaoEnviar>
              Concluir
            </BotaoEnviar>
          </form>
        </div>
      )}

      <p className="nota">
        {org ? (
          <>
            Prefere olhar antes? <Link href="/painel">Ir para o painel</Link>.
          </>
        ) : (
          <>
            Foi convidado por alguém? Abra o link do convite que você recebeu por e-mail — ele já
            coloca você na organização certa.
          </>
        )}
      </p>
    </div>
  );
}
