import { AppError } from '@/shared/domain/app-error';

/** Errores esperables de cuentas e invitaciones, con mensajes para la persona usuaria (§10). */

export class ErrorNoAutenticado extends AppError {
  constructor() {
    super({
      codigo: 'NO_AUTENTICADO',
      mensajeUsuario: 'Tu sesión terminó. Inicia sesión de nuevo para continuar.',
    });
  }
}

export class ErrorCredencialesInvalidas extends AppError {
  constructor() {
    super({
      codigo: 'CREDENCIALES_INVALIDAS',
      mensajeUsuario:
        'El correo o la contraseña no coinciden. Revísalos e inténtalo de nuevo, o recupera tu contraseña.',
    });
  }
}

export class ErrorDemasiadosIntentos extends AppError {
  constructor(minutos: number) {
    super({
      codigo: 'DEMASIADOS_INTENTOS',
      mensajeUsuario: `Hubo demasiados intentos seguidos. Por seguridad, espera ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} antes de volver a intentarlo.`,
    });
  }
}

export class ErrorCuentaSinAcceso extends AppError {
  constructor(detalleTecnico: string) {
    super({
      codigo: 'CUENTA_SIN_ACCESO',
      mensajeUsuario:
        'Tu cuenta no tiene acceso a ningún despacho activo. Pide al administrador de tu despacho que revise tu usuario.',
      detalleTecnico,
    });
  }
}

export class ErrorDespachoSuspendido extends AppError {
  constructor() {
    super({
      codigo: 'DESPACHO_SUSPENDIDO',
      mensajeUsuario:
        'El acceso de tu despacho a LURIS está suspendido. Comunícate con nosotros para reactivarlo.',
    });
  }
}

export class ErrorEnlaceInvalido extends AppError {
  constructor(tipo: 'invitacion' | 'recuperacion', detalleTecnico?: string) {
    super({
      codigo: tipo === 'invitacion' ? 'INVITACION_INVALIDA' : 'ENLACE_RECUPERACION_INVALIDO',
      mensajeUsuario:
        tipo === 'invitacion'
          ? 'Esta invitación ya no es válida: venció, ya se usó o fue cancelada. Pide al administrador de tu despacho que te envíe una nueva.'
          : 'Este enlace para cambiar la contraseña ya no es válido: venció o ya se usó. Solicita uno nuevo.',
      detalleTecnico,
    });
  }
}

export class ErrorReglaDeCuenta extends AppError {
  constructor(codigo: string, mensajeUsuario: string) {
    super({ codigo, mensajeUsuario });
  }
}
