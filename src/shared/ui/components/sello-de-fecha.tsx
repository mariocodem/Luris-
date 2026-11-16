import { cn } from 'cn';
import { formatearFechaOficial, isoDeFechaOficial } from '@/shared/domain/fechas';

/**
 * Sello de fecha oficial: la marca del sistema LURIS. Como el sello fechador de la ventanilla del
 * juzgado, dice qué fecha registró la plataforma (nunca la de detección en LURIS, §1.4).
 * Se usa solo para fechas oficiales; usarlo como adorno le quita su significado.
 */
export function SelloDeFecha({
  etiqueta,
  fecha,
  estampar = false,
  className,
}: {
  /** Qué fecha es: «Registro» o «Actuación». */
  readonly etiqueta: 'Registro' | 'Actuación';
  /** Día calendario oficial: 'AAAA-MM-DD' o el Date de una columna `date`. */
  readonly fecha: Date | string;
  /** Anima el sello al aparecer (actuaciones recién detectadas). */
  readonly estampar?: boolean;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex flex-col items-center rounded-[3px] border-[1.5px] border-sello px-2.5 py-1 leading-none text-sello outline outline-1 outline-offset-2 outline-sello/60',
        estampar && 'motion-safe:animate-estampar',
        className,
      )}
    >
      <span className="text-[0.65625rem] font-semibold tracking-[0.12em] uppercase">
        {etiqueta}
      </span>
      <time dateTime={isoDeFechaOficial(fecha)} className="cifras mt-1 text-sm font-semibold">
        {formatearFechaOficial(fecha)}
      </time>
    </span>
  );
}
