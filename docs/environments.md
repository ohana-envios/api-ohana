# Ambientes de Ohana: desarrollo, staging y producción

La arquitectura objetivo documentada para Ohana usa un VPS Hostinger, Docker y PostgreSQL. Esta entrega deja configuración versionada para los tres ambientes. Los servidores, dominios, certificados, copias de seguridad y credenciales reales deben proporcionarse y comprobarse antes de declarar staging o producción operativos.

| Ambiente | API y datos | Web | Auth0 | Propósito |
| --- | --- | --- | --- | --- |
| Desarrollo | NestJS local + PostgreSQL 17 en Docker. | Vite local `localhost:5173`. | Tenant/aplicación de prueba. | Cambios rápidos y migraciones de desarrollo. |
| Staging | Proyecto Compose `ohana-staging`, volumen PostgreSQL propio, API enlazada a `127.0.0.1:3101`. | Despliegue Vercel de staging o subdominio dedicado. | Aplicación y audiencia de staging. | Ensayo de migraciones, integración y aceptación. |
| Producción | Proyecto Compose `ohana-production`, volumen PostgreSQL propio, API enlazada a `127.0.0.1:3102`. | Dominio público de Ohana. | Aplicación y audiencia de producción. | Operación real después de revisión y respaldos. |

Los proyectos Compose separados impiden compartir volumen y red de base de datos. PostgreSQL no publica el puerto en staging o producción. La API solo escucha en loopback del VPS; hace falta un reverse proxy con HTTPS y dos dominios de API. La web no debe usar `localhost` en staging/producción. No se configuró aún el reverse proxy porque faltan los dominios definitivos.

## Desarrollo

Desde `api-ohana`, si aún corre el contenedor manual `ohana-postgres`, deténgalo antes de usar el mismo puerto:

```bash
docker stop ohana-postgres
docker compose -f infra/compose.dev.yml up -d
cp .env.example .env
npm ci
npm run prisma:migrate:deploy
npm run dev
```

La contraseña pública `ohana_local_only` del ejemplo sirve solo para la base local descartable. Ajuste `.env` para `postgresql://ohana:ohana_local_only@localhost:5432/ohana_dev`. Para probar otra migración, use una base de desarrollo separada de staging y producción.

## Staging y producción en el VPS

Copiar `infra/staging.env.example` a `infra/staging.env` y `infra/production.env.example` a `infra/production.env` **solo en el VPS**, con permisos restringidos. Usar contraseñas únicas de alta entropía y caracteres URL-safe, coherentes entre `DB_PASSWORD` y `DATABASE_URL`. Completar dominios HTTPS, CORS y valores públicos de Auth0; los archivos reales están ignorados por Git. Nunca copiar el `.env` local ni credenciales de producción a staging.

Staging, desde la carpeta del repositorio en el VPS:

```bash
docker compose --env-file infra/staging.env -p ohana-staging -f infra/compose.deploy.yml build
docker compose --env-file infra/staging.env -p ohana-staging -f infra/compose.deploy.yml run --rm api npm run prisma:migrate:deploy
docker compose --env-file infra/staging.env -p ohana-staging -f infra/compose.deploy.yml up -d
docker compose --env-file infra/staging.env -p ohana-staging -f infra/compose.deploy.yml ps
```

Producción usa los mismos comandos con `infra/production.env` y `-p ohana-production`, después de aprobar la misma versión en staging y realizar un backup comprobado. No ejecutar `migrate dev` en staging ni producción. La migración debe ejecutarse una sola vez antes del nuevo proceso API. El endpoint `/api/health` debe responder con base `up`; probarlo por el dominio HTTPS, además de la comprobación interna de Compose.

El reverse proxy del VPS debe dirigir `api-staging.<dominio>` a `127.0.0.1:3101` y `api.<dominio>` a `127.0.0.1:3102`, con certificados TLS y redirección HTTP→HTTPS. No publicar PostgreSQL ni los puertos 3101/3102 en Internet. Definir backups automáticos, retención, prueba de restauración, monitoreo y acceso SSH restringido antes del primer dato real. El contenedor actual incluye la CLI de Prisma para ejecutar migraciones; una imagen de runtime más pequeña puede incorporarse tras validar el despliegue.

## Web y móvil

En Vercel, configurar por ambiente `VITE_API_BASE_URL`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID` y `VITE_AUTH0_AUDIENCE`. Los orígenes web deben coincidir exactamente con `CORS_ORIGINS` y con las URLs permitidas de Auth0. Los cambios de variables `VITE_` requieren un nuevo build web. Staging y producción deben usar recursos Auth0 y bases de datos separados; si se comparte tenant, usar aplicaciones/API identificadas por ambiente y políticas probadas por separado.

En móvil, `EXPO_PUBLIC_API_BASE_URL` apunta a una URL accesible desde el dispositivo. Las variables `EXPO_PUBLIC_` se incluyen en el bundle y no admiten secretos. Antes de distribuir builds, definir perfiles de desarrollo, staging y producción en EAS con identificadores de aplicación distintos y credenciales de tienda del equipo.

## GitHub Actions y promoción

Los workflows actuales verifican cada PR: la API levanta PostgreSQL efímero, aplica migraciones y prueba HTTP; la web compila; móvil exporta bundles iOS/Android. La promoción propuesta es `PR → CI verde → revisión → staging → pruebas de aceptación → backup → producción`. Crear **GitHub Environments** `staging` y `production` con revisores requeridos para producción y secretos separados. No añadir un workflow que haga deploy automático a producción hasta disponer del VPS, dominios y estrategia de rollback aprobados.
