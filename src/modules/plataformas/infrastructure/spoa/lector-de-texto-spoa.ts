import { err, ok, type Result } from '@/shared/domain/result';
import type { ResultadoConsulta } from '../../domain/consulta';
import { ErrorDeLectura } from '../../domain/errores';
import type { LectorDeConsultaAsistida } from '../../domain/puertos';
import {
  aResultadoConsulta,
  esLaMismaNoticia,
  leerFechaSpoa,
  type RegistroSpoa,
  valorSpoa,
} from './registro-spoa';

/**
 * Lee el resultado del portal «Consulta su denuncia» de la Fiscalía tal como queda al copiarlo
 * (seleccionar todo y copiar). El portal muestra cada dato como una etiqueta y, debajo, su valor;
 * al copiar, cada uno queda en su línea, aunque algunos navegadores los unen con un tabulador.
 * El lector acepta ambas formas y no depende del orden exacto de las secciones.
 */

const ETIQUETAS = {
  noticia: 'Número de la Noticia Criminal',
  estado: 'Estado',
  etapa: 'Etapa noticia criminal',
  departamentoHechos: 'Departamentos hechos',
  municipioHechos: 'Municipios hechos',
  fechaHechos: 'Fecha hechos',
  ley: 'Ley de aplicabilidad',
  seccional: 'Seccional',
  unidad: 'Unidad',
  despacho: 'Despacho',
  fechaAsignacion: 'Fecha asignación',
  departamentoDespacho: 'Departamento',
  municipioDespacho: 'Municipio',
  direccion: 'Dirección',
  correo: 'Correo electrónico',
  telefonos: 'Teléfonos',
} as const;

const OTROS_TITULOS = [
  'Despacho asignado',
  'Ubicación del despacho',
  'Delito',
  'Grado del delito',
  'Actuaciones del caso - No reservadas',
  'Fecha actuación',
  'Nombre actuación',
  'Fecha de consulta',
  'Volver',
  'Imprimir',
];

const TERMINAN_ACTUACIONES = ['fecha de consulta', 'volver', 'imprimir'];

export const MENSAJES_DE_LECTURA = {
  VACIO: 'Pega el texto del resultado del portal de la Fiscalía antes de continuar.',
  NO_RECONOCIDO:
    'No encontramos el resultado del SPOA en el texto pegado. En el portal de la Fiscalía, haz clic sobre el resultado, selecciona todo (Ctrl+A, o ⌘A en Mac), cópialo (Ctrl+C) y pégalo aquí completo.',
} as const;

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/:$/, '')
    .trim();
}

const TODAS = new Set([...Object.values(ETIQUETAS), ...OTROS_TITULOS].map(normalizar));
const esTitulo = (linea: string) => TODAS.has(normalizar(linea));

/** Valor de una etiqueta: en la línea siguiente o en la misma («Estado: ACTIVO», «Estado⇥ACTIVO»). */
function valorDe(lineas: readonly string[], etiqueta: string, desde: number): string | null {
  const buscada = normalizar(etiqueta);
  for (let i = desde; i < lineas.length; i++) {
    const linea = lineas[i] ?? '';
    if (normalizar(linea) === buscada) {
      const siguiente = lineas[i + 1];
      return siguiente !== undefined && !esTitulo(siguiente) ? siguiente : null;
    }
    const enLinea = /^(.+?)\s*(?::|\t)\s*(.+)$/.exec(linea);
    if (enLinea && normalizar(enLinea[1] ?? '') === buscada) return enLinea[2] ?? null;
  }
  return null;
}

const FECHA_AL_INICIO =
  /^(\d{1,4}[/-]\d{1,2}[/-]\d{1,4}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:\s*[ap]\.?\s*m\.?)?)?)(?:\s+(.+))?$/i;

function leerActuaciones(lineas: readonly string[]): RegistroSpoa['actuaciones'] {
  const inicio = lineas.findIndex((l) => normalizar(l).startsWith('actuaciones del caso'));
  if (inicio < 0) return [];
  const actuaciones: { fecha: NonNullable<ReturnType<typeof leerFechaSpoa>>; nombre: string }[] =
    [];
  let i = inicio + 1;
  while (i < lineas.length) {
    const linea = lineas[i] ?? '';
    const normal = normalizar(linea);
    if (TERMINAN_ACTUACIONES.some((t) => normal.startsWith(t))) break;
    if (normal.startsWith('fecha actuacion') || normal === 'nombre actuacion') {
      i++;
      continue;
    }
    const partes = FECHA_AL_INICIO.exec(linea);
    const fecha = partes ? leerFechaSpoa(partes[1]) : null;
    if (!fecha) {
      i++;
      continue;
    }
    let nombre = valorSpoa(partes?.[2]);
    if (!nombre) {
      const siguiente = lineas[i + 1];
      const siguienteEsFecha = siguiente !== undefined && FECHA_AL_INICIO.test(siguiente);
      if (siguiente !== undefined && !siguienteEsFecha && !esTitulo(siguiente)) {
        nombre = valorSpoa(siguiente);
        i++;
      }
    }
    if (nombre) actuaciones.push({ fecha, nombre });
    i++;
  }
  return actuaciones;
}

function leerDelitos(lineas: readonly string[]): RegistroSpoa['delitos'] {
  const delitos: { delito: string; grado: string | null }[] = [];
  for (let i = 0; i < lineas.length; i++) {
    if (normalizar(lineas[i] ?? '') !== 'delito') continue;
    const delito = valorSpoa(lineas[i + 1]);
    if (!delito || esTitulo(delito)) continue;
    let grado: string | null = null;
    const lineaGrado = lineas[i + 2] ?? '';
    if (normalizar(lineaGrado).startsWith('grado del delito')) {
      const siguiente = lineas[i + 3];
      grado =
        valorSpoa(lineaGrado.replace(/^grado del delito\s*:?\s*/i, '')) ??
        (siguiente !== undefined && !esTitulo(siguiente) ? valorSpoa(siguiente) : null);
    }
    delitos.push({ delito, grado });
  }
  return delitos;
}

export function interpretarTextoSpoa(
  texto: string,
  nunc: string,
): Result<ResultadoConsulta, ErrorDeLectura> {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, ' ').trim())
    .filter((l) => l !== '');
  if (lineas.length === 0) return err(new ErrorDeLectura('VACIO', MENSAJES_DE_LECTURA.VACIO));

  const textoNoticia = valorDe(lineas, ETIQUETAS.noticia, 0);
  const noticia = textoNoticia?.replace(/\D/g, '') ?? '';
  if (noticia.length !== 21 && noticia.length !== 23) {
    return err(
      new ErrorDeLectura(
        'NO_RECONOCIDO',
        MENSAJES_DE_LECTURA.NO_RECONOCIDO,
        'sin número de noticia',
      ),
    );
  }
  if (!esLaMismaNoticia(nunc, noticia)) {
    return err(
      new ErrorDeLectura(
        'OTRO_NUMERO',
        `El resultado pegado es de otra noticia criminal (${noticia}). En el portal, consulta el NUNC ${nunc} de este proceso y vuelve a copiar el resultado.`,
      ),
    );
  }

  const desde = lineas.findIndex((l) => normalizar(l) === normalizar(ETIQUETAS.noticia));
  const valor = (campo: keyof typeof ETIQUETAS) =>
    valorSpoa(valorDe(lineas, ETIQUETAS[campo], Math.max(desde, 0)));

  const registro: RegistroSpoa = {
    noticia,
    estado: valor('estado'),
    etapa: valor('etapa'),
    ley: valor('ley'),
    departamentoHechos: valor('departamentoHechos'),
    municipioHechos: valor('municipioHechos'),
    fechaHechos: leerFechaSpoa(valor('fechaHechos')),
    seccional: valor('seccional'),
    unidad: valor('unidad'),
    despacho: valor('despacho'),
    fechaAsignacion: leerFechaSpoa(valor('fechaAsignacion')),
    departamentoDespacho: valor('departamentoDespacho'),
    municipioDespacho: valor('municipioDespacho'),
    direccion: valor('direccion'),
    correo: valor('correo'),
    telefonos: valor('telefonos'),
    delitos: leerDelitos(lineas),
    actuaciones: leerActuaciones(lineas),
  };
  return ok(aResultadoConsulta(registro));
}

/** Lector de la consulta asistida del SPOA. */
export function crearLectorSpoa(opciones: {
  readonly urlDelPortal: string;
}): LectorDeConsultaAsistida {
  return {
    plataforma: 'SPOA',
    identificador: 'NUNC',
    urlDelPortal: opciones.urlDelPortal,
    interpretar: interpretarTextoSpoa,
  };
}
