'use client';

import { MessageCircle, Unlink } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/components/button';
import { formatearNumeroWhatsapp } from '../domain/frecuencias';
import { ADVERTENCIAS_DE_WHATSAPP } from '../domain/whatsapp';

export interface EstadoDeVinculacion {
  readonly estado: 'SIN_VINCULAR' | 'VINCULANDO' | 'CONECTADA' | 'DESCONECTADA';
  readonly disponible: boolean;
  readonly numero: string | null;
  readonly qr: readonly string[] | null;
  readonly sinRespuesta: boolean;
}

type Respuesta =
  | { readonly ok: true; readonly estado: EstadoDeVinculacion }
  | { readonly ok: false; readonly mensaje: string; readonly codigoDeAyuda?: string };

export interface AccionesDeVinculacion {
  estado(): Promise<Respuesta>;
  vincular(): Promise<Respuesta>;
  desvincular(): Promise<Respuesta>;
}

const ESPERA_MS = 2_000;
const MARGEN_DEL_QR = 4;

/** Dibuja el QR como un solo trazado SVG: sin imágenes externas ni HTML inyectado. */
function CodigoQr({ filas }: { readonly filas: readonly string[] }) {
  const tamano = filas.length;
  const trazado = filas
    .flatMap((fila, y) =>
      [...fila].flatMap((modulo, x) =>
        modulo === '1' ? [`M${x + MARGEN_DEL_QR} ${y + MARGEN_DEL_QR}h1v1h-1z`] : [],
      ),
    )
    .join('');
  const lado = tamano + MARGEN_DEL_QR * 2;
  return (
    <svg
      role="img"
      aria-label="Código QR para vincular WhatsApp"
      viewBox={`0 0 ${lado} ${lado}`}
      shapeRendering="crispEdges"
      className="size-64 max-w-full rounded-lg border border-border bg-white"
    >
      <path d={trazado} fill="#000" />
    </svg>
  );
}

/**
 * Vinculación del WhatsApp del despacho (§9): el administrador pide vincular, LURIS muestra un QR
 * (lo genera el worker) y lo escanea con el WhatsApp del número dedicado. Mientras se espera, lee
 * el estado cada pocos segundos. Siempre muestra las advertencias de usar una librería no oficial.
 */
export function VinculacionDeWhatsapp({
  inicial,
  acciones,
}: {
  readonly inicial: EstadoDeVinculacion;
  readonly acciones: AccionesDeVinculacion;
}) {
  const [estado, setEstado] = useState(inicial);
  const [ocupado, iniciar] = useTransition();

  useEffect(() => {
    if (estado.estado !== 'VINCULANDO') return;
    let activo = true;
    const temporizador = setInterval(() => {
      void acciones
        .estado()
        .then((respuesta) => {
          if (!activo || !respuesta.ok) return;
          const anterior = estado.estado;
          setEstado(respuesta.estado);
          if (anterior === 'VINCULANDO' && respuesta.estado.estado === 'CONECTADA') {
            toast.success('WhatsApp quedó vinculado');
          }
        })
        .catch(() => undefined);
    }, ESPERA_MS);
    return () => {
      activo = false;
      clearInterval(temporizador);
    };
  }, [acciones, estado.estado]);

  function ejecutar(accion: () => Promise<Respuesta>) {
    iniciar(async () => {
      const respuesta = await accion();
      if (respuesta.ok) setEstado(respuesta.estado);
      else {
        toast.error(respuesta.mensaje, {
          description: respuesta.codigoDeAyuda
            ? `Código de ayuda: ${respuesta.codigoDeAyuda}`
            : undefined,
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="titulo-advertencias"
        className="flex flex-col gap-2 rounded-xl border border-border bg-alerta-suave px-5 py-4"
      >
        <h2 id="titulo-advertencias" className="text-sm font-semibold">
          Antes de vincular, ten en cuenta
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {ADVERTENCIAS_DE_WHATSAPP.map((texto) => (
            <li key={texto}>{texto}</li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="titulo-estado"
        aria-live="polite"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6"
      >
        <h2 id="titulo-estado" className="text-base font-semibold">
          {estado.estado === 'CONECTADA'
            ? 'WhatsApp está vinculado'
            : estado.estado === 'DESCONECTADA'
              ? 'WhatsApp está desconectado'
              : estado.estado === 'VINCULANDO'
                ? 'Escanea el código con WhatsApp'
                : 'WhatsApp no está vinculado'}
        </h2>

        {!estado.disponible ? (
          <p role="alert" className="text-sm text-destructive">
            Este servidor no tiene configurada la clave para guardar la sesión de forma cifrada.
            Pide a quien instaló LURIS que la configure antes de vincular WhatsApp.
          </p>
        ) : null}

        {estado.estado === 'CONECTADA' || estado.estado === 'DESCONECTADA' ? (
          <p className="text-sm text-muted-foreground">
            {estado.numero ? `Número ${formatearNumeroWhatsapp(estado.numero)}. ` : ''}
            {estado.estado === 'CONECTADA'
              ? 'Los avisos de quienes lo aceptaron salen por este número.'
              : 'LURIS se reconecta sola; mientras tanto, los avisos esperan y se reintentan.'}
          </p>
        ) : null}

        {estado.estado === 'VINCULANDO' ? (
          <div className="flex flex-col gap-3">
            {estado.qr ? (
              <>
                <CodigoQr filas={estado.qr} />
                <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
                  <li>Abre WhatsApp en el teléfono del número dedicado.</li>
                  <li>Ve a Ajustes → Dispositivos vinculados → Vincular un dispositivo.</li>
                  <li>Apunta la cámara a este código. Se renueva solo cada pocos segundos.</li>
                </ol>
              </>
            ) : estado.sinRespuesta ? (
              <p role="alert" className="text-sm text-destructive">
                WhatsApp está tardando en responder. Revisa que el servicio de segundo plano de
                LURIS esté en marcha y vuelve a intentarlo.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Preparando el código…</p>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {estado.estado === 'CONECTADA' || estado.estado === 'DESCONECTADA' ? (
            <Button
              type="button"
              variant="outline"
              disabled={ocupado}
              onClick={() => ejecutar(acciones.desvincular)}
            >
              <Unlink aria-hidden />
              {ocupado ? 'Desvinculando…' : 'Desvincular WhatsApp'}
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              disabled={ocupado || !estado.disponible}
              onClick={() => ejecutar(acciones.vincular)}
            >
              <MessageCircle aria-hidden />
              {estado.estado === 'VINCULANDO'
                ? 'Generar un código nuevo'
                : ocupado
                  ? 'Preparando…'
                  : 'Vincular WhatsApp'}
            </Button>
          )}
          {estado.estado === 'VINCULANDO' ? (
            <Button
              type="button"
              variant="ghost"
              disabled={ocupado}
              onClick={() => ejecutar(acciones.desvincular)}
            >
              Cancelar
            </Button>
          ) : null}
        </div>
        {estado.estado === 'CONECTADA' || estado.estado === 'DESCONECTADA' ? (
          <p className="text-sm text-muted-foreground">
            Al desvincular, LURIS cierra la sesión y borra sus claves. También puedes quitar el
            dispositivo desde WhatsApp → Dispositivos vinculados.
          </p>
        ) : null}
      </section>
    </div>
  );
}
