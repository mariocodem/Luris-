'use client';

import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/shared/ui/components/button';

const esquemaRespuesta = z.object({
  ok: z.boolean(),
  mensaje: z.string(),
  codigoDeAyuda: z.string().optional(),
});

const NO_SE_PUDO = 'No pudimos subir el documento. Revisa tu conexión e inténtalo de nuevo.';

/** Formatos que admite LURIS (el tipo real se valida en el servidor). */
const FORMATOS = '.pdf,.png,.jpg,.jpeg,.tif,.tiff,.doc,.docx,.xls,.xlsx,.rtf';

/**
 * «Agregar documento» de una actuación: elige un archivo y lo sube. Para los documentos que la
 * plataforma solo entrega tras un reto (p. ej. SAMAI), que la persona descarga allí.
 */
export function AgregarDocumento({
  procesoId,
  actuacionId,
}: {
  readonly procesoId: string;
  readonly actuacionId: string;
}) {
  const router = useRouter();
  const idCampo = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);

  async function subir(archivo: File) {
    setSubiendo(true);
    try {
      const datos = new FormData();
      datos.set('archivo', archivo);
      const respuesta = await fetch(
        `/api/procesos/${procesoId}/actuaciones/${actuacionId}/documentos`,
        { method: 'POST', body: datos },
      );
      const cuerpo = esquemaRespuesta.safeParse(await respuesta.json().catch(() => null));
      if (!cuerpo.success) {
        toast.error(NO_SE_PUDO);
      } else if (cuerpo.data.ok) {
        toast.success(cuerpo.data.mensaje);
        router.refresh();
      } else {
        toast.error(cuerpo.data.mensaje, {
          description: cuerpo.data.codigoDeAyuda
            ? `Código de ayuda: ${cuerpo.data.codigoDeAyuda}`
            : undefined,
        });
      }
    } catch {
      toast.error(NO_SE_PUDO);
    } finally {
      setSubiendo(false);
      if (campo.current) campo.current.value = '';
    }
  }

  return (
    <span className="inline-flex">
      <input
        ref={campo}
        id={idCampo}
        type="file"
        accept={FORMATOS}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) void subir(archivo);
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={subiendo}
        onClick={() => campo.current?.click()}
        className="-ml-2.5 text-primary"
      >
        <Upload aria-hidden />
        {subiendo ? 'Subiendo…' : 'Agregar documento'}
      </Button>
    </span>
  );
}
