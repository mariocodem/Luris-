/**
 * Mapa de la interfaz web de SIUGJ que usa el adaptador. Es el ÚNICO lugar que conoce el HTML del
 * portal: si SIUGJ cambia, se ajusta aquí y el resto del adaptador no cambia.
 *
 * ── CONFIRMADO en el portal real (spike del 17/11/2026, docs/plataformas/siugj.md) ──────────────
 * Ingreso de usuarios externos en /principalPortal/index.php: campos #txtUsuario y #txtPasswd, el
 * botón de envío del formulario, el mensaje de error en #lblErr1 («Cuenta Bloqueada», «Cuenta
 * Inactiva»…), la ventana del segundo factor con el campo #txtCodigoAcceso («Ingrese el Código de
 * Acceso») y el destino tras ingresar, /principalPortal/inicio.php.
 *
 * ── PROVISIONAL (sin cuenta de usuario externo no se pudo ver) ────────────────────────────────
 * Cómo se busca un expediente, cómo se presentan sus actuaciones y documentos y qué dice el
 * portal cuando la cuenta no tiene acceso. Está modelado sobre el portal SIUGJ simulado de las
 * pruebas (tests/fixtures/siugj y tests/e2e/servicios-de-apoyo.ts) y debe confirmarse en el
 * spike con una cuenta real antes de activar SIUGJ en producción.
 */
export const MAPA_SIUGJ = {
  ingreso: {
    ruta: '/principalPortal/index.php',
    usuario: '#txtUsuario',
    contrasena: '#txtPasswd',
    enviar: 'form:has(#txtPasswd) [type="submit"]',
    error: '#lblErr1',
    codigoDeAcceso: '#txtCodigoAcceso',
    /** Botón que confirma el código en la ventana del segundo factor (ExtJS). */
    confirmarCodigo: '.x-window button:has-text("Aceptar"), .x-window button:has-text("Validar")',
    /** Tras ingresar, el portal lleva a esta página. */
    inicio: '/principalPortal/inicio.php',
  },
  /** Mensajes de #lblErr1 que significan que la cuenta no puede entrar. */
  rechazos: [/bloquead/i, /inactiv/i, /incorrect/i, /no v[aá]lid/i, /no existe/i],
  /** El portal volvió a pedir el código: el que escribió la persona no sirvió. */
  codigoRechazado: /c[oó]digo.*(incorrect|inv[aá]lid|no v[aá]lid|venci)/i,

  // ── PROVISIONAL ────────────────────────────────────────────────────────────────────────
  expediente: {
    ruta: (radicado: string) =>
      `/principalPortal/consultarExpediente.php?cup=${encodeURIComponent(radicado)}`,
    sinAcceso: '[data-siugj="sin-acceso"]',
    noEncontrado: '[data-siugj="no-encontrado"]',
    datos: '[data-siugj="expediente"]',
    despacho: '[data-siugj="despacho"]',
    claseProceso: '[data-siugj="clase"]',
    fechaRadicacion: '[data-siugj="fecha-radicacion"]',
    sujetos: '[data-siugj="sujeto"]',
    sujetoTipo: '[data-siugj="tipo"]',
    sujetoNombre: '[data-siugj="nombre"]',
    actuaciones: '[data-siugj="actuacion"]',
    actuacionId: 'data-id',
    actuacionFecha: '[data-siugj="fecha-actuacion"]',
    actuacionRegistro: '[data-siugj="fecha-registro"]',
    actuacionDescripcion: '[data-siugj="descripcion"]',
    actuacionAnotacion: '[data-siugj="anotacion"]',
    actuacionDocumentos: '[data-siugj="con-documentos"]',
  },
  documentos: {
    ruta: (idActuacion: string) =>
      `/principalPortal/documentosActuacion.php?actuacion=${encodeURIComponent(idActuacion)}`,
    enlace: 'a[data-siugj="documento"]',
    fecha: 'data-fecha',
  },
} as const;
