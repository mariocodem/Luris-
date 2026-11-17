'use client';

import { CircleCheck, Download, FileSpreadsheet, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState, type ChangeEvent } from 'react';
import { Button } from '@/shared/ui/components/button';
import { TituloDeSeccion } from '@/shared/ui/components/encabezado';
import {
  IMPORTACION_INICIAL,
  type EstadoDeImportacion,
  type FilaDeVistaPrevia,
  type VistaPrevia,
} from './estado-de-importacion';

type Accion = (anterior: EstadoDeImportacion, formulario: FormData) => Promise<EstadoDeImportacion>;

const TAMANO_MAXIMO = 1_000_000;
const FILAS_DE_MUESTRA = 8;
const cifras = new Intl.NumberFormat('es-CO');

function Aviso({
  mensaje,
  codigoDeAyuda,
}: {
  readonly mensaje: string;
  readonly codigoDeAyuda?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      <p>{mensaje}</p>
      {codigoDeAyuda ? (
        <p className="mt-1 text-muted-foreground">
          Código de ayuda: <span className="font-mono font-medium">{codigoDeAyuda}</span>
        </p>
      ) : null}
    </div>
  );
}

function identificador(fila: FilaDeVistaPrevia): string {
  return [fila.radicado, fila.nunc].filter(Boolean).join(' · ');
}

/**
 * Asistente de importación: elegir archivo → revisar el resumen → importar. Nada se guarda hasta
 * confirmar. «Elegir otro archivo» reinicia el asistente.
 */
export function Importador({ accion }: { readonly accion: Accion }) {
  const [intento, setIntento] = useState(0);
  return <Pasos key={intento} accion={accion} reiniciar={() => setIntento((n) => n + 1)} />;
}

function Pasos({ accion, reiniciar }: { readonly accion: Accion; readonly reiniciar: () => void }) {
  const [estado, enviar, enviando] = useActionState(accion, IMPORTACION_INICIAL);

  if (estado.tipo === 'importado') {
    return (
      <section
        aria-live="polite"
        className="flex flex-col items-start gap-4 rounded-xl border border-border bg-card p-6"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-exito-suave text-exito">
          <CircleCheck className="size-5" aria-hidden />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="font-serif text-xl font-semibold">
            {estado.creados === 1
              ? 'Importamos 1 proceso'
              : `Importamos ${cifras.format(estado.creados)} procesos`}
          </h2>
          <p className="text-[0.9375rem] text-muted-foreground">
            {estado.omitidos > 0
              ? `${cifras.format(estado.omitidos)} ya estaban registrados y no se duplicaron.`
              : 'Ya aparecen en la lista de procesos.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" asChild>
            <Link href="/procesos">Ver procesos</Link>
          </Button>
          <Button size="lg" variant="ghost" onClick={reiniciar}>
            Importar otro archivo
          </Button>
        </div>
      </section>
    );
  }

  if (estado.tipo === 'vista-previa') {
    return (
      <Revision
        vista={estado.vista}
        error={estado.error}
        enviar={enviar}
        enviando={enviando}
        reiniciar={reiniciar}
      />
    );
  }

  return (
    <EleccionDeArchivo
      enviar={enviar}
      enviando={enviando}
      error={estado.tipo === 'error' ? estado : undefined}
    />
  );
}

function EleccionDeArchivo({
  enviar,
  enviando,
  error,
}: {
  readonly enviar: (formulario: FormData) => void;
  readonly enviando: boolean;
  readonly error?: { readonly mensaje: string; readonly codigoDeAyuda?: string };
}) {
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const alElegir = (evento: ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0];
    setNombre(archivo?.name ?? null);
    setErrorLocal(
      archivo && archivo.size > TAMANO_MAXIMO
        ? 'El archivo pesa más de 1 MB. Divídelo en varios archivos más pequeños.'
        : null,
    );
  };

  return (
    <form
      action={enviar}
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      {error ? <Aviso {...error} /> : null}
      <div className="flex flex-col gap-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
        <p>
          Sube un archivo de Excel (<span className="text-foreground">.xlsx</span>) o CSV con una
          fila por proceso. Si tiene encabezados, LURIS reconoce las columnas{' '}
          <span className="text-foreground">Radicado</span>,{' '}
          <span className="text-foreground">NUNC</span>,{' '}
          <span className="text-foreground">Alias</span>,{' '}
          <span className="text-foreground">Cliente</span> y{' '}
          <span className="text-foreground">Etiquetas</span>.
        </p>
        <p>
          Sin encabezados, pon el radicado o el NUNC en la primera columna; la segunda se usa como
          alias y la tercera como cliente. Los números pueden ir con o sin guiones. Hasta 1.000
          procesos por archivo.
        </p>
      </div>
      <a
        href="/procesos/importar/plantilla"
        download
        className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <Download className="size-4" aria-hidden />
        Descargar plantilla de ejemplo (CSV)
      </a>
      <div className="flex flex-col gap-1.5">
        <p id="archivo-etiqueta" className="text-sm font-medium">
          Archivo
        </p>
        {/* Selector propio: el nativo muestra textos del navegador que pueden no estar en español. */}
        <label className="flex h-10 cursor-pointer items-center overflow-hidden rounded-lg border border-input bg-background text-sm shadow-xs transition-colors hover:bg-muted/50 has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-aria-invalid:border-destructive">
          <input
            type="file"
            name="archivo"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            onChange={alElegir}
            aria-labelledby="archivo-etiqueta"
            aria-invalid={errorLocal ? true : undefined}
            aria-describedby={errorLocal ? 'archivo-nombre archivo-error' : 'archivo-nombre'}
            className="sr-only"
          />
          <span className="flex h-full shrink-0 items-center border-r border-input bg-muted px-4 font-medium text-foreground">
            Elegir archivo
          </span>
          <span id="archivo-nombre" className="min-w-0 truncate px-3 text-muted-foreground">
            {nombre ?? 'Ningún archivo elegido'}
          </span>
        </label>
        {errorLocal ? (
          <p id="archivo-error" className="text-sm text-destructive">
            {errorLocal}
          </p>
        ) : null}
      </div>
      <Button
        type="submit"
        size="lg"
        className="self-start"
        disabled={enviando || errorLocal !== null}
      >
        <FileSpreadsheet aria-hidden />
        {enviando ? 'Revisando el archivo…' : 'Revisar archivo'}
      </Button>
    </form>
  );
}

function Revision({
  vista,
  error,
  enviar,
  enviando,
  reiniciar,
}: {
  readonly vista: VistaPrevia;
  readonly error?: { readonly mensaje: string; readonly codigoDeAyuda?: string };
  readonly enviar: (formulario: FormData) => void;
  readonly enviando: boolean;
  readonly reiniciar: () => void;
}) {
  const nuevos = vista.nuevos.length;
  const resumen = [
    { texto: 'listos para importar', cantidad: nuevos, destacado: true },
    { texto: 'ya registrados (se omiten)', cantidad: vista.yaRegistrados.length },
    { texto: 'repetidos en el archivo', cantidad: vista.duplicados.length },
    { texto: 'con errores', cantidad: vista.errores.length },
  ].filter((r) => r.destacado || r.cantidad > 0);
  const confirmacion = JSON.stringify(
    vista.nuevos.map(({ radicado, nunc, alias, cliente, etiquetas }) => ({
      radicado,
      nunc,
      alias,
      cliente,
      etiquetas,
    })),
  );

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="titulo-resumen" className="flex flex-col gap-3">
        <TituloDeSeccion id="titulo-resumen" detalle={vista.nombreArchivo}>
          Revisa antes de importar
        </TituloDeSeccion>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6">
          <p className="text-[0.9375rem] text-muted-foreground" aria-live="polite">
            Leímos{' '}
            <span className="cifras text-foreground">{cifras.format(vista.filasConDatos)}</span>{' '}
            {vista.filasConDatos === 1 ? 'fila' : 'filas'} con datos.
          </p>
          <ul className="flex flex-col gap-1.5 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
            {resumen.map((r) => (
              <li key={r.texto}>
                <span
                  className={
                    r.destacado ? 'cifras font-semibold text-foreground' : 'cifras text-foreground'
                  }
                >
                  {cifras.format(r.cantidad)}
                </span>{' '}
                <span className="text-muted-foreground">{r.texto}</span>
              </li>
            ))}
          </ul>
          {error ? <Aviso {...error} /> : null}
          <form
            action={enviar}
            className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row"
          >
            <input type="hidden" name="procesos" value={confirmacion} />
            <Button type="submit" size="lg" disabled={enviando || nuevos === 0}>
              {enviando
                ? 'Importando…'
                : nuevos === 1
                  ? 'Importar 1 proceso'
                  : `Importar ${cifras.format(nuevos)} procesos`}
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={reiniciar} disabled={enviando}>
              <RotateCcw aria-hidden />
              Elegir otro archivo
            </Button>
          </form>
        </div>
      </section>

      {vista.errores.length > 0 || vista.duplicados.length > 0 ? (
        <section aria-labelledby="titulo-problemas" className="flex flex-col gap-3">
          <TituloDeSeccion id="titulo-problemas" detalle="No se importarán">
            Filas para revisar en el archivo
          </TituloDeSeccion>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3">
                    Fila
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Valor
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Qué pasa
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ...vista.errores.map((e) => ({
                    fila: e.fila,
                    valor: e.valor,
                    mensaje: e.mensaje,
                  })),
                  ...vista.duplicados.map((d) => ({
                    fila: d.fila,
                    valor: d.identificador,
                    mensaje: `Repetido: ya aparece en la fila ${d.primeraFila}.`,
                  })),
                ]
                  .sort((a, b) => a.fila - b.fila)
                  .map((p) => (
                    <tr key={`${p.fila}-${p.mensaje}`}>
                      <td className="cifras px-5 py-3 align-top">{p.fila}</td>
                      <td className="cifras max-w-[16rem] px-5 py-3 align-top break-all text-muted-foreground">
                        {p.valor || 'vacío'}
                      </td>
                      <td className="min-w-[16rem] px-5 py-3 align-top text-pretty">{p.mensaje}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {nuevos > 0 ? (
        <section aria-labelledby="titulo-muestra" className="flex flex-col gap-3">
          <TituloDeSeccion
            id="titulo-muestra"
            detalle={
              nuevos > FILAS_DE_MUESTRA
                ? `${FILAS_DE_MUESTRA} de ${cifras.format(nuevos)}`
                : undefined
            }
          >
            Procesos que se importarán
          </TituloDeSeccion>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {vista.nuevos.slice(0, FILAS_DE_MUESTRA).map((fila) => (
              <li
                key={fila.fila}
                className="flex flex-col gap-0.5 px-5 py-3 text-sm sm:flex-row sm:items-baseline sm:gap-4"
              >
                <span className="cifras shrink-0 break-all">{identificador(fila)}</span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {[fila.alias, fila.cliente].filter(Boolean).join(' · ') || 'Sin alias ni cliente'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
