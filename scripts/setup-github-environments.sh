#!/usr/bin/env bash
set -euo pipefail

# Crea solo los GitHub Environments ausentes. No toca secretos, revisores,
# reglas existentes, ramas ni despliegues.
owner=ohana-envios
repos=(api-ohana web-ohana app-mobile-ohana)
environments=(dev staging production)
branches=(dev staging main)

command -v gh >/dev/null || { echo 'Falta GitHub CLI (gh).' >&2; exit 1; }
gh auth status >/dev/null

for repo in "${repos[@]}"; do
  full_name="$owner/$repo"
  existing="$(gh api "repos/$full_name/environments" --jq '.environments[].name' | tr '[:upper:]' '[:lower:]')"
  echo "== $full_name =="
  for index in "${!environments[@]}"; do
    environment="${environments[$index]}"
    branch="${branches[$index]}"
    if printf '%s\n' "$existing" | grep -Fxq "$environment"; then
      echo "Conservado: $environment (revisar protección y secretos existentes en GitHub)"
      continue
    fi
    printf '%s' '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' |
      gh api --method PUT "repos/$full_name/environments/$environment" --input - >/dev/null
    gh api --method POST "repos/$full_name/environments/$environment/deployment-branch-policies" \
      -f name="$branch" -f type=branch >/dev/null
    echo "Creado: $environment; rama autorizada: $branch"
  done
  gh api "repos/$full_name/environments" --jq '.environments[] | [.name, (.deployment_branch_policy | tostring)] | @tsv'
done

echo 'Listo. Configurar revisores, secrets y variables en Settings > Environments antes de desplegar.'
