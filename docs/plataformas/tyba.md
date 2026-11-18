# Tyba — Red integrada para la gestión de procesos judiciales (Justicia XXI Web)

Spike de la Fase 9 (17/11/2026). Se leyó el portal público con un navegador, sin enviar
formularios y sin resolver retos, y se hizo una sola solicitud de comprobación a la CPNU. La
implementación está en `src/modules/plataformas/domain/tyba.ts` (detección y descarga asistida) y
en el adaptador de la CPNU (`infrastructure/rama-cpnu/`).

## Qué es Tyba

- El portal `https://procesojudicial.ramajudicial.gov.co/Justicia21/` se titula **TYBA** y dice
  «Red integrada para la gestión de procesos judiciales en línea» (UTDI, Rama Judicial). Ofrece
  dos aplicaciones: **Justicia XXI Web** («Sistema para la gestión de procesos judiciales») y
  Emplazados.
- Justicia XXI Web es el sistema de los despachos; **Tyba** es como se conoce a esa red. La CPNU
  muestra sus procesos junto con los del sistema anterior (Justicia XXI cliente-servidor).
- En la CPNU un mismo radicado puede tener dos registros: uno del sistema anterior y otro de
  Tyba (caso real de un ejecutivo en Villavicencio). Los de Tyba traen la ubicación
  **«Software: Justicia XXI Web»**; los anteriores, una ubicación física («Secretaria - Estado»,
  «Archivo»). Esa es la señal que usa LURIS (`esExpedienteDeTyba`); se observó en un solo
  proceso real, así que si la CPNU la cambia solo hay que ajustar esa función.

## Actuaciones: por la CPNU (automático, sin reto)

Es la vía de LURIS para Tyba: el adaptador de la CPNU trae las actuaciones con sus fechas
oficiales (actuación y registro) y ahora marca el expediente y cada actuación con
`sistema`/`origen = TYBA`. En la ficha del proceso se ve «Tyba, vía la Rama Judicial» en cada
actuación y «Sistema: Tyba (Justicia XXI Web)» en los datos del expediente. Las ya guardadas en
consultas anteriores se marcan en la siguiente sincronización, sin duplicarlas.

## Documentos: la vía automática no existe todavía

1. **CPNU**: lista los documentos de cada actuación de Tyba (nombre, fecha de carga, `tipo`, y un
   `guidDocumento_SXXIW` propio de Justicia XXI Web), pero su ruta de descarga
   (`/Descarga/DocumentoActuacion/{id}`) responde **404** (comprobado de nuevo el 17/11/2026).
   LURIS los registra como «no disponible por ahora».
2. **Portal de Tyba** (`…/Justicia21/Administracion/Descargas/`), todos con verificación humana:

   | Servicio                                                                    | Qué pide                                                          | Verificación    |
   | --------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------- |
   | Descarga de Archivos (`frmDescargaArchivos.aspx`)                           | Número de certificación, código del proceso                       | Texto en imagen |
   | Descarga de Notificaciones (`frmDescargaArchivosAdjuntosNotificacion.aspx`) | Código del archivo, fecha del archivo o de la notificación        | Texto en imagen |
   | Consulta Fijación de Estados (`frmArchivosEstados.aspx`)                    | Departamento, ciudad, corporación, especialidad, despacho, fechas | Texto en imagen |
   | Consulta de Procesos (`Ciudadanos/frmConsulta.aspx`)                        | Despacho, código del proceso o partes                             | reCAPTCHA       |
   | Validación de Archivos                                                      | Código del archivo, fecha                                         | Texto en imagen |

3. El **número de certificación** es el que llega en las comunicaciones del juzgado (estados,
   notificaciones). Con él y el código del proceso (el radicado de 23 dígitos) se descarga el
   archivo público.

Como todas las vías públicas exigen resolver un reto y **LURIS no resuelve, evade ni terceriza
retos** (§6), la política aplicada es la del §6:

- **Consulta asistida de documentos**: cuando un documento de una actuación de Tyba no se puede
  descargar, la ficha explica cómo conseguirlo (número de certificación + radicado) y abre la
  página de descarga de Tyba en otra pestaña. La persona lo descarga y lo sube con **«Agregar
  documento»** (Fase 7): LURIS valida el tipo real, lo deduplica y lo muestra en la actuación.
- **Acceso oficial**: la solicitud de un mecanismo autorizado (un servicio de interoperabilidad
  o la habilitación de la descarga de la CPNU) está en
  [docs/solicitudes/rama-judicial-tyba-documentos.md](../solicitudes/rama-judicial-tyba-documentos.md).
  Cuando la Rama Judicial lo conceda, se implementa como un adaptador detrás del puerto
  `DescargadorDeDocumentos` (el mismo de la CPNU y SIUGJ) y se registra en `composition-root.ts`:
  los casos de uso y la interfaz no cambian.

## Qué falta confirmar

- Si el «número de certificación» se puede ligar a una actuación concreta para sugerirlo en la
  ficha (hoy lo escribe la persona en el portal de Tyba).
- Si la CPNU volverá a entregar los documentos; en ese caso funcionarán solos con el descargador
  existente, sin cambios.
- Las condiciones de uso para consultas programáticas (la página «Políticas de privacidad y
  condiciones de uso» de la Rama Judicial no se leyó en este spike).
