# syntax=docker/dockerfile:1
#
# Imagen de LURIS (Fase 13): la web (Next.js en modo standalone) y el worker en un solo contenedor,
# con el Chromium de Playwright para SIUGJ. Etapas: deps → build → prod-deps → runtime.

ARG NODE_IMAGE=node:26-bookworm-slim

# ─── Base: Node y pnpm (Node 25+ ya no trae Corepack) ─────────────────────────
FROM ${NODE_IMAGE} AS base
# openssl: Prisma lo detecta para elegir su motor de migraciones (sin él descarga uno para OpenSSL 1.1).
RUN apt-get update \
 && apt-get install --yes --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install --global pnpm@9.15.9
# Husky (git hooks) no aplica dentro de la imagen.
ENV HUSKY=0 CI=true NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ─── deps: todas las dependencias (para compilar) ─────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# ─── build: cliente de Prisma, web (standalone) y worker ──────────────────────
FROM deps AS build
COPY . .
RUN pnpm exec prisma generate
# Valores de relleno SOLO para compilar (viven en este comando, no en la imagen): Next.js importa
# módulos que validan el entorno.
RUN DATABASE_URL=postgresql://compilacion:compilacion@localhost:5432/compilacion \
    BETTER_AUTH_SECRET=valor-de-relleno-solo-para-compilar-la-imagen \
    CORREO_TRANSPORTE=archivo \
    pnpm build && node scripts/construir-worker.mjs

# ─── prod-deps: solo dependencias de producción (para el worker y las migraciones) ─
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts \
 && pnpm rebuild @prisma/engines \
 && pnpm exec prisma generate

# ─── runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=America/Bogota \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright \
    SIUGJ_NAVEGADOR=chromium \
    ALMACEN_DIRECTORIO=/data/documentos

# tini: proceso 1 que recoge procesos zombi y reenvía señales.
RUN apt-get update \
 && apt-get install --yes --no-install-recommends tini bash ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

# Usuario sin privilegios.
RUN groupadd --system --gid 10001 luris \
 && useradd --system --uid 10001 --gid luris --home-dir /app --shell /usr/sbin/nologin luris

# Worker y migraciones: dependencias de producción, código empaquetado y esquema.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/prisma ./prisma
COPY --from=prod-deps /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/dist ./dist
# Web: salida standalone de Next.js (con su propio node_modules mínimo) y archivos estáticos.
COPY --from=build /app/.next/standalone ./web
COPY --from=build /app/.next/static ./web/.next/static
COPY docker/entrypoint.sh ./entrypoint.sh

# Chromium para SIUGJ (con las bibliotecas del sistema que necesita).
RUN node node_modules/playwright-core/cli.js install --with-deps --only-shell chromium \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data/documentos \
 && chown -R luris:luris /data /opt/playwright \
 && chmod +x entrypoint.sh

USER luris
VOLUME ["/data/documentos"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["tini", "--", "./entrypoint.sh"]
