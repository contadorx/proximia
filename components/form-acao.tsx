"use client";

import { useFormState } from "react-dom";
import type { EstadoAcao } from "@/lib/formulario";

/**
 * Formulário que não joga fora o que a pessoa digitou.
 *
 * O padrão antigo devolvia erro por redirect (?erro=...): o endereço
 * mudava, o modal fechava e o preenchimento inteiro ia embora — errar a
 * origem do potencial custava doze campos. Aqui a ação devolve { erro }
 * sem redirect: a mensagem aparece dentro do formulário, os campos ficam
 * como estavam. No sucesso a ação continua redirecionando, e é a mudança
 * de endereço que fecha o modal — nada disso mudou.
 */
export function FormAcao({
  action,
  className = "formulario",
  children,
}: {
  action: (estado: EstadoAcao, formData: FormData) => Promise<EstadoAcao>;
  className?: string;
  children: React.ReactNode;
}) {
  const [estado, enviar] = useFormState(action, null);

  return (
    <form action={enviar} className={className}>
      {estado?.erro && (
        <p className="aviso aviso-erro" role="alert">
          {estado.erro}
        </p>
      )}
      {children}
    </form>
  );
}
