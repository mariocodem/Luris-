/**
 * Plataformas judiciales que consulta LURIS, en el orden de prioridad del §1, y el resultado de
 * la última consulta. El puerto está en `puertos.ts`; los adaptadores, en infrastructure/.
 */
export const CODIGOS_DE_PLATAFORMA = ['RAMA_CPNU', 'SPOA', 'SAMAI', 'SIUGJ', 'TYBA'] as const;

export type CodigoPlataforma = (typeof CODIGOS_DE_PLATAFORMA)[number];

export const NOMBRES_DE_PLATAFORMA: Readonly<Record<CodigoPlataforma, string>> = {
  RAMA_CPNU: 'Rama Judicial (CPNU)',
  SPOA: 'SPOA (Fiscalía)',
  SAMAI: 'SAMAI',
  SIUGJ: 'SIUGJ',
  TYBA: 'Tyba',
};

/** Cómo se nombra la plataforma dentro de una frase («No hubo respuesta de la Rama Judicial»). */
export const NOMBRE_EN_FRASE: Readonly<Record<CodigoPlataforma, string>> = {
  RAMA_CPNU: 'la Rama Judicial',
  SPOA: 'el SPOA de la Fiscalía',
  SAMAI: 'SAMAI',
  SIUGJ: 'SIUGJ',
  TYBA: 'Tyba',
};

/** «de» más el nombre en frase, con la contracción del español: «del SPOA», «de la Rama Judicial». */
export function deLaPlataforma(plataforma: CodigoPlataforma): string {
  const nombre = NOMBRE_EN_FRASE[plataforma];
  return nombre.startsWith('el ') ? `del ${nombre.slice(3)}` : `de ${nombre}`;
}

/**
 * Lo que conviene saber de los datos de cada plataforma en la ficha (se muestra junto a ellos).
 */
export const NOTA_SOBRE_LOS_DATOS: Readonly<Partial<Record<CodigoPlataforma, string>>> = {
  SIUGJ:
    'LURIS consulta SIUGJ con la cuenta de usuario externo del abogado responsable (o la del despacho). Solo ve los expedientes a los que esa cuenta tiene acceso.',
  SAMAI:
    'Las actuaciones de este proceso llegan por la Rama Judicial, que las toma de SAMAI. SAMAI pide resolver un reto («No soy un robot») para mostrar el proceso: ábrelo allí para descargar sus documentos públicos y agrégalos a la actuación aquí.',
};

/** Con qué identificador se consulta cada plataforma: radicado (23 dígitos) o NUNC (21). */
export const IDENTIFICADOR_DE_PLATAFORMA: Readonly<Record<CodigoPlataforma, 'RADICADO' | 'NUNC'>> =
  {
    RAMA_CPNU: 'RADICADO',
    SPOA: 'NUNC',
    SAMAI: 'RADICADO',
    SIUGJ: 'RADICADO',
    TYBA: 'RADICADO',
  };

export const ESTADOS_DE_CONSULTA = [
  'EXITOSA',
  'NO_ENCONTRADO',
  'PLATAFORMA_NO_DISPONIBLE',
  'CREDENCIALES_INVALIDAS',
  'REQUIERE_INTERVENCION',
  'LIMITE_DE_CONSULTAS',
  'RESPUESTA_INESPERADA',
  /** La cuenta entra a la plataforma, pero no tiene acceso a este expediente (SIUGJ). */
  'SIN_ACCESO',
  /** La plataforma exige una cuenta y nadie del proceso ni el despacho registró una. */
  'SIN_CREDENCIAL',
] as const;

export type EstadoConsulta = (typeof ESTADOS_DE_CONSULTA)[number];

/** Cómo se explica cada resultado a la persona usuaria (sin jerga técnica, §10). */
export const DESCRIPCION_DE_ESTADO: Readonly<Record<EstadoConsulta, string>> = {
  EXITOSA: 'Consultado sin problemas',
  NO_ENCONTRADO: 'La plataforma no encontró el proceso',
  PLATAFORMA_NO_DISPONIBLE: 'La plataforma no respondió; se reintentará',
  CREDENCIALES_INVALIDAS: 'El usuario de la plataforma no fue aceptado',
  REQUIERE_INTERVENCION: 'Necesita tu confirmación',
  LIMITE_DE_CONSULTAS: 'La plataforma pidió esperar; se reintentará',
  RESPUESTA_INESPERADA: 'La plataforma respondió algo inesperado; lo estamos revisando',
  SIN_ACCESO: 'Tu cuenta no tiene acceso a este expediente',
  SIN_CREDENCIAL: 'Falta registrar un usuario de la plataforma',
};
