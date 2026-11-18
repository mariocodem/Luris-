import type { BrowserContext, Page } from 'playwright-core';
import type { Logger } from '@/shared/domain/logger';
import { err, ok, type Result } from '@/shared/domain/result';
import { leerFechaOficial, type FechaOficial } from '@/shared/domain/fechas';
import { limpiarTexto } from '../../domain/actuaciones';
import type {
  ActuacionExterna,
  ArchivoDescargado,
  DocumentoExterno,
  ExpedienteExterno,
  ResultadoConsulta,
  SujetoProcesal,
} from '../../domain/consulta';
import { type CodigoErrorPlataforma, ErrorPlataforma } from '../../domain/errores';
import type {
  CompletadorDeIngreso,
  ContextoConsulta,
  CuentaDePlataforma,
  DescargadorDeDocumentos,
  PlataformaJudicial,
  ProveedorDeCuentas,
  VerificadorDeAcceso,
} from '../../domain/puertos';
import type { LimitadorDeRitmo } from '../http/limitador-de-ritmo';
import { MAPA_SIUGJ as MAPA } from './mapa-del-portal';
import type { NavegadorAutomatizado } from './navegador';

/**
 * Adaptador de SIUGJ (§6.4): consulta con la cuenta de usuario externo del abogado (o del
 * despacho), con un navegador automatizado, porque el portal necesita JavaScript.
 *
 * - Reutiliza la sesión guardada (cifrada) y solo ingresa cuando venció (§6: no iniciar sesión en
 *   cada consulta).
 * - Si SIUGJ pide el código de acceso (segundo factor), deja el ingreso abierto en memoria y la
 *   consulta queda esperando que la persona escriba el código en LURIS (CompletadorDeIngreso).
 *   LURIS nunca lee el correo ni evade el factor. Si nadie lo escribe a tiempo, el ingreso vence.
 * - «No tienes acceso a este expediente» es SIN_ACCESO, con un mensaje que dice a quién pedirlo.
 *
 * El usuario, la contraseña, la sesión y el código nunca se registran en el log.
 */

const PLATAFORMA = 'SIUGJ';

export interface OpcionesSiugj {
  /** p. ej. https://siugj.ramajudicial.gov.co */
  readonly urlBase: string;
  readonly navegador: NavegadorAutomatizado;
  readonly cuentas: ProveedorDeCuentas;
  readonly limitador: LimitadorDeRitmo;
  readonly tiempoLimiteMs: number;
  /** Minutos que el ingreso espera el código de acceso antes de cerrarse. */
  readonly minutosParaCodigo: number;
  readonly logger: Logger;
  readonly ahora?: () => number;
}

type ResultadoDeIngreso = 'DENTRO' | 'CODIGO' | 'RECHAZADO';

interface IngresoEnEspera {
  readonly contexto: BrowserContext;
  readonly pagina: Page;
  readonly venceEn: number;
}

export type AdaptadorSiugj = PlataformaJudicial &
  DescargadorDeDocumentos &
  CompletadorDeIngreso &
  VerificadorDeAcceso & {
    /** Cierra los ingresos en espera y el navegador (al detener el worker). */
    cerrar(): Promise<void>;
  };

export function crearAdaptadorSiugj(opciones: OpcionesSiugj): AdaptadorSiugj {
  const base = opciones.urlBase.replace(/\/+$/, '');
  const host = new URL(base).host;
  const logger = opciones.logger.child({ plataforma: PLATAFORMA });
  const ahora = opciones.ahora ?? Date.now;
  /** Ingresos que esperan el código de acceso, por credencial. Viven en este worker. */
  const enEspera = new Map<string, IngresoEnEspera>();

  function fallo(
    codigo: CodigoErrorPlataforma,
    detalle: string,
    intervencion: 'CODIGO_DE_ACCESO' | null = null,
  ): ErrorPlataforma {
    if (codigo === 'RESPUESTA_INESPERADA')
      logger.error('Respuesta inesperada de SIUGJ', { detalle });
    return new ErrorPlataforma(PLATAFORMA, codigo, detalle, undefined, intervencion);
  }

  function falloPorExcepcion(error: unknown, paso: string): ErrorPlataforma {
    const nombre = error instanceof Error ? error.name : 'desconocido';
    const mensaje = error instanceof Error ? error.message : '';
    // Tiempo agotado o red caída: pasajero. Lo demás (cambió el portal, no hay navegador…), no.
    if (nombre === 'TimeoutError' || /net::ERR_|ECONNREFUSED|ENOTFOUND/i.test(mensaje)) {
      return fallo('PLATAFORMA_NO_DISPONIBLE', `${paso}: ${nombre}`);
    }
    return fallo('RESPUESTA_INESPERADA', `${paso}: ${nombre}`);
  }

  async function ir(pagina: Page, ruta: string, ctx: ContextoConsulta): Promise<void> {
    if ((await opciones.limitador.esperarTurno(ctx.signal)) === 'PAUSADO') {
      throw Object.assign(new Error('SIUGJ en pausa'), { name: 'PausaDeSiugj' });
    }
    await pagina.goto(`${base}${ruta}`, {
      waitUntil: 'domcontentloaded',
      timeout: opciones.tiempoLimiteMs,
    });
  }

  function limpiarVencidos(): void {
    for (const [credencialId, espera] of enEspera) {
      if (espera.venceEn <= ahora()) {
        enEspera.delete(credencialId);
        void espera.contexto.close().catch(() => undefined);
      }
    }
  }

  async function sesionActiva(pagina: Page, ctx: ContextoConsulta): Promise<boolean> {
    await ir(pagina, MAPA.ingreso.inicio, ctx);
    return (
      new URL(pagina.url()).pathname === MAPA.ingreso.inicio &&
      (await pagina.locator(MAPA.ingreso.contrasena).count()) === 0
    );
  }

  /** Llena el formulario de ingreso real de SIUGJ y espera a ver qué responde. */
  async function ingresar(
    pagina: Page,
    usuario: string,
    secreto: string,
    ctx: ContextoConsulta,
  ): Promise<ResultadoDeIngreso> {
    await ir(pagina, MAPA.ingreso.ruta, ctx);
    await pagina.fill(MAPA.ingreso.usuario, usuario);
    await pagina.fill(MAPA.ingreso.contrasena, secreto);
    await pagina.click(MAPA.ingreso.enviar);
    const espera = { timeout: opciones.tiempoLimiteMs };
    return Promise.any([
      pagina.waitForURL(`**${MAPA.ingreso.inicio}*`, espera).then(() => 'DENTRO' as const),
      pagina
        .locator(MAPA.ingreso.codigoDeAcceso)
        .waitFor({ state: 'visible', ...espera })
        .then(() => 'CODIGO' as const),
      pagina
        .locator(MAPA.ingreso.error)
        .filter({ hasText: /\S/ })
        .waitFor({ state: 'visible', ...espera })
        .then(async () => {
          const texto = (await pagina.locator(MAPA.ingreso.error).textContent()) ?? '';
          if (!MAPA.rechazos.some((patron) => patron.test(texto))) {
            throw new Error('mensaje de ingreso no reconocido');
          }
          return 'RECHAZADO' as const;
        }),
    ]).catch((errores: unknown) => {
      // Ninguna de las tres señales llegó: el portal no respondió o cambió.
      const primero = errores instanceof AggregateError ? (errores.errors[0] as unknown) : errores;
      throw primero instanceof Error ? primero : new Error('ingreso sin respuesta');
    });
  }

  async function guardarSesion(contexto: BrowserContext, cuenta: CuentaDePlataforma) {
    await cuenta.guardarSesion(JSON.stringify(await contexto.storageState()));
  }

  /**
   * Abre una página con sesión de la cuenta del proceso, ingresando si hace falta. Devuelve el
   * error de plataforma si no se pudo (sin cuenta, código pendiente, rechazo…).
   */
  async function conSesion<T>(
    ctx: ContextoConsulta,
    paso: string,
    trabajo: (pagina: Page) => Promise<Result<T, ErrorPlataforma>>,
  ): Promise<Result<T, ErrorPlataforma>> {
    limpiarVencidos();
    if (!ctx.alcance) return err(fallo('RESPUESTA_INESPERADA', `${paso}: consulta sin proceso`));
    const cuenta = await opciones.cuentas.cuentaPara(ctx.alcance, PLATAFORMA);
    if (!cuenta) return err(fallo('SIN_CREDENCIAL', `${paso}: sin credencial`));
    if (cuenta.esperandoCodigo) {
      return err(fallo('REQUIERE_INTERVENCION', `${paso}: esperando código`, 'CODIGO_DE_ACCESO'));
    }

    let contexto: BrowserContext | null = null;
    let conservarContexto = false;
    try {
      contexto = await opciones.navegador.nuevoContexto(cuenta.sesion);
      const pagina = await contexto.newPage();
      if (!(await sesionActiva(pagina, ctx))) {
        const ingreso = await ingresar(pagina, cuenta.usuario, cuenta.secreto, ctx);
        if (ingreso === 'RECHAZADO') {
          await cuenta.registrarRechazo();
          return err(fallo('CREDENCIALES_INVALIDAS', `${paso}: SIUGJ no aceptó la cuenta`));
        }
        if (ingreso === 'CODIGO') {
          enEspera.set(cuenta.credencialId, {
            contexto,
            pagina,
            venceEn: ahora() + opciones.minutosParaCodigo * 60_000,
          });
          conservarContexto = true;
          await cuenta.esperarCodigo();
          return err(
            fallo('REQUIERE_INTERVENCION', `${paso}: SIUGJ pidió código`, 'CODIGO_DE_ACCESO'),
          );
        }
      }
      const resultado = await trabajo(pagina);
      // La sesión pudo renovarse durante la consulta: se guarda la más reciente.
      await guardarSesion(contexto, cuenta);
      return resultado;
    } catch (error) {
      if (error instanceof Error && error.name === 'PausaDeSiugj') {
        return err(fallo('LIMITE_DE_CONSULTAS', `${paso}: pausa`));
      }
      if (ctx.signal?.aborted) return err(fallo('PLATAFORMA_NO_DISPONIBLE', `${paso}: cancelado`));
      return err(falloPorExcepcion(error, paso));
    } finally {
      if (contexto && !conservarContexto) await contexto.close().catch(() => undefined);
    }
  }

  async function leerExpediente(
    pagina: Page,
    radicado: string,
    ctx: ContextoConsulta,
  ): Promise<Result<ResultadoConsulta, ErrorPlataforma>> {
    const e = MAPA.expediente;
    await ir(pagina, e.ruta(radicado), ctx);
    const primero = pagina.locator(`${e.sinAcceso}, ${e.noEncontrado}, ${e.datos}`).first();
    await primero.waitFor({ state: 'attached', timeout: opciones.tiempoLimiteMs });
    if ((await pagina.locator(e.sinAcceso).count()) > 0) {
      return err(fallo('SIN_ACCESO', 'SIUGJ: la cuenta no tiene acceso al expediente'));
    }
    if ((await pagina.locator(e.noEncontrado).count()) > 0) {
      return err(fallo('NO_ENCONTRADO', 'SIUGJ: expediente no encontrado'));
    }

    const texto = async (selector: string) =>
      limpiarTexto(await pagina.locator(selector).first().textContent());
    const expediente: ExpedienteExterno = {
      idExterno: radicado,
      despachoJudicial: await texto(e.despacho),
      departamento: null,
      ponente: null,
      tipoProceso: null,
      claseProceso: await texto(e.claseProceso),
      subclaseProceso: null,
      recurso: null,
      ubicacion: null,
      fechaRadicacion: leerFechaDelPortal(await texto(e.fechaRadicacion)),
      ultimaActuacion: null,
      sujetos: await leerSujetos(pagina),
      reservado: false,
      detalles: [],
      urlDeConsulta: `${base}${e.ruta(radicado)}`,
    };

    const actuaciones: ActuacionExterna[] = [];
    for (const fila of await pagina.locator(e.actuaciones).all()) {
      const fechaActuacion = leerFechaDelPortal(
        limpiarTexto(await fila.locator(e.actuacionFecha).textContent()),
      );
      const descripcion = limpiarTexto(await fila.locator(e.actuacionDescripcion).textContent());
      // Sin fecha oficial o sin descripción no es una actuación utilizable (§1.4).
      if (!fechaActuacion || !descripcion) {
        return err(fallo('RESPUESTA_INESPERADA', 'SIUGJ: actuación sin fecha o descripción'));
      }
      actuaciones.push({
        idExterno: await fila.getAttribute(e.actuacionId),
        expediente: radicado,
        despachoJudicial: expediente.despachoJudicial,
        fechaActuacion,
        fechaRegistro: leerFechaDelPortal(
          limpiarTexto(await fila.locator(e.actuacionRegistro).textContent()),
        ),
        descripcion,
        anotacion: limpiarTexto(await fila.locator(e.actuacionAnotacion).textContent()),
        terminoInicia: null,
        terminoVence: null,
        tieneDocumentos: (await fila.locator(e.actuacionDocumentos).count()) > 0,
      });
    }
    const ultima =
      actuaciones
        .map((a) => a.fechaActuacion)
        .sort()
        .at(-1) ?? null;
    return ok({
      plataforma: PLATAFORMA,
      expedientes: [{ ...expediente, ultimaActuacion: ultima }],
      actuaciones,
    });
  }

  async function leerSujetos(pagina: Page): Promise<SujetoProcesal[]> {
    const e = MAPA.expediente;
    const sujetos: SujetoProcesal[] = [];
    for (const fila of await pagina.locator(e.sujetos).all()) {
      const tipo = limpiarTexto(await fila.locator(e.sujetoTipo).textContent());
      const nombre = limpiarTexto(await fila.locator(e.sujetoNombre).textContent());
      if (tipo && nombre) sujetos.push({ tipo, nombre });
    }
    return sujetos;
  }

  /** Una dirección de documento solo se sigue si es del propio SIUGJ (nunca otro sitio). */
  function direccionPropia(ruta: string): URL | null {
    try {
      const url = new URL(ruta, `${base}/`);
      return url.host === host ? url : null;
    } catch {
      return null;
    }
  }

  return {
    codigo: PLATAFORMA,
    identificador: 'RADICADO',
    plataforma: PLATAFORMA,

    consultar(radicado, ctx) {
      return conSesion(ctx, 'consulta', (pagina) => leerExpediente(pagina, radicado, ctx));
    },

    listar(idExternoActuacion, ctx) {
      return conSesion(ctx, 'documentos', async (pagina) => {
        await ir(pagina, MAPA.documentos.ruta(idExternoActuacion), ctx);
        const documentos: DocumentoExterno[] = [];
        for (const enlace of await pagina.locator(MAPA.documentos.enlace).all()) {
          const href = await enlace.getAttribute('href');
          const url = href ? direccionPropia(href) : null;
          const nombre = limpiarTexto(await enlace.textContent());
          if (!url || !nombre) continue;
          documentos.push({
            idExterno: `${url.pathname}${url.search}`,
            nombre,
            fechaCarga: leerFechaDelPortal(await enlace.getAttribute(MAPA.documentos.fecha)),
            urlOrigen: url.toString(),
          });
        }
        return ok(documentos);
      });
    },

    async descargar(idExternoDocumento, tamanoMaximo, ctx) {
      const url = direccionPropia(idExternoDocumento);
      if (!url) return err(fallo('NO_ENCONTRADO', 'SIUGJ: documento con dirección ajena'));
      const resultado = await conSesion<ArchivoDescargado | 'DEMASIADO_GRANDE'>(
        ctx,
        'descarga',
        async (pagina) => {
          if ((await opciones.limitador.esperarTurno(ctx.signal)) === 'PAUSADO') {
            return err(fallo('LIMITE_DE_CONSULTAS', 'descarga: pausa'));
          }
          const respuesta = await pagina.request.get(url.toString(), {
            timeout: opciones.tiempoLimiteMs,
          });
          if (respuesta.status() === 404) return err(fallo('NO_ENCONTRADO', 'descarga: 404'));
          if (!respuesta.ok()) {
            return err(fallo('PLATAFORMA_NO_DISPONIBLE', `descarga: HTTP ${respuesta.status()}`));
          }
          const declarado = Number(respuesta.headers()['content-length'] ?? 0);
          const cuerpo = declarado > tamanoMaximo ? null : await respuesta.body();
          if (!cuerpo || cuerpo.length > tamanoMaximo) return ok('DEMASIADO_GRANDE' as const);
          return ok({
            contenido: new Uint8Array(cuerpo),
            tipoDeclarado: respuesta.headers()['content-type'] ?? null,
          });
        },
      );
      if (!resultado.ok) return resultado;
      if (resultado.value === 'DEMASIADO_GRANDE') return err('DEMASIADO_GRANDE');
      return ok(resultado.value);
    },

    async completar(credencialId, codigo, ctx) {
      limpiarVencidos();
      const espera = enEspera.get(credencialId);
      if (!espera) return err('INGRESO_VENCIDO');
      const { pagina, contexto } = espera;
      try {
        await pagina.fill(MAPA.ingreso.codigoDeAcceso, codigo);
        const alInicio = pagina
          .waitForURL(`**${MAPA.ingreso.inicio}*`, { timeout: opciones.tiempoLimiteMs })
          .then(() => 'DENTRO' as const);
        // El mensaje de un código equivocado anterior puede seguir en pantalla: se decide cuando
        // llega la respuesta del portal a ESTE envío, no al primer texto visible.
        const respuesta = pagina.waitForResponse(
          (r) => r.request().method() === 'POST' && new URL(r.url()).host === host,
          { timeout: opciones.tiempoLimiteMs },
        );
        await pagina.click(MAPA.ingreso.confirmarCodigo);
        const resultado = await Promise.race([
          alInicio,
          respuesta.then(async () => {
            // Deja que el portal pinte su respuesta (mensaje o redirección).
            await pagina.waitForTimeout(300);
            if (new URL(pagina.url()).pathname === MAPA.ingreso.inicio) return 'DENTRO' as const;
            const rechazado = await pagina.getByText(MAPA.codigoRechazado).first().isVisible();
            return rechazado ? ('RECHAZADO' as const) : alInicio;
          }),
        ]);
        if (resultado === 'RECHAZADO') {
          alInicio.catch(() => undefined);
          return err('CODIGO_INVALIDO');
        }
        const sesion = JSON.stringify(await contexto.storageState());
        enEspera.delete(credencialId);
        await contexto.close().catch(() => undefined);
        return ok({ sesion });
      } catch (error) {
        enEspera.delete(credencialId);
        await contexto.close().catch(() => undefined);
        if (ctx.signal?.aborted) return err('INGRESO_VENCIDO');
        return err(falloPorExcepcion(error, 'código de acceso'));
      }
    },

    async verificar(usuario, secreto, ctx, credencialId) {
      limpiarVencidos();
      let contexto: BrowserContext | null = null;
      let conservarContexto = false;
      try {
        contexto = await opciones.navegador.nuevoContexto(null);
        const pagina = await contexto.newPage();
        const ingreso = await ingresar(pagina, usuario, secreto, ctx);
        if (ingreso === 'RECHAZADO') {
          return err(fallo('CREDENCIALES_INVALIDAS', 'verificación: SIUGJ no aceptó la cuenta'));
        }
        if (ingreso === 'CODIGO') {
          enEspera.set(credencialId, {
            contexto,
            pagina,
            venceEn: ahora() + opciones.minutosParaCodigo * 60_000,
          });
          conservarContexto = true;
          return err(
            fallo('REQUIERE_INTERVENCION', 'verificación: SIUGJ pidió código', 'CODIGO_DE_ACCESO'),
          );
        }
        return ok({ sesion: JSON.stringify(await contexto.storageState()) });
      } catch (error) {
        if (error instanceof Error && error.name === 'PausaDeSiugj') {
          return err(fallo('LIMITE_DE_CONSULTAS', 'verificación: pausa'));
        }
        return err(falloPorExcepcion(error, 'verificación'));
      } finally {
        if (contexto && !conservarContexto) await contexto.close().catch(() => undefined);
      }
    },

    async cerrar() {
      for (const espera of enEspera.values()) await espera.contexto.close().catch(() => undefined);
      enEspera.clear();
      await opciones.navegador.cerrar();
    },
  };
}

/** SIUGJ muestra las fechas como dd/mm/aaaa (a veces con hora); se guardan como día oficial. */
export function leerFechaDelPortal(texto: string | null): FechaOficial | null {
  if (!texto) return null;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto.trim());
  if (dmy) return leerFechaOficial(`${dmy[3]}-${dmy[2]}-${dmy[1]}`);
  return leerFechaOficial(texto);
}
