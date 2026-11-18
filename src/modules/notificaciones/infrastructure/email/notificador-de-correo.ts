import { err, ok } from '@/shared/domain/result';
import { asuntoDelAviso, textoDelAviso } from '../../domain/aviso';
import type { EnviadorDeCorreos } from '../../domain/enviador-de-correos';
import { ErrorDeEnvio, type Notificador } from '../../domain/notificador';
import { renderizarAviso } from './plantillas/aviso';

/** Canal de correo de los avisos (§9): React Email para el HTML y el enviador (SMTP) para la salida. */
export function crearNotificadorDeCorreo(deps: {
  readonly enviador: EnviadorDeCorreos;
}): Notificador {
  return {
    canal: 'CORREO',
    async enviar(aviso) {
      const html = await renderizarAviso(aviso);
      const envio = await deps.enviador.enviar({
        para: aviso.destinatario.email,
        asunto: asuntoDelAviso(aviso),
        texto: textoDelAviso(aviso),
        html,
      });
      if (envio.ok) return ok(undefined);
      return err(
        envio.error instanceof ErrorDeEnvio
          ? envio.error
          : new ErrorDeEnvio('FALLO_TEMPORAL', envio.error.detalleTecnico),
      );
    },
  };
}
