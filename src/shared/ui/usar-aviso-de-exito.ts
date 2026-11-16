'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { EstadoDeFormulario } from './estado-de-formulario';

/**
 * Convierte la confirmación de una acción en un aviso emergente (toast), para no mover la
 * pantalla. Los errores se siguen mostrando junto al formulario, donde se corrigen.
 */
export function useAvisoDeExito(estado: EstadoDeFormulario): void {
  const anterior = useRef(estado);
  useEffect(() => {
    if (estado !== anterior.current && estado.tipo === 'exito') toast.success(estado.mensaje);
    anterior.current = estado;
  }, [estado]);
}
