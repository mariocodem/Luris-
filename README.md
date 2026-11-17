# LURIS

Aplicación web SaaS multi-despacho para consultar y seguir procesos judiciales en las plataformas
oficiales de Colombia (Rama Judicial – CPNU, SPOA, SAMAI, SIUGJ y Tyba).

La guía completa de producto, arquitectura y fases está en [CLAUDE.md](CLAUDE.md).

## Requisitos

- Node.js 26 (LTS) o superior
- pnpm 9
- Docker con Docker Compose (para la base de datos de desarrollo)

## Puesta en marcha

```bash
pnpm install              # también genera el cliente de Prisma
cp .env.example .env      # ajusta los valores si hace falta
pnpm db:up                # PostgreSQL 18 en localhost:5432
pnpm db:deploy            # aplica las migraciones
pnpm db:seed              # datos de ejemplo (ficticios)
pnpm dev                  # http://localhost:3000
pnpm worker:dev           # en otra terminal: proceso de tareas en segundo plano
```

Las variables de entorno se validan con Zod al arrancar (`src/shared/infrastructure/env.ts`). Si
falta alguna o es inválida, el servidor muestra cuál y por qué.

## Scripts

| Comando                 | Qué hace                                                    |
| ----------------------- | ----------------------------------------------------------- |
| `pnpm dev`              | Servidor de desarrollo de Next.js                           |
| `pnpm worker:dev`       | Worker en modo observación                                  |
| `pnpm build`            | Build de producción                                         |
| `pnpm lint`             | ESLint (falla con cualquier advertencia)                    |
| `pnpm format`           | Formatea con Prettier                                       |
| `pnpm format:check`     | Verifica el formato                                         |
| `pnpm typecheck`        | Genera tipos de rutas y ejecuta `tsc --noEmit`              |
| `pnpm test`             | Todas las pruebas (unidad + integración; requiere la base)  |
| `pnpm test:unit`        | Solo pruebas de unidad (sin base de datos)                  |
| `pnpm test:integracion` | Solo pruebas de integración contra PostgreSQL               |
| `pnpm test:e2e`         | Pruebas e2e con Playwright (base e2e propia, puerto 3100)   |
| `pnpm db:up`            | Levanta PostgreSQL de desarrollo (`docker-compose.dev.yml`) |
| `pnpm db:down`          | Detiene PostgreSQL de desarrollo (conserva los datos)       |
| `pnpm db:migrate`       | Crea/aplica migraciones en desarrollo y regenera el cliente |
| `pnpm db:deploy`        | Aplica las migraciones pendientes (sin crear nuevas)        |
| `pnpm db:seed`          | Carga los datos de ejemplo (idempotente)                    |
| `pnpm db:reset`         | Borra la base de desarrollo, migra y siembra de nuevo       |
| `pnpm db:studio`        | Prisma Studio                                               |

Antes de cada commit, Husky ejecuta lint-staged (ESLint + Prettier sobre los archivos preparados).

## Estructura

Arquitectura hexagonal por módulos de negocio (ver §3 de [CLAUDE.md](CLAUDE.md)):

```
src/
  app/                 Presentación (Next.js App Router)
  modules/<módulo>/    domain · application · infrastructure · ui
  shared/              domain (Result, AppError, Radicado, Nunc) · infrastructure (env, logger, prisma) · ui
  worker/              Proceso separado para colas y tareas programadas
  composition-root.ts  Ensamblado de dependencias
prisma/                Esquema, migraciones y semilla de desarrollo
tests/integracion/     Pruebas contra PostgreSQL (aislamiento, restricciones)
```

ESLint impide que el dominio importe de capas externas, que los casos de uso dependan de
implementaciones concretas y que la presentación consulte la base de datos.

## Base de datos

Prisma 7 + PostgreSQL. Esquema en [prisma/schema.prisma](prisma/schema.prisma); la migración
inicial agrega restricciones `CHECK` (formato de radicado y NUNC, roles, consentimiento de
WhatsApp, lotes de 1 a 400…).

**Aislamiento por despacho.** Los datos de negocio se leen y escriben solo con el cliente que
devuelve `obtenerDependencias().baseDeDatos.paraDespacho(despachoId)`
([aislamiento-despacho.ts](src/shared/infrastructure/prisma/aislamiento-despacho.ts)). Ese cliente
filtra por despacho, inyecta el `despachoId` al crear, rechaza escrituras anidadas y consultas
SQL crudas, y no permite navegar desde un usuario hacia otros despachos. Además, las claves
foráneas compuestas `(padreId, despachoId)` hacen que la propia base rechace relaciones entre
despachos. Usa siempre claves foráneas escalares (`procesoId`, no `proceso: { connect }`).

**Datos de ejemplo** (`pnpm db:seed`): despacho `despacho-demo` y estos usuarios. Todos usan la
contraseña de **desarrollo** `LurisDemo2026` (la semilla no se ejecuta en producción):

| Usuario                             | Rol                         | Entra a                        |
| ----------------------------------- | --------------------------- | ------------------------------ |
| `superadmin@luris.test`             | Superadmin (operador LURIS) | `/plataforma/despachos`        |
| `administradora@despacho-demo.test` | Administradora del despacho | `/inicio`, `/ajustes/usuarios` |
| `abogado@despacho-demo.test`        | Abogado                     | `/inicio`                      |
| `abogada@despacho-demo.test`        | Abogada                     | `/inicio`                      |
| `asistente@despacho-demo.test`      | Asistente                   | `/inicio`                      |

## Autenticación, roles y permisos

- **Better Auth** (correo y contraseña + plugin de organizaciones: despacho = organización,
  membresía = miembro) mapeado a las tablas en español. Configuración en
  [better-auth.ts](src/modules/usuarios/infrastructure/autenticacion/better-auth.ts).
- **No hay registro abierto ni rutas `/api/auth`**: las cuentas nacen por invitación y todo pasa
  por server actions → casos de uso, que verifican la matriz de permisos del §5
  ([permisos.ts](src/modules/usuarios/domain/permisos.ts), probada celda por celda).
- **Invitaciones**: enlace de un solo uso que vence a las `INVITACION_HORAS_VIGENCIA` horas; en la
  base solo se guarda el SHA-256 del token.
- **Cada petición** vuelve a verificar que la membresía siga activa y el despacho no esté
  suspendido: desactivar una cuenta o suspender un despacho surte efecto de inmediato.
- **Correos en desarrollo**: con `CORREO_TRANSPORTE=archivo` cada correo (invitación,
  recuperación) se guarda como `.html` en `.correos/` para abrirlo en el navegador. Esa carpeta
  contiene enlaces de acceso y está en `.gitignore`. En producción se exige SMTP (Fase 11).
- **Auditoría**: inicios y cierres de sesión, intentos fallidos, invitaciones, cambios de rol,
  desactivaciones y cambios de estado de despachos quedan en `registros_auditoria`.

## Procesos (Fase 4)

- **Lista** (`/procesos`): búsqueda por radicado o NUNC (con o sin guiones, basta un fragmento de
  4 cifras), alias o cliente sin importar tildes; filtros por estado, etiqueta y responsable;
  tabla desde 1024 px y tarjetas por debajo. El administrador ve todo el despacho; abogados y
  asistentes, solo los procesos en los que participan.
- **Registrar y editar**: radicado y/o NUNC con validación en tiempo real (cuenta las cifras y
  muestra cómo se guardará). Quien registra queda asignado (abogado como responsable, asistente
  como apoyo). El radicado y el NUNC no se pueden cambiar si el proceso ya tiene actuaciones.
- **Ficha** (`/procesos/[id]`): línea de tiempo de actuaciones con sus fechas oficiales,
  responsable y apoyo (los cambia el administrador; el abogado responsable suma o quita apoyo),
  plataformas y archivar/restaurar (no borra nada).
- **Importar** (`/procesos/importar`): Excel (.xlsx) o CSV, hasta 1.000 procesos y 1 MB. Primero
  muestra cuáles están listos, cuáles ya existen, cuáles se repiten y cuáles tienen errores (con
  la fila y el motivo); nada se guarda hasta confirmar. Detecta los radicados que Excel guardó
  como número (notación científica) y lee los CSV de Excel en español (`;` y Windows-1252).
  Plantilla de ejemplo en `/procesos/importar/plantilla`.
- **Búsqueda sin tildes**: la columna `procesos.busqueda` guarda alias y cliente normalizados; la
  mantiene el repositorio de procesos.

## Consulta en plataformas (Fase 5)

LURIS consulta la Rama Judicial (CPNU) por radicado, guarda las actuaciones con sus **fechas
oficiales** (actuación y registro, nunca la de detección) y detecta las nuevas. Detalles de la API
y de lo que se encontró en el spike: [docs/plataformas/rama-cpnu.md](docs/plataformas/rama-cpnu.md).

- **El worker consulta; la web solo encola.** `pnpm worker:dev` ejecuta las colas de pg-boss
  (tablas en el esquema `pgboss` de la misma base, sin Redis): una cola de sincronización por
  plataforma con su propio límite de concurrencia, una de documentos y la sincronización
  programada. Sin el worker, «Consultar ahora» queda en espera.
- **«Consultar ahora»** (ficha del proceso): encola la consulta con prioridad alta y muestra su
  avance hasta que termina; la persona puede salir de la página. Si ya había una en espera para el
  proceso, la adelanta en vez de crear otra.
- **Sincronización programada**: todos los procesos activos de los despachos activos, por defecto
  a las 6:00, 13:00 y 19:00 (hora de Bogotá). Se cambia con `SINCRONIZACION_CRON` (o `off`).
- **Novedades**: la primera consulta exitosa de un proceso es su historia («carga inicial»: no se
  marca como nueva ni se notificará); desde la segunda, cada actuación que no estaba guardada se
  marca como **Nueva** durante 7 días. No se guardan duplicados (clave única por actuación).
- **Ritmo con los portales** (§6): 20 solicitudes por minuto a la CPNU, reintentos con espera
  creciente, y una pausa de 10 minutos si la plataforma frena a LURIS (403/429). Todo es
  configurable en `.env` (ver `.env.example`). User-Agent identificable de LURIS.
- **Documentos**: se registran los de cada actuación, se descargan, se valida su tipo real (PDF,
  imágenes, Word, Excel, RTF), se deduplican por SHA-256 dentro del despacho y se guardan en
  `ALMACEN_DIRECTORIO` (archivos 600, carpetas 700). Se ven en `/procesos/[id]/documentos/[id]` y
  se sirven solo por la ruta autenticada `/api/documentos/[id]`, que verifica el despacho y el
  permiso sobre el proceso. Hoy la CPNU lista los documentos, pero no entrega su descarga (ver el
  documento del spike).
- **Errores**: la persona ve qué pasó y qué puede hacer («No hubo respuesta de la Rama
  Judicial…»); el detalle técnico queda en el log del worker.

## SPOA de la Fiscalía (Fase 6)

El portal de la Fiscalía exige resolver un reto (CAPTCHA) en cada consulta, y **LURIS no
resuelve, evade ni terceriza retos** (§6). Por eso el SPOA es una **consulta asistida**. Detalles
del spike en [docs/plataformas/spoa.md](docs/plataformas/spoa.md).

- **Consulta asistida** (`/procesos/[id]/spoa`, botón «Consultar en el SPOA» de la ficha): LURIS
  muestra el NUNC con «Copiar» y el portal oficial en un panel; la persona consulta y resuelve el
  reto, copia el resultado y lo pega. LURIS muestra lo que leyó y, al confirmarlo, lo guarda como
  cualquier consulta (fechas oficiales, detección de nuevas, notificable) y lo audita.
- **Bandeja «Pendientes de tu confirmación»** (`/pendientes`): la sincronización programada abre
  un pendiente para cada proceso con NUNC que lleve 7 días sin consultarse en el SPOA
  (`SPOA_DIAS_ENTRE_CONFIRMACIONES`); guardar la consulta lo cierra. Cada persona ve solo los de
  sus procesos.
- **Acceso oficial**: la solicitud formal de interoperabilidad está en
  [docs/solicitudes/fiscalia-spoa-interoperabilidad.md](docs/solicitudes/fiscalia-spoa-interoperabilidad.md).
  El adaptador automático ya está hecho detrás del mismo puerto: con
  `SPOA_INTEROPERABILIDAD_URL` y `SPOA_INTEROPERABILIDAD_TOKEN`, el SPOA se consulta solo como
  la CPNU, sin más cambios.

## SAMAI y credenciales de plataformas (Fase 7)

Detalles del spike en [docs/plataformas/samai.md](docs/plataformas/samai.md).

- **Datos de SAMAI, sin reto**: para los procesos de lo contencioso administrativo (radicado con
  entidad 03, 23 o 33), «Consultar ahora» y la sincronización programada también consultan la
  búsqueda pública de SAMAI: vigente, titular del despacho, partes y el enlace «Ver el proceso en
  SAMAI». Si no está en la corporación de origen, se busca en el Consejo de Estado.
- **Actuaciones por la CPNU**: la página del proceso en SAMAI pide «No soy un robot» y LURIS no
  resuelve retos. La CPNU publica las actuaciones de SAMAI al día, así que llegan por ahí y no se
  duplican.
- **Agregar documento** (cada actuación, para quien puede editar el proceso): sube a mano un
  documento que la plataforma solo entrega tras un reto (p. ej. una providencia de SAMAI). Se valida
  el tipo real y el tamaño, se deduplica y queda registrado quién lo subió.
- **Ajustes → Plataformas**: el abogado guarda su usuario y contraseña de SAMAI (el administrador,
  también los del despacho). Se cifran con AES-256-GCM (`CREDENCIALES_CLAVE`), exigen
  consentimiento explícito, se pueden borrar y quedan en la auditoría (nunca el secreto). Al
  guardarla, el worker prueba el acceso con el formulario de ingreso de SAMAI y muestra el
  resultado. Genera la clave con `openssl rand -base64 32`; si se pierde, hay que registrar de
  nuevo las credenciales.

## Pruebas

- **Unidad** (`*.test.ts`, junto al código): dominio e infraestructura pura, sin base de datos.
  Los adaptadores de plataformas se prueban con respuestas grabadas (`tests/fixtures/`).
- **Integración** (`tests/integracion/*.integracion.test.ts`): cada ejecución borra y recrea la
  base `<DATABASE_URL>_test`, le aplica todas las migraciones y verifica el aislamiento entre
  despachos y las restricciones del esquema. Requiere `pnpm db:up`.
- **E2E** (`tests/e2e/*.spec.ts`, Playwright): flujos completos en el navegador (registrar,
  editar, archivar, permisos por rol, búsqueda, asignaciones, importación, vista móvil y
  «Consultar ahora» con documentos y detección de novedades, la consulta asistida del SPOA desde
  la bandeja de pendientes, SAMAI, credenciales y documentos agregados a mano). Recrea la base
  `<DATABASE_URL>_e2e` con la semilla y levanta su propio servidor en el puerto 3100, el worker y
  una CPNU simulada con respuestas grabadas (puerto 3199, que también simula el portal del SPOA
  y SAMAI): nunca consultan las plataformas reales.
  Requiere `pnpm db:up` y que `pnpm dev` esté detenido (Next.js no admite dos servidores de
  desarrollo sobre la misma carpeta). La primera vez: `pnpm exec playwright install chromium`.

## Sistema de diseño

Mundo visual **«Sello de radicación»**: papel blanco y grises fríos, azul marino para la
estructura, azul rey apagado para acciones y sellos, salmón empolvado solo para lo nuevo. La
referencia completa está en [DESIGN.md](DESIGN.md); el contexto del producto, en
[PRODUCT.md](PRODUCT.md).

- **Tokens**: variables CSS en [globals.css](src/app/globals.css) (tema claro y `.dark`).
- **Tipografía**: Public Sans (interfaz) y Source Serif 4 (títulos); clase `cifras` para
  radicados y fechas.
- **Tema**: claro / oscuro / sistema con `next-themes`, sin parpadeo.
- **Shell**: barra lateral desde 1024 px; en móvil y tableta, barra superior y menú inferior.
- **Componentes propios**: `SelloDeFecha` (solo fechas oficiales), `RadicadoCopiable`,
  `Encabezado`, `EstadoVacio`, `Campo`; avisos con `sonner`.
- **Catálogo**: `/dev/componentes` (solo en desarrollo) muestra todo en ambos temas.

Los componentes base se instalan en `src/shared/ui/components` (configurado en
`components.json`) y se adaptan a los tokens:

```bash
pnpm exec shadcn add <componente>
```
