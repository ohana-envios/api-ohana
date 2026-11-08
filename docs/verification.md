# Evidencia de verificación — SCRUM-12 / SCRUM-13

Fecha: 08/11/2026. Rama local: `feat/scrum-12-13-backend-modelo`.

## Comprobado en esta sesión

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
- GitHub: `api-ohana` no tiene ramas ni commits al inicio del trabajo.
- Jira: SCRUM-12 y SCRUM-13 conservan Sprint 2 cerrado, Sprint 3 futuro y estado `En curso`.

## Pendiente de ejecución real

- `prisma migrate deploy/status/diff`, `npm run db:verify` y la solicitud HTTP real todavía requieren PostgreSQL. `prisma migrate status` devolvió P1001 porque `localhost:5432` no responde en este sandbox.
- La migración SQL fue generada mediante Prisma Migrate, pero **aún no fue aplicada a PostgreSQL** en esta sesión.
- Docker está instalado, pero este sandbox no puede acceder a su socket; tampoco hay binario de servidor PostgreSQL disponible localmente.
- `git push` falla con `Could not resolve host: github.com`. La conexión integrada de GitHub devuelve HTTP 403 al intentar escribir. No existen commits remotos ni PR.
- La primera instalación informó 15 vulnerabilidades. Se retiraron las dependencias de Supertest y Nest Testing; falta repetir una auditoría con acceso a npm sobre el lockfile actualizado y revisar los hallazgos sin aplicar `npm audit fix --force` automáticamente.

Esta lista debe actualizarse con los resultados reales, el enlace del PR y la revisión de otro integrante antes de declarar ambas tareas terminadas.
