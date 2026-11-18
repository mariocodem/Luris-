import { err } from '@/shared/domain/result';
import { textoDelAviso } from '../../domain/aviso';
import { ErrorDeEnvio, type Notificador } from '../../domain/notificador';
import type { GestorDeWhatsapp } from './gestor-de-whatsapp';

/**
 * Canal de WhatsApp de los avisos (§9). Solo envía a quien dio su consentimiento (lo verifica el
 * despachador antes). Para pasar a la API oficial de Meta basta otra implementación de este
 * puerto: nada fuera de `notificaciones/infrastructure/whatsapp/` cambia.
 */
export function crearNotificadorDeWhatsapp(deps: {
  readonly gestor: Pick<GestorDeWhatsapp, 'enviar'>;
}): Notificador {
  return {
    canal: 'WHATSAPP',
    async enviar(aviso, { despachoId }) {
      const numero = aviso.destinatario.numeroWhatsapp;
      if (!numero) return err(new ErrorDeEnvio('DESTINO_INVALIDO', 'Sin número de WhatsApp'));
      return deps.gestor.enviar(despachoId, numero, textoDelAviso(aviso));
    },
  };
}
