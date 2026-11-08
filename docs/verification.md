# Evidencia de verificación — SCRUM-12 / SCRUM-13

Fecha: 08/11/2026. Rama local: `feat/scrum-12-13-backend-modelo`.

## Comprobado en el sandbox y en Terminal local

- `git diff --check`: sin errores de espacios.
- `python3 -m json.tool package.json` y `tsconfig.json`: JSON válido.
- `node --check scripts/verify-schema.mjs`: sintaxis JavaScript válida.
- Ejecución directa de `validateEnvironment` con Node 22: URL PostgreSQL, puerto y CORS de ejemplo aceptados.
- Comparación estática del esquema Prisma y la migración: los seis modelos tienen sus columnas en el SQL.
- `npm install` ejecutado por Santiago en Terminal: 260 paquetes instalados y `package-lock.json` generado; Prisma Client 7.8.0 se generó en `postinstall`.
- `npm run prisma:validate`: esquema válido.
- `npm run build`: Prisma Client regenerado y TypeScript compilado sin errores.
- `npm test`: cuatro pruebas unitarias aprobadas (configuración y health con consulta simulada).
- `npm ci --offline --ignore-scripts` en un directorio temporal: lockfile reproducible, 237 paquetes instalados.
- `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`: SQL inicial generado por Prisma Migrate; la migración versionada contiene ese resultado exacto y un trigger adicional que protege eventos históricos.
- `bash scripts/verify-local.sh` ejecutado por Santiago contra PostgreSQL 17 en Docker: `npm ci`, validación y generación de Prisma Client, `prisma migrate deploy` (una migración aplicada), `prisma migrate status` (base al día), `prisma migrate diff` (sin diferencias), `db:verify` (seis tablas, claves, índices, snapshot de dirección y eventos inmutables), build y 4/4 pruebas aprobadas.
- La API arrancó y `GET /api/health` respondió HTTP 200 con `{"status":"ok","database":"up"}`. El log completo quedó en `verification.local.log` (ignorado por Git).
- GitHub: `api-ohana` no tiene ramas ni commits al inicio del trabajo.
- Jira: SCRUM-12 y SCRUM-13 conservan Sprint 2 cerrado, Sprint 3 futuro y estado `En curso`.

## Pendiente de ejecución real

- CI en GitHub y revisión de otro integrante todavía no se ejecutaron.
- `git push` desde este sandbox falla con `Could not resolve host: github.com`. La conexión integrada de GitHub devuelve HTTP 403 al intentar escribir. Al registrar esta evidencia aún no existen commits remotos ni PR.
- La primera instalación informó 15 vulnerabilidades. Se retiraron las dependencias de Supertest y Nest Testing; falta repetir una auditoría con acceso a npm sobre el lockfile actualizado y revisar los hallazgos sin aplicar `npm audit fix --force` automáticamente.

Esta lista debe actualizarse con los resultados reales, el enlace del PR y la revisión de otro integrante antes de declarar ambas tareas terminadas.
