# SAMAI — Jurisdicción de lo contencioso administrativo (Consejo de Estado)

Spike de la Fase 7 (16/11/2026). Verificado contra el servicio real con pocas solicitudes, sin
iniciar sesión y sin resolver retos. La implementación está en
`src/modules/plataformas/infrastructure/samai/`.

## Qué procesos son de SAMAI

Los de la jurisdicción de lo contencioso administrativo. En el radicado, los dígitos 6 y 7
(entidad) son `03` (Consejo de Estado), `23` (tribunal administrativo) o `33` (juzgado
administrativo). Son los únicos que aparecen en el catálogo de corporaciones de SAMAI, cuyo
código es exactamente los 7 primeros dígitos del radicado (p. ej. `0500123` = Tribunal
Administrativo de Antioquia).

## Búsqueda pública (sin reto): la usa LURIS

`POST https://samai.consejodeestado.gov.co/Vistas/Casos/Jprocesos.ashx/buscar` con JSON
(`tipoBusqueda: "radicado"`, `criterio`, `ambito: "corporacion"`, `corporacion`, …). Exige la
corporación. Devuelve `{ ok, data: { items, total } }`; cada ítem trae clase, fecha de ingreso,
despacho y titular vigente, ponente, demandante, demandado, si está vigente, si es privado, el
`guid` y `urlDetalle` (la página del proceso).

- Un proceso en segunda instancia conserva el radicado de origen pero está en el Consejo de
  Estado (`1100103`): LURIS busca primero en la corporación de origen y luego allí.
- Algunos campos traen el relleno `_RDRQ_NULL`; se limpia.
- `GET …/Jprocesos.ashx/corporaciones` da el catálogo (76 corporaciones).

## La página del proceso pide un reto

`/Vistas/Casos/list_procesos.aspx?guid=…` muestra «No soy un robot — Ingrese sin espacios, este
dato para ver el proceso» antes de mostrar actuaciones y documentos (formulario ASP.NET; las
actuaciones no vienen en la página hasta pasar el reto). **LURIS no lo resuelve** (§6), aunque el
código aparezca como texto. Además SAMAI no permite mostrarse dentro de otra página
(`X-Frame-Options: SAMEORIGIN`), así que no hay panel como en el SPOA: se abre en otra pestaña.

## Actuaciones: por la CPNU

La CPNU publica los procesos de SAMAI con sus actuaciones, tomadas de SAMAI y al día (verificado
en un proceso de tribunal: 60 actuaciones hasta diciembre de 2025, mismo ponente que SAMAI y
actualizado ese mismo día; y en uno del Consejo de Estado, Sección Segunda). Por eso:

- Las actuaciones de un proceso de SAMAI llegan por la CPNU, sin reto y sin duplicarse.
- La consulta en SAMAI solo aporta datos (`soloDatos`): vigente, titular del despacho, número
  interno, asunto y el enlace «Ver el proceso en SAMAI».

## Documentos

Los documentos públicos están en la página del proceso, detrás del reto. Por eso, por ahora,
LURIS no los descarga sola. La vía es **asistida**: «Ver el proceso en SAMAI», la persona resuelve
el reto, descarga el documento y lo sube con «Agregar documento» en la actuación. Se valida igual
que lo descargado por LURIS (tipo real, tamaño, deduplicado) y queda registrado quién lo subió.

## Cuenta del abogado (credenciales)

SAMAI tiene ingreso «con usuario y contraseña» para usuarios externos (abogados y sujetos
procesales, que piden su cuenta por la Ventanilla Virtual) en `/Login.aspx`, sin reto en el
formulario. También hay ingreso institucional con Microsoft Entra ID, solo para servidores
judiciales; LURIS no lo usa.

Implementado:

- **Ajustes → Plataformas:** credenciales cifradas (AES-256-GCM, clave en `CREDENCIALES_CLAVE`,
  ligadas a despacho, plataforma, titular y usuario), con consentimiento explícito, borrado y
  auditoría.
- **Prueba de acceso:** al guardar, el worker inicia sesión con el formulario real (estado oculto
  de ASP.NET y cookies). Si SAMAI pide un reto, no lo resuelve. La contraseña solo se envía al
  propio SAMAI.

**Pendiente, con una cuenta real:** no se ha visto la página del proceso con sesión iniciada (si
sigue pidiendo el reto, cómo se ven las actuaciones y cómo se descargan los documentos). Con una
cuenta de prueba de un abogado (con su consentimiento) se completa la descarga automática de los
documentos que su cuenta puede ver, detrás del puerto `DescargadorDeDocumentos`, sin tocar los
casos de uso.

## Pruebas

- Respuestas grabadas en `tests/fixtures/samai/` (nombres de personas cambiados por ficticios) y
  el formulario de ingreso real (`login.html`).
- `pnpm test:e2e` usa un SAMAI simulado (`tests/e2e/servicios-de-apoyo.ts`): búsqueda e ingreso.
