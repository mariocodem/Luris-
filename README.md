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

**Datos de ejemplo** (`pnpm db:seed`): despacho `despacho-demo` y estos usuarios (todavía sin
contraseña; la autenticación llega en la Fase 2):

| Usuario                             | Rol                         |
| ----------------------------------- | --------------------------- |
| `superadmin@luris.test`             | Superadmin (operador LURIS) |
| `administradora@despacho-demo.test` | Administradora del despacho |
| `abogado@despacho-demo.test`        | Abogado                     |
| `abogada@despacho-demo.test`        | Abogada                     |
| `asistente@despacho-demo.test`      | Asistente                   |

## Pruebas

- **Unidad** (`*.test.ts`, junto al código): dominio e infraestructura pura, sin base de datos.
- **Integración** (`tests/integracion/*.integracion.test.ts`): cada ejecución borra y recrea la
  base `<DATABASE_URL>_test`, le aplica todas las migraciones y verifica el aislamiento entre
  despachos y las restricciones del esquema. Requiere `pnpm db:up`.

## Componentes de interfaz (21st.dev / shadcn)

Los componentes se instalan en `src/shared/ui/components` (configurado en `components.json`):

```bash
pnpm dlx shadcn@latest add "<url del componente en 21st.dev>"
```

Después de instalar un componente, adáptalo a los tokens de diseño del proyecto.
