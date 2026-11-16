#!/usr/bin/env bash
# Despliegue del Cotizador de Riesgos Patrimoniales en producción GCIA (rama main). Carpeta: ~/exelixi/cotizador-rc
#   bash scripts/deploy-prod.sh              → vista cliente: PM2 cotizador-patrimoniales, 127.0.0.1:5195, raíz /
#                                              (Apache patrimoniales.exelixitech.com → 127.0.0.1:5195; lo configura infra)
#   CON_ADMIN=1 bash scripts/deploy-prod.sh  → además la vista admin: PM2 cotizador-patrimoniales-admin, 127.0.0.1:5185
#                                              (sin Apache: túnel SSH  ssh -L 5185:127.0.0.1:5185 proyect@172.30.149.75)
# La .env.local se crea una vez con:  node scripts/crear-env-prod.mjs   (no muestra ninguna key).
# Nunca hace reset: si hay cambios en archivos versionados, se detiene.
set -euo pipefail
[ "$(hostname)" = "Srv-Gcia-proyect" ] || { echo "ESTE SCRIPT ES PARA PRODUCCIÓN GCIA (Srv-Gcia-proyect)"; exit 1; }
cd "$(dirname "$0")/.."

APP=cotizador-patrimoniales; PUERTO=5195
APP_ADMIN=cotizador-patrimoniales-admin; PUERTO_ADMIN=5185

# ── 1 · Verificaciones y git pull (luego el script se vuelve a ejecutar ya actualizado) ──────────────────────────────
if [ "${1:-}" != "--actualizado" ]; then
  [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "La carpeta no está en la rama main"; exit 1; }
  if [ -n "$(git status --short --untracked-files=no)" ]; then
    echo "Hay cambios locales en archivos versionados (no se hace reset; revisar con el equipo):"
    git status --short --untracked-files=no
    exit 1
  fi
  [ -f .env.local ] || { echo "Falta .env.local: crearla con  node scripts/crear-env-prod.mjs"; exit 1; }
  for v in NEST_API_URL NEST_API_KEY NEXUS_API_URL NEXUS_API_KEY COTIZACIONES_RC_SECRET; do
    grep -qE "^$v=.+" .env.local || { echo "Falta $v en .env.local"; exit 1; }
  done
  if grep -qE 'nexusqa|cierrelmds|trycloudflare' .env.local; then echo ".env.local apunta a QA/dev: no se despliega"; exit 1; fi
  if grep -qE '^VITE_(RCG_PLANES_EMITIR|RC_EMITIR)=1' .env.local; then echo "Botones de emisión de prueba encendidos en .env.local (VITE_*_EMITIR=1)"; exit 1; fi
  # Puertos: libres o ya usados por nuestra propia app.
  ocupado() { ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q .; }
  for par in "$APP:$PUERTO" "$APP_ADMIN:$PUERTO_ADMIN"; do
    a=${par%%:*}; p=${par##*:}
    [ "$a" = "$APP_ADMIN" ] && [ "${CON_ADMIN:-0}" != "1" ] && continue
    if ocupado "$p" && ! pm2 describe "$a" >/dev/null 2>&1; then
      echo "El puerto $p ya lo usa otro proceso (ss -ltnp | grep :$p): elegir otro en ecosystem.config.cjs"; exit 1
    fi
  done
  git pull --ff-only origin main
  exec bash "$0" --actualizado
fi

# ── 2 · Dependencias y build (uno por vista) ─────────────────────────────────────────────────────────────────────────
npm ci --include=dev --no-audit --no-fund
unset PORT VITE_APP_BASE VITE_NEXUS_API_URL DATABASE_URL COTIZADOR_CLIENTE COTIZADOR_OUTDIR COTIZADOR_PUBLICO
export VITE_APP_BASE=/ COTIZADOR_ENTORNO=produccion
COTIZADOR_CLIENTE=1 COTIZADOR_OUTDIR=dist npm run build
[ "${CON_ADMIN:-0}" = "1" ] && COTIZADOR_CLIENTE=0 COTIZADOR_OUTDIR=dist-admin npm run build

# El bundle no puede llevar URLs de QA/dev ni las keys del servidor (se comprueba sin mostrarlas).
for d in dist dist-admin; do
  [ -d "$d" ] || continue
  [ "$d" = dist-admin ] && [ "${CON_ADMIN:-0}" != "1" ] && continue
  if grep -rqE 'nexusqa|cierrelmds' "$d"; then echo "El bundle $d trae URLs de QA/dev"; exit 1; fi
  for v in NEST_API_KEY NEXUS_API_KEY COTIZACIONES_RC_SECRET; do
    val=$(grep -E "^$v=" .env.local | tail -1 | cut -d= -f2- | tr -d '\r')
    if [ -n "$val" ] && grep -rqF -- "$val" "$d"; then echo "ALERTA: $v aparece en el bundle $d: no se despliega"; exit 1; fi
  done
done
unset val

# ── 3 · PM2 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
apps="$APP"; [ "${CON_ADMIN:-0}" = "1" ] && apps="$APP $APP_ADMIN"
for a in $apps; do
  if pm2 describe "$a" >/dev/null 2>&1; then
    pm2 reload ecosystem.config.cjs --only "$a" --env production --update-env
  else
    pm2 start ecosystem.config.cjs --only "$a" --env production
  fi
done
pm2 save
git log --oneline -1

# ── 4 · Healthcheck local ────────────────────────────────────────────────────────────────────────────────────────────
sleep 5
fallos=0
chequear() { # descripción, código esperado, curl args…
  local desc=$1 esperado=$2; shift 2
  local cod; cod=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@" || true)
  if [ "$cod" = "$esperado" ]; then echo "OK   $desc ($cod)"; else echo "FALLA $desc: $cod (esperado $esperado)"; fallos=$((fallos + 1)); fi
}
B=http://127.0.0.1:$PUERTO
chequear "cliente: página"                          200 "$B/"
chequear "cliente: catálogo nest-api (key OK)"     200 "$B/nest/api/v1/riesgos-generales/ramos"
chequear "cliente: emisión directa bloqueada"      404 -X POST "$B/nest/api/v1/riesgos-generales/emision"
chequear "cliente: listado de Nexus bloqueado"      404 "$B/nexus/api/cotizaciones-rc?q=x"
chequear "cliente: prima manipulada rechazada"      400 -X POST -H 'content-type: application/json' --data '{"producto":"rcg","datos":{"producto":"rcg"}}' "$B/nexus/api/cotizaciones-rc"
if [ "${CON_ADMIN:-0}" = "1" ]; then
  chequear "admin: página"                          200 "http://127.0.0.1:$PUERTO_ADMIN/"
  chequear "admin: catálogo nest-api"               200 "http://127.0.0.1:$PUERTO_ADMIN/nest/api/v1/riesgos-generales/ramos"
fi
# Nexus: sin el módulo cotizaciones-rc desplegado en nexus-api responde 404 (el cotizador avisa y sigue cotizando).
NEXUS=$(grep -E '^NEXUS_API_URL=' .env.local | cut -d= -f2- | tr -d '\r')
echo "nexus-api /health: $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$NEXUS/health" || true)"
[ "$fallos" = 0 ] || { echo "$fallos verificación(es) fallaron: revisar  pm2 logs $APP --lines 50"; exit 1; }
echo "Listo. Público (cuando infra publique el vhost): https://patrimoniales.exelixitech.com/"
