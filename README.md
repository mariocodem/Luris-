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

## Pruebas

- **Unidad** (`*.test.ts`, junto al código): dominio e infraestructura pura, sin base de datos.
- **Integración** (`tests/integracion/*.integracion.test.ts`): cada ejecución borra y recrea la
  base `<DATABASE_URL>_test`, le aplica todas las migraciones y verifica el aislamiento entre
  despachos y las restricciones del esquema. Requiere `pnpm db:up`.

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
