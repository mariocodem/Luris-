# CLAUDE.md — LURIS

> Guía de trabajo para Claude Code. Léela completa antes de escribir código.
> El desarrollo es **por fases**: trabaja solo en la fase activa, cumple su "Definición de terminado" y **detente a pedir confirmación** antes de pasar a la siguiente.

---

## 1. Qué es LURIS

LURIS es una aplicación web **SaaS multi-despacho** para abogados y despachos jurídicos en Colombia que **centraliza la consulta y el seguimiento de procesos judiciales** en las plataformas oficiales, detecta actuaciones nuevas, trae sus documentos adjuntos y notifica por correo y WhatsApp.

Problema que resuelve: consultar procesos uno por uno, en varios portales distintos, es repetitivo y hace difícil detectar cambios cuando se manejan cientos de procesos.

### Requisitos no negociables

1. Integración con **todas** las plataformas, en este orden de prioridad:
   1. Consulta de Procesos Nacional Unificada de la Rama Judicial (CPNU)
   2. SPOA (Fiscalía General de la Nación)
   3. SAMAI (Consejo de Estado / Jurisdicción Contencioso Administrativa)
   4. SIUGJ (Sistema Integrado de Gestión Judicial)
   5. Tyba (Justicia XXI Web)
2. **Documentos adjuntos** de las actuaciones: descargarlos, guardarlos y mostrarlos.
3. **Consulta masiva de hasta 400 procesos** en una sola operación.
4. **Fechas oficiales**: toda actuación muestra y notifica la fecha en que **la plataforma la registró** (fecha de actuación y fecha de registro), **nunca** la fecha en que LURIS la detectó. La fecha de detección se guarda solo para auditoría.
5. **Radicados sin guiones ni espacios**: se guardan y se muestran como cadena de dígitos. Botón **"Copiar radicado"** en todo lugar donde aparezca un radicado.
6. **Notificaciones** por correo electrónico y por WhatsApp.
7. **Errores comprensibles**: el usuario nunca ve códigos HTTP (404, 500…), trazas, nombres de excepciones ni mensajes técnicos.
8. **Roles** y administración de cuentas por despacho.
9. **Modo claro / oscuro** con interruptor.
10. **Responsive** (mobile-first).
11. Fase final: **Docker con exactamente dos contenedores** (base de datos + aplicación).

---

## 2. Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js (App Router, última versión estable) en modo fullstack, TypeScript `strict` |
| Validación | Zod (en toda frontera: formularios, server actions, route handlers, respuestas de plataformas externas, variables de entorno) |
| ORM / BD | Prisma + PostgreSQL |
| Autenticación | Better Auth con plugin de organizaciones (organización = despacho) |
| UI | Tailwind CSS + componentes de **21st.dev** (base shadcn/ui) + `next-themes` |
| Trabajos en segundo plano | `pg-boss` (cola sobre PostgreSQL, sin Redis, para respetar los dos contenedores) |
| HTTP / scraping | `fetch` nativo con timeouts, `cheerio` para HTML, Playwright (Chromium) solo donde haya login |
| Correo | Nodemailer (SMTP) + React Email para plantillas |
| WhatsApp | Librería open source (Baileys) detrás de un puerto intercambiable — ver §9 |
| Calidad | ESLint (flat config) + Prettier + `prettier-plugin-tailwindcss` + Husky + lint-staged |
| Pruebas | Vitest (dominio y casos de uso), Playwright Test (e2e de flujos críticos) |

> **Antes de instalar cualquier dependencia, verifica su versión estable actual y su API vigente en la documentación oficial** (Next.js, Prisma y Better Auth cambian configuración entre versiones mayores). No asumas APIs de memoria.

### Skills y herramientas de diseño

- **impeccable** (Paul Bakaus): instalar con `/plugin marketplace add pbakaus/impeccable`. Úsala para diseñar, auditar y pulir cada pantalla. Pasa `audit`/`polish` al cerrar cada fase con UI.
- **apple-design**: skill de diseño estilo Apple (jerarquía tipográfica clara, espacios generosos, movimiento sutil, contraste accesible). Aplícala junto con impeccable; si entran en conflicto, prioriza legibilidad y accesibilidad.
- **21st.dev**: buscar el componente en https://21st.dev, instalarlo con el comando `npx shadcn@latest add "<url del componente>"` que da el sitio, y adaptarlo a los tokens del proyecto. Si está configurado el MCP de 21st.dev (Magic), puedes usarlo para generar variantes. Nunca copies componentes sin adaptarlos a los tokens de diseño.

---

## 3. Arquitectura

**Arquitectura limpia / hexagonal (puertos y adaptadores), organizada por módulos de negocio**, dentro de un único proyecto Next.js. Las dependencias apuntan siempre hacia el dominio.

```
src/
  app/                        # Presentación (Next.js): rutas, layouts, server actions, route handlers
    (auth)/                   # login, recuperar contraseña
    (app)/                    # área autenticada: procesos, consultas, ajustes, usuarios
    api/                      # route handlers (solo los necesarios; preferir server actions)
    error.tsx, not-found.tsx, global-error.tsx
  modules/
    procesos/
      domain/                 # entidades, value objects, errores de dominio, interfaces de repositorio
      application/            # casos de uso (un archivo por caso de uso)
      infrastructure/         # repositorios Prisma, mapeadores
      ui/                     # componentes propios del módulo
    plataformas/
      domain/                 # puerto PlataformaJudicial, tipos ResultadoConsulta, ActuacionExterna
      application/            # ConsultarProceso, ConsultaMasiva, SincronizarProceso
      infrastructure/
        rama-cpnu/            # un adaptador por plataforma
        spoa/
        samai/
        siugj/
        tyba/
    documentos/
    notificaciones/           # puertos Notificador; adaptadores email/ y whatsapp/
    usuarios/                 # roles, permisos, invitaciones
    despachos/                # tenants
    auditoria/
  shared/
    domain/                   # Result<T,E>, AppError, value objects comunes (Radicado, Nunc)
    infrastructure/           # prisma client, logger, crypto, env (validado con Zod), storage
    ui/                       # design system: tokens, componentes base de 21st.dev adaptados
  worker/                     # proceso Node separado: pg-boss, tareas programadas, sesión WhatsApp
  composition-root.ts         # ensamblado de dependencias (inyección manual, sin contenedor DI)
prisma/
  schema.prisma
  migrations/
```

### Principios SOLID aplicados

- **S** — Un caso de uso por clase/función; los componentes de UI no contienen lógica de negocio; los adaptadores solo traducen.
- **O** — Agregar una plataforma o un canal de notificación = agregar un adaptador nuevo que implementa el puerto. **No** se modifican casos de uso existentes.
- **L** — Todo adaptador de `PlataformaJudicial` debe poder sustituir a otro sin romper `ConsultarProceso` (mismo contrato de entrada/salida y de errores).
- **I** — Puertos pequeños: `ConsultadorDeProcesos`, `DescargadorDeDocumentos`, `Notificador`, `AlmacenDeArchivos`, `CifradorDeCredenciales`. Una plataforma que no da documentos no implementa el descargador.
- **D** — Casos de uso dependen de interfaces; las implementaciones concretas se conectan solo en `composition-root.ts`.

### Reglas de código

- Sin `any`. Sin `// @ts-ignore` salvo justificación en comentario.
- Funciones pequeñas, nombres en español para el dominio (`Proceso`, `Actuacion`, `Despacho`), inglés aceptado para términos técnicos (`repository`, `handler`).
- Los errores esperables se devuelven como `Result` (no se lanzan); las excepciones quedan para fallos realmente inesperados.
- Toda entrada externa se valida con Zod **en la frontera**; el dominio recibe datos ya válidos.
- Nada de lógica de negocio en `page.tsx`; las páginas llaman casos de uso.
- `pnpm lint` y `pnpm format:check` deben pasar sin advertencias antes de cerrar cualquier tarea.

---

## 4. Modelo de dominio (referencia)

- **Despacho** (tenant): nombre, NIT, plan, estado.
- **Usuario** y **Membresía** (usuario ↔ despacho, con rol).
- **Proceso**: `radicado` (23 dígitos, `String`, nunca numérico por los ceros a la izquierda) y/o `nunc` (21 dígitos, para SPOA), alias, cliente/parte (texto libre), abogado responsable, etiquetas, activo.
- **ProcesoPlataforma**: en qué plataformas existe el proceso, id externo, última sincronización, estado de la última consulta.
- **Actuacion**: plataforma, id externo, `fechaActuacion`, `fechaRegistro` (las de la plataforma), descripción, anotación, `detectadaEn` (solo auditoría), `tieneDocumentos`. Clave única por (procesoPlataforma, id externo o hash estable) para no duplicar.
- **Documento**: actuación, nombre, tipo MIME, tamaño, hash SHA-256, ruta en almacenamiento, origen (URL de la plataforma).
- **CredencialPlataforma**: despacho o abogado + plataforma + usuario + secreto **cifrado** (AES-256-GCM, clave en variable de entorno). Nunca se registra en logs ni se devuelve al cliente.
- **ConsultaMasiva** e **ItemConsultaMasiva**: lote, estado, progreso, resultado por radicado y por plataforma.
- **PreferenciaNotificacion**: por usuario: canales (correo / WhatsApp), número, frecuencia (inmediata / resumen diario).
- **Notificacion**: registro de envíos, estado, reintentos.
- **RegistroAuditoria**: quién hizo qué y cuándo.

**Multi-tenancy:** toda tabla de negocio lleva `despachoId`. El acceso a datos pasa por una extensión de Prisma que inyecta el filtro del despacho de la sesión; está prohibido consultar tablas de negocio sin ese filtro. Pruebas obligatorias de aislamiento entre despachos.

### Value objects clave

- `Radicado`: recibe cualquier texto, elimina todo lo que no sea dígito, exige exactamente 23 dígitos. Se muestra siempre sin guiones.
- `Nunc` (SPOA): misma normalización, exige 21 dígitos.
- Ambos con esquema Zod reutilizable y mensajes de error en español claro ("El radicado debe tener 23 números; este tiene 21").

---

## 5. Roles y permisos

| Permiso | Superadmin (operador LURIS) | Administrador del despacho | Abogado | Asistente |
|---|---|---|---|---|
| Crear / suspender despachos | ✅ | — | — | — |
| Crear, editar y desactivar cuentas del despacho | — | ✅ | — | — |
| Asignar roles | — | ✅ | — | — |
| Gestionar credenciales de plataformas del despacho | — | ✅ | sus propias | — |
| Registrar / editar procesos | — | ✅ | ✅ (propios) | ✅ (asignados) |
| Consultar y ver actuaciones / documentos | — | todos | propios | asignados |
| Consulta masiva | — | ✅ | ✅ | ✅ |
| Configurar notificaciones | — | ✅ | ✅ | ✅ (propias) |
| Ver auditoría | ✅ | ✅ | — | — |

- Los permisos se verifican **en el servidor** (casos de uso), nunca solo ocultando botones.
- El administrador crea cuentas por invitación (correo con enlace de un solo uso y expiración); el usuario define su contraseña.
- El superadmin no ve datos de procesos de los despachos.

---

## 6. Integración con plataformas

### Contrato común

```ts
interface PlataformaJudicial {
  readonly codigo: 'RAMA_CPNU' | 'SPOA' | 'SAMAI' | 'SIUGJ' | 'TYBA';
  readonly identificador: 'RADICADO' | 'NUNC';
  consultar(id: string, ctx: ContextoConsulta): Promise<Result<ResultadoConsulta, ErrorPlataforma>>;
}
// ResultadoConsulta: datos del proceso + actuaciones (con fechas oficiales) + referencias a documentos.
// ErrorPlataforma: NO_ENCONTRADO | PLATAFORMA_NO_DISPONIBLE | CREDENCIALES_INVALIDAS |
//                  REQUIERE_INTERVENCION | LIMITE_DE_CONSULTAS | RESPUESTA_INESPERADA
```

- Cada respuesta externa se valida con un esquema Zod propio del adaptador; si el formato cambió, el error es `RESPUESTA_INESPERADA` con detalle en el log técnico, no en la UI.
- Timeouts, reintentos con backoff exponencial y **límite de concurrencia y velocidad por plataforma** (configurables por variable de entorno) para no saturar los portales oficiales.
- `User-Agent` identificable de LURIS. Respetar los términos de uso de cada portal.
- Cada adaptador tiene pruebas con respuestas grabadas (fixtures) y una prueba de humo opcional contra el servicio real (desactivada en CI).

### Hallazgos iniciales por plataforma (verificar en el spike de cada fase)

1. **Rama Judicial — CPNU**: API JSON pública en `https://consultaprocesos.ramajudicial.gov.co:448/api/v2` (sin CORS: solo desde el servidor; es lenta). Endpoints conocidos: `/Procesos/Consulta/NumeroRadicacion?numero={23}&SoloActivos=false&pagina=1`, `/Proceso/Detalle/{idProceso}`, `/Proceso/Actuaciones/{idProceso}?pagina={n}`. Las actuaciones traen fecha de actuación y fecha de registro. Investigar endpoint de documentos de actuación. **Es también la vía principal para los procesos de Tyba**, porque la CPNU muestra procesos de Tyba y de otros sistemas.
2. **SPOA**: se consulta con el NUNC de 21 dígitos en el portal de la Fiscalía; el formulario tiene **reCAPTCHA**.
3. **SAMAI**: consulta pública sin registro con los 23 dígitos; solo documentos marcados como públicos. Para documentos restringidos, usar la cuenta del abogado (credenciales del despacho/abogado).
4. **SIUGJ**: sistema nuevo (procesos nuevos, empezó por laboral). La consulta del expediente requiere usuario externo registrado y, a veces, acceso concedido por el despacho judicial. Requiere login con las credenciales que provea el abogado → Playwright.
5. **Tyba**: consulta pública con **CAPTCHA**. Actuaciones: obtenerlas vía CPNU. Documentos: investigar la ruta de descarga por "número de certificación" que llega en las comunicaciones del juzgado.

### Política sobre CAPTCHA (obligatoria)

**LURIS no resuelve, evade ni terceriza la resolución de CAPTCHAs** (nada de OCR de captchas, servicios tipo "captcha solver" ni trucos para saltarlos). Para SPOA y para la consulta directa en Tyba:

- **Vía automática legítima**: (a) obtener los datos por un canal oficial sin CAPTCHA cuando exista (CPNU para Tyba); (b) solicitar a la entidad acceso por interoperabilidad / servicio web (la fase correspondiente incluye redactar la solicitud). Cuando haya acceso oficial, se implementa como adaptador y se integra a la consulta automática y masiva sin tocar el resto del sistema.
- **Mientras tanto — consulta asistida**: LURIS prepara la consulta, muestra el reto de la plataforma en un panel para que el usuario lo resuelva él mismo, y luego LURIS lee, normaliza y guarda el resultado. En la consulta masiva estos ítems quedan en una bandeja "Pendientes de tu confirmación" en lugar de fallar.

### Consulta automática con credenciales del abogado

Que el servidor consulte portales de forma programada (con o sin credenciales) es, técnicamente, un proceso automatizado. Por eso:
- Credenciales cifradas, con consentimiento explícito del abogado al registrarlas, y botón para eliminarlas.
- Sesiones reutilizadas para no iniciar sesión en cada consulta.
- Ritmo de consultas conservador y configurable.
- Tratamiento de datos conforme a la Ley 1581 de 2012 (habeas data): política de privacidad, finalidad, retención.

---

## 7. Consulta masiva (hasta 400 procesos)

- Entrada: pegar texto (uno o varios por línea, con o sin guiones) o subir CSV/XLSX. Se normalizan, se validan, se quitan duplicados y se muestra un resumen antes de ejecutar ("398 válidos, 2 con error: …").
- Ejecución asíncrona con `pg-boss`: un trabajo por (radicado × plataforma), respetando el límite por plataforma, en el orden de prioridad del §1.
- Progreso en vivo (polling o Server-Sent Events) con barra, conteo por estado y resultados parciales navegables.
- El usuario puede cerrar la página: el lote continúa y se notifica al terminar.
- Reintentos automáticos de los fallos transitorios; los permanentes quedan con mensaje claro y botón "Reintentar".
- Exportar resultados a Excel/CSV.
- Meta de rendimiento: documentar el tiempo real de 400 procesos contra la CPNU y ajustar la concurrencia.

---

## 8. Documentos adjuntos

- Puerto `AlmacenDeArchivos` con implementación en disco (volumen Docker de la app). Diseñado para cambiar a almacenamiento S3-compatible sin tocar casos de uso.
- Deduplicación por hash SHA-256. Límite de tamaño configurable. Validar tipo MIME real.
- Visor en la app (PDF en línea) y descarga. Los archivos se sirven por una ruta autenticada que verifica despacho y permisos; nunca por URL pública.

---

## 9. Notificaciones

- Puerto `Notificador` con adaptadores **Email** y **WhatsApp**; agregar canales sin modificar casos de uso.
- Contenido: proceso (alias + radicado), plataforma, **fecha de actuación y fecha de registro oficiales**, descripción, si tiene documentos y enlace a LURIS.
- Modos: inmediata o resumen diario (configurable por usuario). Agrupar varias actuaciones de un mismo proceso.
- Cola de envíos con reintentos e idempotencia (nunca enviar dos veces la misma actuación por el mismo canal).
- **WhatsApp open source (Baileys)**: corre dentro del proceso `worker` (sin contenedor adicional); la sesión se vincula con QR desde la pantalla de ajustes del despacho (rol administrador) y se persiste cifrada. Advertencias para documentar en la UI de configuración: no es la API oficial de Meta, puede violar los términos de WhatsApp y el número puede ser bloqueado → usar un número dedicado, ritmo bajo de envío y solo a usuarios que dieron su consentimiento. El adaptador debe poder reemplazarse por WhatsApp Cloud API sin cambios fuera de `notificaciones/infrastructure/whatsapp/`.

---

## 10. Errores y mensajes al usuario

- Jerarquía `AppError` con `codigo` interno y `mensajeUsuario` en español claro, sin jerga técnica, que diga **qué pasó y qué puede hacer**.
  - ❌ "Error 404" / "Internal Server Error" / "fetch failed"
  - ✅ "No encontramos un proceso con ese radicado en la Rama Judicial. Revisa que tenga los 23 números."
  - ✅ "La plataforma SAMAI no está respondiendo ahora. Volveremos a intentar automáticamente en 15 minutos."
  - ✅ "Tu usuario de SIUGJ no fue aceptado. Actualiza la contraseña en Ajustes → Plataformas."
- `not-found.tsx`, `error.tsx` y `global-error.tsx` personalizados, con lenguaje humano y una acción (volver, reintentar, ir al inicio).
- Route handlers y server actions nunca devuelven trazas; el detalle técnico va al logger estructurado (con id de correlación que sí puede mostrarse: "Código de ayuda: A7F3").
- Errores de formulario junto al campo, en tiempo real, con los mensajes de Zod traducidos.

---

## 11. UI / UX

- Mobile-first; probar en 360 px, 768 px, 1280 px y 1920 px. Tablas de procesos → tarjetas en móvil.
- Interruptor claro/oscuro/sistema con `next-themes`; tokens de color en CSS variables; sin parpadeo al cargar.
- Botón **Copiar radicado** (icono + tooltip + confirmación "Radicado copiado") en listas, detalle, resultados masivos y notificaciones en la app.
- Accesibilidad WCAG 2.2 AA: contraste, foco visible, navegación por teclado, `aria-live` para progreso de consultas.
- Estados vacíos, de carga (skeletons) y de error diseñados en cada pantalla.
- Fechas en formato colombiano (`dd/mm/aaaa`) y zona horaria `America/Bogota`.

---z

## 12. Fases

> Cada fase termina con: `pnpm lint`, `pnpm format:check`, `pnpm typecheck` y `pnpm test` en verde, resumen de lo hecho y **pausa para confirmación**.

### Fase 0 — Fundaciones
- Crear proyecto Next.js (TS strict, App Router, `src/`), pnpm.
- ESLint flat config + Prettier + plugin Tailwind + Husky + lint-staged + scripts (`lint`, `format`, `format:check`, `typecheck`, `test`).
- Estructura de carpetas del §3, `composition-root.ts`, `Result`, `AppError`, logger, validación de entorno con Zod (`.env.example`).
- PostgreSQL local con `docker compose` solo para desarrollo.
- Instalar y verificar skills (impeccable, apple-design) y configuración de 21st.dev.
- **Terminado cuando:** el proyecto arranca, el lint pasa y existe una prueba de ejemplo.

### Fase 1 — Dominio y base de datos
- `schema.prisma` con el modelo del §4, índices, restricciones únicas y migración inicial.
- Value objects `Radicado` y `Nunc` con pruebas exhaustivas (guiones, espacios, puntos, longitud incorrecta, ceros a la izquierda).
- Extensión Prisma de aislamiento por despacho + pruebas de aislamiento.
- Seed de desarrollo (un despacho, un usuario por rol, procesos de ejemplo).
- **Terminado cuando:** migraciones aplican limpias y las pruebas de dominio pasan.

### Fase 2 — Autenticación, despachos y roles
- Better Auth con organizaciones (despacho) y roles del §5; matriz de permisos centralizada y probada.
- Login, cierre de sesión, recuperación de contraseña, invitaciones con expiración.
- Panel del administrador: listar, invitar, editar rol, desactivar usuarios.
- Superadmin: crear y suspender despachos.
- Auditoría de acciones de cuenta.
- **Terminado cuando:** las pruebas de permisos cubren cada celda de la matriz.

### Fase 3 — Sistema de diseño y shell
- Tokens, tipografía, modo claro/oscuro, layout responsive (barra lateral → menú inferior o drawer en móvil).
- Componentes base desde 21st.dev adaptados; componente `RadicadoCopiable`.
- Páginas de error personalizadas y sistema de toasts.
- Pasar `impeccable` (audit + polish) y revisar con apple-design.
- **Terminado cuando:** shell navegable en los 4 anchos y en ambos temas sin problemas de contraste.

### Fase 4 — Gestión de procesos
- Registrar proceso (radicado y/o NUNC), editar, archivar, asignar abogado/asistente, etiquetas, búsqueda y filtros.
- Importación desde CSV/XLSX (reutiliza el normalizador).
- Detalle del proceso con línea de tiempo de actuaciones (vacía por ahora).
- **Terminado cuando:** CRUD completo con permisos y e2e del flujo principal.

### Fase 5 — Motor de consulta + Rama Judicial (CPNU)
- Puerto `PlataformaJudicial`, caso de uso `ConsultarProceso` y `SincronizarProceso` (detecta actuaciones nuevas comparando con las guardadas).
- `pg-boss` en el proceso `worker`, con límites por plataforma.
- Adaptador CPNU: búsqueda por radicado, detalle, actuaciones paginadas, documentos (si el spike confirma el endpoint).
- Guardar `fechaActuacion` y `fechaRegistro` oficiales.
- Botón "Consultar ahora" en el detalle y sincronización programada (frecuencia configurable).
- **Terminado cuando:** un proceso real se sincroniza de punta a punta y las fechas mostradas son las de la plataforma.

### Fase 6 — SPOA
- Spike: documentar el flujo del portal de la Fiscalía y confirmar campos disponibles.
- Redactar (en `docs/solicitudes/`) la solicitud formal de acceso por interoperabilidad a la Fiscalía.
- Implementar consulta asistida según la política del §6 y su integración a la bandeja de pendientes.
- Diseñar el adaptador automático detrás del mismo puerto, listo para activarse cuando exista acceso oficial.
- **Terminado cuando:** un abogado puede consultar un NUNC desde LURIS y el resultado queda guardado y notificable.

### Fase 7 — SAMAI
- Adaptador de consulta pública (23 dígitos): proceso, actuaciones y documentos públicos.
- Modo con credenciales del abogado para documentos restringidos (gestión de credenciales cifradas en Ajustes → Plataformas).
- **Terminado cuando:** actuaciones y documentos públicos se sincronizan y notifican.

### Fase 8 — SIUGJ
- Gestión de credenciales SIUGJ por abogado/despacho.
- Adaptador con Playwright: login, reutilización de sesión, búsqueda del expediente, actuaciones y documentos.
- Manejo claro de "no tienes acceso a este expediente en SIUGJ; solicítalo al juzgado".
- **Terminado cuando:** un proceso SIUGJ se sincroniza con la cuenta del abogado.

### Fase 9 — Tyba
- Actuaciones vía CPNU (reutilizando el adaptador de la fase 5) marcando el origen Tyba.
- Spike de documentos: ruta por número de certificación y alternativas oficiales; si solo hay vía con CAPTCHA, aplicar la política del §6 (asistida + solicitud de acceso oficial).
- **Terminado cuando:** las actuaciones de procesos Tyba se sincronizan automáticamente.

### Fase 10 — Consulta masiva
- Todo lo del §7, incluida la bandeja de pendientes para plataformas con consulta asistida.
- Prueba de carga con 400 radicados contra fixtures y una medición real controlada contra la CPNU.
- **Terminado cuando:** un lote de 400 termina, se puede abandonar y retomar, y se exporta.

### Fase 11 — Notificaciones
- Adaptador Email (Nodemailer + React Email) y adaptador WhatsApp (Baileys en el worker, vinculación por QR).
- Preferencias por usuario, modo inmediato y resumen diario, idempotencia y reintentos.
- **Terminado cuando:** una actuación nueva genera exactamente un correo y un WhatsApp con las fechas oficiales.

### Fase 12 — Endurecimiento
- Revisión de seguridad: headers, rate limiting de login, CSRF, cifrado de credenciales, permisos de archivos.
- Pruebas e2e de flujos críticos, accesibilidad, rendimiento (Lighthouse en móvil).
- Pasada final de `impeccable` sobre todas las pantallas.
- Documentación de usuario breve y de operación.

### Fase 13 — Docker (dos contenedores)
- `docker-compose.yml` con **solo dos servicios**:
  - `db`: PostgreSQL oficial, volumen persistente, healthcheck.
  - `app`: imagen multi-stage con Next.js en modo `standalone` + proceso `worker` + Chromium de Playwright; un entrypoint que ejecuta `prisma migrate deploy`, arranca la app y el worker y reenvía señales correctamente; volumen para documentos y sesión de WhatsApp.
- Usuario no root, `.dockerignore`, variables vía `.env`, healthcheck de la app.
- **Terminado cuando:** `docker compose up -d` en una máquina limpia levanta LURIS funcional con datos persistentes tras reiniciar.

---

## 13. Comandos

```bash
pnpm dev             # desarrollo
pnpm worker:dev      # worker en desarrollo
pnpm lint            # ESLint
pnpm format          # Prettier (escribe)
pnpm format:check    # Prettier (verifica)
pnpm typecheck       # tsc --noEmit
pnpm test            # Vitest
pnpm test:e2e        # Playwright
pnpm db:migrate      # prisma migrate dev
pnpm db:seed         # datos de ejemplo
```

## 14. Qué NO hacer

- No mostrar códigos HTTP ni mensajes técnicos al usuario.
- No guardar radicados como número ni con guiones.
- No usar la fecha de detección como fecha de la actuación.
- No consultar tablas de negocio sin filtro de despacho.
- No registrar credenciales, tokens ni contenido de documentos en logs.
- No resolver ni evadir CAPTCHAs.
- No agregar un tercer contenedor.
- No avanzar de fase sin confirmación.
