'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from 'cn';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

/**
 * Radicado (23 dígitos) o NUNC (21) siempre sin guiones ni espacios, en cifras tabulares, con
 * botón «Copiar» (§1.5, §11). Al copiar: el ícono cambia a ✓, aparece el aviso «Radicado
 * copiado» y una región `aria-live` lo anuncia a los lectores de pantalla.
 */
export function RadicadoCopiable({
  valor,
  tipo = 'radicado',
  className,
}: {
  /** Ya normalizado: solo dígitos. */
  readonly valor: string;
  readonly tipo?: 'radicado' | 'nunc';
  readonly className?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nombre = tipo === 'nunc' ? 'NUNC' : 'Radicado';
  const digitos = valor.replace(/\D/g, '');

  useEffect(() => () => clearTimeout(temporizador.current), []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(digitos);
      setCopiado(true);
      toast.success(`${nombre} copiado`, { description: digitos, duration: 2500 });
      clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error(`No pudimos copiar el ${nombre.toLowerCase()}`, {
        description: 'Selecciónalo y cópialo con Ctrl+C.',
      });
    }
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="cifras text-sm whitespace-nowrap text-foreground select-all">{digitos}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={copiar}
            aria-label={`Copiar ${nombre.toLowerCase()} ${digitos}`}
            className={cn(
              'inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-card hover:text-primary active:scale-95 sm:size-7',
              copiado && 'text-exito hover:text-exito',
            )}
          >
            {copiado ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Copy className="size-3.5" aria-hidden />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {copiado ? `${nombre} copiado` : `Copiar ${nombre.toLowerCase()}`}
        </TooltipContent>
      </Tooltip>
      <span className="sr-only" aria-live="polite">
        {copiado ? `${nombre} copiado` : ''}
      </span>
    </span>
  );
}
