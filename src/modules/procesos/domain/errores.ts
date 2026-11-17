import { AppError, ErrorNoEncontrado } from '@/shared/domain/app-error';

/** Errores esperables de la gestión de procesos, con mensajes para la persona usuaria (§10). */

/**
 * El proceso no existe en el despacho o la persona no puede verlo. Es el mismo mensaje en los
 * dos casos para no revelar procesos que no le corresponden.
 */
export class ErrorProcesoNoEncontrado extends ErrorNoEncontrado {
  constructor(detalleTecnico?: string) {
    super(
      'No encontramos ese proceso en tu despacho, o no lo tienes asignado. Revisa la lista de procesos.',
      detalleTecnico,
    );
  }
}

export class ErrorProcesoDuplicado extends AppError {
  constructor(tipo: 'RADICADO' | 'NUNC', valor: string) {
    const nombre = tipo === 'RADICADO' ? 'el radicado' : 'el NUNC';
    super({
      codigo: 'PROCESO_DUPLICADO',
      mensajeUsuario: `Ya hay un proceso con ${nombre} ${valor} en el despacho. Búscalo en la lista de procesos; si no lo ves, pide al administrador que te lo asigne.`,
    });
  }
}

export class ErrorIdentificadorBloqueado extends AppError {
  constructor() {
    super({
      codigo: 'IDENTIFICADOR_BLOQUEADO',
      mensajeUsuario:
        'Este proceso ya tiene actuaciones de las plataformas, así que su radicado y su NUNC no se pueden cambiar. Si el número está mal, archiva este proceso y registra uno nuevo.',
    });
  }
}

export class ErrorAsignacionInvalida extends AppError {
  constructor(mensajeUsuario: string) {
    super({ codigo: 'ASIGNACION_INVALIDA', mensajeUsuario });
  }
}

export class ErrorDeImportacion extends AppError {
  constructor(mensajeUsuario: string, detalleTecnico?: string) {
    super({ codigo: 'IMPORTACION_INVALIDA', mensajeUsuario, detalleTecnico });
  }
}
