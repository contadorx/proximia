import { describe, expect, it } from "vitest";
import {
  achatar,
  lerMapa,
  montarHierarquia,
  rotuloInfluencia,
  type ContatoMapa,
  type PapelDecisao,
  type PosturaContato,
} from "@/lib/decisores";

/**
 * O que se testa aqui é a montagem do mapa — a parte que decide o que a
 * pessoa vê antes da reunião. A regra de acesso é do banco e está em
 * supabase/testes/decisores.sql; aqui é cálculo puro.
 */

function contato(parcial: Partial<ContatoMapa> & { id: string; nome: string }): ContatoMapa {
  return {
    cargo: null,
    email: null,
    telefone: null,
    principal: false,
    area: null,
    influencia: null,
    papel_id: null,
    postura_id: null,
    reporta_a: null,
    ...parcial,
  };
}

const PAPEIS: PapelDecisao[] = [
  { id: "p-decide", rotulo: "Decisor", descricao: null, decide: true, ordem: 1, ativo: true },
  { id: "p-influi", rotulo: "Técnico", descricao: null, decide: false, ordem: 2, ativo: true },
];

const POSTURAS: PosturaContato[] = [
  { id: "s-apoia", rotulo: "Apoia", descricao: null, tom: "favoravel", ordem: 1, ativo: true },
  { id: "s-contra", rotulo: "Resistente", descricao: null, tom: "contrario", ordem: 2, ativo: true },
  { id: "s-neutro", rotulo: "Neutro", descricao: null, tom: "neutro", ordem: 3, ativo: true },
];

describe("hierarquia do mapa de decisores", () => {
  it("quem não reporta a ninguém é raiz, e os subordinados descem um nível", () => {
    const arvore = montarHierarquia([
      contato({ id: "a", nome: "Ana" }),
      contato({ id: "b", nome: "Bruno", reporta_a: "a" }),
      contato({ id: "c", nome: "Carla", reporta_a: "b" }),
    ]);

    expect(arvore).toHaveLength(1);
    expect(arvore[0].contato.nome).toBe("Ana");
    expect(arvore[0].filhos[0].contato.nome).toBe("Bruno");
    expect(arvore[0].filhos[0].profundidade).toBe(1);
    expect(arvore[0].filhos[0].filhos[0].profundidade).toBe(2);
  });

  it("quem reporta a alguém de fora da lista vira raiz, em vez de sumir", () => {
    const arvore = montarHierarquia([
      contato({ id: "a", nome: "Ana" }),
      contato({ id: "z", nome: "Zé", reporta_a: "fantasma" }),
    ]);
    expect(achatar(arvore).map((n) => n.contato.nome).sort()).toEqual(["Ana", "Zé"]);
  });

  it("ciclo herdado não trava nem some com ninguém", () => {
    // O banco recusa ciclo, mas dado antigo (ou importado antes da trava)
    // pode chegar assim. A tela não pode entrar em recursão infinita.
    const arvore = montarHierarquia([
      contato({ id: "a", nome: "Ana", reporta_a: "b" }),
      contato({ id: "b", nome: "Bruno", reporta_a: "a" }),
    ]);
    const nomes = achatar(arvore).map((n) => n.contato.nome).sort();
    expect(nomes).toEqual(["Ana", "Bruno"]);
  });

  it("ninguém aparece duas vezes", () => {
    const arvore = montarHierarquia([
      contato({ id: "a", nome: "Ana" }),
      contato({ id: "b", nome: "Bruno", reporta_a: "a" }),
      contato({ id: "c", nome: "Carla", reporta_a: "a" }),
    ]);
    const ids = achatar(arvore).map((n) => n.contato.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lista vazia devolve árvore vazia", () => {
    expect(montarHierarquia([])).toEqual([]);
  });
});

describe("leitura do mapa — as quatro perguntas da ficha", () => {
  const contatos = [
    contato({ id: "a", nome: "Ana", papel_id: "p-decide", postura_id: "s-apoia", principal: true }),
    contato({ id: "b", nome: "Bruno", papel_id: "p-influi", postura_id: "s-contra", reporta_a: "a" }),
    contato({ id: "c", nome: "Carla", influencia: 5, reporta_a: "a" }),
    contato({ id: "d", nome: "Dino", influencia: 2, reporta_a: "a" }),
  ];

  it("decide quem tem papel marcado como decisor — nunca o rótulo", () => {
    const m = lerMapa(contatos, PAPEIS, POSTURAS);
    expect(m.decidem.map((c) => c.nome)).toEqual(["Ana"]);
  });

  it("influencia quem tem papel que não decide, ou influência alta sem papel", () => {
    const m = lerMapa(contatos, PAPEIS, POSTURAS);
    expect(m.influenciam.map((c) => c.nome).sort()).toEqual(["Bruno", "Carla"]);
  });

  it("contra sai da postura com tom contrário", () => {
    const m = lerMapa(contatos, PAPEIS, POSTURAS);
    expect(m.contra.map((c) => c.nome)).toEqual(["Bruno"]);
  });

  it("porta de entrada é o principal e quem está no topo", () => {
    const m = lerMapa(contatos, PAPEIS, POSTURAS);
    expect(m.portaDeEntrada.map((c) => c.nome)).toEqual(["Ana"]);
  });

  it("conta quantos ainda estão sem papel — é o que falta mapear", () => {
    const m = lerMapa(contatos, PAPEIS, POSTURAS);
    expect(m.semPapel).toBe(2);
    expect(m.total).toBe(4);
  });

  it("mapa vazio não quebra e não inventa ninguém", () => {
    const m = lerMapa([], PAPEIS, POSTURAS);
    expect(m).toMatchObject({ total: 0, semPapel: 0 });
    expect(m.decidem).toEqual([]);
  });

  it("papel de outro catálogo (id desconhecido) não promove ninguém a decisor", () => {
    const m = lerMapa([contato({ id: "x", nome: "Xis", papel_id: "de-outra-org" })], PAPEIS, POSTURAS);
    expect(m.decidem).toEqual([]);
  });
});

describe("rótulo de influência", () => {
  it("diz o nível em palavra, sem falsa precisão", () => {
    expect(rotuloInfluencia(5)).toBe("influência decisiva");
    expect(rotuloInfluencia(1)).toBe("influência muito baixa");
  });

  it("sem avaliação, diz que não foi avaliada", () => {
    expect(rotuloInfluencia(null)).toBe("influência não avaliada");
  });
});
