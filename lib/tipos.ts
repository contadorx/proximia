export type Papel = "owner" | "admin" | "leitura_ampla" | "analista" | "ponto_focal";

export const PAPEIS: { valor: Papel; rotulo: string; explicacao: string }[] = [
  { valor: "owner", rotulo: "Dono", explicacao: "Administra tudo e pode excluir a organização." },
  { valor: "admin", rotulo: "Administrador", explicacao: "Administra a organização e as pessoas." },
  {
    valor: "leitura_ampla",
    rotulo: "Acompanhamento",
    explicacao: "Vê tudo da organização e não altera nada. Perfil da gestão.",
  },
  { valor: "analista", rotulo: "Analista", explicacao: "Opera todas as carteiras." },
  {
    valor: "ponto_focal",
    rotulo: "Ponto focal",
    explicacao: "Opera apenas as carteiras em que estiver vinculado.",
  },
];

export function rotuloPapel(papel: Papel): string {
  return PAPEIS.find((p) => p.valor === papel)?.rotulo ?? papel;
}

export type Vinculo = {
  orgId: string;
  nome: string;
  slug: string;
  papel: Papel;
};
