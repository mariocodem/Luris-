import type { PgBoss, Queue } from 'pg-boss';
import { z } from 'zod';
import type {
  ColaDeTrabajos,
  EstadoDeTrabajo,
  SolicitudDeSincronizacion,
} from '../application/puertos';
import { CODIGOS_DE_PLATAFORMA, type CodigoPlataforma } from '../domain/plataforma';
import { ESTADOS_DE_CONSULTA } from '../domain/plataforma';

/**
 * Colas de pg-boss de las plataformas. Una cola por plataforma, así cada una tiene su propio
 * límite de concurrencia en el worker (§6) y una plataforma lenta no frena a las demás.
 */

function sufijo(plataforma: CodigoPlataforma): string {
  return plataforma.toLowerCase().replaceAll('_', '-');
}

export const NOMBRES_DE_COLA = {
  sincronizar: (plataforma: CodigoPlataforma) => `sincronizar-${sufijo(plataforma)}`,
  documentos: (plataforma: CodigoPlataforma) => `documentos-${sufijo(plataforma)}`,
  programada: 'sincronizacion-programada',
  verificarCredencial: 'verificar-credencial',
} as const;

/** Prioridad de lo que pide una persona («Consultar ahora») frente a lo programado. */
const PRIORIDAD_ALTA = 10;

/**
 * - stately: a lo sumo un trabajo en espera y uno en curso por proceso (singletonKey).
 * - Reintentos con espera exponencial: 1, 2, 4, 8 y 16 minutos (con variación), tope de 1 hora.
 */
const OPCIONES_SINCRONIZAR: Omit<Queue, 'name'> = {
  policy: 'stately',
  retryLimit: 5,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 3600,
  expireInSeconds: 900,
  deleteAfterSeconds: 2 * 24 * 3600,
};

const OPCIONES_DOCUMENTOS: Omit<Queue, 'name'> = {
  ...OPCIONES_SINCRONIZAR,
  expireInSeconds: 1800,
};

const OPCIONES_PROGRAMADA: Omit<Queue, 'name'> = {
  policy: 'singleton',
  retryLimit: 1,
  retryDelay: 300,
  expireInSeconds: 1800,
};

/** Crea las colas si no existen (es idempotente). La llaman la web y el worker al iniciar. */
export async function asegurarColas(
  boss: PgBoss,
  plataformas: {
    readonly sincronizables: readonly CodigoPlataforma[];
    readonly conDocumentos: readonly CodigoPlataforma[];
  },
): Promise<void> {
  for (const plataforma of plataformas.sincronizables) {
    await boss.createQueue(NOMBRES_DE_COLA.sincronizar(plataforma), OPCIONES_SINCRONIZAR);
  }
  for (const plataforma of plataformas.conDocumentos) {
    await boss.createQueue(NOMBRES_DE_COLA.documentos(plataforma), OPCIONES_DOCUMENTOS);
  }
  await boss.createQueue(NOMBRES_DE_COLA.programada, OPCIONES_PROGRAMADA);
  // Un intento de ingreso por credencial a la vez; pocos reintentos (no bloquear la cuenta).
  await boss.createQueue(NOMBRES_DE_COLA.verificarCredencial, {
    policy: 'stately',
    retryLimit: 3,
    retryDelay: 300,
    retryBackoff: true,
    expireInSeconds: 300,
  });
}

// ─── Datos de los trabajos (validados al leerlos: vienen de la base de datos) ──────

export const esquemaSolicitud = z.object({
  despachoId: z.uuid(),
  procesoId: z.uuid(),
  plataforma: z.enum(CODIGOS_DE_PLATAFORMA),
});

export const esquemaVerificacion = z.object({
  despachoId: z.uuid(),
  credencialId: z.uuid(),
});

export const esquemaDocumentos = z.object({
  despachoId: z.uuid(),
  actuacionId: z.uuid(),
  plataforma: z.enum(CODIGOS_DE_PLATAFORMA),
});

const esquemaResumen = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('SINCRONIZADO'),
    nuevas: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    cargaInicial: z.boolean(),
    reservado: z.boolean(),
    soloDatos: z.boolean().optional(),
  }),
  z.object({
    tipo: z.literal('FALLIDO'),
    codigo: z.enum(ESTADOS_DE_CONSULTA).exclude(['EXITOSA']),
  }),
  z.object({
    tipo: z.literal('OMITIDO'),
    motivo: z.enum(['PROCESO_NO_ENCONTRADO', 'SIN_IDENTIFICADOR', 'PLATAFORMA_NO_CONFIGURADA']),
  }),
]);

function estadoDe(trabajo: { readonly state: string; readonly output: unknown }): EstadoDeTrabajo {
  switch (trabajo.state) {
    case 'created':
      return { estado: 'EN_COLA' };
    case 'active':
      return { estado: 'EN_CURSO' };
    case 'retry':
      return { estado: 'REINTENTANDO' };
    case 'completed': {
      const resumen = esquemaResumen.safeParse(trabajo.output);
      return resumen.success
        ? { estado: 'TERMINADO', resumen: resumen.data }
        : { estado: 'FALLIDO' };
    }
    default:
      return { estado: 'FALLIDO' };
  }
}

export function crearColaDeTrabajos(obtenerBoss: () => Promise<PgBoss>): ColaDeTrabajos {
  return {
    async encolarSincronizacion(solicitud, prioridad) {
      const boss = await obtenerBoss();
      const nombre = NOMBRES_DE_COLA.sincronizar(solicitud.plataforma);
      const datos = { ...solicitud };
      if (prioridad === 'NORMAL') {
        const id = await boss.send(nombre, datos, { singletonKey: solicitud.procesoId });
        if (id) return id;
      } else {
        // Si ya hay uno en espera (p. ej. de la sincronización programada o esperando un
        // reintento), se adelanta y se le sube la prioridad en vez de crear otro.
        const respuesta = await boss.upsert(nombre, datos, {
          singletonKey: solicitud.procesoId,
          priority: PRIORIDAD_ALTA,
          startAfter: new Date(),
        });
        const id = respuesta.jobs[0];
        if (id) return id;
      }
      const [existente] = await boss.findJobs(nombre, { key: solicitud.procesoId, queued: true });
      if (existente) return existente.id;
      throw new Error(`No se pudo encolar la sincronización de ${solicitud.procesoId}`);
    },

    async encolarSincronizaciones(solicitudes: readonly SolicitudDeSincronizacion[]) {
      const boss = await obtenerBoss();
      const porCola = new Map<string, SolicitudDeSincronizacion[]>();
      for (const solicitud of solicitudes) {
        const nombre = NOMBRES_DE_COLA.sincronizar(solicitud.plataforma);
        porCola.set(nombre, [...(porCola.get(nombre) ?? []), solicitud]);
      }
      let creados = 0;
      for (const [nombre, lote] of porCola) {
        // Los que ya tienen un trabajo en espera se omiten (política stately).
        const ids = await boss.insert(
          nombre,
          lote.map((solicitud) => ({ data: { ...solicitud }, singletonKey: solicitud.procesoId })),
          { returnId: true },
        );
        creados += ids?.length ?? 0;
      }
      return creados;
    },

    async estadoDeSincronizacion(plataforma, idTrabajo) {
      if (!z.uuid().safeParse(idTrabajo).success) return null;
      const boss = await obtenerBoss();
      const trabajo = await boss.getJobById<unknown>(
        NOMBRES_DE_COLA.sincronizar(plataforma),
        idTrabajo,
      );
      if (!trabajo) return null;
      const datos = esquemaSolicitud.safeParse(trabajo.data);
      if (!datos.success) return null;
      return {
        despachoId: datos.data.despachoId,
        procesoId: datos.data.procesoId,
        estado: estadoDe(trabajo),
      };
    },

    async encolarVerificacion(datos) {
      const boss = await obtenerBoss();
      await boss.send(
        NOMBRES_DE_COLA.verificarCredencial,
        { ...datos },
        {
          singletonKey: datos.credencialId,
        },
      );
    },

    async encolarDocumentos(datos) {
      const boss = await obtenerBoss();
      await boss.send(
        NOMBRES_DE_COLA.documentos(datos.plataforma),
        { ...datos },
        {
          singletonKey: datos.actuacionId,
        },
      );
    },
  };
}
