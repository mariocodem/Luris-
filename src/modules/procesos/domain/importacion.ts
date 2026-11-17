import {
  ErrorIdentificadorNoReconocido,
  esNotacionCientifica,
  reconocerIdentificador,
} from '@/shared/domain/identificador';
import { crearNunc, type Nunc } from '@/shared/domain/nunc';
import { crearRadicado, type Radicado } from '@/shared/domain/radicado';
import { err, ok, type Result } from '@/shared/domain/result';
import { ErrorDeImportacion } from './errores';
import { LIMITES_DE_PROCESO, problemasDeEtiquetas, separarEtiquetas } from './proceso';

/**
 * Importación de procesos desde una hoja de cálculo o un CSV (§Fase 4). Reutiliza los value
 * objects de radicado y NUNC: acepta los números con o sin guiones, espacios y puntos.
 *
 * Con encabezados, reconoce columnas como «Radicado», «NUNC», «Alias», «Cliente» y «Etiquetas».
 * Sin encabezados: radicado o NUNC en la primera columna, alias en la segunda y cliente en la
 * tercera.
 */

export const MAXIMO_FILAS_DE_IMPORTACION = 1000;

type Campo = 'identificador' | 'radicado' | 'nunc' | 'alias' | 'cliente' | 'etiquetas';

const SINONIMOS: Readonly<Record<Campo, readonly string[]>> = {
  identificador: ['identificador', 'numero', 'numerodelproceso', 'numerodeproceso', 'expediente'],
  radicado: [
    'radicado',
    'radicacion',
    'nradicado',
    'noradicado',
    'numeroderadicado',
    'numeroderadicacion',
    'radicadodelproceso',
  ],
  nunc: ['nunc', 'noticiacriminal', 'numerounicodenoticiacriminal'],
  alias: ['alias', 'nombre', 'nombredelproceso', 'referencia', 'asunto'],
  cliente: ['cliente', 'parte', 'partes', 'poderdante', 'demandante'],
  etiquetas: ['etiquetas', 'etiqueta', 'categoria', 'categorias'],
};

type Columnas = Partial<Record<Campo, number>>;

function normalizarEncabezado(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Si la fila es de encabezados, devuelve qué columna es cada campo; si no, null. */
function columnasDeEncabezado(fila: readonly string[]): Columnas | null {
  const columnas: Columnas = {};
  fila.forEach((celda, indice) => {
    const nombre = normalizarEncabezado(celda);
    for (const [campo, sinonimos] of Object.entries(SINONIMOS) as [Campo, readonly string[]][]) {
      if (columnas[campo] === undefined && sinonimos.includes(nombre)) columnas[campo] = indice;
    }
  });
  const tieneIdentificador =
    columnas.identificador !== undefined ||
    columnas.radicado !== undefined ||
    columnas.nunc !== undefined;
  return tieneIdentificador ? columnas : null;
}

const SIN_ENCABEZADO: Columnas = { identificador: 0, alias: 1, cliente: 2 };

export interface ProcesoAImportar {
  /** Número de fila en el archivo (como lo ve la persona en Excel). */
  readonly fila: number;
  readonly radicado: Radicado | null;
  readonly nunc: Nunc | null;
  readonly alias: string | null;
  readonly cliente: string | null;
  readonly etiquetas: readonly string[];
}

export interface ErrorDeFila {
  readonly fila: number;
  /** Lo que venía en la celda del identificador, para que la persona lo ubique. */
  readonly valor: string;
  readonly mensaje: string;
}

export interface DuplicadoEnArchivo {
  readonly fila: number;
  readonly identificador: string;
  /** Fila donde apareció primero. */
  readonly primeraFila: number;
}

export interface AnalisisDeImportacion {
  /** Filas con datos (sin contar encabezados ni filas vacías). */
  readonly filasConDatos: number;
  readonly validos: readonly ProcesoAImportar[];
  readonly errores: readonly ErrorDeFila[];
  readonly duplicados: readonly DuplicadoEnArchivo[];
}

function celda(fila: readonly string[], indice: number | undefined): string {
  return indice === undefined ? '' : (fila[indice] ?? '').trim();
}

function textoLimitado(
  valor: string,
  maximo: number,
  campo: string,
): Result<string | null, string> {
  const limpio = valor.replace(/\s+/g, ' ').trim();
  if (limpio.length > maximo) return err(`${campo} tiene más de ${maximo} caracteres.`);
  return ok(limpio === '' ? null : limpio);
}

interface Identificadores {
  readonly radicado: Radicado | null;
  readonly nunc: Nunc | null;
}

function identificadoresDeFila(
  fila: readonly string[],
  columnas: Columnas,
): Result<Identificadores, string> {
  let radicado: Radicado | null = null;
  let nunc: Nunc | null = null;

  const generico = celda(fila, columnas.identificador);
  if (generico !== '') {
    const reconocido = reconocerIdentificador(generico);
    if (!reconocido.ok) return err(reconocido.error.mensajeUsuario);
    if (reconocido.value.tipo === 'RADICADO') radicado = reconocido.value.valor;
    else nunc = reconocido.value.valor;
  }

  const textoRadicado = celda(fila, columnas.radicado);
  if (textoRadicado !== '') {
    if (esNotacionCientifica(textoRadicado)) return err(mensajeNotacion());
    const resultado = crearRadicado(textoRadicado);
    if (!resultado.ok) return err(resultado.error.mensajeUsuario);
    radicado = resultado.value;
  }

  const textoNunc = celda(fila, columnas.nunc);
  if (textoNunc !== '') {
    if (esNotacionCientifica(textoNunc)) return err(mensajeNotacion());
    const resultado = crearNunc(textoNunc);
    if (!resultado.ok) return err(resultado.error.mensajeUsuario);
    nunc = resultado.value;
  }

  if (radicado === null && nunc === null) return err('La fila no tiene radicado ni NUNC.');
  return ok({ radicado, nunc });
}

function mensajeNotacion(): string {
  return new ErrorIdentificadorNoReconocido('NOTACION_CIENTIFICA', 0).mensajeUsuario;
}

/**
 * Analiza las filas leídas del archivo: normaliza, valida y quita duplicados. No consulta la
 * base de datos (eso lo hace el caso de uso para marcar los procesos ya registrados).
 */
export function analizarFilas(
  filas: readonly (readonly string[])[],
): Result<AnalisisDeImportacion, ErrorDeImportacion> {
  const conDatos = filas
    .map((celdas, indice) => ({ celdas, numero: indice + 1 }))
    .filter(({ celdas }) => celdas.some((valor) => valor.trim() !== ''));

  const primera = conDatos[0];
  if (!primera) {
    return err(
      new ErrorDeImportacion('El archivo está vacío: no encontramos ninguna fila con datos.'),
    );
  }

  const encabezado = columnasDeEncabezado(primera.celdas);
  const columnas = encabezado ?? SIN_ENCABEZADO;
  const datos = encabezado ? conDatos.slice(1) : conDatos;

  if (datos.length === 0) {
    return err(
      new ErrorDeImportacion('El archivo solo tiene encabezados: agrega al menos un proceso.'),
    );
  }
  if (datos.length > MAXIMO_FILAS_DE_IMPORTACION) {
    return err(
      new ErrorDeImportacion(
        `El archivo tiene ${datos.length} procesos y el máximo por importación es ${MAXIMO_FILAS_DE_IMPORTACION}. Divídelo en varios archivos.`,
      ),
    );
  }

  const validos: ProcesoAImportar[] = [];
  const errores: ErrorDeFila[] = [];
  const duplicados: DuplicadoEnArchivo[] = [];
  const vistos = new Map<string, number>();

  for (const { celdas, numero } of datos) {
    const valor = [
      celda(celdas, columnas.identificador),
      celda(celdas, columnas.radicado),
      celda(celdas, columnas.nunc),
    ]
      .filter(Boolean)
      .join(' / ')
      .slice(0, 60);

    const identificadores = identificadoresDeFila(celdas, columnas);
    if (!identificadores.ok) {
      errores.push({ fila: numero, valor, mensaje: identificadores.error });
      continue;
    }
    const { radicado, nunc } = identificadores.value;

    const alias = textoLimitado(
      celda(celdas, columnas.alias),
      LIMITES_DE_PROCESO.alias,
      'El alias',
    );
    if (!alias.ok) {
      errores.push({ fila: numero, valor, mensaje: alias.error });
      continue;
    }
    const cliente = textoLimitado(
      celda(celdas, columnas.cliente),
      LIMITES_DE_PROCESO.cliente,
      'El cliente',
    );
    if (!cliente.ok) {
      errores.push({ fila: numero, valor, mensaje: cliente.error });
      continue;
    }
    const etiquetas = separarEtiquetas(celda(celdas, columnas.etiquetas));
    const problemaDeEtiquetas = problemasDeEtiquetas(etiquetas)[0];
    if (problemaDeEtiquetas !== undefined) {
      errores.push({ fila: numero, valor, mensaje: problemaDeEtiquetas });
      continue;
    }

    const claves = [radicado && `R${radicado}`, nunc && `N${nunc}`].filter((c): c is string => !!c);
    const repetida = claves.find((clave) => vistos.has(clave));
    if (repetida) {
      duplicados.push({
        fila: numero,
        identificador: repetida.slice(1),
        primeraFila: vistos.get(repetida) ?? numero,
      });
      continue;
    }
    for (const clave of claves) vistos.set(clave, numero);

    validos.push({
      fila: numero,
      radicado,
      nunc,
      alias: alias.value,
      cliente: cliente.value,
      etiquetas,
    });
  }

  return ok({ filasConDatos: datos.length, validos, errores, duplicados });
}
