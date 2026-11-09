# Ohana Envíos API

API REST modular de Ohana Envíos. Incluye la base técnica (SCRUM-12), el modelo relacional inicial (SCRUM-13) y validación inicial de access tokens Auth0 (SCRUM-14). El tenant y los casos de uso operativos completos todavía requieren configuración e implementación.

## Requisitos

- Node.js 22.12 o superior y npm 10 o superior.
- PostgreSQL 17 o compatible, accesible desde la máquina de desarrollo.
- Una base de datos de desarrollo vacía. Nunca use una base con datos reales para `migrate dev`.

## Inicio local

1. Cree una base de datos local, por ejemplo `ohana_dev`, y un usuario PostgreSQL con permisos sobre ella. Si usa Docker, esta instancia descartable sirve solo para desarrollo:

   ```bash
   docker run --rm --name ohana-postgres \
     -e POSTGRES_USER=ohana -e POSTGRES_PASSWORD=ohana_local_only \
     -e POSTGRES_DB=ohana_dev -p 127.0.0.1:5432:5432 postgres:17
   ```

   La contraseña del ejemplo es pública y **no debe usarse fuera de una base local descartable**. Mantenga el contenedor en ejecución mientras prueba la API. No guarde credenciales reales en Git.
2. Copie el ejemplo y ajuste únicamente su archivo local:

   ```bash
   cp .env.example .env
   ```

   `DATABASE_URL` debe apuntar a PostgreSQL. Para el contenedor anterior use `postgresql://ohana:ohana_local_only@localhost:5432/ohana_dev` en `.env`. El archivo `.env.example` no contiene credenciales. Para otro servidor, configure una URL privada en `.env` y codifique los caracteres especiales de la contraseña en formato URL.
3. Instale las dependencias y genere el cliente:

   ```bash
   npm install
   npm run prisma:validate
   npm run prisma:generate
   ```

4. Aplique la migración inicial en la base vacía y verifique el esquema:

   ```bash
   npm run prisma:migrate:deploy
   npm run prisma:migrate:status
   npm run prisma:migrate:diff
   npm run db:verify
   ```

5. Compile, pruebe y arranque la API:

   ```bash
   npm run build
   npm test
   npm run dev
   ```

   En otra terminal:

   ```bash
   curl --fail http://localhost:3000/api/health
   ```

   Respuesta esperada con PostgreSQL disponible: `{"status":"ok","database":"up"}`. Si la conexión cae después del arranque, la ruta responde HTTP 503. La aplicación exige una conexión válida al iniciar.

Para ejecutar todo el proceso de verificación anterior con una sola orden y guardar la salida localmente, use `bash scripts/verify-local.sh`. El archivo `verification.local.log` no se sube a Git.

## Configuración

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Obligatoria. URL PostgreSQL usada por Prisma CLI y la API. |
| `PORT` | Puerto HTTP; por defecto `3000`. |
| `NODE_ENV` | `development`, `test` o `production`. |
| `CORS_ORIGINS` | Orígenes web exactos, separados por comas. Vacío bloquea solicitudes CORS. |
| `AUTH0_ISSUER_BASE_URL` | URL HTTPS del tenant Auth0; obligatoria en producción. |
| `AUTH0_AUDIENCE` | Identifier de la API Auth0; obligatorio junto al emisor. |

La configuración se valida al iniciar. El archivo `.env` y el cliente Prisma generado están excluidos de Git. `prisma.config.ts` sigue el formato de Prisma 7: la URL reside allí y la conexión de la aplicación usa `@prisma/adapter-pg`.

`GET /api/auth/me` exige un access token JWT válido de Auth0. La guía [docs/auth0-setup.md](docs/auth0-setup.md) explica cómo registrar la API y la SPA, configurar correo verificado y MFA, y probar la validación. En desarrollo el health funciona sin tenant; el endpoint protegido devuelve 503 hasta configurar Auth0. En producción la API no arranca sin emisor y audiencia.

## Migraciones y CI

- `npm run prisma:migrate:dev -- --name nombre` crea y aplica una migración nueva en una base de **desarrollo**.
- `npm run prisma:migrate:deploy` aplica las migraciones versionadas sin generar otra.
- `npm run prisma:migrate:diff` comprueba si la base aplicada coincide con `schema.prisma` en los objetos que Prisma soporta; los triggers se comprueban aparte en `npm run db:verify`.
- CI inicia PostgreSQL de prueba, instala con `npm ci`, valida y genera Prisma Client, aplica migraciones, comprueba esquema, compila, ejecuta pruebas y llama al endpoint HTTP.

La migración inicial incluye seis tablas, claves foráneas con `ON DELETE RESTRICT`, índices y un trigger que impide modificar o borrar eventos históricos. Los bultos se identifican mediante el código del envío más su secuencia; no tienen un código independiente en este alcance.

La configuración de [desarrollo, staging y producción](docs/environments.md) incluye Docker Compose para PostgreSQL local y proyectos de despliegue aislados. Staging y producción requieren VPS, dominios, HTTPS y credenciales reales antes de poder activarse.
La estrategia de [ramas y promoción](docs/branching-and-environments.md) define `feature/* → dev → staging → main` mediante PR y revisión.

## Modelo y decisiones pendientes

Consulte [docs/model-decisions.md](docs/model-decisions.md) para los supuestos que Fernando debe validar. Los campos de dirección del envío son copias históricas: cambiar una dirección habitual del cliente no altera un envío ya registrado. La creación y transición de envíos debe implementarse posteriormente con transacciones que inserten el evento correspondiente.

## Trazabilidad

- SCRUM-12: estructura NestJS, configuración, PrismaService, endpoint de salud y CI.
- SCRUM-13: esquema Prisma, migración inicial, verificación de restricciones y decisiones de dominio.

Estas tareas estuvieron comprometidas en Sprint 2 y continúan en Sprint 3. La revisión de equipo y la aceptación en Jira deben conservar esa historia, sin moverlas retroactivamente a un sprint cerrado.
