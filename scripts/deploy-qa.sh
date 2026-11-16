#!/usr/bin/env bash
# Despliegue del cotizador RC en QA 121 (rama qa). Uso: bash scripts/deploy-qa.sh
set -euo pipefail
[ "$(hostname)" = "srv001qa" ] || { echo "ESTE SCRIPT ES PARA EL 121 (srv001qa)"; exit 1; }
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo "Falta .env.local (NEST_API_URL, NEST_API_KEY, NEXUS_API_URL, NEXUS_API_KEY, VITE_*): ver .env.example"; exit 1; }
git pull --ff-only origin qa
npm ci --no-audit --no-fund
unset PORT VITE_APP_BASE DATABASE_URL
VITE_APP_BASE=/cotizador-rc/ npm run build
if pm2 describe cotizador-rc >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --env production --update-env
else
  pm2 start ecosystem.config.cjs --env production && pm2 save
fi
git log --oneline -1
sleep 5
curl -s -o /dev/null -w "cotizador local %{http_code}\n" http://127.0.0.1:5185/cotizador-rc/
