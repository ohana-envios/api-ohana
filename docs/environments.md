# Ambientes de Ohana: desarrollo, staging y producción

La arquitectura objetivo documentada para Ohana usa un VPS Hostinger, Docker y PostgreSQL. Esta entrega deja configuración versionada para los tres ambientes. Los servidores, dominios, certificados, copias de seguridad y credenciales reales deben proporcionarse y comprobarse antes de declarar staging o producción operativos.

| Ambiente | API y datos | Web | ZITADEL | Propósito |
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

**Decisión de staging:** API y PostgreSQL correrán en contenedores Docker dentro del VPS Hostinger; la web usará un despliegue Preview de Vercel ligado a la rama `staging`. Crear `$HOME/ohana-staging/staging.env` **solo en el VPS**, tomando `infra/staging.env.example` como plantilla, con permisos `600`. Usar contraseñas únicas de alta entropía y caracteres URL-safe, coherentes entre `DB_PASSWORD` y `DATABASE_URL`. Completar dominios HTTPS, CORS y valores públicos de ZITADEL. Nunca copiar el `.env` local ni credenciales de producción a staging.

Cuando este cambio se integre en `staging`, `API CI` tendrá un job de CD: solo se ejecutará tras `verify` verde en un push a `staging` (o una ejecución manual seleccionando esa rama), usará el GitHub Environment `staging`, transferirá el código por SSH con host verificado, construirá la imagen en el VPS, respaldará PostgreSQL en `$HOME/ohana-staging/backups`, aplicará migraciones, actualizará la API y comprobará `/api/health` en loopback. **No despliega producción.** Los backups y releases quedan en el VPS; establecer retención y probar una restauración antes de usar datos importantes. Una migración que cambie la estructura de datos puede requerir una reversión planificada; el script no restaura automáticamente la base.

Para activar el job, configurar en **api-ohana → Settings → Environments → staging**:

| Tipo | Nombre | Valor |
| --- | --- | --- |
| Variable | `STAGING_SSH_HOST` | IP o dominio del VPS. |
| Variable | `STAGING_SSH_USER` | Usuario SSH con acceso a Docker. |
| Variable | `STAGING_SSH_PORT` | Puerto SSH; opcional, 22 por defecto. |
| Secret | `STAGING_SSH_PRIVATE_KEY` | Contenido de la clave privada de despliegue, desde un archivo local; nunca en Git. |
| Secret | `STAGING_SSH_KNOWN_HOSTS` | Entrada `known_hosts` del VPS, con huella verificada por un canal independiente. |

La clave pública correspondiente debe figurar en `~/.ssh/authorized_keys` de ese usuario en el VPS. No se necesita la contraseña del VPS en GitHub. El usuario debe poder ejecutar `docker compose` y escribir en `$HOME/ohana-staging`. Antes del primer push a `staging`, crear allí `staging.env` y verificar `docker compose version`. No guardar el archivo de variables dentro de un release: el job lo conserva fuera del código versionado.

Despliegue manual de emergencia, desde la carpeta del repositorio en el VPS (con un `infra/staging.env` local creado a partir de la misma configuración):

```bash
docker compose --env-file infra/staging.env -p ohana-staging -f infra/compose.deploy.yml build
docker compose --env-file infra/staging.env -p ohana-staging -f infra/compose.deploy.yml run --rm api npm run prisma:migrate:deploy
docker compose --env-file infra/staging.env -p ohana-staging -f infra/compose.deploy.yml up -d
docker compose --env-file infra/staging.env -p ohana-staging -f infra/compose.deploy.yml ps
```

Producción usa los mismos comandos con `infra/production.env` y `-p ohana-production`, después de aprobar la misma versión en staging y realizar un backup comprobado. No ejecutar `migrate dev` en staging ni producción. La migración debe ejecutarse una sola vez antes del nuevo proceso API. El endpoint `/api/health` debe responder con base `up`; probarlo por el dominio HTTPS, además de la comprobación interna de Compose.

El reverse proxy del VPS debe dirigir `api-staging.<dominio>` a `127.0.0.1:3101` y `api.<dominio>` a `127.0.0.1:3102`, con certificados TLS y redirección HTTP→HTTPS. No publicar PostgreSQL ni los puertos 3101/3102 en Internet. Definir backups automáticos, retención, prueba de restauración, monitoreo y acceso SSH restringido antes del primer dato real. El contenedor actual incluye la CLI de Prisma para ejecutar migraciones; una imagen de runtime más pequeña puede incorporarse tras validar el despliegue.

## Web y móvil

En Vercel, vincular `web-ohana` y usar `main` como Production Branch solo después de comprobar qué proyecto alimenta el sitio actual. Configurar para la rama Preview `staging` `VITE_API_BASE_URL`, `VITE_ZITADEL_ISSUER_URL`, `VITE_ZITADEL_CLIENT_ID` y `VITE_ZITADEL_PROJECT_ID` con valores de staging; Vercel permite [variables Preview específicas por rama](https://vercel.com/docs/environment-variables). `VITE_API_BASE_URL` debe ser la URL HTTPS pública de la API en el VPS. Los orígenes web deben coincidir exactamente con `CORS_ORIGINS` y con las URLs permitidas de ZITADEL. Los cambios de variables `VITE_` requieren un nuevo build web. Staging y producción deben usar recursos ZITADEL y bases de datos separados; si se comparte tenant, usar aplicaciones/API identificadas por ambiente y políticas probadas por separado.

En móvil, `EXPO_PUBLIC_API_BASE_URL` apunta a una URL accesible desde el dispositivo. Las variables `EXPO_PUBLIC_` se incluyen en el bundle y no admiten secretos. Antes de distribuir builds, definir perfiles de desarrollo, staging y producción en EAS con identificadores de aplicación distintos y credenciales de tienda del equipo.

## GitHub Actions y promoción

Los workflows verifican cada PR: la API levanta PostgreSQL efímero, aplica migraciones y prueba HTTP; la web compila; móvil exporta bundles iOS/Android. El job de CD de API para staging entra tras CI verde al recibir un push a `staging`, una vez configurados acceso y variables. La promoción propuesta es `PR → CI verde → revisión → staging → pruebas de aceptación → backup → producción`. Los GitHub Environments `staging` y `production` ya existen; configurar revisores requeridos para producción y secretos separados. No hay despliegue automático a producción.
