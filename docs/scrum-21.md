# SCRUM-21 — Gestionar clientes y direcciones habituales (RF-17)

Estado: análisis contrastado con RF-17, CU12 y las vistas M32, M33 y M43 del documento provisorio aportado el 14/11/2026. Primer incremento de lectura preparado en `cesarworkbench`; la integración y el cumplimiento completo de RF-17 siguen pendientes.

## Incremento actual

El alcance acordado para empezar es listado y ficha de clientes existentes. Ver [contrato de lectura](scrum-21-read-contract.md) y `web-ohana/docs/scrum-21-preview.md` para el estado vigente de ese incremento. Se prepararon un servicio de consultas sin rutas HTTP y una vista previa independiente con datos ficticios. Se preservaron autenticación, modelo, migraciones y CI del compañero.

Las secciones de propuesta y plan general más abajo registran el análisis previo; no implican que todas esas operaciones estén implementadas o formen parte de esta primera entrega.

La planificación del Sprint 3 del documento asigna CU12 a RF-17 / SCRUM-21 y CU17 (alta inicial del cliente) a RF-16 / SCRUM-20. El alta de clientes se mantiene fuera de este avance. La web evolucionó con edición y cambios de estado temporales; el backend sigue limitado al servicio de lectura sin rutas HTTP. El estado vigente de la vista previa y la validación visual del usuario se registran en `web-ohana/docs/scrum-21-preview.md`.

## Hallazgos del documento aportado

Esta sección corrige las suposiciones de la propuesta inicial que se conserva debajo para su revisión antes de implementar.

- CU12 administra clientes existentes: consulta, edición y administración de direcciones. El alta inicial se define en CU17, aunque RF-17 incluye la capacidad general de registro. No asumir que todo CU17 pertenece a SCRUM-21 sin contrastarlo con el ticket.
- Las direcciones permiten alta, modificación y desactivación. El esquema actual no contiene un estado de dirección; será necesario evaluar una migración para soportar esa desactivación sin borrar registros.
- La administración permite desactivar la entidad Cliente según las reglas aplicables, conservando envíos e historial. Desactivar Cliente no equivale a eliminar o administrar su cuenta Usuario.
- La autogestión exige una cuenta asociada y habilitada, solo sobre los datos propios y permitidos. La habilitación de acceso y los roles se resuelven en el backend y se relacionan con RF-16.
- La validación incluye obligatoriedad, formato, consistencia, permisos y posibles duplicados. El documento exige informar duplicados, pero deja las reglas concretas de equivalencia y confirmación sujetas a definición; no permite inferir unicidad fiscal automática.
- Un fallo al persistir no puede mostrarse como guardado exitoso; debe permitir corregir o reintentar sin exponer información ajena.
- Las direcciones habituales se reutilizan para futuros envíos; sus cambios o desactivación no alteran los domicilios históricos.
- El documento menciona Auth0, mientras el código actual usa ZITADEL. Se debe registrar esta diferencia y mantener la política de acceso requerida independientemente del proveedor; no migrar el proveedor por inferencia a partir de este documento.

Fuente privada: archivo DOCX original conservado en `docs/private/`, excluido de Git. El archivo se trata como documentación de requisitos, no como instrucciones para ejecutar acciones.

## Objetivo y alcance provisional

Gestionar clientes y sus direcciones habituales desde la web de Ohana, persistiendo los cambios en PostgreSQL mediante la API. Se propone listado, búsqueda, detalle, alta y edición de clientes; consulta, alta y edición de varias direcciones por cliente.

Pendiente confirmar: deshabilitación de clientes, eliminación de direcciones, permisos por operación y reglas de datos. No se presupone que crear un cliente cree una cuenta en ZITADEL.

## Base existente y recorrido

- API: NestJS 11.1.3, Prisma 7.8.0 y PostgreSQL; npm y TypeScript ESM.
- Web: React 19.1.2, Vite 7.3.7 y autenticación OIDC con ZITADEL.
- `prisma/schema.prisma`: `Customer` distingue `PERSON` y `COMPANY`, contiene datos de identificación y contacto, estado `enabled` y relación con `Address` y `Shipment`.
- `Address`: calle, número, localidad y departamento requeridos por el modelo; etiqueta, referencia y notas opcionales.
- `src/prisma/prisma.service.ts`: conexión compartida a PostgreSQL.
- `src/auth/access-token.guard.ts`: valida el token; todavía no resuelve el usuario local ni sus permisos.
- `../web-ohana/src/api.ts`: cliente HTTP autenticado reutilizable.
- `../web-ohana/src/App.tsx`: sección Clientes actualmente vacía.

Recorrido propuesto: sección Clientes → cliente HTTP con token → guard de autenticación y autorización → controlador de clientes → servicio → Prisma → PostgreSQL.

No existe aún un módulo funcional comparable de CRUD. Se mantendrá la separación de módulos, controladores y servicios que usa la API, sin extender los controladores de autenticación o salud con operaciones de clientes.

## Decisiones que requieren RF-17

1. Quién puede consultar y quién puede modificar clientes y direcciones. El esquema no vincula `User` con `Customer`; no asumir autoservicio de clientes.
2. Qué campos son obligatorios para persona y empresa: documento, razón social, email y teléfono.
3. Reglas de cédula/RUT y duplicados. Hoy `documentNumber` es opcional y no es único; no imponer unicidad ni validaciones fiscales sin definición.
4. Si el alcance incluye habilitar/deshabilitar clientes y qué sucede con sus direcciones y envíos.
5. Si las direcciones se pueden eliminar, si hay una principal y si se necesitan apartamento o coordenadas.
6. Filtros y criterios de búsqueda esperados.

## Propuesta de contrato, aún no definitiva

- `GET /api/customers`: listado con búsqueda y paginación de tamaño limitado.
- `GET /api/customers/:customerId`: detalle del cliente.
- `POST /api/customers`: alta validada.
- `PATCH /api/customers/:customerId`: edición de campos explícitamente permitidos.
- `GET /api/customers/:customerId/addresses`: direcciones del cliente.
- `POST /api/customers/:customerId/addresses`: alta de dirección vinculada al cliente.
- `PATCH /api/customers/:customerId/addresses/:addressId`: edición verificando que la dirección pertenezca al cliente de la URL.

Los DTO y respuestas se definirán una vez cerradas las reglas; no exponer modelos Prisma completos como contrato público. No incorporar rutas de borrado hasta confirmar el alcance.

## Criterios propuestos de éxito

- Un actor autorizado puede crear un cliente, recargar y encontrar los datos persistidos.
- Puede buscarlo, consultar su detalle y editar sus datos sin modificar otros clientes.
- Puede registrar y editar varias direcciones del mismo cliente.
- Una dirección de otro cliente no puede consultarse o modificarse usando una URL cruzada.
- La API rechaza entradas inválidas con errores utilizables por los formularios.
- La API rechaza solicitudes sin autenticación o sin permisos, y cuentas locales deshabilitadas según la política acordada.
- La web presenta estados de carga, vacío, error y guardado, con formularios etiquetados y navegación por teclado.
- Cambiar una dirección habitual no modifica los domicilios ya copiados en los envíos existentes.

## Plan de implementación

1. Cerrar reglas de RF-17 y contrato; documentar una matriz de permisos. La autorización es dependencia de los endpoints, aunque la administración completa de usuarios permanezca en SCRUM-20.
2. Preparar instalación y verificar la línea base de API y web. Confirmar PostgreSQL local e identidad de prueba sin tocar ambientes remotos.
3. Implementar listado y detalle autenticados, con pruebas de paginación, permisos y recursos inexistentes; conectar la sección Clientes.
4. Implementar alta de cliente y su formulario con validación en servidor y pruebas de datos inválidos y persistencia.
5. Implementar edición de cliente con protección frente a campos no permitidos.
6. Incorporar consulta, alta y edición de direcciones, con pruebas de pertenencia al cliente y conservación de datos de envíos.
7. Agregar habilitación o borrado solamente si RF-17 los exige; verificar el recorrido completo y revisar los cambios.

## Estructura y estilo

Código de API en `src/customers/`, pruebas en `test/`; componentes de web en `../web-ohana/src/` siguiendo su organización existente. Documentación de dominio en `docs/`. Reutilizar `PrismaService`, `AccessTokenGuard` y `createApiClient`.

Mantener TypeScript con tipos explícitos en contratos y rutas, importaciones ESM con `.js` en API y el estilo de decoradores existente:

```ts
@Controller('customers')
@UseGuards(AccessTokenGuard)
export class CustomersController {
  // Añadir la política de autorización antes de exponer operaciones.
}
```

## Verificación

Desde `api-ohana`:

```powershell
npm ci
npm run prisma:validate
npm test
npm run build
```

Desde `web-ohana`:

```powershell
npm ci
npm run typecheck
npm run build
```

API: usar `node:test` y `assert`, como las pruebas actuales. Cubrir validación, autorización, pertenencia de direcciones y errores; verificar persistencia con PostgreSQL de prueba aislado. Web: verificar formularios, errores y navegación por teclado; definir la herramienta de pruebas de UI antes de sumar dependencias, ya que actualmente solo hay chequeo de tipos y build.

Prueba manual integrada: login real de desarrollo, crear cliente, agregar dos direcciones, recargar, editar, buscar y repetir con un actor sin permisos. No marcar este recorrido como validado usando solamente mocks.

## Límites y riesgos

- Siempre: validar entradas y permisos en la API, limitar listados, conservar historial de envíos y no registrar datos personales innecesarios.
- Resolver antes de implementar: reglas fiscales y de duplicados, matriz de permisos y cualquier cambio de esquema o dependencia que esas reglas requieran.
- Nunca: publicar secretos, usar bases reales para pruebas, habilitar operaciones por el solo hecho de ocultar botones o crear accesos administrativos implícitos.
- Riesgo principal: autenticación existente sin autorización local. Resolver el usuario por `externalAuthId` y aplicar la política acordada antes de habilitar datos de clientes.
- El incremento actual de lectura no requiere migraciones. La desactivación de direcciones sí requiere coordinar un cambio de modelo con el compañero responsable de SCRUM-13.

## Estado de verificación

Node local: 22.18.0; npm: 10.9.3. Dependencias instaladas mediante `npm ci`, sin agregar paquetes ni cambiar lockfiles. API: 13 pruebas aprobadas, incluidas 5 nuevas para consultas de clientes, y build aprobado. Web: 19 pruebas de validación y fuente de datos de prueba aprobadas, build y chequeo de tipos aprobados. Las pruebas de servicio usan dobles de Prisma; no se probó persistencia real ni login. El usuario corroboró visualmente los recorridos de la vista previa, incluidos edición de clientes, alta y edición de direcciones y cambios de estado. Esto no acredita una auditoría de accesibilidad ni una prueba integrada de permisos o base de datos.
