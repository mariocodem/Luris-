'use client';

import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/components/button';
import type { AvanceDeConsultaMasiva } from '../application/consulta-masiva';
import { loteTermino, porcentajeDeAvance, type ConteoDeItems } from '../domain/consulta-masiva';

export type RespuestaDeAvance =
  | { readonly ok: true; readonly avance: AvanceDeConsultaMasiva }
  | { readonly ok: false; readonly mensaje: string };

export type RespuestaDeReintento =
  | { readonly ok: true; readonly reintentados: number }
  | { readonly ok: false; readonly mensaje: string; readonly codigoDeAyuda?: string };

export interface AccionesDeConsultaMasiva {
  avance(id: string): Promise<RespuestaDeAvance>;
  reintentar(id: string, itemId: string | null): Promise<RespuestaDeReintento>;
}

const cifras = new Intl.NumberFormat('es-CO');
const ESPERA_MS = 2_500;
const ESPERA_MAXIMA_MS = 15_000;

function mismoConteo(a: ConteoDeItems, b: ConteoDeItems): boolean {
  return (
    a.total === b.total &&
    a.pendientes === b.pendientes &&
    a.enProceso === b.enProceso &&
    a.completados === b.completados &&
    a.fallidos === b.fallidos &&
    a.porConfirmar === b.porConfirmar
  );
}

/**
 * Avance en vivo de una consulta masiva (§7): barra con conteo por estado, anunciada a los
 * lectores de pantalla. Mientras haya algo por consultar, lee el avance cada pocos segundos (más
 * despacio si hay fallos de red o la pestaña está oculta) y, cuando cambia, vuelve a pedir la
 * página para mostrar los resultados parciales. Cerrar la página no detiene la consulta.
 */
export function ProgresoDeConsultaMasiva({
  id,
  inicial,
  acciones,
}: {
  readonly id: string;
  readonly inicial: AvanceDeConsultaMasiva;
  readonly acciones: AccionesDeConsultaMasiva;
}) {
  const router = useRouter();
  const [avance, setAvance] = useState(inicial);
  const [reintentando, reintentar] = useTransition();
  const ultimo = useRef(inicial);

  useEffect(() => {
    if (loteTermino(avance.conteo) && avance.estado !== 'EN_PROCESO') return;
    let activo = true;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let fallos = 0;

    async function leer() {
      if (document.visibilityState === 'hidden') {
        temporizador = setTimeout(() => void leer(), ESPERA_MS * 2);
        return;
      }
      const respuesta = await acciones.avance(id).catch(() => null);
      if (!activo) return;
      if (respuesta?.ok) {
        fallos = 0;
        const nuevo = respuesta.avance;
        if (
          !mismoConteo(nuevo.conteo, ultimo.current.conteo) ||
          nuevo.estado !== ultimo.current.estado
        ) {
          const habiaTerminado = loteTermino(ultimo.current.conteo);
          ultimo.current = nuevo;
          setAvance(nuevo);
          router.refresh();
          if (!habiaTerminado && loteTermino(nuevo.conteo)) {
            toast.success('La consulta masiva terminó', {
              description: `${cifras.format(nuevo.conteo.completados)} listos, ${cifras.format(nuevo.conteo.fallidos)} con problemas.`,
            });
          }
        }
        if (loteTermino(nuevo.conteo)) return;
      } else {
        fallos += 1;
      }
      temporizador = setTimeout(
        () => void leer(),
        Math.min(ESPERA_MS * 2 ** Math.min(fallos, 3), ESPERA_MAXIMA_MS),
      );
    }

    temporizador = setTimeout(() => void leer(), ESPERA_MS);
    return () => {
      activo = false;
      if (temporizador) clearTimeout(temporizador);
    };
  }, [acciones, avance.conteo, avance.estado, id, router]);

  const { conteo } = avance;
  const porcentaje = porcentajeDeAvance(conteo);
  const termino = loteTermino(conteo);
  const hechos = conteo.completados + conteo.fallidos + conteo.porConfirmar;

  function reintentarFallidos() {
    reintentar(async () => {
      const respuesta = await acciones.reintentar(id, null);
      if (respuesta.ok) {
        toast.success(
          respuesta.reintentados === 1
            ? 'Volvimos a poner 1 consulta en la cola'
            : `Volvimos a poner ${cifras.format(respuesta.reintentados)} consultas en la cola`,
        );
        const nuevo = await acciones.avance(id).catch(() => null);
        if (nuevo?.ok) {
          ultimo.current = nuevo.avance;
          setAvance(nuevo.avance);
        }
        router.refresh();
      } else {
        toast.error(respuesta.mensaje, {
          description: respuesta.codigoDeAyuda
            ? `Código de ayuda: ${respuesta.codigoDeAyuda}`
            : undefined,
        });
      }
    });
  }

  const partes = [
    { texto: 'listos', cantidad: conteo.completados },
    { texto: 'con problemas', cantidad: conteo.fallidos },
    { texto: 'esperan tu confirmación', cantidad: conteo.porConfirmar },
    { texto: 'consultando', cantidad: conteo.enProceso },
    { texto: 'en cola', cantidad: conteo.pendientes },
  ].filter((p) => p.cantidad > 0);

  return (
    <section
      aria-labelledby="titulo-progreso"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titulo-progreso" className="text-base font-semibold">
          {termino ? 'Consulta terminada' : 'Consultando…'}
        </h2>
        <p className="cifras text-sm text-muted-foreground">
          {cifras.format(hechos)} de {cifras.format(conteo.total)} consultas
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Avance de la consulta masiva"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje}
        className="h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
      <p aria-live="polite" className="text-sm text-pretty text-muted-foreground">
        {partes.length === 0 ? (
          'Sin consultas.'
        ) : (
          <>
            {partes.map((p, indice) => (
              <span key={p.texto}>
                {indice > 0 ? ' · ' : ''}
                <span className="cifras font-medium text-foreground">
                  {cifras.format(p.cantidad)}
                </span>{' '}
                {p.texto}
              </span>
            ))}
          </>
        )}
      </p>
      {termino ? null : (
        <p className="text-sm text-muted-foreground">
          Puedes cerrar esta página: la consulta sigue y los resultados quedan guardados.
        </p>
      )}
      {conteo.fallidos > 0 ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={reintentarFallidos}
          disabled={reintentando}
        >
          <RotateCcw aria-hidden />
          {reintentando
            ? 'Reintentando…'
            : conteo.fallidos === 1
              ? 'Reintentar la consulta con problemas'
              : `Reintentar las ${cifras.format(conteo.fallidos)} consultas con problemas`}
        </Button>
      ) : null}
    </section>
  );
}

/** «Reintentar» una sola consulta con problemas. */
export function ReintentarItem({
  id,
  itemId,
  acciones,
}: {
  readonly id: string;
  readonly itemId: string;
  readonly acciones: Pick<AccionesDeConsultaMasiva, 'reintentar'>;
}) {
  const router = useRouter();
  const [reintentando, reintentar] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={reintentando}
      onClick={() =>
        reintentar(async () => {
          const respuesta = await acciones.reintentar(id, itemId);
          if (respuesta.ok) {
            toast.success('Volvimos a poner la consulta en la cola');
            router.refresh();
          } else {
            toast.error(respuesta.mensaje);
          }
        })
      }
    >
      <RotateCcw aria-hidden />
      {reintentando ? 'Reintentando…' : 'Reintentar'}
    </Button>
  );
}
