/** Colombia no tiene horario de verano: Bogotá es siempre UTC-5. */
const DESFASE_DE_BOGOTA_HORAS = 5;

/**
 * Próximo instante, estrictamente posterior a `ahora`, en que son las `hora`:00 en Bogotá. Es
 * cuando sale el resumen diario.
 */
export function proximaHoraDeResumen(ahora: Date, hora: number): Date {
  const candidato = new Date(
    Date.UTC(
      ahora.getUTCFullYear(),
      ahora.getUTCMonth(),
      ahora.getUTCDate(),
      hora + DESFASE_DE_BOGOTA_HORAS,
      0,
      0,
      0,
    ),
  );
  if (candidato.getTime() <= ahora.getTime()) candidato.setUTCDate(candidato.getUTCDate() + 1);
  return candidato;
}

/** Intentos de envío de un aviso antes de darlo por fallido. */
export const INTENTOS_DE_ENVIO = 5;

/** Espera antes del siguiente intento: 1, 2, 4, 8… minutos, con tope de una hora. */
export function esperaDeReintentoMs(intentosHechos: number): number {
  const minutos = Math.min(2 ** Math.max(0, intentosHechos - 1), 60);
  return minutos * 60_000;
}
