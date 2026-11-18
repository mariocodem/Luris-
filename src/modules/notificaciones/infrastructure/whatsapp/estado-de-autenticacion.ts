import type {
  AuthenticationCreds,
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
  SignalDataSet,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';

/**
 * Lo que se usa de Baileys, recibido de afuera: la librería se carga solo en el worker (con
 * `import()` en `socket-baileys.ts`), nunca al arrancar la web.
 */
export interface PiezasDeBaileys {
  readonly BufferJSON: typeof BufferJSON;
  readonly initAuthCreds: typeof initAuthCreds;
  readonly proto: typeof proto;
}

/**
 * Estado de autenticación de Baileys (credenciales + claves de Signal) en memoria, serializable
 * a un solo texto JSON. El gestor lo guarda CIFRADO en la base de datos: nunca en archivos ni en
 * claro (§9). Reemplaza a `useMultiFileAuthState`, que Baileys no recomienda para producción.
 */
export interface EstadoDeAutenticacionPersistible {
  readonly estado: AuthenticationState;
  /** Todo el estado como JSON (con los Buffers codificados), para guardarlo cifrado. */
  exportar(): string;
}

interface DatosGuardados {
  readonly creds: AuthenticationCreds;
  readonly claves: Record<string, unknown>;
}

const clave = (tipo: string, id: string): string => `${tipo}:${id}`;

export function crearEstadoDeAutenticacion(
  json: string | null,
  alCambiar: () => void,
  { BufferJSON, initAuthCreds, proto }: PiezasDeBaileys,
): EstadoDeAutenticacionPersistible {
  const guardado = json ? (JSON.parse(json, BufferJSON.reviver) as DatosGuardados) : null;
  const creds: AuthenticationCreds = guardado?.creds ?? initAuthCreds();
  const claves = new Map<string, unknown>(Object.entries(guardado?.claves ?? {}));

  const estado: AuthenticationState = {
    creds,
    keys: {
      get: <T extends keyof SignalDataTypeMap>(tipo: T, ids: string[]) => {
        const datos: { [id: string]: SignalDataTypeMap[T] } = {};
        for (const id of ids) {
          let valor = claves.get(clave(tipo, id));
          if (tipo === 'app-state-sync-key' && valor) {
            valor = proto.Message.AppStateSyncKeyData.fromObject(valor as object);
          }
          if (valor !== undefined) datos[id] = valor as SignalDataTypeMap[T];
        }
        return datos;
      },
      set: (datos: SignalDataSet) => {
        for (const tipo of Object.keys(datos)) {
          const porId = datos[tipo as keyof SignalDataTypeMap] ?? {};
          for (const id of Object.keys(porId)) {
            const valor = (porId as Record<string, unknown>)[id];
            if (valor) claves.set(clave(tipo, id), valor);
            else claves.delete(clave(tipo, id));
          }
        }
        alCambiar();
      },
      clear: () => {
        claves.clear();
        alCambiar();
      },
    },
  };

  return {
    estado,
    exportar: () =>
      JSON.stringify(
        { creds, claves: Object.fromEntries(claves) } satisfies DatosGuardados,
        BufferJSON.replacer,
      ),
  };
}
