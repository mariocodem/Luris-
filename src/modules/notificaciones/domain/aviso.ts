import { formatearFechaOficial } from '@/shared/domain/fechas';
import type { CodigoPlataforma } from '@/modules/plataformas/domain/plataforma';
import { etiquetaDeOrigen } from '@/modules/plataformas/domain/tyba';
import type { Frecuencia } from './preferencias';

export type CanalDeAviso = 'CORREO' | 'WHATSAPP';

/** Una actuación nueva, con las fechas OFICIALES de la plataforma (§1.4), nunca la de detección. */
export interface ActuacionAvisada {
  readonly id: string;
  readonly plataforma: CodigoPlataforma;
  /** Sistema de origen si llegó por otra plataforma (Tyba por la CPNU). */
  readonly origen: CodigoPlataforma | null;
  readonly fechaActuacion: Date;
  readonly fechaRegistro: Date | null;
  readonly descripcion: string;
  readonly anotacion: string | null;
  readonly tieneDocumentos: boolean;
}

export interface ProcesoAvisado {
  readonly procesoId: string;
  readonly alias: string | null;
  readonly cliente: string | null;
  readonly radicado: string | null;
  readonly nunc: string | null;
  /** Las más recientes primero. */
  readonly actuaciones: readonly ActuacionAvisada[];
}

export interface Destinatario {
  readonly nombre: string;
  readonly email: string;
  readonly numeroWhatsapp: string | null;
}

/** Aviso de actuaciones nuevas: uno por persona, canal y proceso (inmediato) o por persona (resumen). */
export interface AvisoDeActuaciones {
  readonly tipo: 'ACTUACIONES';
  readonly destinatario: Destinatario;
  readonly modo: Frecuencia;
  readonly procesos: readonly ProcesoAvisado[];
  /** Dirección base de LURIS, para los enlaces. */
  readonly urlBase: string;
}

/** Aviso de que terminó una consulta masiva (§7). */
export interface AvisoDeConsultaMasiva {
  readonly tipo: 'CONSULTA_MASIVA';
  readonly destinatario: Destinatario;
  readonly consultaId: string;
  readonly procesos: number;
  readonly listos: number;
  readonly conProblemas: number;
  readonly porConfirmar: number;
  readonly urlBase: string;
}

export type Aviso = AvisoDeActuaciones | AvisoDeConsultaMasiva;

// ─── Textos (compartidos por los canales) ─────────────────────────────────────

export function nombreDelProcesoAvisado(
  proceso: Pick<ProcesoAvisado, 'alias' | 'cliente' | 'radicado' | 'nunc'>,
): string {
  return proceso.alias ?? proceso.cliente ?? proceso.radicado ?? proceso.nunc ?? 'Proceso';
}

export function enlaceDelProceso(urlBase: string, procesoId: string): string {
  return `${urlBase.replace(/\/+$/, '')}/procesos/${procesoId}`;
}

export function enlaceDeLaConsultaMasiva(urlBase: string, consultaId: string): string {
  return `${urlBase.replace(/\/+$/, '')}/consulta-masiva/${consultaId}`;
}

export function enlaceDeNotificaciones(urlBase: string): string {
  return `${urlBase.replace(/\/+$/, '')}/notificaciones`;
}

function plural(cantidad: number, singular: string, pluralizado: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : pluralizado}`;
}

export function totalDeActuaciones(procesos: readonly ProcesoAvisado[]): number {
  return procesos.reduce((suma, p) => suma + p.actuaciones.length, 0);
}

/** Línea con las dos fechas oficiales: «Actuación: 21/10/2026 · Registro: 30/10/2026». */
export function lineaDeFechas(actuacion: ActuacionAvisada): string {
  const partes = [`Actuación: ${formatearFechaOficial(actuacion.fechaActuacion)}`];
  if (actuacion.fechaRegistro) {
    partes.push(`Registro: ${formatearFechaOficial(actuacion.fechaRegistro)}`);
  }
  return partes.join(' · ');
}

export function asuntoDelAviso(aviso: Aviso): string {
  if (aviso.tipo === 'CONSULTA_MASIVA') {
    return `Terminó tu consulta masiva de ${plural(aviso.procesos, 'proceso', 'procesos')}`;
  }
  const cantidad = totalDeActuaciones(aviso.procesos);
  const [primero] = aviso.procesos;
  if (aviso.procesos.length === 1 && primero) {
    return `${plural(cantidad, 'actuación nueva', 'actuaciones nuevas')} en ${nombreDelProcesoAvisado(primero)}`;
  }
  return aviso.modo === 'RESUMEN_DIARIO'
    ? `Resumen diario: ${plural(cantidad, 'actuación nueva', 'actuaciones nuevas')} en ${plural(aviso.procesos.length, 'proceso', 'procesos')}`
    : `${plural(cantidad, 'actuación nueva', 'actuaciones nuevas')} en ${plural(aviso.procesos.length, 'proceso', 'procesos')}`;
}

/** Texto plano del aviso: es el cuerpo de WhatsApp y la versión de texto del correo. */
export function textoDelAviso(aviso: Aviso): string {
  if (aviso.tipo === 'CONSULTA_MASIVA') {
    const lineas = [
      `Hola ${aviso.destinatario.nombre}, terminó tu consulta masiva de ${plural(aviso.procesos, 'proceso', 'procesos')}.`,
      '',
      `Listos: ${aviso.listos}`,
      `Con problemas: ${aviso.conProblemas}`,
    ];
    if (aviso.porConfirmar > 0) lineas.push(`Esperan tu confirmación: ${aviso.porConfirmar}`);
    lineas.push('', `Ver resultados: ${enlaceDeLaConsultaMasiva(aviso.urlBase, aviso.consultaId)}`);
    return lineas.join('\n');
  }

  const cantidad = totalDeActuaciones(aviso.procesos);
  const lineas = [
    aviso.modo === 'RESUMEN_DIARIO'
      ? `Hola ${aviso.destinatario.nombre}, este es tu resumen diario: ${plural(cantidad, 'actuación nueva', 'actuaciones nuevas')}.`
      : `Hola ${aviso.destinatario.nombre}, hay ${plural(cantidad, 'actuación nueva', 'actuaciones nuevas')} en tus procesos.`,
  ];
  for (const proceso of aviso.procesos) {
    lineas.push('', nombreDelProcesoAvisado(proceso));
    if (proceso.radicado) lineas.push(`Radicado: ${proceso.radicado}`);
    if (proceso.nunc) lineas.push(`NUNC: ${proceso.nunc}`);
    for (const actuacion of proceso.actuaciones) {
      lineas.push(
        '',
        `• ${actuacion.descripcion}`,
        `  ${etiquetaDeOrigen(actuacion.plataforma, actuacion.origen)}`,
        `  ${lineaDeFechas(actuacion)}`,
      );
      if (actuacion.tieneDocumentos) lineas.push('  Tiene documentos adjuntos.');
    }
    lineas.push('', `Abrir en LURIS: ${enlaceDelProceso(aviso.urlBase, proceso.procesoId)}`);
  }
  lineas.push('', `Cambia cómo recibes estos avisos en ${enlaceDeNotificaciones(aviso.urlBase)}`);
  return lineas.join('\n');
}
