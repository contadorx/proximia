import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "./supabase/server";
import { ambienteCompleto } from "./env";
import type { Papel, Vinculo } from "./tipos";

export const COOKIE_ORG = "proximia_org";

/**
 * Sem configuracao nao ha o que consultar. Melhor levar a pessoa para a tela
 * que diz o que falta do que estourar um erro sem explicacao.
 */
export function exigirConfiguracao() {
  if (!ambienteCompleto()) redirect("/instalacao");
}

export async function usuarioAtual() {
  if (!ambienteCompleto()) return null;

  // Falha de rede ou credencial errada nao pode derrubar a pagina inteira:
  // sem sessao confirmada, tratamos como visitante e a tela de acesso aparece.
  try {
    const supabase = criarClienteServidor();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch (e) {
    console.error("[auth] nao foi possivel confirmar a sessao:", e);
    return null;
  }
}

export async function exigirUsuario() {
  exigirConfiguracao();
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar");
  return usuario;
}

/** Organizações em que a pessoa tem vínculo ativo. */
export async function vinculosDoUsuario(): Promise<Vinculo[]> {
  try {
    return await consultarVinculos();
  } catch (e) {
    console.error("[auth] nao foi possivel ler os vinculos:", e);
    return [];
  }
}

async function consultarVinculos(): Promise<Vinculo[]> {
  const supabase = criarClienteServidor();

  const { data: vinculos, error } = await supabase
    .from("memberships")
    .select("org_id, papel")
    .eq("ativo", true);

  if (error || !vinculos?.length) return [];

  const { data: orgs } = await supabase
    .from("orgs")
    .select("id, nome, slug")
    .in(
      "id",
      vinculos.map((v) => v.org_id as string),
    );

  const porId = new Map((orgs ?? []).map((o) => [o.id as string, o]));

  return vinculos
    .map((v) => {
      const org = porId.get(v.org_id as string);
      if (!org) return null;
      return {
        orgId: org.id as string,
        nome: org.nome as string,
        slug: org.slug as string,
        papel: v.papel as Papel,
      };
    })
    .filter((v): v is Vinculo => v !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Organização selecionada no cookie, apenas se o vínculo continuar válido. */
export async function orgAtual(): Promise<Vinculo | null> {
  const escolhida = cookies().get(COOKIE_ORG)?.value;
  if (!escolhida) return null;

  const vinculos = await vinculosDoUsuario();
  return vinculos.find((v) => v.orgId === escolhida) ?? null;
}

export async function exigirOrg(): Promise<Vinculo> {
  await exigirUsuario();
  const org = await orgAtual();
  if (!org) redirect("/organizacoes");
  return org;
}

export function podeAdministrar(papel: Papel): boolean {
  return papel === "owner" || papel === "admin";
}

export function podeEscrever(papel: Papel): boolean {
  return papel !== "leitura_ampla";
}

/**
 * Quem cria, edita e arquiva a estrutura da carteira. Gêmeo em TypeScript
 * da função pode_gerir_carteiras do banco: o ponto focal opera dentro da
 * carteira, mas não redesenha a estrutura dela.
 */
export function podeGerirCarteiras(papel: Papel): boolean {
  return papel === "owner" || papel === "admin" || papel === "analista";
}