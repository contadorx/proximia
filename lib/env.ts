/**
 * Leitura central das variaveis de ambiente.
 *
 * Em desenvolvimento, valores ausentes nao derrubam o app: o sistema sobe em
 * "modo sem conexao" e a tela inicial mostra o que falta. Em producao, a
 * ausencia de qualquer variavel obrigatoria interrompe o boot — melhor falhar
 * no deploy do que servir um app que nao le nem grava nada.
 */

export type ChecagemAmbiente = {
  nome: string;
  presente: boolean;
  obrigatoria: boolean;
  dica: string;
};

const OBRIGATORIAS = [
  {
    nome: "NEXT_PUBLIC_SUPABASE_URL",
    valor: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dica: "URL do projeto no Supabase, em Project Settings › API.",
  },
  {
    nome: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    valor: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    dica: "Chave anon (publica) do projeto, em Project Settings › API.",
  },
] as const;

const OPCIONAIS = [
  {
    nome: "SUPABASE_SERVICE_ROLE_KEY",
    valor: process.env.SUPABASE_SERVICE_ROLE_KEY,
    dica: "Chave service role. Usada apenas no servidor, a partir da importacao de dados.",
  },
] as const;

export function checarAmbiente(): ChecagemAmbiente[] {
  return [
    ...OBRIGATORIAS.map((v) => ({
      nome: v.nome,
      presente: Boolean(v.valor),
      obrigatoria: true,
      dica: v.dica,
    })),
    ...OPCIONAIS.map((v) => ({
      nome: v.nome,
      presente: Boolean(v.valor),
      obrigatoria: false,
      dica: v.dica,
    })),
  ];
}

export function ambienteCompleto(): boolean {
  return OBRIGATORIAS.every((v) => Boolean(v.valor));
}

/**
 * URL e chave publica sem lancar erro. Devolve null quando falta configuracao.
 * Use onde uma excecao derrubaria a requisicao inteira — middleware, por
 * exemplo, onde o erro vira 500 sem explicacao nenhuma para quem acessou.
 */
export function credenciaisOpcionais(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** URL e chave publica. Lanca em producao se faltarem. */
export function credenciaisPublicas(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Configuracao incompleta: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY nas variaveis de ambiente do deploy.",
      );
    }
    return { url: "https://exemplo.supabase.co", anonKey: "chave-de-desenvolvimento" };
  }

  return { url, anonKey };
}

export const nomeApp = process.env.NEXT_PUBLIC_APP_NOME || "Proximia";
