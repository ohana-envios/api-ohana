#!/usr/bin/env bash
set -euo pipefail

sha="${1:?Usage: deploy-staging.sh <commit-sha>}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Commit SHA inválido' >&2; exit 1; }

root="$HOME/ohana-staging"
release="$root/releases/$sha"
env_file="$root/staging.env"
[[ -f "$env_file" ]] || { echo "Falta $env_file en el VPS" >&2; exit 1; }
[[ -f "$release/infra/compose.deploy.yml" ]] || { echo 'Release incompleto' >&2; exit 1; }
command -v docker >/dev/null || { echo 'Docker no está instalado' >&2; exit 1; }
command -v curl >/dev/null || { echo 'curl no está instalado' >&2; exit 1; }

umask 077
mkdir -p "$root/backups"
compose=(docker compose --env-file "$env_file" -p ohana-staging -f "$release/infra/compose.deploy.yml")

"${compose[@]}" config --quiet
"${compose[@]}" build api
"${compose[@]}" up -d postgres

# La copia queda en el VPS. Nunca se envía a Actions ni al repositorio.
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_tmp="$root/backups/$timestamp-before-$sha.dump.tmp"
backup="$root/backups/$timestamp-before-$sha.dump"
if ! "${compose[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_tmp"; then
  rm -f "$backup_tmp"
  echo 'Falló el respaldo; se detiene el despliegue' >&2
  exit 1
fi
mv "$backup_tmp" "$backup"
echo "Respaldo creado: $backup"

"${compose[@]}" run --rm api npm run prisma:migrate:deploy
"${compose[@]}" up -d api

healthy=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:3101/api/health | grep -q '"database":"up"'; then
    healthy=true
    break
  fi
  sleep 2
done
if [[ "$healthy" != true ]]; then
  echo 'La API no respondió con base de datos activa; revisar contenedores en staging' >&2
  "${compose[@]}" ps >&2 || true
  exit 1
fi

ln -sfn "$release" "$root/current"
rm -f "$root/incoming/$sha.tar.gz"
"${compose[@]}" ps
echo "Staging API desplegada desde $sha; health local correcto"
