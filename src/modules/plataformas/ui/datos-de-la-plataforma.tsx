import { ExternalLink, Lock } from 'lucide-react';
import { formatearFechaOficial } from '@/shared/domain/fechas';
import type { ExpedienteExterno } from '../domain/consulta';
import {
  type CodigoPlataforma,
  NOMBRE_EN_FRASE,
  NOMBRES_DE_PLATAFORMA,
  NOTA_SOBRE_LOS_DATOS,
} from '../domain/plataforma';

/**
 * Datos del proceso tal como los informa la plataforma: despacho judicial, clase, ponente,
 * ubicación y partes. Se muestran como los escribe la plataforma (es el dato oficial).
 */
export function DatosDeLaPlataforma({
  plataforma,
  expedientes,
}: {
  readonly plataforma: CodigoPlataforma;
  readonly expedientes: readonly ExpedienteExterno[];
}) {
  const [principal, ...otros] = expedientes;
  if (!principal) return null;
  const nota = NOTA_SOBRE_LOS_DATOS[plataforma];
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <Expediente expediente={principal} plataforma={plataforma} />
      {nota ? (
        <p className="max-w-[68ch] border-t border-border pt-4 text-sm text-pretty text-muted-foreground">
          {nota}
        </p>
      ) : null}
      {otros.map((expediente) => (
        <details key={expediente.idExterno} className="group border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-medium text-primary underline-offset-4 hover:underline">
            Otro registro de este radicado en {NOMBRE_EN_FRASE[plataforma]}
          </summary>
          <div className="pt-4">
            <Expediente expediente={expediente} plataforma={plataforma} />
          </div>
        </details>
      ))}
    </div>
  );
}

function Expediente({
  expediente,
  plataforma,
}: {
  readonly expediente: ExpedienteExterno;
  readonly plataforma: CodigoPlataforma;
}) {
  const clase = [expediente.claseProceso, expediente.subclaseProceso]
    .filter((v) => v && !/^sin subclase/i.test(v) && !/^en general/i.test(v))
    .join(' · ');
  const filas: readonly (readonly [string, string | null])[] = [
    ['Clase', clase || null],
    ['Tipo', expediente.tipoProceso],
    ['Ponente', expediente.ponente],
    [
      'Recurso',
      expediente.recurso && !/^sin tipo/i.test(expediente.recurso) ? expediente.recurso : null,
    ],
    ['Ubicación', expediente.ubicacion],
    [
      'Radicado el',
      expediente.fechaRadicacion ? formatearFechaOficial(expediente.fechaRadicacion) : null,
    ],
  ];
  const visibles = [
    ...filas.filter((fila): fila is readonly [string, string] => fila[1] !== null),
    ...expediente.detalles.map((d) => [d.etiqueta, d.valor] as const),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-pretty">
          {expediente.despachoJudicial ?? 'Despacho judicial sin informar'}
        </p>
        {expediente.departamento ? (
          <p className="text-sm text-muted-foreground">{expediente.departamento}</p>
        ) : null}
      </div>

      {expediente.reservado ? (
        <p className="flex items-start gap-2 text-sm text-pretty text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Proceso reservado: {NOMBRE_EN_FRASE[plataforma]} no publica sus actuaciones. Consúltalas
          directamente con el juzgado.
        </p>
      ) : null}

      {visibles.length > 0 ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
          {visibles.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="contents">
              <dt className="text-muted-foreground">{etiqueta}</dt>
              <dd
                className={
                  /^(Radicado|Asignado) el$|^Fecha /.test(etiqueta) ? 'cifras' : 'text-pretty'
                }
              >
                {valor}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {expediente.urlDeConsulta ? (
        <a
          href={expediente.urlDeConsulta}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Ver el proceso en {NOMBRES_DE_PLATAFORMA[plataforma]}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      ) : null}

      {expediente.sujetos.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Partes</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {expediente.sujetos.map((sujeto, i) => (
              <li key={`${sujeto.tipo}-${sujeto.nombre}-${i}`} className="text-pretty">
                <span className="text-muted-foreground">{sujeto.tipo}:</span> {sujeto.nombre}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
