# Evidencia de verificación — SCRUM-12 / SCRUM-13

Fecha: 08/11/2026. Rama local: `feat/scrum-12-13-backend-modelo`.

## Comprobado en esta sesión

- `git diff --check`: sin errores de espacios.
- `python3 -m json.tool package.json` y `tsconfig.json`: JSON válido.
- `node --check scripts/verify-schema.mjs`: sintaxis JavaScript válida.
- Ejecución directa de `validateEnvironment` con Node 22: URL PostgreSQL, puerto y CORS de ejemplo aceptados.
- Comparación estática del esquema Prisma y la migración: los seis modelos tienen sus columnas en el SQL.
- GitHub: `api-ohana` no tiene ramas ni commits al inicio del trabajo.
- Jira: SCRUM-12 y SCRUM-13 conservan Sprint 2 cerrado, Sprint 3 futuro y estado `En curso`.

## Pendiente de ejecución real

- `npm install` no terminó en este sandbox. El acceso a npm está bloqueado y la caché local carece de paquetes transitivos requeridos.
- `prisma validate`, `prisma generate`, `prisma migrate dev/deploy/status/diff`, `npm run build`, `npm test` y la solicitud HTTP real requieren dependencias instaladas. Ninguno se da por aprobado todavía.
- La migración SQL inicial está preparada, pero **no fue generada mediante Prisma Migrate ni aplicada a PostgreSQL** en esta sesión. Debe regenerarse con `prisma migrate dev --create-only` sobre una base de prueba vacía y revisarse antes de `migrate deploy`.
- Docker está instalado, pero este sandbox no puede acceder a su socket; tampoco hay binario de servidor PostgreSQL disponible localmente.
- `git push` falla con `Could not resolve host: github.com`. La conexión integrada de GitHub devuelve HTTP 403 al intentar escribir. No existen commits remotos ni PR.

Esta lista debe actualizarse con los resultados reales, el enlace del PR y la revisión de otro integrante antes de declarar ambas tareas terminadas.
