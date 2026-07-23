import { redirect } from "next/navigation";

/**
 * A exportação mudou de endereço: exportar é consumo de dados, não
 * catálogo, então ela vive junto das outras leituras, em Relatórios.
 * Esta rota fica para links antigos não quebrarem — e Configurações
 * mantém um link apontando para lá.
 */
export default function RotaAntigaExportacao() {
  redirect("/relatorios/exportacao");
}
