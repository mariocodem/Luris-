'use client';

import { ExternalLink, ScanText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/components/button';
import { RadicadoCopiable } from '@/shared/ui/components/radicado-copiable';
import { SelloDeFecha } from '@/shared/ui/components/sello-de-fecha';
import { AvisoDeFormulario } from '@/shared/ui/components/aviso-de-formulario';
import type { EstadoDeFormulario } from '@/shared/ui/estado-de-formulario';
import type { VistaPreviaAsistida } from '../application/consulta-asistida';
import type { CodigoPlataforma } from '../domain/plataforma';

type Fallo = { readonly ok: false; readonly mensaje: string; readonly codigoDeAyuda?: string };

export interface AccionesDeConsultaAsistida {
  interpretar(
    procesoId: string,
    plataforma: CodigoPlataforma,
    texto: string,
  ): Promise<{ readonly ok: true; readonly vista: VistaPreviaAsistida } | Fallo>;
  confirmar(
    procesoId: string,
    plataforma: CodigoPlataforma,
    texto: string,
  ): Promise<{ readonly ok: true; readonly mensaje: string } | Fallo>;
}

/** Actuaciones que se muestran en la vista previa antes de «y N más». */
const ACTUACIONES_EN_LA_VISTA = 8;

/**
 * Consulta asistida (§6): la persona consulta en el portal oficial y resuelve el reto ella misma;
 * luego pega el resultado, revisa lo que LURIS entendió y lo guarda. LURIS nunca resuelve, evade
 * ni terceriza el reto.
 */
export function ConsultaAsistida({
  procesoId,
  plataforma,
  numero,
  nombreDelPortal,
  urlDelPortal,
  acciones,
}: {
  readonly procesoId: string;
  readonly plataforma: CodigoPlataforma;
  readonly numero: string;
  readonly nombreDelPortal: string;
  readonly urlDelPortal: string;
  readonly acciones: AccionesDeConsultaAsistida;
}) {
  const router = useRouter();
  const idTexto = useId();
  const [texto, setTexto] = useState('');
  const [vista, setVista] = useState<VistaPreviaAsistida | null>(null);
  const [estado, setEstado] = useState<EstadoDeFormulario>({ tipo: 'inicial' });
  const [leyendo, leer] = useTransition();
  const [guardando, guardar] = useTransition();

  function alFallar(respuesta: Fallo) {
    setEstado({
      tipo: 'error',
      mensaje: respuesta.mensaje,
      codigoDeAyuda: respuesta.codigoDeAyuda,
    });
  }

  function leerResultado() {
    leer(async () => {
      setEstado({ tipo: 'inicial' });
      const respuesta = await acciones.interpretar(procesoId, plataforma, texto);
      if (!respuesta.ok) {
        setVista(null);
        alFallar(respuesta);
        return;
      }
      setVista(respuesta.vista);
    });
  }

  function guardarResultado() {
    guardar(async () => {
      const respuesta = await acciones.confirmar(procesoId, plataforma, texto);
      if (!respuesta.ok) {
        alFallar(respuesta);
        return;
      }
      toast.success(respuesta.mensaje);
      router.push(`/procesos/${procesoId}`);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      <section aria-labelledby="titulo-portal" className="flex min-w-0 flex-col gap-4">
        <h2 id="titulo-portal" className="text-lg font-semibold tracking-[-0.01em]">
          1. Consulta en el portal de la Fiscalía
        </h2>
        <ol className="flex flex-col gap-3 text-sm leading-relaxed text-pretty">
          <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Copia el NUNC:</span>
            <RadicadoCopiable valor={numero} tipo="nunc" />
          </li>
          <li>
            En el portal, pégalo en «Número de denuncia», resuelve el reto y pulsa «Buscar». El reto
            lo resuelves tú: LURIS no lo resuelve por ti.
          </li>
          <li>
            Con el resultado en pantalla, haz clic sobre él, selecciona todo (Ctrl+A, o ⌘A en Mac) y
            cópialo (Ctrl+C).
          </li>
        </ol>
        <iframe
          src={urlDelPortal}
          title={nombreDelPortal}
          className="h-[38rem] w-full rounded-xl border border-border bg-card"
          referrerPolicy="no-referrer"
        />
        <p className="text-sm text-muted-foreground">
          ¿No carga o prefieres otra ventana?{' '}
          <a
            href={urlDelPortal}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
          >
            Abre el portal en una pestaña nueva
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </p>
      </section>

      <section aria-labelledby="titulo-resultado" className="flex min-w-0 flex-col gap-4">
        <h2 id="titulo-resultado" className="text-lg font-semibold tracking-[-0.01em]">
          2. Pega el resultado
        </h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idTexto} className="text-sm font-medium">
            Resultado copiado del portal
          </label>
          <textarea
            id={idTexto}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              if (vista) setVista(null);
            }}
            rows={9}
            spellCheck={false}
            placeholder="Pega aquí todo el texto del resultado…"
            aria-describedby={`${idTexto}-ayuda`}
            aria-invalid={estado.tipo === 'error' || undefined}
            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
          />
          <p id={`${idTexto}-ayuda`} className="text-sm text-muted-foreground">
            Antes de guardar, te mostramos lo que entendimos para que lo revises.
          </p>
        </div>
        <AvisoDeFormulario estado={estado} />
        {vista ? null : (
          <Button
            type="button"
            size="lg"
            onClick={leerResultado}
            disabled={leyendo || texto.trim() === ''}
            className="self-start"
          >
            <ScanText aria-hidden />
            {leyendo ? 'Leyendo…' : 'Leer resultado'}
          </Button>
        )}

        {vista ? (
          <VistaPrevia
            vista={vista}
            guardando={guardando}
            alGuardar={guardarResultado}
            alCorregir={() => setVista(null)}
          />
        ) : null}
      </section>
    </div>
  );
}

function VistaPrevia({
  vista,
  guardando,
  alGuardar,
  alCorregir,
}: {
  readonly vista: VistaPreviaAsistida;
  readonly guardando: boolean;
  readonly alGuardar: () => void;
  readonly alCorregir: () => void;
}) {
  const total = vista.actuaciones.length;
  const resumen = vista.primeraConsulta
    ? `${total} ${total === 1 ? 'actuación' : 'actuaciones'}: se guardarán como la historia del proceso.`
    : vista.nuevas > 0
      ? `${total} ${total === 1 ? 'actuación' : 'actuaciones'}, ${vista.nuevas} ${vista.nuevas === 1 ? 'nueva' : 'nuevas'}.`
      : `${total} ${total === 1 ? 'actuación' : 'actuaciones'}, ninguna nueva.`;
  const visibles = vista.actuaciones.slice(0, ACTUACIONES_EN_LA_VISTA);

  return (
    <section
      aria-labelledby="titulo-vista"
      aria-live="polite"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"
    >
      <div className="flex flex-col gap-1">
        <h3 id="titulo-vista" className="font-semibold">
          Esto es lo que leímos
        </h3>
        <p className="text-sm text-muted-foreground">{resumen}</p>
      </div>

      {vista.expediente ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          {vista.expediente.despachoJudicial ? (
            <>
              <dt className="text-muted-foreground">Despacho</dt>
              <dd className="text-pretty">{vista.expediente.despachoJudicial}</dd>
            </>
          ) : null}
          {vista.expediente.detalles.slice(0, 4).map((d) => (
            <div key={d.etiqueta} className="contents">
              <dt className="text-muted-foreground">{d.etiqueta}</dt>
              <dd className="text-pretty">{d.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {total > 0 ? (
        <ol className="flex flex-col divide-y divide-border border-y border-border">
          {visibles.map((a) => (
            <li
              key={a.idExterno ?? `${a.fechaActuacion}-${a.descripcion}`}
              className="flex items-center gap-3 py-2.5"
            >
              <SelloDeFecha etiqueta="Actuación" fecha={a.fechaActuacion} className="shrink-0" />
              <span className="min-w-0 text-sm font-medium text-pretty">{a.descripcion}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          El resultado no tiene actuaciones públicas (las reservadas no aparecen en el portal).
        </p>
      )}
      {total > visibles.length ? (
        <p className="text-sm text-muted-foreground">
          y <span className="cifras">{total - visibles.length}</span> más.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" onClick={alGuardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar en LURIS'}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={alCorregir} disabled={guardando}>
          Corregir el texto
        </Button>
      </div>
    </section>
  );
}
