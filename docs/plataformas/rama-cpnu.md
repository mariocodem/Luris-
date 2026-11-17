# Rama Judicial — Consulta de Procesos Nacional Unificada (CPNU)

Hallazgos del spike de la Fase 5 (16/11/2026), verificados contra la API real y el código del
portal oficial (`consultaprocesos.ramajudicial.gov.co`). El adaptador está en
`src/modules/plataformas/infrastructure/rama-cpnu/`.

## API

Base: `https://consultaprocesos.ramajudicial.gov.co:448/api/v2` (variable `CPNU_URL_BASE`).
Pública, sin autenticación ni CAPTCHA, sin CORS (solo se consulta desde el servidor). Respondió en
0,25–0,8 s por solicitud durante las pruebas.

| Uso                     | Ruta                                                                             | Respuesta                                                                                |
| ----------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Buscar por radicado     | `GET /Procesos/Consulta/NumeroRadicacion?numero={23}&SoloActivos=false&pagina=1` | `{ procesos: [...], paginacion }`. Sin resultados: 200 con `procesos: []`                |
| Detalle del expediente  | `GET /Proceso/Detalle/{idProceso}`                                               | despacho, ponente, tipo, clase, subclase, recurso, ubicación, `esPrivado`                |
| Actuaciones             | `GET /Proceso/Actuaciones/{idProceso}?pagina={n}`                                | 40 por página: `fechaActuacion`, `fechaRegistro`, `fechaInicial`/`fechaFinal` (término)… |
| Documentos del proceso  | `GET /Proceso/Documentos/{idProceso}`                                            | 404 con mensaje si no hay                                                                |
| Documentos de actuación | `GET /Proceso/DocumentosActuacion/{idRegActuacion}`                              | lista sin envoltura: `idRegDocumento`, `nombre`, `descripcion`, `fechaCarga`             |
| Descargar documento     | `GET /Descarga/DocumentoActuacion/{idRegDocumento}`                              | el archivo (`Content-Type` del documento)                                                |

Las rutas de documentos no están documentadas: salen del código JavaScript del portal (las mismas
que usa su botón «Descargar»).

## Particularidades

- **Un radicado, varios expedientes.** La búsqueda puede devolver varios `idProceso` con el mismo
  radicado: uno por cada sistema o despacho donde está registrado. Caso real: un ejecutivo de
  Villavicencio aparece en Justicia XXI (actuaciones hasta 2023) y en Tyba
  (`ubicacion: "Software: Justicia XXI Web"`, desde 2023). LURIS une sus actuaciones en una sola
  línea de tiempo y guarda los datos de cada expediente.
- **Procesos de Tyba.** La CPNU muestra los procesos de Tyba con sus actuaciones y la lista de sus
  documentos (`conDocumentos: true`). Es la vía sin CAPTCHA para Tyba (Fase 9).
- **Identificadores.** Se usa el `idProceso` de la búsqueda para las demás rutas (el detalle
  devuelve un `idRegProceso` distinto). `idRegActuacion` es único y es la clave de deduplicación.
- **Fechas.** Llegan como `"2023-01-31T00:00:00"` sin zona horaria: son días de Bogotá. LURIS
  toma solo el día (nunca convierte de zona). La fecha de registro puede ser anterior a la de la
  actuación (p. ej. fijaciones en estado).
- **Texto.** Los nombres traen espacios sobrantes y saltos de línea internos
  (`"ANDREA\r\n\t\t\t VELA"`); `codRegla` viene relleno de espacios. Se normaliza todo.
- **Partes.** Vienen en un solo texto: `"Demandante: X | Demandado: Y"`.
- **Errores de la API.** `{"StatusCode": 404, "Message": "..."}` con el estado HTTP real. Un
  radicado mal formado da 404 con «ha de contener 23 digitos»; una búsqueda por nombre demasiado
  amplia, 400.
- **Procesos reservados** (`esPrivado: true`): la plataforma no publica sus actuaciones.

## Ritmo y bloqueos

Durante el spike, con ~35 solicitudes por minuto sostenidas a las rutas de documentos (unas 85 en
2,5 minutos), la CPNU empezó a responder **403 Forbidden** (página HTML de su cortafuegos) en
`DocumentosActuacion` y `Descarga`. La búsqueda siguió respondiendo 200.

Por eso:

- El ritmo por defecto es de **20 solicitudes por minuto** (`CPNU_SOLICITUDES_POR_MINUTO`), compartido
  por consultas y documentos, con concurrencia 2 (`CPNU_CONCURRENCIA`).
- Un 403 (o un 429 que persiste) se trata como «la plataforma pidió esperar»: el worker deja de
  consultar la CPNU durante `CPNU_PAUSA_POR_BLOQUEO_MINUTOS` (10 por defecto) y la cola reintenta
  después con espera creciente.
- En la primera consulta de un proceso solo se piden los documentos de las 10 actuaciones más
  recientes; los de cada actuación nueva se piden siempre.

## Descarga de documentos: pendiente de la Rama Judicial

La lista de documentos de una actuación funciona, pero **la descarga respondió 404 (sin cuerpo)
para todos los documentos probados**, también los publicados hace semanas. El portal oficial
muestra en ese caso «El documento solicitado no está disponible en este momento». LURIS registra
cada documento con su nombre y fecha oficial de carga, lo muestra en la línea de tiempo como «la
plataforma no lo tiene disponible por ahora» y lo descarga cuando la ruta responda (los 404 no se
reintentan en cada consulta; el reintento manual y periódico queda para una fase posterior).
No se intentó ninguna vía alternativa (cabeceras imitando al portal u otras rutas no públicas).

## Pruebas

- Respuestas grabadas de la API real en `tests/fixtures/cpnu/` (con los nombres de personas
  naturales y del juez cambiados por ficticios).
- `pnpm test:e2e` levanta una CPNU simulada con esas respuestas (`tests/e2e/servicios-de-apoyo.ts`):
  las pruebas nunca consultan la plataforma real.
