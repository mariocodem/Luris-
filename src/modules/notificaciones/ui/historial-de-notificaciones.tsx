import { Mail, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { cn } from 'cn';
import { etiquetaDeOrigen } from '@/modules/plataformas/domain/tyba';
import { formatearDiaYHora } from '@/shared/domain/fechas';
import { RadicadoCopiable } from '@/shared/ui/components/radicado-copiable';
import { SelloDeFecha } from '@/shared/ui/components/sello-de-fecha';
import type { NotificacionDeLaPersona } from '../application/puertos';
import { nombreDelProcesoAvisado } from '../domain/aviso';
import { mensajeDeEstadoDeAviso } from '../domain/notificador';

const CLASES_DE_ESTADO = {
  ENVIADA: 'bg-exito-suave text-exito',
  PENDIENTE: 'bg-secondary text-secondary-foreground',
  FALLIDA: 'bg-error-suave text-destructive',
} as const;

const ETIQUETA_DE_ESTADO = {
  ENVIADA: 'Enviada',
  PENDIENTE: 'En cola',
  FALLIDA: 'No enviada',
} as const;

/**
 * Los avisos recientes de la persona: qué actuación, con las dos fechas oficiales de la
 * plataforma (§1.4), por qué canal y cómo quedó. La fecha en que LURIS la detectó no se muestra.
 */
export function HistorialDeNotificaciones({
  avisos,
}: {
  readonly avisos: readonly NotificacionDeLaPersona[];
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {avisos.map((aviso) => {
        const Icono = aviso.canal === 'WHATSAPP' ? MessageCircle : Mail;
        return (
          <li
            key={aviso.id}
            className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between md:gap-6"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <Link
                href={`/procesos/${aviso.proceso.procesoId}`}
                className="truncate text-sm font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                {nombreDelProcesoAvisado(aviso.proceso)}
              </Link>
              {aviso.proceso.radicado ? <RadicadoCopiable valor={aviso.proceso.radicado} /> : null}
              {aviso.proceso.nunc ? (
                <RadicadoCopiable valor={aviso.proceso.nunc} tipo="nunc" />
              ) : null}
              <p className="text-sm text-pretty">{aviso.actuacion.descripcion}</p>
              <p className="text-sm text-muted-foreground">
                {etiquetaDeOrigen(aviso.actuacion.plataforma, aviso.actuacion.origen)}
                {aviso.actuacion.tieneDocumentos ? ' · Tiene documentos' : ''}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <SelloDeFecha etiqueta="Actuación" fecha={aviso.actuacion.fechaActuacion} />
                {aviso.actuacion.fechaRegistro ? (
                  <SelloDeFecha etiqueta="Registro" fecha={aviso.actuacion.fechaRegistro} />
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5 md:items-end">
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Icono className="size-4" aria-hidden />
                {aviso.canal === 'WHATSAPP' ? 'WhatsApp' : 'Correo'}
              </span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                  CLASES_DE_ESTADO[aviso.estado],
                )}
              >
                {ETIQUETA_DE_ESTADO[aviso.estado]}
              </span>
              <p className="max-w-64 text-sm text-muted-foreground md:text-right">
                {aviso.estado === 'ENVIADA' && aviso.enviadaEn
                  ? `El ${formatearDiaYHora(aviso.enviadaEn)}`
                  : mensajeDeEstadoDeAviso(aviso.estado, aviso.codigoError)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
