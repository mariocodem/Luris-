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
      return `Para consultar ${nombre} hace falta que confirmes la consulta tú mismo. La encontrarás en «Pendientes de tu confirmación».`;
    case 'RESPUESTA_INESPERADA':
      return `${capitalizar(nombre)} respondió de una forma que no esperábamos. Ya quedó registrado para revisarlo; mientras tanto puedes consultar el proceso en su portal.`;
  }
}

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

  constructor(
    plataforma: CodigoPlataforma,
    codigo: CodigoErrorPlataforma,
    detalleTecnico?: string,
    causa?: unknown,
  ) {
    super({
      codigo,
      mensajeUsuario: mensajeDeErrorDePlataforma(plataforma, codigo),
      detalleTecnico,
      causa,
    });
    this.plataforma = plataforma;
    this.transitorio = esTransitorio(codigo);
  }
}
