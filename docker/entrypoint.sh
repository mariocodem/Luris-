#!/usr/bin/env bash
# Arranque del contenedor `app`: aplica las migraciones, crea el primer superadministrador si se
# pidió y deja corriendo la web y el worker. Si cualquiera de los dos se detiene, se detiene el
# otro y el contenedor termina con error (Docker lo reinicia). Las señales de Docker (SIGTERM) se
# reenvían a los dos para un apagado ordenado: el worker termina los trabajos en curso.
set -uo pipefail

echo "[luris] Aplicando migraciones…"
if ! node_modules/.bin/prisma migrate deploy; then
  echo "[luris] No se pudieron aplicar las migraciones; no se inicia." >&2
  exit 1
fi

node dist/crear-superadmin.mjs || echo "[luris] No se pudo crear el superadministrador (ver arriba)." >&2

echo "[luris] Iniciando la web y el worker…"
node web/server.js &
web=$!
node dist/worker.mjs &
worker=$!

detener() {
  trap - TERM INT
  kill -TERM "$web" "$worker" 2>/dev/null
  wait "$web" "$worker" 2>/dev/null
}
trap 'detener; exit 0' TERM INT

# Termina en cuanto cualquiera de los dos procesos se detiene.
wait -n "$web" "$worker"
codigo=$?
echo "[luris] Un proceso terminó (código $codigo); deteniendo el otro." >&2
detener
exit "$((codigo == 0 ? 1 : codigo))"
