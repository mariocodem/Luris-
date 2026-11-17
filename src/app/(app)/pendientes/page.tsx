import { ClipboardCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  NOMBRES_DE_PLATAFORMA,
  type CodigoPlataforma,
} from '@/modules/plataformas/domain/plataforma';
import { nombreDeProceso } from '@/modules/procesos/domain/proceso';
import { Identificadores } from '@/modules/procesos/ui/lista-de-procesos';
import { formatearDia, formatearDiaYHora } from '@/shared/domain/fechas';
import { Button } from '@/shared/ui/components/button';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { EstadoVacio } from '@/shared/ui/components/estado-vacio';
import { casosDeUso } from '../../_servidor/peticion';
import { sesionDeLaPeticion } from '../../_servidor/sesion';

export const metadata: Metadata = { title: 'Pendientes de tu confirmación' };

// Depende de la sesión en cada petición.
export const instant = false;

/** Dónde se hace la consulta asistida de cada plataforma. */
const RUTA_ASISTIDA: Partial<Record<CodigoPlataforma, string>> = { SPOA: 'spoa' };

/**
 * Bandeja «Pendientes de tu confirmación» (§6): consultas en plataformas con reto (hoy el SPOA)
 * que LURIS no hace sola. Cada una se resuelve al guardar su consulta asistida.
 */
export default async function PaginaDePendientes() {
  const sesion = await sesionDeLaPeticion();
  const pendientes = await casosDeUso().listarPendientes(sesion);
  const lista = pendientes.ok ? pendientes.value : [];

  return (
    <>
      <Encabezado
        titulo="Pendientes de tu confirmación"
        descripcion="El SPOA de la Fiscalía pide resolver un reto en cada consulta, así que LURIS no puede consultarlo solo. Estos procesos esperan que hagas la consulta; LURIS guarda el resultado."
      />
      {!pendientes.ok ? (
        <p className="text-muted-foreground">{pendientes.error.mensajeUsuario}</p>
      ) : lista.length === 0 ? (
        <EstadoVacio
          icono={ClipboardCheck}
          titulo="No tienes consultas pendientes"
          descripcion="Cuando un proceso con NUNC lleve una semana sin consultarse en el SPOA, aparecerá aquí para que confirmes la consulta."
        />
      ) : (
        <section aria-labelledby="titulo-pendientes" className="flex flex-col gap-3">
          <h2 id="titulo-pendientes" className="sr-only">
            Consultas pendientes
          </h2>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            <span className="cifras">{lista.length}</span>{' '}
            {lista.length === 1 ? 'consulta pendiente' : 'consultas pendientes'}, las más antiguas
            primero.
          </p>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {lista.map((p) => {
              const ruta = RUTA_ASISTIDA[p.plataforma];
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between md:gap-6"
                >
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Link
                      href={`/procesos/${p.procesoId}`}
                      className="font-semibold text-pretty underline-offset-4 hover:underline"
                    >
                      {nombreDeProceso(p)}
                    </Link>
                    <Identificadores radicado={null} nunc={p.nunc} />
                    <p className="text-sm text-muted-foreground">
                      {NOMBRES_DE_PLATAFORMA[p.plataforma]} ·{' '}
                      {p.ultimaConsultaEn ? (
                        <>
                          última consulta el{' '}
                          <span className="cifras">{formatearDiaYHora(p.ultimaConsultaEn)}</span>
                        </>
                      ) : (
                        'aún sin consultar'
                      )}{' '}
                      · en la bandeja desde el{' '}
                      <span className="cifras">{formatearDia(p.creadoEn)}</span>
                    </p>
                  </div>
                  {ruta ? (
                    <Button size="lg" asChild className="self-start md:self-center">
                      <Link href={`/procesos/${p.procesoId}/${ruta}`}>
                        Consultar en {NOMBRES_DE_PLATAFORMA[p.plataforma]}
                      </Link>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
