# SPOA — Sistema Penal Oral Acusatorio (Fiscalía General de la Nación)

Spike de la Fase 6 (16/11/2026). Hallazgos verificados en el portal oficial y en su código
JavaScript público, sin enviar consultas ni resolver retos. La implementación está en
`src/modules/plataformas/infrastructure/spoa/`.

## El portal

- **Dónde:** «Consulta su denuncia», enlazado desde la página de consultas de la Fiscalía:
  `https://consulta-web.fiscalia.gov.co/` (variable `SPOA_URL_PORTAL`). Es una aplicación React.
- **Qué pide:** el número de la noticia criminal (NUNC) de **21 o 23 dígitos** y la solución de
  un reto.
- **El reto (CAPTCHA):** propio de la Fiscalía (`captcha.fiscalia.gov.co`), no reCAPTCHA como
  suponía la guía inicial: un texto distorsionado en imagen o una operación matemática.
- **Se puede mostrar dentro de otra página:** el portal no envía `X-Frame-Options` ni
  `frame-ancestors`. LURIS lo muestra en un panel y además ofrece abrirlo en otra pestaña.

## Lo que muestra el resultado (solo información no reservada)

En este orden: número de la noticia criminal; estado; etapa; departamento, municipio y fecha de
los hechos; ley de aplicabilidad; despacho asignado (seccional, unidad, despacho, fecha de
asignación); ubicación del despacho (departamento, municipio, dirección, correo, teléfonos);
delitos con su grado; **actuaciones no reservadas** (fecha y nombre); fecha de la consulta.
Donde no hay dato, el portal escribe «Ninguno».

No informa partes, documentos ni fecha de registro de las actuaciones: LURIS guarda la fecha de
la actuación y deja la de registro vacía («la plataforma no informó la fecha de registro»).

## Cómo funciona por dentro

El portal pide los datos a un servicio interno que devuelve XML con el contrato
`RespuestaConsulta → DatosRespuesta → RegistroNumero` (campos `CASO_NOTICIA`, `CASO_ESTADO`,
`CASO_ETAPA`, `DELITOS` como `delito#grado|…`, `ACTUACIONES` como `fecha#nombre|…`, etc.).

**Ese servicio responde sin verificar que se haya resuelto el reto:** el reto solo se exige en el
navegador. LURIS **no lo usa**: consultarlo directamente sería evadir el CAPTCHA, y la política del
§6 lo prohíbe. Conviene informarlo a la Fiscalía por un canal de reporte responsable.

## Decisión: consulta asistida + solicitud de acceso oficial (política del §6)

1. **Consulta asistida (activa).** En `/procesos/[id]/spoa`:
   1. LURIS muestra el NUNC con «Copiar» y el portal en un panel.
   2. La persona consulta allí y **resuelve el reto ella misma**.
   3. Selecciona todo el resultado, lo copia y lo pega en LURIS.
   4. LURIS lee el texto (`lector-de-texto-spoa.ts`), muestra lo que entendió y, al confirmarlo,
      lo guarda como cualquier otra consulta: detecta las actuaciones nuevas (la primera vez son
      la historia del proceso) y quedan listas para notificar (Fase 11).

   El lector acepta etiqueta y valor en líneas separadas o en la misma, tabuladores y fechas
   dd/mm/aaaa o aaaa-mm-dd, y verifica que el resultado sea del NUNC del proceso.

2. **Bandeja «Pendientes de tu confirmación».** La sincronización programada abre un pendiente
   para cada proceso activo con NUNC que lleve `SPOA_DIAS_ENTRE_CONFIRMACIONES` días (7 por
   defecto) sin una consulta exitosa en el SPOA. Guardar la consulta lo cierra. La consulta masiva
   (Fase 10) agregará ahí sus ítems del SPOA en lugar de fallar.
3. **Adaptador automático (listo, inactivo).** `adaptador-spoa-oficial.ts` implementa el mismo
   puerto `PlataformaJudicial` sobre el contrato `RespuestaConsulta`. Se activa solo cuando la
   Fiscalía conceda el acceso y se configuren `SPOA_INTEROPERABILIDAD_URL` y
   `SPOA_INTEROPERABILIDAD_TOKEN`: entonces el SPOA entra a la consulta automática, programada y
   masiva como la CPNU, la bandeja deja de usarse para el SPOA y nada más cambia. Si el contrato
   oficial es distinto, solo cambia `leerRespuestaSpoa`.
4. **Solicitud formal:** [docs/solicitudes/fiscalia-spoa-interoperabilidad.md](../solicitudes/fiscalia-spoa-interoperabilidad.md).

## Pendiente de validar con un caso real

No hay un resultado real del portal en las pruebas: obtenerlo exige resolver el reto, y eso no lo
hace LURIS (ni quien lo desarrolla de forma automatizada). Los fixtures de `tests/fixtures/spoa/`
son sintéticos, con la estructura tomada del código del portal. Pendiente: que un abogado consulte
un NUNC real y verifique que la vista previa coincide con lo que muestra el portal (en especial, el
formato de las fechas de las actuaciones). La vista previa antes de guardar existe precisamente
para que nada se guarde mal leído.
