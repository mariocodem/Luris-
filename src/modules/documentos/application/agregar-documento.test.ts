import { describe, expect, it } from 'vitest';
import type { EventoDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import type {
  DetalleDeProceso,
  RepositorioDeProcesos,
} from '@/modules/procesos/application/puertos';
import type { ContextoMiembro } from '@/modules/usuarios/application/contexto-de-sesion';
import type { RolDeDespacho } from '@/modules/usuarios/domain/rol-de-despacho';
import { crearAgregarDocumento } from './agregar-documento';
import type { AlmacenDeArchivos, RepositorioDeDocumentos } from './puertos';

const DESPACHO = { id: '00000000-0000-7000-8000-000000000001', nombre: 'Despacho Demo' };
const PROCESO = '00000000-0000-7000-8000-0000000000a1';
const ACTUACION = '00000000-0000-7000-8000-0000000000c1';
const PDF = new TextEncoder().encode('%PDF-1.7 auto que admite');

function sesion(rol: RolDeDespacho, membresiaId = `m-${rol}`): ContextoMiembro {
  return {
    usuarioId: `u-${membresiaId}`,
    nombre: rol,
    email: `${rol}@demo.test`,
    perfil: rol,
    despacho: DESPACHO,
    membresiaId,
  };
}

function escenario() {
  const proceso: DetalleDeProceso = {
    id: PROCESO,
    radicado: '05001233300020160013200',
    nunc: null,
    alias: 'Nulidad',
    cliente: null,
    activo: true,
    creadoEn: new Date(),
    etiquetas: [],
    asignaciones: [
      {
        membresiaId: 'm-abogado',
        tipo: 'RESPONSABLE',
        nombre: 'Carlos',
        rol: 'abogado',
        activa: true,
      },
    ],
    plataformas: [],
    actuaciones: [],
    totalActuaciones: 1,
  };
  const noUsado = () => {
    throw new Error('no se usa');
  };
  const procesos = {
    buscar: async (_d: string, id: string) => (id === PROCESO ? proceso : null),
  } as unknown as RepositorioDeProcesos;
  const registrados: { nombre: string; subidoPorId: string; tipoMime: string }[] = [];
  const documentos: RepositorioDeDocumentos = {
    actuacionDeOrigen: noUsado,
    registrarReferencias: noUsado,
    pendientes: noUsado,
    marcarDescargado: noUsado,
    marcarNoDisponible: noUsado,
    paraAbrir: noUsado,
    procesoDeLaActuacion: async (_d, id) =>
      id === ACTUACION ? PROCESO : id === 'de-otro' ? 'otro-proceso' : null,
    async registrarSubido(_d, datos) {
      registrados.push(datos);
      return { id: 'doc-1' };
    },
  };
  const almacen: AlmacenDeArchivos = {
    guardar: async (_d, contenido) => ({
      ruta: 'r',
      sha256: 'a'.repeat(64),
      tamanoBytes: contenido.byteLength,
    }),
    abrir: async () => null,
  };
  const eventos: EventoDeAuditoria[] = [];
  const agregar = crearAgregarDocumento({
    procesos,
    documentos,
    almacen,
    auditoria: { registrar: async (e) => void eventos.push(e) },
    reloj: { ahora: () => new Date() },
    tamanoMaximoBytes: 1024,
  });
  return { agregar, registrados, eventos };
}

const SUBIDA = {
  procesoId: PROCESO,
  actuacionId: ACTUACION,
  nombre: 'Auto admite',
  contenido: PDF,
  ip: null,
};

describe('agregar un documento a mano', () => {
  it('guarda el archivo con el tipo real, quién lo subió, y lo audita', async () => {
    const { agregar, registrados, eventos } = escenario();
    const r = await agregar(sesion('abogado'), SUBIDA);
    expect(r).toEqual({ ok: true, value: { id: 'doc-1', nombre: 'Auto admite.pdf' } });
    expect(registrados[0]).toMatchObject({ tipoMime: 'application/pdf', subidoPorId: 'm-abogado' });
    expect(eventos[0]).toMatchObject({ accion: 'DOCUMENTO_AGREGADO', entidadId: 'doc-1' });
  });

  it('exige poder editar el proceso (quien no lo ve recibe «no encontrado»)', async () => {
    const r = await escenario().agregar(sesion('asistente'), SUBIDA);
    expect(r.ok || r.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('rechaza una actuación de otro proceso', async () => {
    const r = await escenario().agregar(sesion('administrador'), {
      ...SUBIDA,
      actuacionId: 'de-otro',
    });
    expect(r.ok || r.error.codigo).toBe('NO_ENCONTRADO');
  });

  it.each([
    ['vacío', new Uint8Array(), 'vacío'],
    ['muy grande', new Uint8Array(2048).fill(37), 'pesa más de'],
    ['de otro formato', new TextEncoder().encode('<html>hola</html>'), 'no es un PDF'],
  ])('rechaza un archivo %s con un mensaje claro', async (_caso, contenido, mensaje) => {
    const { agregar, registrados } = escenario();
    const r = await agregar(sesion('administrador'), { ...SUBIDA, contenido });
    expect(r.ok || r.error.codigo).toBe('DOCUMENTO_INVALIDO');
    expect(!r.ok && r.error.mensajeUsuario).toContain(mensaje);
    expect(registrados).toEqual([]);
  });
});
