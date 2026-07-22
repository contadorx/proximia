export type Periodo = { chave: string; rotulo: string; inicio: string; fim: string };

function iso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/**
 * Períodos do extrato. O padrão é o mês corrente: é a cadência natural de
 * reporte e evita que o documento vire um recorte arbitrário.
 */
export function periodos(): Periodo[] {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();

  const mesAtualInicio = new Date(ano, mes, 1);
  const mesAnteriorInicio = new Date(ano, mes - 1, 1);
  const mesAnteriorFim = new Date(ano, mes, 0);
  const trimestre = new Date(ano, mes - 2, 1);

  const nomeMes = (d: Date) =>
    d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return [
    {
      chave: "mes",
      rotulo: `Mês atual — ${nomeMes(hoje)}`,
      inicio: iso(mesAtualInicio),
      fim: iso(hoje),
    },
    {
      chave: "mes_anterior",
      rotulo: `Mês anterior — ${nomeMes(mesAnteriorInicio)}`,
      inicio: iso(mesAnteriorInicio),
      fim: iso(mesAnteriorFim),
    },
    {
      chave: "trimestre",
      rotulo: "Últimos três meses",
      inicio: iso(trimestre),
      fim: iso(hoje),
    },
    {
      chave: "ano",
      rotulo: `Ano de ${ano}`,
      inicio: `${ano}-01-01`,
      fim: iso(hoje),
    },
  ];
}

export function acharPeriodo(chave: string | undefined): Periodo {
  const lista = periodos();
  return lista.find((p) => p.chave === chave) ?? lista[0];
}
