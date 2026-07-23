"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { criarClienteBrowser } from "@/lib/supabase/client";

type Modo = "entrar" | "cadastrar";

const MENSAGENS: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "Email not confirmed": "Confirme o e-mail pelo link que enviamos e tente de novo.",
  "User already registered": "Esse e-mail já tem cadastro. Use a tela de entrada.",
  "Password should be at least 6 characters": "A senha precisa de pelo menos 6 caracteres.",
};

function traduzir(mensagem: string): string {
  return MENSAGENS[mensagem] ?? mensagem;
}

export default function FormularioAcesso({ modo }: { modo: Modo }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Acesso corporativo: ao ver o domínio digitado, a tela pergunta ao
  // banco se aquele domínio entra por SSO. A resposta é mínima —
  // exige_sso e o identificador do provedor —, sem nome de organização:
  // a tela de entrada não deve contar quem é cliente de quem.
  const [sso, setSso] = useState<{ exige: boolean; provider: string } | null>(null);
  const dominio = email.includes("@") ? email.split("@")[1]?.trim().toLowerCase() : "";

  useEffect(() => {
    if (modo !== "entrar" || !dominio || dominio.length < 3) {
      setSso(null);
      return;
    }
    let cancelado = false;
    const t = setTimeout(async () => {
      try {
        const supabase = criarClienteBrowser();
        const { data } = await supabase.rpc("sso_do_dominio", { p_email: email });
        const linha = Array.isArray(data) ? data[0] : data;
        if (!cancelado) {
          setSso(
            linha?.provider_id
              ? { exige: linha.exige_sso === true, provider: linha.provider_id }
              : null,
          );
        }
      } catch {
        // Sem resposta, a tela segue como sempre foi: e-mail e senha.
        if (!cancelado) setSso(null);
      }
    }, 400);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [dominio, email, modo]);

  async function entrarComSso() {
    setErro(null);
    setEnviando(true);
    try {
      const supabase = criarClienteBrowser();
      const { data, error } = await supabase.auth.signInWithSSO({ domain: dominio });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("O provedor não devolveu endereço de entrada.");
    } catch (e) {
      setErro(
        e instanceof Error
          ? traduzir(e.message)
          : "Não foi possível falar com o acesso corporativo.",
      );
      setEnviando(false);
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setEnviando(true);

    const supabase = criarClienteBrowser();

    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        router.push("/");
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: {
          data: { nome },
          emailRedirectTo: `${window.location.origin}/auth/callback?proximo=/comecar`,
        },
      });
      if (error) throw error;

      if (!data.session) {
        setAviso(
          "Cadastro criado. Confirme pelo link que enviamos — ele leva direto para a configuração inicial. " +
            "O e-mail sai na hora; se não chegar em alguns minutos, olhe o spam e avise quem instalou: " +
            "essa mensagem depende do SMTP configurado no Supabase, não do envio do próprio Proximia.",
        );
        setEnviando(false);
        return;
      }

      router.push("/comecar");
      router.refresh();
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Não foi possível concluir. Tente de novo.";
      setErro(traduzir(mensagem));
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="formulario">
      {modo === "cadastrar" && (
        <label className="campo">
          <span>Nome</span>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="name"
            required
          />
        </label>
      )}

      <label className="campo">
        <span>E-mail</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>

      {sso && modo === "entrar" && (
        <div className="campo">
          <button
            type="button"
            className="botao botao-primario"
            onClick={entrarComSso}
            disabled={enviando}
          >
            {enviando ? "Redirecionando…" : "Entrar com o acesso da sua empresa"}
          </button>
          <small>
            {sso.exige
              ? "Esta organização exige acesso corporativo para o domínio " + dominio + "."
              : "O domínio " + dominio + " tem acesso corporativo. Você também pode usar sua senha."}
          </small>
        </div>
      )}

      {!(sso?.exige && modo === "entrar") && (
      <label className="campo">
        <span>Senha</span>
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete={modo === "entrar" ? "current-password" : "new-password"}
          minLength={modo === "entrar" ? 6 : 8}
          required
        />
        {modo === "cadastrar" && <small>Pelo menos 8 caracteres.</small>}
      </label>
      )}

      {erro && <p className="aviso aviso-erro">{erro}</p>}
      {aviso && <p className="aviso aviso-ok">{aviso}</p>}

      {!(sso?.exige && modo === "entrar") && (
        <button
          className={sso ? "botao botao-secundario" : "botao botao-primario"}
          type="submit"
          disabled={enviando}
        >
          {enviando ? "Enviando…" : modo === "entrar" ? "Entrar" : "Criar acesso"}
        </button>
      )}
    </form>
  );
}
