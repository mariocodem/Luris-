'use client';

import { ListChecks, RotateCcw, Search } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState, type ChangeEvent } from 'react';
import { Button } from '@/shared/ui/components/button';
import { TituloDeSeccion } from '@/shared/ui/components/encabezado';
import type { VistaPreviaDeConsultaMasiva } from '../application/consulta-masiva';
import { NOMBRE_EN_FRASE } from '../domain/plataforma';
import { CONSULTA_MASIVA_INICIAL, type EstadoDeConsultaMasiva } from './estado-de-consulta-masiva';

type Accion = (
  anterior: EstadoDeConsultaMasiva,
  formulario: FormData,
) => Promise<EstadoDeConsultaMasiva>;

const TAMANO_MAXIMO = 1_000_000;
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

/**
 * Asistente de consulta masiva: pegar o subir los números → revisar el resumen → consultar.
 * Nada se consulta ni se registra hasta confirmar. «Empezar de nuevo» reinicia el asistente.
 */
export function FormularioDeConsultaMasiva({ accion }: { readonly accion: Accion }) {
  const [intento, setIntento] = useState(0);
  return <Pasos key={intento} accion={accion} reiniciar={() => setIntento((n) => n + 1)} />;
}

function Pasos({ accion, reiniciar }: { readonly accion: Accion; readonly reiniciar: () => void }) {
  const [estado, enviar, enviando] = useActionState(accion, CONSULTA_MASIVA_INICIAL);

  if (estado.tipo === 'vista-previa') {
    return (
      <Revision
        vista={estado.vista}
        origen={estado.origen}
        error={estado.error}
        enviar={enviar}
        enviando={enviando}
        reiniciar={reiniciar}
      />
    );
  }
  return (
    <Entrada
      enviar={enviar}
      enviando={enviando}
      error={estado.tipo === 'error' ? estado : undefined}
    />
  );
}

function Entrada({
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="texto-masivo" className="text-sm font-medium">
          Radicados o NUNC
        </label>
        <textarea
          id="texto-masivo"
          name="texto"
          rows={8}
          spellCheck={false}
          autoComplete="off"
          placeholder={'50001-40-03-001-2021-00343-00\n11001310300120230012300'}
          aria-describedby="ayuda-texto-masivo"
          className="min-h-40 w-full rounded-lg border border-input bg-background px-3 py-2.5 font-mono text-base shadow-xs transition-colors outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
        />
        <p id="ayuda-texto-masivo" className="text-sm text-muted-foreground">
          Uno o varios por línea, con o sin guiones. Un radicado tiene 23 números; un NUNC del SPOA,
          21. Hasta 400 procesos por consulta.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <p id="archivo-masivo-etiqueta" className="text-sm font-medium">
          O sube un archivo <span className="font-normal text-muted-foreground">(opcional)</span>
        </p>
        {/* Selector propio: el nativo muestra textos del navegador que pueden no estar en español. */}
        <label className="flex h-10 cursor-pointer items-center overflow-hidden rounded-lg border border-input bg-background text-sm shadow-xs transition-colors hover:bg-muted/50 has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
          <input
            type="file"
            name="archivo"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={alElegir}
            aria-labelledby="archivo-masivo-etiqueta"
            aria-invalid={errorLocal ? true : undefined}
            aria-describedby={
              errorLocal ? 'archivo-masivo-nombre archivo-masivo-error' : 'archivo-masivo-nombre'
            }
            className="sr-only"
          />
          <span className="flex h-full shrink-0 items-center border-r border-input bg-muted px-4 font-medium text-foreground">
            Elegir archivo
          </span>
          <span id="archivo-masivo-nombre" className="min-w-0 truncate px-3 text-muted-foreground">
            {nombre ?? 'Excel (.xlsx) o CSV con los números'}
          </span>
        </label>
        {errorLocal ? (
          <p id="archivo-masivo-error" className="text-sm text-destructive">
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
        <Search aria-hidden />
        {enviando ? 'Revisando la lista…' : 'Revisar lista'}
      </Button>
    </form>
  );
}

function Cifra({
  cantidad,
  texto,
  destacado = false,
}: {
  readonly cantidad: number;
  readonly texto: string;
  readonly destacado?: boolean;
}) {
  return (
    <li>
      <span
        className={destacado ? 'cifras font-semibold text-foreground' : 'cifras text-foreground'}
      >
        {cifras.format(cantidad)}
      </span>{' '}
      <span className="text-muted-foreground">{texto}</span>
    </li>
  );
}

function Revision({
  vista,
  origen,
  error,
  enviar,
  enviando,
  reiniciar,
}: {
  readonly vista: VistaPreviaDeConsultaMasiva;
  readonly origen: string;
  readonly error?: { readonly mensaje: string; readonly codigoDeAyuda?: string };
  readonly enviar: (formulario: FormData) => void;
  readonly enviando: boolean;
  readonly reiniciar: () => void;
}) {
  const total = vista.procesos.length;
  const sobrepasa = vista.sobrante > 0;
  const asistidos = vista.procesos.filter((p) => p.plataformas.some((x) => x.modo === 'ASISTIDA'));
  const confirmacion = JSON.stringify(vista.procesos.map((p) => p.identificador));
  const plataformas = [
    ...new Set(vista.procesos.flatMap((p) => p.plataformas.map((x) => x.plataforma))),
  ];

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="titulo-resumen" className="flex flex-col gap-3">
        <TituloDeSeccion id="titulo-resumen" detalle={origen}>
          Revisa antes de consultar
        </TituloDeSeccion>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6">
          <p className="text-[0.9375rem] text-pretty" aria-live="polite">
            <span className="cifras font-semibold">{cifras.format(total)}</span>{' '}
            {total === 1 ? 'proceso válido' : 'procesos válidos'}
            {vista.totalErrores > 0 ? (
              <>
                , <span className="cifras font-semibold">{cifras.format(vista.totalErrores)}</span>{' '}
                con {vista.totalErrores === 1 ? 'error' : 'errores'}
              </>
            ) : null}
            .
          </p>
          <ul className="flex flex-col gap-1.5 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
            <Cifra cantidad={vista.consultas} texto="consultas por hacer" destacado />
            {vista.nuevos > 0 ? (
              <Cifra cantidad={vista.nuevos} texto="se registrarán en Procesos" />
            ) : null}
            {vista.procesos.length - vista.nuevos > 0 ? (
              <Cifra cantidad={vista.procesos.length - vista.nuevos} texto="ya registrados" />
            ) : null}
            {vista.repetidos > 0 ? (
              <Cifra cantidad={vista.repetidos} texto="repetidos (se consultan una vez)" />
            ) : null}
            {vista.excluidos.length > 0 ? (
              <Cifra cantidad={vista.excluidos.length} texto="no se pueden consultar" />
            ) : null}
          </ul>
          {plataformas.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Se consultará {plataformas.map((p) => NOMBRE_EN_FRASE[p]).join(', ')}. Puedes cerrar
              la página: la consulta sigue y verás el resultado al volver.
            </p>
          ) : null}
          {asistidos.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {asistidos.length === 1
                ? '1 número es NUNC del SPOA: la Fiscalía pide resolver una verificación, así que queda en '
                : `${cifras.format(asistidos.length)} números son NUNC del SPOA: la Fiscalía pide resolver una verificación, así que quedan en `}
              <Link href="/pendientes" className="text-primary underline-offset-4 hover:underline">
                Pendientes de tu confirmación
              </Link>
              .
            </p>
          ) : null}
          {sobrepasa ? (
            <Aviso
              mensaje={`La lista tiene ${cifras.format(total)} procesos y el máximo por consulta es ${cifras.format(vista.maximo)}. Quita ${cifras.format(vista.sobrante)} o divídela en dos.`}
            />
          ) : null}
          {error ? <Aviso {...error} /> : null}
          <form
            action={enviar}
            className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row"
          >
            <input type="hidden" name="identificadores" value={confirmacion} />
            <Button type="submit" size="lg" disabled={enviando || total === 0 || sobrepasa}>
              <ListChecks aria-hidden />
              {enviando
                ? 'Iniciando la consulta…'
                : total === 1
                  ? 'Consultar 1 proceso'
                  : `Consultar ${cifras.format(total)} procesos`}
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={reiniciar} disabled={enviando}>
              <RotateCcw aria-hidden />
              Empezar de nuevo
            </Button>
          </form>
        </div>
      </section>

      {vista.errores.length > 0 || vista.excluidos.length > 0 ? (
        <section aria-labelledby="titulo-problemas" className="flex flex-col gap-3">
          <TituloDeSeccion id="titulo-problemas" detalle="No se consultarán">
            Para revisar en tu lista
          </TituloDeSeccion>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3">
                    Línea
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
                {vista.errores.map((e) => (
                  <tr key={`${e.linea}-${e.texto}`}>
                    <td className="cifras px-5 py-3 align-top">{e.linea}</td>
                    <td className="cifras max-w-[16rem] px-5 py-3 align-top break-all text-muted-foreground">
                      {e.texto}
                    </td>
                    <td className="min-w-[16rem] px-5 py-3 align-top text-pretty">{e.mensaje}</td>
                  </tr>
                ))}
                {vista.excluidos.map((e) => (
                  <tr key={e.identificador}>
                    <td className="px-5 py-3 align-top text-muted-foreground">—</td>
                    <td className="cifras max-w-[16rem] px-5 py-3 align-top break-all text-muted-foreground">
                      {e.identificador}
                    </td>
                    <td className="min-w-[16rem] px-5 py-3 align-top text-pretty">{e.mensaje}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {vista.totalErrores > vista.errores.length ? (
            <p className="text-sm text-muted-foreground">
              Mostramos los primeros {vista.errores.length} de {cifras.format(vista.totalErrores)}{' '}
              errores.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
