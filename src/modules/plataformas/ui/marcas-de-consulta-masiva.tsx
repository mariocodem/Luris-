import { cn } from 'cn';
import { ETIQUETA_DE_ESTADO_DE_ITEM, type EstadoDeItem } from '../domain/consulta-masiva';
import type { LoteDeConsultaMasiva } from '../application/puertos';

const CLASES_DE_ITEM: Readonly<Record<EstadoDeItem, string>> = {
  PENDIENTE: 'bg-secondary text-secondary-foreground',
  EN_PROCESO: 'bg-secondary text-secondary-foreground',
  COMPLETADO: 'bg-exito-suave text-exito',
  FALLIDO: 'bg-error-suave text-destructive',
  PENDIENTE_CONFIRMACION: 'bg-alerta-suave text-foreground',
};

/** Estado de un ítem: texto siempre visible (el color solo acompaña, §11). */
export function MarcaDeEstadoDeItem({ estado }: { readonly estado: EstadoDeItem }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 font-sans text-xs font-medium whitespace-nowrap',
        CLASES_DE_ITEM[estado],
      )}
    >
      {ETIQUETA_DE_ESTADO_DE_ITEM[estado]}
    </span>
  );
}

const ETIQUETA_DE_LOTE: Readonly<Record<LoteDeConsultaMasiva['estado'], string>> = {
  PENDIENTE: 'En cola',
  EN_PROCESO: 'En curso',
  COMPLETADA: 'Terminada',
  CANCELADA: 'Cancelada',
};

export function MarcaDeEstadoDeLote({
  estado,
}: {
  readonly estado: LoteDeConsultaMasiva['estado'];
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 font-sans text-xs font-medium whitespace-nowrap',
        estado === 'COMPLETADA'
          ? 'bg-exito-suave text-exito'
          : 'bg-secondary text-secondary-foreground',
      )}
    >
      {ETIQUETA_DE_LOTE[estado]}
    </span>
  );
}
