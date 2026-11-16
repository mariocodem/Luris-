'use client';

import { toast } from 'sonner';
import { Button } from '@/shared/ui/components/button';

export function BotonesDeAviso() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => toast.success('Rol actualizado.')}>
        Aviso de éxito
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.warning('3 procesos esperan tu confirmación', {
            description: 'SPOA pide que resuelvas el reto de la plataforma.',
          })
        }
      >
        Aviso de alerta
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.error('La plataforma SAMAI no está respondiendo ahora', {
            description: 'Volveremos a intentar automáticamente en 15 minutos.',
          })
        }
      >
        Aviso de error
      </Button>
    </div>
  );
}
