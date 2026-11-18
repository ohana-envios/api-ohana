# SCRUM-20 — Base de acceso operativo (RF-16)

## Objetivo y alcance

Primer incremento en `cesarworkbench`: identificar al usuario local a partir del `sub` autenticado, comprobar su habilitación y aplicar autorización explícita por rol. RF-16, RN-CU15-03/06 y RN-CU19-01/04 fundamentan estos controles.

Se mantienen los roles existentes (`ADMIN`, `OPERATOR`, `CUSTOMER`, `COURIER`). No se agregan roles ni se asignan privilegios a ninguna persona. La matriz por operación de negocio y los subadministradores quedan pendientes de definición; no se infieren permisos administrativos de `OPERATOR`.

## Contrato

Segundo incremento: `GET /api/users`, exclusivo de `ADMIN`, devuelve `{ items, page, pageSize, total, totalPages }`. Cada elemento contiene `id`, `email`, `displayName`, `role` y `enabled`; no expone el identificador externo ni otros campos internos. Filtros: `search` por nombre o email (hasta 120 caracteres), `role` (`all` o un rol existente), `status` (`all`, `enabled`, `disabled`), `page` (1–100000) y `pageSize` (1–50, por defecto 20). Orden estable por nombre e ID; consulta inválida: 400. Sin resultados: lista vacía y cero páginas. Consulta y filtros no modifican usuarios ni privilegios.

La pantalla correspondiente vive en una vista previa independiente de web, de solo lectura y con usuarios ficticios. No modifica el login, la navegación existente, las cuentas reales ni la configuración externa. La prueba con PostgreSQL y ZITADEL reales continúa pendiente de integración con el compañero.

- `GET /api/users/me`: token válido más usuario local asociado y habilitado. Devuelve solo `id`, `email`, `displayName`, `role` y `enabled: true` del usuario actual. Los cuatro roles actuales pueden consultar su propia sesión operativa.
- 401: token ausente, mal formado o inválido, según el guard existente.
- 403: identidad sin usuario local asociado, usuario deshabilitado o rol no autorizado. El mensaje no distingue cuenta inexistente de deshabilitada.
- 503: fallo de introspección o consulta de acceso local. No expone errores de base de datos.
- Las rutas protegidas con `RolesGuard` deniegan acceso sin una lista explícita de roles; no hay bypass implícito de administrador.

La asociación se consulta por `User.externalAuthId === sub`. No hay asociación por email, autorregistro, alta automática ni elevación de privilegios en el login. La habilitación y el rol se leen en cada solicitud, sin caché local: un token todavía válido no evita una deshabilitación o cambio de rol en PostgreSQL.

## Integración y límites

Flujo: Bearer → `AccessTokenGuard` existente → `OperationalUserGuard` → `UsersService` → Prisma → `RolesGuard` → controlador. El request recibe el usuario local resuelto por el servidor; no se toman roles ni estados de headers, body, query ni del frontend.

El único cambio en `src/auth/` es exportar `AccessTokenGuard` desde `AuthModule` para inyectar la misma implementación. `/api/auth/me` sigue siendo una comprobación de identidad externa y no autoriza operaciones de negocio. Salud continúa con su comportamiento existente. No se convierten esos endpoints de diagnóstico en verificaciones de habilitación.

El código nuevo vive en `src/users/` y se registra en `AppModule`. Reutiliza `PrismaService`, las excepciones de NestJS y las convenciones ESM con `.js`. No cambia esquemas, migraciones, CI, dependencias, configuración del tenant ni login web. El listado web se prepara en una vista previa independiente, documentada en `web-ohana/docs/scrum-20-preview.md`. Las rutas de negocio futuras deberán aplicar ambos guards y declarar los roles permitidos.

Las restricciones por propiedad de recursos (por ejemplo, un cliente solo sobre sus propios datos) requieren controles adicionales: el rol por sí solo no da acceso a todos los clientes. Un `User` habilitado tampoco acredita por sí solo el estado operativo de una entidad Cliente pendiente de habilitación.

Correo verificado, MFA, revocación de la sesión externa y políticas del proveedor siguen bajo la integración de SCRUM-14. Este incremento consume su verificación de token; no afirma haber comprobado esas políticas en un tenant real.

## Plan y verificación

1. Probar resolución por identidad externa, rechazo de cuentas sin acceso, proyección de datos y fallos seguros.
2. Implementar el servicio y guards reutilizables, con denegación por defecto.
3. Integrar el endpoint de sesión operativa y probar la cadena HTTP real de Nest con dobles de introspección y Prisma.
4. Revisar que autenticación, modelo y dependencias preservan su comportamiento previo.

```powershell
npm test
npm run build
node --test test/users.http.test.mjs
```

El build requiere `DATABASE_URL` configurada para generar Prisma, pero no establece conexión. La prueba HTTP separada importa `dist/` para verificar la inyección real y los metadatos de decoradores emitidos por TypeScript, y por eso se ejecuta después del build. No altera CI ni incorpora librerías de prueba. Usa exclusivamente HTTP en loopback, introspección simulada y acceso a datos simulado; no se conecta a ZITADEL ni PostgreSQL reales.

Los criterios son: 401 antes de consultar usuarios si no hay token válido; 403 sin acceso local o permiso; 200 con el usuario propio habilitado; revocación local efectiva en la siguiente solicitud; fallos 503 sin detalles internos; `/auth/me` sin cambio de contrato.

Resultado local: 20 pruebas unitarias aprobadas, build aprobado y 11 escenarios HTTP aprobados dentro de una prueba de aplicación, incluidos autorización, filtros, proyección y paginación del listado. La prueba HTTP no forma parte del patrón `test/*.test.ts` de `npm test`: el comando separado anterior es obligatorio para verificar este incremento completo. La incorporación a CI debe coordinarse con SCRUM-27.

## Uso en futuros módulos

Importar `UsersModule` en el módulo consumidor y aplicar ambos guards en ese orden. Declarar explícitamente los roles de cada operación, por ejemplo:

```ts
@UseGuards(OperationalUserGuard, RolesGuard)
@RequireRoles('ADMIN')
@Get('example')
example() {
  // Aplicar además restricciones de propiedad o alcance cuando corresponda.
}
```

Este ejemplo no crea una ruta ni define la matriz de permisos de clientes. La sesión operativa propia admite los cuatro roles existentes; los permisos de cada función se definen e integran por separado. La web todavía consulta el diagnóstico externo `/auth/me`: deberá integrar `/users/me` antes de presentar acceso operativo real. No se cambió el login ni la vista previa de SCRUM-21.

## Pendiente para completar SCRUM-20

Administración de usuarios y roles, altas y asociaciones autorizadas de identidad, habilitación inicial de clientes (CU18), registro de clientes (CU17), auditoría de cambios, pantallas, asociación Usuario–Cliente y pruebas con servicios reales. No se habilita a ninguna cuenta real mediante este trabajo.
