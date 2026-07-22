"use client";

export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="coluna-estreita">
      <p className="olho">Erro</p>
      <h1>Algo falhou nesta tela</h1>
      <p className="chamada">
        A página não conseguiu carregar. Tente de novo; se continuar, verifique a configuração em{" "}
        <a href="/diagnostico">diagnóstico</a>.
      </p>

      {error.digest && (
        <p className="nota">
          Código para localizar no log do servidor: <span className="dado">{error.digest}</span>
        </p>
      )}

      <div className="acoes-rodape" style={{ marginTop: 24 }}>
        <button className="botao" onClick={() => reset()}>
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
