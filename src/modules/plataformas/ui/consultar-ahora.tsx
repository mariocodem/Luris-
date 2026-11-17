'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/components/button';
import type { AvanceDeConsulta, ConsultaSolicitada } from '../application/solicitar-consulta';

type Fallo = { readonly ok: false; readonly mensaje: string; readonly codigoDeAyuda?: string };

export interface AccionesDeConsulta {
  consultarAhora(
    procesoId: string,
  ): Promise<{ readonly ok: true; readonly solicitadas: readonly ConsultaSolicitada[] } | Fallo>;
  avance(
    procesoId: string,
    solicitadas: readonly ConsultaSolicitada[],
  ): Promise<{ readonly ok: true; readonly avances: readonly AvanceDeConsulta[] } | Fallo>;
}

/** Espera entre lecturas del avance: rápido al principio, más pausado si tarda. */
function espera(transcurridoMs: number): number {
  return transcurridoMs < 15_000 ? 1_500 : 3_000;
}
const ESPERA_EN_COLA_MS = 20_000;
const TOPE_MS = 120_000;

/**
 * «Consultar ahora»: pide la consulta al worker y muestra su avance hasta que termina. La persona
 * puede salir de la página: la consulta sigue y el resultado queda en la ficha.
 */
export function ConsultarAhora({
  procesoId,
  acciones,
}: {
  readonly procesoId: string;
  readonly acciones: AccionesDeConsulta;
}) {
  const router = useRouter();
  const [iniciando, iniciar] = useTransition();
  const [enCurso, setEnCurso] = useState(false);
  const [estado, setEstado] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activo = useRef(true);

  useEffect(() => {
    activo.current = true;
    return () => {
      activo.current = false;
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  function terminar(avances: readonly AvanceDeConsulta[]) {
    setEnCurso(false);
    setEstado(avances.map((a) => a.mensaje).join(' '));
    for (const avance of avances) {
      if (avance.estado === 'TERMINADA') toast.success(avance.mensaje);
      else toast.warning(avance.mensaje);
    }
    router.refresh();
  }

  function seguir(solicitadas: readonly ConsultaSolicitada[], desde: number) {
    const transcurrido = Date.now() - desde;
    temporizador.current = setTimeout(() => {
      void (async () => {
        const respuesta = await acciones.avance(procesoId, solicitadas);
        if (!activo.current) return;
        if (!respuesta.ok) {
          setEnCurso(false);
          setEstado(respuesta.mensaje);
          toast.error(respuesta.mensaje, {
            description: respuesta.codigoDeAyuda
              ? `Código de ayuda: ${respuesta.codigoDeAyuda}`
              : undefined,
          });
          return;
        }
        const pendientes = respuesta.avances.filter((a) => a.estado === 'EN_CURSO');
        if (pendientes.length === 0) {
          terminar(respuesta.avances);
          return;
        }
        const ahora = Date.now() - desde;
        if (ahora > TOPE_MS) {
          setEnCurso(false);
          setEstado(
            'La consulta sigue en curso. Puedes salir de esta página: el resultado quedará guardado en la ficha.',
          );
          return;
        }
        setEstado(
          ahora > ESPERA_EN_COLA_MS
            ? 'Sigue en espera: hay otras consultas antes que esta. Puedes salir de esta página.'
            : pendientes.map((a) => a.mensaje).join(' '),
        );
        seguir(solicitadas, desde);
      })();
    }, espera(transcurrido));
  }

  function consultar() {
    iniciar(async () => {
      setEstado(null);
      const respuesta = await acciones.consultarAhora(procesoId);
      if (!activo.current) return;
      if (!respuesta.ok) {
        setEstado(respuesta.mensaje);
        toast.error(respuesta.mensaje, {
          description: respuesta.codigoDeAyuda
            ? `Código de ayuda: ${respuesta.codigoDeAyuda}`
            : undefined,
        });
        return;
      }
      setEnCurso(true);
      setEstado('Consultando…');
      seguir(respuesta.solicitadas, Date.now());
    });
  }

  const ocupado = iniciando || enCurso;
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={consultar}
        disabled={ocupado}
        aria-describedby="estado-de-consulta"
        className="self-start"
      >
        <RefreshCw aria-hidden className={ocupado ? 'motion-safe:animate-spin' : undefined} />
        {ocupado ? 'Consultando…' : 'Consultar ahora'}
      </Button>
      <p
        id="estado-de-consulta"
        aria-live="polite"
        className="text-sm text-pretty text-muted-foreground empty:hidden"
      >
        {estado}
      </p>
    </div>
  );
}
