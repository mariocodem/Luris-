# LURIS con Docker (dos contenedores)

`docker-compose.yml` levanta **exactamente dos servicios** (§1):

| Servicio | Imagen                         | Qué contiene                                                                                                                   |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `db`     | `postgres:18-alpine`           | PostgreSQL con volumen persistente `luris-db` y healthcheck. Datos del negocio y cola de trabajos. **No publica puertos.**     |
| `app`    | construida con el `Dockerfile` | La **web** (Next.js `standalone`), el **worker** (consultas, documentos, avisos, WhatsApp) y el Chromium de Playwright (SIUGJ) |

No hay Redis ni un tercer contenedor: la cola usa PostgreSQL y WhatsApp corre dentro del worker.

## Puesta en marcha en una máquina limpia

Requisitos: Docker con Compose v2.

```powershell
cp .env.example .env
```

Edita `.env` y completa, como mínimo:

| Variable                                                            | Valor                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                                                 | Una contraseña larga y aleatoria                                                                  |
| `BETTER_AUTH_SECRET`                                                | `openssl rand -base64 32`                                                                         |
| `CREDENCIALES_CLAVE`                                                | `openssl rand -base64 32` (¡guárdala aparte!, ver [operacion.md](operacion.md))                   |
| `APP_URL`                                                           | La dirección pública (`https://luris.tudespacho.co`); en pruebas locales, `http://localhost:3000` |
| `CORREO_TRANSPORTE=smtp`, `SMTP_HOST`, `SMTP_*`, `CORREO_REMITENTE` | Tu servidor de correo (en producción es obligatorio)                                              |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_CONTRASENA`                         | El primer operador de LURIS (mínimo 10 caracteres)                                                |

Luego:

```powershell
docker compose up -d --build
```

La primera vez construye la imagen (varios minutos: instala dependencias, compila y descarga
Chromium). Al arrancar, el contenedor `app`:

1. espera a que la base esté sana (`depends_on` con `service_healthy`);
2. aplica las migraciones (`prisma migrate deploy`); si fallan, **no arranca**;
3. crea el superadministrador si aún no hay ninguno (idempotente; **quita
   `SUPERADMIN_CONTRASENA` del `.env` después del primer arranque**);
4. inicia la web (puerto 3000) y el worker.

Entra a `APP_URL`, inicia sesión con el superadministrador y crea el primer despacho en
«Despachos»; el despacho invita a su administrador por correo.

## Comprobaciones

```powershell
docker compose ps                 # app y db "healthy"
docker compose logs -f app        # «Worker de LURIS iniciado» y «LURIS iniciado»
curl http://localhost:3000/api/salud
```

El healthcheck de `app` consulta `/api/salud` (llega a la base de datos). Si la web **o** el worker
se detienen, el contenedor termina con error y Docker lo reinicia (`restart: unless-stopped`).

## Datos y respaldos

| Qué                                                                           | Dónde                                           | Respaldo                                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| Base de datos (negocio, cola de trabajos y la sesión de WhatsApp **cifrada**) | volumen `luris-db`                              | `docker compose exec db pg_dump -U luris luris > respaldo.sql` |
| Documentos descargados                                                        | volumen `luris-documentos` (`/data/documentos`) | copia del volumen                                              |

Los datos **persisten** al reiniciar o recrear los contenedores (`docker compose restart`,
`down`/`up`); solo se pierden con `docker compose down -v`. La sesión de WhatsApp vive cifrada en
la base: no necesita volumen propio.

## Seguridad de la imagen

- El proceso corre como usuario **sin privilegios** (`luris`, uid 10001); `tini` es el proceso 1.
- La base no tiene puertos publicados; solo `app` publica el puerto de la web.
- Los secretos llegan por variables de entorno (`.env`, que **no** entra a la imagen: está en
  `.dockerignore`); el `.env` no se sube al repositorio.
- LURIS **no termina HTTPS**: pon delante un proxy inverso con certificado y que **sobrescriba
  `X-Forwarded-For`** (ver «Lo que debe haber delante de LURIS» en [operacion.md](operacion.md)).
- Apagado ordenado: Docker envía `SIGTERM`; el entrypoint lo reenvía a la web y al worker, que
  termina los trabajos en curso (hasta 30 s; `stop_grace_period: 45s`).

## Actualizar

```powershell
git pull
docker compose up -d --build
```

Las migraciones nuevas se aplican solas al arrancar. Respalda la base antes de actualizar.

## Problemas frecuentes

| Síntoma                                            | Causa y solución                                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Define POSTGRES_PASSWORD en el archivo .env`      | Falta esa variable                                                                                                    |
| El contenedor `app` se reinicia sin parar          | `docker compose logs app`: normalmente una variable inválida (el log dice cuál, nunca su valor) o la base inaccesible |
| «No hay superadministrador» en el log              | Define `SUPERADMIN_EMAIL` y `SUPERADMIN_CONTRASENA` y reinicia (`docker compose up -d`)                               |
| No se pueden iniciar sesión tras cambiar `APP_URL` | Las cookies seguras exigen HTTPS cuando `APP_URL` es `https://…`                                                      |
| SIUGJ no abre el navegador                         | `docker compose logs app`; la imagen incluye Chromium (`SIUGJ_NAVEGADOR=chromium`)                                    |
