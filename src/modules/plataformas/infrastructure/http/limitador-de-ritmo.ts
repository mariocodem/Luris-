/**
 * Limita el ritmo de solicitudes a una plataforma (§6: no saturar los portales oficiales).
 * Reparte los turnos con un intervalo mínimo entre el inicio de una solicitud y el de la
 * siguiente. Vive en memoria: es correcto porque solo el worker consulta las plataformas.
 *
 * Si la plataforma frena a LURIS (p. ej. la CPNU responde 403 tras una ráfaga), `pausar` detiene
 * todas las solicitudes a esa plataforma por un tiempo: mientras dure, `esperarTurno` responde
 * PAUSADO sin esperar, y la cola reintenta el trabajo más tarde.
 */
export interface LimitadorDeRitmo {
  /** Espera hasta que haya turno. Se rechaza si la señal se cancela mientras espera. */
  esperarTurno(signal?: AbortSignal): Promise<'LISTO' | 'PAUSADO'>;
  /** Suspende las solicitudes durante `ms` milisegundos (o más, si ya había una pausa mayor). */
  pausar(ms: number): void;
}

export function crearLimitadorDeRitmo(opciones: {
  readonly solicitudesPorMinuto: number;
  readonly ahora?: () => number;
  readonly esperar?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): LimitadorDeRitmo {
  const intervaloMs = 60_000 / opciones.solicitudesPorMinuto;
  const ahora = opciones.ahora ?? Date.now;
  const esperar = opciones.esperar ?? esperarCancelable;
  let siguienteTurno = 0;
  let pausadoHasta = 0;

  return {
    async esperarTurno(signal) {
      const momento = ahora();
      if (momento < pausadoHasta) return 'PAUSADO';
      const turno = Math.max(momento, siguienteTurno);
      siguienteTurno = turno + intervaloMs;
      if (turno > momento) await esperar(turno - momento, signal);
      return ahora() < pausadoHasta ? 'PAUSADO' : 'LISTO';
    },
    pausar(ms) {
      pausadoHasta = Math.max(pausadoHasta, ahora() + ms);
    },
  };
}

/** Espera `ms` milisegundos; se rechaza en cuanto la señal se cancela. */
export function esperarCancelable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const temporizador = setTimeout(() => {
      signal?.removeEventListener('abort', alCancelar);
      resolve();
    }, ms);
    function alCancelar() {
      clearTimeout(temporizador);
      reject(signal?.reason);
    }
    signal?.addEventListener('abort', alCancelar, { once: true });
  });
}
