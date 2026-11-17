import { type FechaOficial, formatearFechaOficial, leerFechaOficial } from '@/shared/domain/fechas';
import { hashEstable, limpiarTexto } from '../../domain/actuaciones';
import type {
  ActuacionExterna,
  DetalleDeExpediente,
  ResultadoConsulta,
} from '../../domain/consulta';

/**
 * Lo que el SPOA (Fiscalía) informa de una noticia criminal: los campos no reservados que muestra
 * su portal «Consulta su denuncia» (ver docs/plataformas/spoa.md). Es el modelo común de las dos
 * vías: la consulta asistida (texto que pega la persona) y el servicio oficial de
 * interoperabilidad, cuando exista.
 */
export interface RegistroSpoa {
  /** Número de la noticia criminal (solo dígitos). */
  readonly noticia: string;
  readonly estado: string | null;
  readonly etapa: string | null;
  readonly ley: string | null;
  readonly departamentoHechos: string | null;
  readonly municipioHechos: string | null;
  readonly fechaHechos: FechaOficial | null;
  readonly seccional: string | null;
  readonly unidad: string | null;
  readonly despacho: string | null;
  readonly fechaAsignacion: FechaOficial | null;
  readonly departamentoDespacho: string | null;
  readonly municipioDespacho: string | null;
  readonly direccion: string | null;
  readonly correo: string | null;
  readonly telefonos: string | null;
  readonly delitos: readonly { readonly delito: string; readonly grado: string | null }[];
  readonly actuaciones: readonly { readonly fecha: FechaOficial; readonly nombre: string }[];
}

/** El portal escribe «Ninguno» donde no hay dato. */
export function valorSpoa(texto: string | null | undefined): string | null {
  const limpio = limpiarTexto(texto);
  return limpio && !/^ninguno$/i.test(limpio) ? limpio : null;
}

/**
 * Fecha del SPOA. Acepta día/mes/año (con / o -) y año-mes-día, con o sin hora: el formato exacto
 * del portal no está documentado, así que se aceptan las formas habituales.
 */
export function leerFechaSpoa(texto: string | null | undefined): FechaOficial | null {
  const limpio = texto?.trim() ?? '';
  const dma = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T][\d:.]+(?:\s*[ap]\.?\s*m\.?)?)?$/i.exec(
    limpio,
  );
  if (dma) {
    const [, dia, mes, anio] = dma;
    return leerFechaOficial(`${anio}-${mes?.padStart(2, '0')}-${dia?.padStart(2, '0')}`);
  }
  const amd = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T][\d:.]+)?$/.exec(limpio);
  if (amd) {
    const [, anio, mes, dia] = amd;
    return leerFechaOficial(`${anio}-${mes?.padStart(2, '0')}-${dia?.padStart(2, '0')}`);
  }
  return null;
}

function lugar(municipio: string | null, departamento: string | null): string | null {
  const partes = [municipio, departamento].filter((p): p is string => p !== null);
  return partes.length > 0 ? partes.join(', ') : null;
}

function detalles(registro: RegistroSpoa): DetalleDeExpediente[] {
  const delitos = registro.delitos
    .map((d) => (d.grado ? `${d.delito} (${d.grado.toLowerCase()})` : d.delito))
    .join('; ');
  const filas: readonly (readonly [string, string | null])[] = [
    ['Estado', registro.estado],
    ['Etapa', registro.etapa],
    ['Delitos', delitos || null],
    ['Ley', registro.ley],
    [
      'Fecha de los hechos',
      registro.fechaHechos ? formatearFechaOficial(registro.fechaHechos) : null,
    ],
    ['Lugar de los hechos', lugar(registro.municipioHechos, registro.departamentoHechos)],
    ['Seccional', registro.seccional],
    ['Unidad', registro.unidad],
    [
      'Asignado el',
      registro.fechaAsignacion ? formatearFechaOficial(registro.fechaAsignacion) : null,
    ],
    ['Dirección', registro.direccion],
    ['Teléfonos', registro.telefonos],
    ['Correo', registro.correo],
  ];
  return filas.flatMap(([etiqueta, valor]) => (valor ? [{ etiqueta, valor }] : []));
}

/**
 * El SPOA no da identificador de actuación: se arma uno estable con la fecha, el nombre y el
 * orden entre las iguales (dos «ASIGNACION» el mismo día son dos actuaciones distintas).
 */
function actuaciones(registro: RegistroSpoa): ActuacionExterna[] {
  const vistas = new Map<string, number>();
  return registro.actuaciones.map(({ fecha, nombre }) => {
    const base = `spoa:${fecha}:${hashEstable(nombre)}`;
    const ocurrencia = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, ocurrencia);
    return {
      idExterno: `${base}:${ocurrencia}`,
      expediente: registro.noticia,
      despachoJudicial: registro.despacho,
      fechaActuacion: fecha,
      fechaRegistro: null,
      descripcion: nombre,
      anotacion: null,
      terminoInicia: null,
      terminoVence: null,
      tieneDocumentos: false,
    };
  });
}

export function aResultadoConsulta(registro: RegistroSpoa): ResultadoConsulta {
  const lista = actuaciones(registro);
  const ultima = lista.reduce<FechaOficial | null>(
    (max, a) => (max === null || a.fechaActuacion > max ? a.fechaActuacion : max),
    null,
  );
  return {
    plataforma: 'SPOA',
    expedientes: [
      {
        idExterno: registro.noticia,
        despachoJudicial: registro.despacho,
        departamento: lugar(registro.municipioDespacho, registro.departamentoDespacho),
        ponente: null,
        tipoProceso: null,
        claseProceso: null,
        subclaseProceso: null,
        recurso: null,
        ubicacion: null,
        fechaRadicacion: null,
        ultimaActuacion: ultima,
        sujetos: [],
        reservado: false,
        detalles: detalles(registro),
        // El portal del SPOA no tiene una página por noticia criminal.
        urlDeConsulta: null,
      },
    ],
    actuaciones: lista.sort((a, b) =>
      a.fechaActuacion < b.fechaActuacion ? 1 : a.fechaActuacion > b.fechaActuacion ? -1 : 0,
    ),
  };
}

/** El NUNC del proceso (21 dígitos) coincide con el número que muestra el SPOA (21 o 23). */
export function esLaMismaNoticia(nunc: string, noticia: string): boolean {
  return noticia === nunc || noticia.startsWith(nunc);
}
