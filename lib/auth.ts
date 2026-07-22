import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "./supabase/server";
import type { Papel, Vinculo } from "./tipos";

export const COOKIE_ORG = "proximia_org";

export async function usuarioAtual() {
  const supabase = criarClienteServidor();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function exigirUsuario() {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar");
  return usuario;
}

/** Organizações em que a pessoa tem vínculo ativo. */
export async function vinculosDoUsuario(): Promise<Vinculo[]> {
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
