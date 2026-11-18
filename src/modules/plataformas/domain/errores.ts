import { AppError } from '@/shared/domain/app-error';
import {
  type CodigoPlataforma,
  deLaPlataforma,
  type EstadoConsulta,
  NOMBRE_EN_FRASE,
} from './plataforma';

/** Por qué falló una consulta (§6). Son los mismos códigos que el estado de la última consulta. */
export type CodigoErrorPlataforma = Exclude<EstadoConsulta, 'EXITOSA'>;

/**
 * Fallos pasajeros: la plataforma no respondió o pidió esperar. Se reintentan solos, con espera
 * creciente. El resto no mejora reintentando (el proceso no existe, el formato cambió…).
 */
const TRANSITORIOS: ReadonlySet<CodigoErrorPlataforma> = new Set([
  'PLATAFORMA_NO_DISPONIBLE',
  'LIMITE_DE_CONSULTAS',
]);

export function esTransitorio(codigo: CodigoErrorPlataforma): boolean {
  return TRANSITORIOS.has(codigo);
}

/** Qué pasó y qué puede hacer la persona, sin jerga técnica (§10). */
export function mensajeDeErrorDePlataforma(
  plataforma: CodigoPlataforma,
  codigo: CodigoErrorPlataforma,
): string {
  const nombre = NOMBRE_EN_FRASE[plataforma];
  switch (codigo) {
    case 'NO_ENCONTRADO':
      return `No encontramos este proceso en ${nombre}. Revisa que el número esté completo; si el proceso es nuevo, puede tardar unos días en aparecer.`;
    case 'PLATAFORMA_NO_DISPONIBLE':
      return `No hubo respuesta ${deLaPlataforma(plataforma)}. Volveremos a intentarlo automáticamente en unos minutos.`;
    case 'LIMITE_DE_CONSULTAS':
      return `${capitalizar(nombre)} pidió esperar antes de seguir consultando. Volveremos a intentarlo automáticamente.`;
    case 'CREDENCIALES_INVALIDAS':
      return `Tu usuario ${deLaPlataforma(plataforma)} no fue aceptado. Actualiza la contraseña en Ajustes → Plataformas.`;
    case 'REQUIERE_INTERVENCION':
      // SIUGJ pide un código de acceso al ingresar; el SPOA, que la persona resuelva el reto.
      return INTERVENCION_DE_LA_PLATAFORMA[plataforma] === 'CODIGO_DE_ACCESO'
        ? `${capitalizar(nombre)} pidió un código de acceso. Escribe el código que te llegó en Ajustes → Plataformas; después LURIS consultará el proceso solo.`
        : `Para consultar ${nombre} hace falta que confirmes la consulta tú mismo. La encontrarás en «Pendientes de tu confirmación».`;
    case 'RESPUESTA_INESPERADA':
      return `${capitalizar(nombre)} respondió de una forma que no esperábamos. Ya quedó registrado para revisarlo; mientras tanto puedes consultar el proceso en su portal.`;
    case 'SIN_ACCESO':
      return `Tu cuenta no tiene acceso a este expediente en ${nombre}. Solicítalo al juzgado que lleva el proceso; cuando te lo concedan, LURIS lo consultará solo.`;
    case 'SIN_CREDENCIAL':
      return `Para consultar ${nombre} hace falta un usuario de la plataforma. Regístralo en Ajustes → Plataformas (el tuyo o el del despacho).`;
  }
}

/**
 * Qué intervención de la persona hace falta cuando el error es REQUIERE_INTERVENCION:
 * - CONSULTA_ASISTIDA: resolver ella misma el reto de la plataforma (SPOA, §6).
 * - CODIGO_DE_ACCESO: escribir en LURIS el código del segundo factor que la plataforma le envió
 *   (SIUGJ). LURIS nunca lee el correo ni evade el factor: lo entrega la persona.
 */
export type IntervencionRequerida = 'CONSULTA_ASISTIDA' | 'CODIGO_DE_ACCESO';

/** Qué intervención pide cada plataforma cuando no puede seguir sola. */
const INTERVENCION_DE_LA_PLATAFORMA: Readonly<Record<CodigoPlataforma, IntervencionRequerida>> = {
  RAMA_CPNU: 'CONSULTA_ASISTIDA',
  SPOA: 'CONSULTA_ASISTIDA',
  SAMAI: 'CONSULTA_ASISTIDA',
  SIUGJ: 'CODIGO_DE_ACCESO',
  TYBA: 'CONSULTA_ASISTIDA',
};

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export type MotivoDeLectura = 'VACIO' | 'NO_RECONOCIDO' | 'OTRO_NUMERO';

/**
 * El texto que pegó la persona en una consulta asistida no se pudo leer. El mensaje dice cómo
 * copiarlo bien.
 */
export class ErrorDeLectura extends AppError {
  readonly motivo: MotivoDeLectura;

  constructor(motivo: MotivoDeLectura, mensajeUsuario: string, detalleTecnico?: string) {
    super({ codigo: `LECTURA_${motivo}`, mensajeUsuario, detalleTecnico });
    this.motivo = motivo;
  }
}

/**
 * Error de una consulta a una plataforma. Todo adaptador devuelve este mismo error con los mismos
 * códigos, así cualquiera puede reemplazar a otro sin romper los casos de uso (§3, L de SOLID).
 */
export class ErrorPlataforma extends AppError {
  declare readonly codigo: CodigoErrorPlataforma;
  readonly plataforma: CodigoPlataforma;
  readonly transitorio: boolean;
  /** Solo con REQUIERE_INTERVENCION: qué tiene que hacer la persona. */
  readonly intervencion: IntervencionRequerida | null;

  constructor(
    plataforma: CodigoPlataforma,
    codigo: CodigoErrorPlataforma,
    detalleTecnico?: string,
    causa?: unknown,
    intervencion: IntervencionRequerida | null = null,
  ) {
    super({
      codigo,
      mensajeUsuario: mensajeDeErrorDePlataforma(plataforma, codigo),
      detalleTecnico,
      causa,
    });
    this.plataforma = plataforma;
    this.transitorio = esTransitorio(codigo);
    this.intervencion = codigo === 'REQUIERE_INTERVENCION' ? intervencion : null;
  }
}
