#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
npm run build

./node_modules/.bin/tsc -p tsconfig.build.json --watch --preserveWatchOutput &
compiler_pid=$!
node --watch dist/main.js &
server_pid=$!

cleanup() {
  kill "$compiler_pid" "$server_pid" 2>/dev/null || true
  wait "$compiler_pid" "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
wait "$server_pid"
