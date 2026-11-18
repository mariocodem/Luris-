import { describe, expect, it } from 'vitest';
import {
  asuntoDelAviso,
  enlaceDelProceso,
  lineaDeFechas,
  textoDelAviso,
  type ActuacionAvisada,
  type AvisoDeActuaciones,
  type AvisoDeConsultaMasiva,
  type ProcesoAvisado,
} from './aviso';
import { ErrorDeEnvio, mensajeDeEstadoDeAviso } from './notificador';
import {
  aplicarPreferencias,
  esquemaDePreferencias,
  formatearNumeroWhatsapp,
  normalizarNumeroWhatsapp,
  PREFERENCIAS_POR_DEFECTO,
} from './preferencias';
import { esperaDeReintentoMs, proximaHoraDeResumen } from './programacion';
import { jidDeNumero, numeroDeJid } from './whatsapp';

const actuacion = (parcial: Partial<ActuacionAvisada> = {}): ActuacionAvisada => ({
  id: 'a1',
  plataforma: 'RAMA_CPNU',
  origen: null,
  // Las fechas oficiales son días calendario guardados como medianoche UTC.
  fechaActuacion: new Date('2026-10-21T00:00:00Z'),
  fechaRegistro: new Date('2026-10-30T00:00:00Z'),
  descripcion: 'Agregar Memorial',
  anotacion: null,
  tieneDocumentos: true,
  ...parcial,
});

const proceso = (parcial: Partial<ProcesoAvisado> = {}): ProcesoAvisado => ({
  procesoId: 'p1',
  alias: 'Ejecutivo Bancolombia',
  cliente: null,
  radicado: '50001400300120210034300',
  nunc: null,
  actuaciones: [actuacion()],
  ...parcial,
});

const aviso = (parcial: Partial<AvisoDeActuaciones> = {}): AvisoDeActuaciones => ({
  tipo: 'ACTUACIONES',
  destinatario: { nombre: 'Laura', email: 'laura@despacho.test', numeroWhatsapp: '573001234567' },
  modo: 'INMEDIATA',
  procesos: [proceso()],
  urlBase: 'https://luris.test/',
  ...parcial,
});

describe('normalizarNumeroWhatsapp', () => {
  it.each([
    ['300 123 4567', '573001234567'],
    ['+57 300 123 4567', '573001234567'],
    ['(300) 123-4567', '573001234567'],
    ['573001234567', '573001234567'],
    ['0057 300 123 4567', '573001234567'],
    ['+1 415 555 2671', '14155552671'],
    ['+49 151 23456789', '4915123456789'],
  ])('«%s» → %s', (texto, esperado) => {
    expect(normalizarNumeroWhatsapp(texto)).toBe(esperado);
  });

  it.each(['', 'hola', '123', '3001234', '+57 100 123 4567', '12345678901234567'])(
    '«%s» no es un número válido',
    (texto) => {
      expect(normalizarNumeroWhatsapp(texto)).toBeNull();
    },
  );

  it('se muestra con formato', () => {
    expect(formatearNumeroWhatsapp('573001234567')).toBe('+57 300 123 4567');
    expect(formatearNumeroWhatsapp('14155552671')).toBe('+14155552671');
  });
});

describe('preferencias', () => {
  const base = {
    correoActivo: true,
    whatsappActivo: false,
    numeroWhatsapp: '',
    consentimientoWhatsapp: false,
    frecuencia: 'INMEDIATA' as const,
  };

  it('por defecto: correo de inmediato y WhatsApp apagado', () => {
    expect(PREFERENCIAS_POR_DEFECTO).toMatchObject({
      correoActivo: true,
      whatsappActivo: false,
      frecuencia: 'INMEDIATA',
    });
  });

  it('activar WhatsApp exige número y consentimiento, con el error junto a cada campo', () => {
    const r = esquemaDePreferencias.safeParse({ ...base, whatsappActivo: true });
    expect(r.success).toBe(false);
    if (r.success) return;
    const campos = r.error.issues.map((i) => i.path[0]);
    expect(campos).toEqual(expect.arrayContaining(['numeroWhatsapp', 'consentimientoWhatsapp']));
    expect(r.error.issues.map((i) => i.message).join(' ')).toContain(
      'aceptar que LURIS te escriba',
    );
  });

  it('un número mal escrito se señala aunque WhatsApp esté apagado', () => {
    const r = esquemaDePreferencias.safeParse({ ...base, numeroWhatsapp: '123' });
    expect(r.success).toBe(false);
  });

  it('rechaza una frecuencia desconocida', () => {
    expect(esquemaDePreferencias.safeParse({ ...base, frecuencia: 'CADA_HORA' }).success).toBe(
      false,
    );
  });

  it('guarda el número normalizado y la fecha del consentimiento', () => {
    const ahora = new Date('2026-11-18T15:00:00Z');
    const entrada = esquemaDePreferencias.parse({
      ...base,
      whatsappActivo: true,
      numeroWhatsapp: '300 123 4567',
      consentimientoWhatsapp: true,
      frecuencia: 'RESUMEN_DIARIO',
    });
    expect(aplicarPreferencias(entrada, PREFERENCIAS_POR_DEFECTO, ahora)).toEqual({
      correoActivo: true,
      whatsappActivo: true,
      numeroWhatsapp: '573001234567',
      consentimientoWhatsappEn: ahora,
      frecuencia: 'RESUMEN_DIARIO',
    });
  });

  it('el consentimiento conserva su fecha mientras el número no cambie, y se renueva si cambia', () => {
    const antes = new Date('2026-01-05T10:00:00Z');
    const ahora = new Date('2026-11-18T15:00:00Z');
    const previas = {
      ...PREFERENCIAS_POR_DEFECTO,
      whatsappActivo: true,
      numeroWhatsapp: '573001234567',
      consentimientoWhatsappEn: antes,
    };
    const mismo = esquemaDePreferencias.parse({
      ...base,
      whatsappActivo: true,
      numeroWhatsapp: '+57 300 123 4567',
      consentimientoWhatsapp: true,
    });
    expect(aplicarPreferencias(mismo, previas, ahora).consentimientoWhatsappEn).toEqual(antes);
    const otro = esquemaDePreferencias.parse({
      ...base,
      whatsappActivo: true,
      numeroWhatsapp: '310 765 4321',
      consentimientoWhatsapp: true,
    });
    expect(aplicarPreferencias(otro, previas, ahora).consentimientoWhatsappEn).toEqual(ahora);
  });

  it('al apagar WhatsApp se retira el consentimiento', () => {
    const previas = {
      ...PREFERENCIAS_POR_DEFECTO,
      whatsappActivo: true,
      numeroWhatsapp: '573001234567',
      consentimientoWhatsappEn: new Date('2026-01-05T10:00:00Z'),
    };
    const entrada = esquemaDePreferencias.parse({ ...base, numeroWhatsapp: '300 123 4567' });
    expect(aplicarPreferencias(entrada, previas, new Date())).toMatchObject({
      whatsappActivo: false,
      consentimientoWhatsappEn: null,
    });
  });
});

describe('programación', () => {
  it('el resumen sale a la próxima hora indicada, en hora de Bogotá', () => {
    // 07:00 en Bogotá = 12:00 UTC.
    expect(proximaHoraDeResumen(new Date('2026-11-18T10:00:00Z'), 7)).toEqual(
      new Date('2026-11-18T12:00:00Z'),
    );
    // Ya pasó hoy: sale mañana.
    expect(proximaHoraDeResumen(new Date('2026-11-18T13:00:00Z'), 7)).toEqual(
      new Date('2026-11-19T12:00:00Z'),
    );
    // Justo en punto: la siguiente (estrictamente posterior).
    expect(proximaHoraDeResumen(new Date('2026-11-18T12:00:00Z'), 7)).toEqual(
      new Date('2026-11-19T12:00:00Z'),
    );
    // Cambio de mes.
    expect(proximaHoraDeResumen(new Date('2026-11-30T20:00:00Z'), 7)).toEqual(
      new Date('2026-12-01T12:00:00Z'),
    );
  });

  it('los reintentos esperan 1, 2, 4, 8… minutos, con tope de una hora', () => {
    expect([1, 2, 3, 4, 5].map((n) => esperaDeReintentoMs(n) / 60_000)).toEqual([1, 2, 4, 8, 16]);
    expect(esperaDeReintentoMs(20) / 60_000).toBe(60);
  });
});

describe('textos del aviso', () => {
  it('muestra las dos fechas OFICIALES de la plataforma, no la de detección', () => {
    expect(lineaDeFechas(actuacion())).toBe('Actuación: 21/10/2026 · Registro: 30/10/2026');
    expect(lineaDeFechas(actuacion({ fechaRegistro: null }))).toBe('Actuación: 21/10/2026');
    const texto = textoDelAviso(aviso());
    expect(texto).toContain('Actuación: 21/10/2026 · Registro: 30/10/2026');
    expect(texto).toContain('Radicado: 50001400300120210034300');
    expect(texto).toContain('Agregar Memorial');
    expect(texto).toContain('Tiene documentos adjuntos.');
    expect(texto).toContain('Rama Judicial (CPNU)');
    expect(texto).toContain(enlaceDelProceso('https://luris.test/', 'p1'));
    expect(texto).toContain('https://luris.test/procesos/p1');
    expect(texto).toContain('https://luris.test/notificaciones');
  });

  it('las actuaciones de Tyba lo dicen', () => {
    const texto = textoDelAviso(
      aviso({ procesos: [proceso({ actuaciones: [actuacion({ origen: 'TYBA' })] })] }),
    );
    expect(texto).toContain('Tyba, vía la Rama Judicial');
  });

  it('el asunto cuenta las actuaciones y nombra el proceso', () => {
    expect(asuntoDelAviso(aviso())).toBe('1 actuación nueva en Ejecutivo Bancolombia');
    const dos = aviso({
      procesos: [proceso({ actuaciones: [actuacion(), actuacion({ id: 'a2' })] })],
    });
    expect(asuntoDelAviso(dos)).toBe('2 actuaciones nuevas en Ejecutivo Bancolombia');
    const resumen = aviso({
      modo: 'RESUMEN_DIARIO',
      procesos: [proceso(), proceso({ procesoId: 'p2', alias: 'Tutela' })],
    });
    expect(asuntoDelAviso(resumen)).toBe('Resumen diario: 2 actuaciones nuevas en 2 procesos');
  });

  it('un resumen agrupa por proceso', () => {
    const texto = textoDelAviso(
      aviso({
        modo: 'RESUMEN_DIARIO',
        procesos: [
          proceso(),
          proceso({ procesoId: 'p2', alias: 'Tutela', radicado: '11001310300120190012300' }),
        ],
      }),
    );
    expect(texto).toContain('resumen diario');
    expect(texto.indexOf('Ejecutivo Bancolombia')).toBeLessThan(texto.indexOf('Tutela'));
    expect(texto).toContain('/procesos/p2');
  });

  it('el aviso de la consulta masiva dice cuántos quedaron listos y con problemas', () => {
    const masiva: AvisoDeConsultaMasiva = {
      tipo: 'CONSULTA_MASIVA',
      destinatario: aviso().destinatario,
      consultaId: 'c1',
      procesos: 400,
      listos: 390,
      conProblemas: 7,
      porConfirmar: 3,
      urlBase: 'https://luris.test',
    };
    expect(asuntoDelAviso(masiva)).toBe('Terminó tu consulta masiva de 400 procesos');
    const texto = textoDelAviso(masiva);
    expect(texto).toContain('Listos: 390');
    expect(texto).toContain('Con problemas: 7');
    expect(texto).toContain('Esperan tu confirmación: 3');
    expect(texto).toContain('https://luris.test/consulta-masiva/c1');
  });
});

describe('estado de un aviso para la persona', () => {
  it('explica cada caso sin códigos técnicos', () => {
    expect(mensajeDeEstadoDeAviso('ENVIADA', null)).toBe('Enviada');
    expect(mensajeDeEstadoDeAviso('PENDIENTE', null)).toContain('En cola');
    expect(mensajeDeEstadoDeAviso('PENDIENTE', 'FALLO_TEMPORAL')).toContain('Reintentando');
    expect(mensajeDeEstadoDeAviso('FALLIDA', 'CANAL_DESACTIVADO')).toContain(
      'desactivaste este canal',
    );
    expect(mensajeDeEstadoDeAviso('FALLIDA', 'DESTINO_INVALIDO')).toContain('no ser válido');
    for (const codigo of ['DESTINO_INVALIDO', 'RECHAZADO', 'FALLO_TEMPORAL', null, 'RARO']) {
      expect(mensajeDeEstadoDeAviso('FALLIDA', codigo)).not.toMatch(
        /[A-Z]{4,}_[A-Z]+|HTTP|SMTP|\b[45]\d\d\b/,
      );
    }
  });

  it('solo se reintentan los fallos pasajeros', () => {
    expect(new ErrorDeEnvio('FALLO_TEMPORAL').transitorio).toBe(true);
    expect(new ErrorDeEnvio('CANAL_NO_DISPONIBLE').transitorio).toBe(true);
    expect(new ErrorDeEnvio('DESTINO_INVALIDO').transitorio).toBe(false);
    expect(new ErrorDeEnvio('RECHAZADO').transitorio).toBe(false);
  });
});

describe('WhatsApp', () => {
  it('convierte entre número y JID', () => {
    expect(jidDeNumero('573001234567')).toBe('573001234567@s.whatsapp.net');
    expect(numeroDeJid('573001234567:12@s.whatsapp.net')).toBe('573001234567');
    expect(numeroDeJid('573001234567@s.whatsapp.net')).toBe('573001234567');
    expect(numeroDeJid('grupo@g.us')).toBeNull();
  });
});
