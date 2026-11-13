#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."
exec > >(tee verification.local.log) 2>&1

echo '== Ohana API: verificación local =='
if [[ ! -f .env ]]; then
  echo 'Falta .env. Copiá .env.example y configurá DATABASE_URL.' >&2
  exit 1
fi

npm ci --no-audit --no-fund
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:migrate:status
npm run prisma:migrate:diff
npm run db:verify
npm run build
npm test

PORT=3101 node dist/main.js &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null || true' EXIT

for attempt in $(seq 1 20); do
  if response=$(curl --silent --show-error --fail http://localhost:3101/api/health 2>/dev/null); then
    node -e '
      const response = JSON.parse(process.argv[1]);
      if (response.status !== "ok" || response.database !== "up") process.exit(1);
    ' "$response"
    echo "GET /api/health: $response"
    echo 'Verificación local completada.'
    exit 0
  fi
  sleep 1
done

echo 'La API no respondió con HTTP 200 en /api/health.' >&2
exit 1
