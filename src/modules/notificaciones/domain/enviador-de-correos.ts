import type { AppError } from '@/shared/domain/app-error';
import type { Result } from '@/shared/domain/result';

/** Correo listo para enviar. `html` ya viene escapado por quien arma la plantilla. */
export interface CorreoSaliente {
  readonly para: string;
  readonly asunto: string;
  readonly texto: string;
  readonly html: string;
}

/**
 * Puerto de envío de correos. Implementaciones: archivo (desarrollo) y SMTP (Fase 11).
 * Las implementaciones nunca registran el contenido del correo en el log: puede llevar
 * enlaces de acceso.
 */
export interface EnviadorDeCorreos {
  enviar(correo: CorreoSaliente): Promise<Result<void, AppError>>;
}
