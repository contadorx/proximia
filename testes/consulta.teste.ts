import { describe, expect, it } from "vitest";
import { paraLista, paraTexto, temFiltro } from "@/lib/consulta";
import { paraCsv, RECURSOS } from "@/lib/exportacao";
import { agruparPorResponsavel } from "@/lib/panorama";

/**
 * Normalização de parâmetros e exportação. São as duas bordas do sistema:
 * o que entra pela URL e o que sai em arquivo. Erro aqui não quebra a
 * tela — corrompe silenciosamente o resultado.
 */

describe("parâmetros de consulta", () => {
  it("aceita o mesmo campo como texto, lista ou ausente", () => {
    // O seletor múltiplo envia um campo por item marcado, então o mesmo
    // parâmetro chega das três formas.
    expect(paraLista(undefined)).toEqual([]);
    expect(paraLista("a")).toEqual(["a"]);
    expect(paraLista(["a", "b"])).toEqual(["a", "b"]);
  });

  it("descarta valor vazio, que vem de campo não preenchido", () => {
    expect(paraLista(["a", "", "  "])).toEqual(["a"]);
    expect(paraLista("")).toEqual([]);
  });

  it("pega o primeiro quando o campo é de escolha única", () => {
    expect(paraTexto(["b", "c"])).toBe("b");
    expect(paraTexto(undefined)).toBeUndefined();
  });

  it("reconhece filtro ativo em qualquer um dos campos", () => {
    expect(temFiltro(undefined, [], "")).toBe(false);
    expect(temFiltro(undefined, ["x"])).toBe(true);
  });
});

describe("exportação em CSV", () => {
  const colunas = ["nome", "observacao", "valor"];

  it("põe entre aspas o texto que contém o separador", () => {
    // Sem isso, uma observação com ponto e vírgula desloca a planilha
    // inteira a partir daquela linha.
    const csv = paraCsv([{ nome: "Alfa", observacao: "tem; ponto e vírgula", valor: 10 }], colunas);
    expect(csv).toContain('"tem; ponto e vírgula"');
  });

  it("duplica aspas internas", () => {
    const csv = paraCsv([{ nome: 'diz "olá"', observacao: null, valor: null }], colunas);
    expect(csv).toContain('"diz ""olá"""');
  });

  it("mantém quebra de linha dentro do campo", () => {
    const csv = paraCsv([{ nome: "Alfa", observacao: "linha um\nlinha dois", valor: 0 }], colunas);
    expect(csv).toContain('"linha um\nlinha dois"');
  });

  it("escreve zero e falso, que não são ausência", () => {
    const csv = paraCsv([{ nome: "Alfa", observacao: false, valor: 0 }], colunas);
    const linha = csv.trim().split("\r\n")[1];
    expect(linha).toBe("Alfa;false;0");
  });

  it("começa com a marca de ordem, para o Excel abrir com acento certo", () => {
    expect(paraCsv([], colunas).startsWith("\uFEFF")).toBe(true);
  });

  it("não exporta recurso com nome repetido", () => {
    const chaves = RECURSOS.map((r) => r.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe("panorama por responsável", () => {
  const linhas = [
    { carteira_id: "A", nome: "Norte", codigo: "N", contas_total: 1, frentes_abertas: 0, frentes_potencial: 100, contas_potencial: 0, frentes_capturado: 0, contas_capturado: 0, contratos_vencidos: 0, contratos_janela: 0, compromissos_atrasados: 0, ultima_movimentacao: new Date().toISOString() },
    { carteira_id: "B", nome: "Sul", codigo: "S", contas_total: 1, frentes_abertas: 0, frentes_potencial: 200, contas_potencial: 0, frentes_capturado: 0, contas_capturado: 0, contratos_vencidos: 0, contratos_janela: 0, compromissos_atrasados: 0, ultima_movimentacao: new Date().toISOString() },
    { carteira_id: "C", nome: "Leste", codigo: "L", contas_total: 1, frentes_abertas: 0, frentes_potencial: 300, contas_potencial: 0, frentes_capturado: 0, contas_capturado: 0, contratos_vencidos: 0, contratos_janela: 0, compromissos_atrasados: 0, ultima_movimentacao: new Date().toISOString() },
  ] as never;

  const vinculos = [
    { carteira_id: "A", user_id: "unidade" },
    { carteira_id: "A", user_id: "corporativo" },
    { carteira_id: "B", user_id: "unidade" },
  ];

  it("conta a carteira compartilhada para os dois responsáveis", () => {
    const r = agruparPorResponsavel(linhas, vinculos, [], []);
    const porId = Object.fromEntries(r.map((x) => [x.userId ?? "sem-dono", x]));

    expect(porId["unidade"].carteiras.length).toBe(2);
    expect(porId["corporativo"].carteiras.length).toBe(1);
  });

  it("mostra a carteira sem responsável como linha própria", () => {
    const r = agruparPorResponsavel(linhas, vinculos, [], []);
    const orfa = r.find((x) => x.userId === null);
    expect(orfa?.carteiras[0].carteira_id).toBe("C");
  });

  it("a soma por pessoa é maior que a da rede, e por isso não serve de total", () => {
    // Consequência de contar a compartilhada duas vezes. É proposital: a
    // lente compara carga, não resultado — somar valor por pessoa seria
    // dupla contagem disfarçada de desempenho.
    const r = agruparPorResponsavel(linhas, vinculos, [], []);
    const soma = r.reduce((t, x) => t + x.potencial, 0);
    expect(soma).toBe(700);
    expect(soma).toBeGreaterThan(600);
  });
});
