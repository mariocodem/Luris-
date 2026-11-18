# Operación de LURIS

Guía para quien instala y mantiene LURIS. La puesta en marcha con Docker llega en la Fase 13;
aquí está lo que hay que saber de la aplicación, su configuración y su seguridad.

## Piezas

| Proceso                      | Qué hace                                                                                        | Cómo se arranca                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Aplicación web** (Next.js) | Páginas y acciones; solo encola trabajos                                                        | `pnpm build` y `pnpm start` (desarrollo: `pnpm dev`) |
| **Worker**                   | Consulta las plataformas, descarga documentos, despacha avisos y mantiene la sesión de WhatsApp | `pnpm worker:dev`                                    |
| **PostgreSQL**               | Datos del negocio y la cola de trabajos (`pg-boss`, esquema `pgboss`)                           | `pnpm db:up` en desarrollo                           |

**Sin el worker no pasa nada en segundo plano** (consultas, consulta masiva, avisos). `GET
/api/salud` responde `{"estado":"ok"}` si la web llega a la base (503 si no); no revisa el worker.
Antes de arrancar una versión nueva: `pnpm db:deploy`.

## Variables de entorno

Se validan al arrancar: si falta algo, el proceso no inicia y dice qué variable (nunca su valor).
Referencia comentada: `.env.example`. Lo imprescindible:

| Variable                                               | Para qué                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `DATABASE_URL`                                         | Conexión a PostgreSQL                                                          |
| `BETTER_AUTH_SECRET`                                   | Firma las cookies de sesión (mínimo 32 caracteres)                             |
| `APP_URL`                                              | Dirección pública `https://…` (enlaces, cookies seguras, orígenes confiables)  |
| `CORREO_TRANSPORTE=smtp`, `SMTP_*`, `CORREO_REMITENTE` | Correos; en producción `archivo` no se acepta                                  |
| `CREDENCIALES_CLAVE`                                   | Cifra credenciales de plataformas y la sesión de WhatsApp (32 bytes en base64) |
| `ALMACEN_DIRECTORIO`                                   | Carpeta de documentos (volumen persistente; archivos 600, carpetas 700)        |

> **No pierdas ni cambies `CREDENCIALES_CLAVE`.** Con otra clave, las credenciales y la sesión de
> WhatsApp dejan de descifrarse y hay que registrarlas de nuevo. Guárdala fuera del repositorio y
> fuera de los respaldos de la base.

El ritmo con los portales (`CPNU_SOLICITUDES_POR_MINUTO`, etc.) está en
[consulta-masiva.md](consulta-masiva.md): un lote de 400 procesos tarda ~90 minutos a 20/min.

## Seguridad

- **Acceso**: sin registro abierto (invitaciones de un solo uso, vencen en 72 h). Las rutas de
  Better Auth no están expuestas: todo pasa por casos de uso que verifican los permisos en el
  servidor. Desactivar una cuenta la saca en su siguiente petición. Contraseña de mínimo 10
  caracteres.
- **Sesión**: cookie `HttpOnly`, `SameSite=Lax`, `Secure` si `APP_URL` es HTTPS; dura 7 días.
- **Límites de intentos** (en memoria): 5 fallos de inicio de sesión por correo y por IP en 15
  minutos; 5 recuperaciones de contraseña por correo; 10 consultas masivas y 10 credenciales
  guardadas cada 15 minutos por persona; 5 vinculaciones de WhatsApp cada 15 minutos por despacho.
  Un correo inexistente y una contraseña equivocada dan el mismo mensaje.
- **CSRF**: las server actions comparan el origen de cada petición con el host; la subida de
  documentos exige `Sec-Fetch-Site: same-origin` y tamaño declarado.
- **Cabeceras** (`src/shared/infrastructure/seguridad.ts`): nosniff, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, COOP/CORP; en producción, HSTS y CSP sin `eval` ni
  scripts de terceros, con `frame-ancestors 'self'`. El visor de documentos queda fuera de la CSP
  (rompería el visor de PDF). Límite conocido: `script-src` admite `'unsafe-inline'` porque Next.js
  hidrata con scripts en línea; una CSP con _nonce_ obligaría a renderizar todo de forma dinámica.
- **Datos**: aislamiento por despacho en todas las tablas (con pruebas); credenciales y sesión de
  WhatsApp con AES-256-GCM y un contexto distinto por registro; nunca viajan al navegador.
- **Logs**: ocultan contraseñas, tokens, cookies, credenciales, sesiones, QR y números de WhatsApp;
  nunca registran el contenido de correos, mensajes ni documentos.
- **Errores**: la persona ve qué pasó y un «código de ayuda»; ese código aparece en el log técnico.

### Lo que debe haber delante de LURIS

1. **HTTPS** (proxy inverso con certificado): LURIS no termina TLS.
2. **El proxy debe sobrescribir `X-Forwarded-For`** con la IP real; si el cliente puede inventarla,
   el límite por IP se evade (el límite por correo sigue).
3. **`Host`/`X-Forwarded-Host` correctos**; si el proxy los cambia, declara
   `experimental.serverActions.allowedOrigins` en `next.config.ts`.
4. **Una sola réplica de la web**: el limitador es en memoria (con más réplicas, moverlo a
   PostgreSQL detrás del puerto `LimitadorDeIntentos`).

### Revisión de dependencias (18/11/2026)

`pnpm audit --prod` informa 3 avisos, todos en herramientas de compilación o pruebas, no en el
código de producción: `picomatch` (alto, ReDoS; vía `vitest`/`vite`, sin versión corregida aún) y
`minimatch` (moderado; vía la CLI de `shadcn`, ahora dependencia de desarrollo). Ninguno procesa
texto que escriban las personas. Se repite la revisión en cada actualización.

## Datos personales (Ley 1581 de 2012)

- **Finalidad**: seguimiento de los procesos del despacho y avisos a su equipo; no se comparten
  datos entre despachos ni con terceros salvo las plataformas oficiales consultadas y el proveedor
  de correo configurado.
- **Consentimiento**: las credenciales se guardan con autorización expresa y se pueden borrar;
  WhatsApp exige número y aceptación expresa (queda su fecha).
- **Supresión y retención**: desactivar una cuenta no borra datos. Borrar usuarios, despachos o
  credenciales se hace en la base de datos; la política de privacidad y los plazos de retención los
  define el despacho como responsable del tratamiento.

## Respaldos

Respalda la base (`pg_dump`) **y** el volumen de documentos juntos, y `CREDENCIALES_CLAVE` por
separado. Para restaurar: base → documentos → `pnpm db:deploy` → web y worker. La cola viaja con la
base y retoma los trabajos pendientes.

## Cuando algo falla

| Síntoma                        | Qué mirar                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| «Consultar ahora» no avanza    | ¿Corre el worker? Su log dice «Worker de LURIS iniciado»                                                             |
| Una plataforma siempre falla   | Log del worker: «Plataforma en pausa» (baja el ritmo) o `RESPUESTA_INESPERADA` (el portal cambió)                    |
| No llegan correos              | Log del worker: «El servidor de correo no aceptó el mensaje» con el código SMTP; se reintenta 5 veces                |
| WhatsApp desconectado          | Ajustes → WhatsApp del despacho; si se cerró desde el teléfono, vincular de nuevo; si no conecta, actualizar Baileys |
| Alguien no puede entrar        | Puede estar bloqueado 15 minutos; reiniciar la web limpia el límite                                                  |
| Un error con «código de ayuda» | Busca ese código en el log de la web                                                                                 |

## Pruebas antes de entregar

`pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` y `pnpm test:e2e` (levanta su propio
servidor, worker y plataformas simuladas; requiere `pnpm dev` detenido). Las e2e cubren seguridad,
cuentas, accesibilidad (axe, WCAG 2.2 AA, claro/oscuro, escritorio/celular) y un lote de 400.
