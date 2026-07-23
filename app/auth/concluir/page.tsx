"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { destinoSeguro, lerFragmento } from "@/lib/retorno";

/**
 * Conclui a entrada quando os tokens vêm no FRAGMENTO da URL.
 *
 * O fragmento (#access_token=…) nunca é enviado ao servidor — é regra do
 * navegador, não escolha do produto. Por isso este passo existe: o
 * callback do servidor encaminha para cá, e aqui, já no cliente, o
 * fragmento é lido e vira sessão.
 *
 * Se não houver token nenhum no fragmento, aí sim o link chegou
 * incompleto de verdade — e a mensagem diz o que costuma causar isso, em
 * vez de só constatar.
 */
export default function ConcluirEntrada() {
  const router = useRouter();
  const parametros = useSearchParams();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const destino = destinoSeguro(parametros.get("proximo"));
    const { accessToken, refreshToken, erro: erroProvedor } = lerFragmento(window.location.hash);

    if (erroProvedor) {
      setErro(
        `O provedor recusou o link: ${erroProvedor}. Links de e-mail servem uma vez só e expiram — peça outro.`,
      );
      return;
    }

    if (!accessToken || !refreshToken) {
      setErro(
        "O link chegou sem as informações de entrada. Isso costuma acontecer quando ele é " +
          "quebrado em duas linhas pelo programa de e-mail: copie o endereço inteiro e cole no " +
          "navegador, ou peça um novo.",
      );
      return;
    }

    const concluir = async () => {
      try {
        const supabase = criarClienteBrowser();
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;

        // Tira os tokens do endereço antes de seguir: eles não têm por que
        // ficar no histórico do navegador.
        window.history.replaceState(null, "", window.location.pathname);
        router.replace(destino);
        router.refresh();
      } catch {
        setErro("Não foi possível concluir a entrada com este link. Peça um novo.");
      }
    };

    void concluir();
  }, [parametros, router]);

  return (
    <div className="coluna-estreita">
      <p className="olho">Acesso</p>
      <h1>{erro ? "Não deu para entrar" : "Entrando…"}</h1>

      {erro ? (
        <>
          <p className="aviso aviso-erro">{erro}</p>
          <p>
            <Link className="botao botao-secundario" href="/entrar">
              Voltar para a entrada
            </Link>
          </p>
        </>
      ) : (
        <p className="chamada">Confirmando o link e preparando a sua sessão.</p>
      )}
    </div>
  );
}
