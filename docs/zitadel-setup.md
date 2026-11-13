# ZITADEL Cloud Free — OIDC y MFA de Ohana

El plan Free anuncia 100 usuarios activos diarios y funciones de seguridad sin costo. Confirmar el consumo real antes de depender del límite. Referencia: https://zitadel.com/pricing

## Instancia y ambientes

1. Crear una instancia ZITADEL Cloud Free de Ohana. Usar un proyecto separado para `dev`, `staging` y `production`, cada uno con una SPA web y una aplicación API. No compartir Client ID ni secreto entre ambientes.
2. En cada SPA, usar tipo **User Agent** / autorización **Code + PKCE**. Registrar el origen exacto de Vite local o Vercel en Redirect URI y Post Logout URI. Activar Dev Mode solo para `http://localhost:5173`; staging y producción usan HTTPS. Copiar emisor, Client ID y Project ID a las variables `VITE_ZITADEL_*` del ambiente web. La SPA solicita `openid profile email urn:zitadel:iam:org:project:id:<PROJECT_ID>:aud`.
3. En cada proyecto registrar una aplicación **API** con autenticación **Basic**. Guardar Client ID y Client Secret solo en el `.env` privado del servidor, junto con emisor, Project ID y Client ID de la SPA. El endpoint de introspección es `<ISSUER>/oauth/v2/introspect`. No introducir el secreto en `VITE_*`, Git ni mensajes.
4. En la consola, configurar **Login Behavior and Security → Multifactor**: habilitar TOTP y **Force MFA**. Si se usa un proveedor externo, decidir si aplicar `Force MFA for local authenticated users` o la política general. Deshabilitar registro público si las cuentas serán invitadas por Ohana. Configurar recuperación de cuenta y límites de intentos antes de producción.
5. Probar una cuenta por ambiente: registro del factor TOTP, inicio de sesión con código, rechazo sin factor y acceso a `GET /api/auth/me` con access token. Verificar que un token expirado, revocado o emitido para otro proyecto sea rechazado. `GET /api/health` sigue público.

La API usa introspección y comprueba `active`, `iss`, `aud`, `client_id`, `sub`, `exp` y tipo Bearer. No usar solo el JWT y su audiencia para autorizar: ZITADEL documenta que se puede solicitar una audiencia sin permisos y recomienda introspección. Los futuros endpoints deben agregar autorización por rol y relación con el cliente, además del guard de autenticación.

La política MFA se aplica en ZITADEL, no en la web. Una configuración local o la existencia de este código no demuestran que MFA esté activo. Antes de publicar, revisar la política en la consola y ejecutar una prueba real de inicio de sesión. El correo de la instancia puede requerir proveedor SMTP propio para una entrega fiable en producción; revisar los términos actuales del plan y probar invitaciones y recuperación.

Fuentes: https://zitadel.com/docs/sdk-examples/react · https://zitadel.com/docs/guides/integrate/token-introspection/basic-auth · https://zitadel.com/docs/guides/manage/console/default-settings · https://help.zitadel.com/security-best-practices-validating-audience-aud-claims-in-zitadel-access-tokens
