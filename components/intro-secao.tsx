/**
 * Faixa de explicacao no topo de cada tela. Padroniza a autoexplicacao:
 * a pessoa entende o que aquela tela faz sem precisar de treinamento.
 */
export function IntroSecao({ children }: { children: React.ReactNode }) {
  return <div className="intro-secao">{children}</div>;
}

/**
 * Estado vazio com acao. Tela vazia e convite para agir, nunca so um aviso
 * de que nao ha nada.
 */
export function Vazio({
  children,
  acao,
}: {
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <div className="vazio">
      <p>{children}</p>
      {acao}
    </div>
  );
}
