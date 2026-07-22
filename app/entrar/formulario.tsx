"use client";

import { useState } from "react";
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
        options: { data: { nome } },
      });
      if (error) throw error;

      if (!data.session) {
        setAviso("Cadastro criado. Confirme o e-mail pelo link que enviamos e depois entre.");
        setEnviando(false);
        return;
      }

      router.push("/");
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

      <label className="campo">
        <span>Senha</span>
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete={modo === "entrar" ? "current-password" : "new-password"}
          minLength={6}
          required
        />
      </label>

      {erro && <p className="aviso aviso-erro">{erro}</p>}
      {aviso && <p className="aviso aviso-ok">{aviso}</p>}

      <button className="botao botao-primario" type="submit" disabled={enviando}>
        {enviando ? "Enviando…" : modo === "entrar" ? "Entrar" : "Criar acesso"}
      </button>
    </form>
  );
}
