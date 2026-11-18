import type { CodigoPlataforma, EstadoConsulta } from './plataforma';

/**
 * Credenciales de plataformas (§4, §6): usuario y contraseña de un abogado (o del despacho) en
 * una plataforma con login, para consultar lo que solo ve una cuenta. Se guardan cifradas, con
 * consentimiento explícito, y se pueden borrar en cualquier momento.
 */

/** Plataformas en las que LURIS acepta credenciales. */
export const PLATAFORMAS_CON_CREDENCIALES = [
  'SAMAI',
  'SIUGJ',
] as const satisfies readonly CodigoPlataforma[];
export type PlataformaConCredenciales = (typeof PLATAFORMAS_CON_CREDENCIALES)[number];

export const ALCANCES_DE_CREDENCIAL = ['PERSONAL', 'DESPACHO'] as const;
export type AlcanceDeCredencial = (typeof ALCANCES_DE_CREDENCIAL)[number];

/** Para qué usa LURIS la credencial en cada plataforma (se muestra al pedir el consentimiento). */
export const USO_DE_LA_CREDENCIAL: Readonly<Record<PlataformaConCredenciales, string>> = {
  SAMAI:
    'LURIS iniciará sesión en SAMAI con esta cuenta, a un ritmo bajo, para consultar los procesos del despacho y traer los documentos que tu cuenta puede ver.',
  SIUGJ:
    'LURIS iniciará sesión en SIUGJ con tu cuenta de usuario externo, a un ritmo bajo y reutilizando la sesión, para consultar los expedientes a los que tu cuenta tiene acceso y traer sus actuaciones y documentos. Si SIUGJ pide un código de acceso, te lo pediremos a ti: LURIS nunca lee tu correo.',
};

/**
 * Espera del código de acceso (segundo factor de SIUGJ): la plataforma lo envió a la persona y
 * LURIS mantiene el ingreso a medias durante `minutosDeVigencia`. Pasado ese tiempo, la próxima
 * consulta pide un código nuevo.
 */
export function esperaCodigoDeAcceso(
  codigoSolicitadoEn: Date | null,
  ahora: Date,
  minutosDeVigencia: number,
): boolean {
  return (
    codigoSolicitadoEn !== null &&
    ahora.getTime() - codigoSolicitadoEn.getTime() < minutosDeVigencia * 60_000
  );
}

/**
 * Contexto con el que se cifra la sesión guardada de una credencial (cookies de la plataforma):
 * solo sirve para esa credencial.
 */
export function contextoDeSesion(credencialId: string): string {
  return ['luris-sesion-v1', credencialId].join('|');
}

/** Contexto con el que viaja cifrado por la cola el código de acceso que escribió la persona. */
export function contextoDeCodigo(credencialId: string): string {
  return ['luris-codigo-v1', credencialId].join('|');
}

/** Lo que la persona acepta al guardar una credencial. */
export const TEXTO_DE_CONSENTIMIENTO =
  'Autorizo a LURIS a guardar esta contraseña cifrada y a usarla para consultar en mi nombre los procesos del despacho en esta plataforma. Puedo borrarla cuando quiera.';

/**
 * Contexto con el que se cifra el secreto (dato autenticado): si alguien moviera el secreto a otra
 * fila (otro despacho, plataforma, titular o usuario), no se podría descifrar.
 */
export function contextoDeCifrado(credencial: {
  readonly despachoId: string;
  readonly plataforma: CodigoPlataforma;
  readonly alcance: AlcanceDeCredencial;
  readonly membresiaId: string;
  readonly usuario: string;
}): string {
  const titular = credencial.alcance === 'DESPACHO' ? 'despacho' : credencial.membresiaId;
  return [
    'luris-credencial-v1',
    credencial.despachoId,
    credencial.plataforma,
    titular,
    credencial.usuario,
  ].join('|');
}

/** Cómo se explica el resultado de probar el acceso (sin jerga técnica, §10). */
export function descripcionDeVerificacion(estado: EstadoConsulta | null): string {
  switch (estado) {
    case null:
      return 'Probando el acceso…';
    case 'EXITOSA':
      return 'Acceso verificado';
    case 'CREDENCIALES_INVALIDAS':
      return 'La plataforma no aceptó el usuario o la contraseña. Revísalos y guárdalos de nuevo.';
    case 'REQUIERE_INTERVENCION':
      return 'La plataforma pidió una verificación que debes hacer tú. Entra una vez a la plataforma y luego guarda la credencial de nuevo.';
    case 'PLATAFORMA_NO_DISPONIBLE':
    case 'LIMITE_DE_CONSULTAS':
      return 'No pudimos probar el acceso porque la plataforma no respondió. Lo intentaremos de nuevo.';
    case 'NO_ENCONTRADO':
    case 'RESPUESTA_INESPERADA':
    case 'SIN_ACCESO':
    case 'SIN_CREDENCIAL':
      return 'No pudimos probar el acceso. Ya quedó registrado para revisarlo.';
  }
}
