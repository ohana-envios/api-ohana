> Guía histórica. La decisión actual para MFA gratuito de Ohana está en [zitadel-setup.md](zitadel-setup.md). No usar esta guía para nuevos despliegues.

# Auth0 — configuración inicial de SCRUM-14

La API valida access tokens JWT de Auth0 mediante JWKS remoto, firma RS256, emisor, audiencia, vencimiento y sujeto. `GET /api/auth/me` devuelve únicamente el identificador externo (`sub`) cuando recibe un token válido. `GET /api/health` sigue siendo público. Los endpoints funcionales futuros deberán usar `AccessTokenGuard` y verificar permisos del usuario en la API; ocultar botones en la web no autoriza operaciones.

## Registrar recursos en Auth0

1. Crear una **API** de Ohana en el tenant y seleccionar **RS256**. Guardar su **Identifier** como `AUTH0_AUDIENCE` en la API y `VITE_AUTH0_AUDIENCE` en la web.
2. Crear una aplicación de tipo **Single Page Application**. Guardar su Client ID público como `VITE_AUTH0_CLIENT_ID` y el dominio del tenant como `VITE_AUTH0_DOMAIN` (sin protocolo). No usar Client Secret en la web.
3. Agregar URLs de cada entorno en **Allowed Callback URLs**, **Allowed Logout URLs** y **Allowed Web Origins**. Desarrollo: `http://localhost:5173`. Staging y producción deben tener sus URLs reales y HTTPS.
4. Configurar `AUTH0_ISSUER_BASE_URL=https://<dominio-del-tenant>/` y la misma audiencia en la API. En producción, ambas variables son obligatorias. Configurar `CORS_ORIGINS` con el origen exacto de cada web.
5. Para comprobar el flujo: iniciar sesión en la web, obtener un access token para la audiencia de Ohana y llamar `GET /api/auth/me` con `Authorization: Bearer <token>`. Comprobar 401 para token ausente, audiencia incorrecta, emisor incorrecto y token vencido. Nunca publicar tokens en Git o en Jira.

## Correo verificado y MFA

La emisión de un JWT no demuestra por sí sola que el correo esté verificado o que se haya completado MFA. Definir con Fernando qué usuarios y conexiones requieren esas políticas. Para cuentas de base de datos Auth0, una **Post-Login Action** puede negar el acceso si `event.user.email_verified` es falso; Auth0 documenta ese patrón en su [guía de soporte](https://support.auth0.com/center/s/article/implement-email-verification-to-prevent-access-with-unverified-emails-in-auth0). Probar el mensaje de error y el reenvío de correo con una cuenta de prueba.

Configurar los factores y la política de MFA en **Security → Multi-factor Auth** del tenant. La opción `Always` exige segundo factor en cada inicio según la política; una Action permite reglas más específicas. Validar el comportamiento con cuentas de cliente, operador y administrador antes de activarlo en producción. Referencia: [Auth0, MFA en cada inicio](https://support.auth0.com/center/s/article/Force-MFA-every-attempt).

La configuración del tenant es externa al repositorio y aún necesita datos de la organización. No se han creado aplicaciones, políticas ni usuarios reales desde este código.
