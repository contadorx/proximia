import { describe, expect, it } from "vitest";
import { limparMensagem } from "@/lib/telemetria";

/**
 * O requisito é que dado de negócio NÃO viaje para ferramenta de
 * terceiro. Estes testes são a trava: cada um usa uma mensagem de erro
 * realista que carrega dado de cliente e exige que ele não sobreviva.
 */
describe("telemetria: nenhum dado de negócio no relatório", () => {
  it("corta o valor da chave duplicada do Postgres", () => {
    const bruta =
      'duplicate key value violates unique constraint "contas_documento_key" ' +
      "DETAIL: Key (documento)=(11222333000181) already exists.";
    const limpa = limparMensagem(bruta);
    expect(limpa).not.toContain("11222333000181");
    expect(limpa).toContain("Key (…)=(…)");
  });

  it("remove endereços de e-mail", () => {
    const limpa = limparMensagem("falha ao enviar para diretoria@clientereal.com.br");
    expect(limpa).not.toContain("diretoria@clientereal.com.br");
    expect(limpa).toContain("…@…");
  });

  it("remove sequências longas de dígitos (documento, valor, telefone)", () => {
    const limpa = limparMensagem("valor 4850000 rejeitado para o documento 11222333000181");
    expect(limpa).not.toContain("4850000");
    expect(limpa).not.toContain("11222333000181");
  });

  it("remove literais entre aspas, onde costuma vir o nome da conta", () => {
    const limpa = limparMensagem("conta 'Alfa Indústria Metalúrgica' não encontrada");
    expect(limpa).not.toContain("Alfa Indústria Metalúrgica");
  });

  it("preserva a parte técnica, que é o que serve para diagnosticar", () => {
    const limpa = limparMensagem("new row violates row-level security policy for table contas");
    expect(limpa).toContain("row-level security policy");
    expect(limpa).toContain("contas");
  });

  it("limita o tamanho, para não virar despejo de log", () => {
    expect(limparMensagem("x".repeat(1000)).length).toBeLessThanOrEqual(300);
  });
});
