# SCRUM-21 — Primer incremento: consulta de clientes

## Alta y edición de direcciones

`POST /api/customers/:customerId/addresses` agrega una dirección y `PATCH /api/customers/:customerId/addresses/:addressId` edita una dirección perteneciente a ese cliente. Ambas operaciones exigen `ADMIN` habilitado. El cuerpo contiene exactamente `label`, `street`, `number`, `locality`, `department`, `reference` y `notes` como textos; calle, número, localidad y departamento son obligatorios. Se recortan espacios y los opcionales vacíos se guardan como `null`. Los límites coinciden con los formularios web y móvil. Para editar se agrega `expected` con los siete valores originales; una versión desactualizada produce 409 y un identificador inexistente o de otro cliente produce 404. Se devuelve la ficha del cliente actualizada.

La creación usa la relación existente del modelo y la edición comprueba de forma atómica la pertenencia y los valores anteriores. No se modifican el modelo ni las migraciones, y las direcciones históricas copiadas en envíos no se alteran. Los formularios advierten posibles duplicados según la comparación provisional existente; la API no impone unicidad. En la prueba HTTP contra PostgreSQL 17 aislado se verificaron persistencia, autorización, validación, pertenencia y ediciones simultáneas con autenticación simulada. La prueba con ZITADEL y dispositivos reales sigue pendiente.

## Estado de direcciones y migración

La migración aditiva `20261117120000_address_active` agrega `Address.active` con valor inicial `true`: las direcciones existentes quedan activas, sin modificar instantáneas de envíos. Debe coordinarse con el compañero y aplicarse antes de iniciar esta versión de la API; solo se aplicó a PostgreSQL aislado. Los clientes que ya no tengan direcciones se conservan sin inventar datos y la interfaz pide agregar o reactivar una. No hay todavía alta real de clientes en esta entrega; esa futura operación debe contemplar la regla de dirección activa.

`PATCH /api/customers/:customerId/addresses/:addressId/status` recibe exactamente `{ "active": true | false }`, solo para `ADMIN` habilitado. Las respuestas incluyen `active` en cada dirección. La operación conserva la dirección, no cambia el estado del cliente y es idempotente. Si se intenta desactivar la última dirección activa responde 409. Para serializar cambios simultáneos, la transacción bloquea la fila del cliente antes de contar y actualizar; la garantía corresponde a las operaciones que usen esta API. Las interfaces muestran el estado y permiten recargar ante un conflicto. La edición de una dirección desactivada conserva su estado.

La migración conserva registros pero cambia el contrato de lectura de forma aditiva. Antes de desplegar se requiere respaldo, revisión con el compañero y validación del estado de los clientes existentes. No revertir eliminando la columna sin preservar los estados: se perdería la información de direcciones desactivadas. Una versión antigua que ignore el estado no debe volver a habilitar operaciones hasta definir un procedimiento de reversión compatible.

## Edición de datos de clientes

`PATCH /api/customers/:customerId`, habilitado únicamente para `ADMIN` activo, guarda el nombre visible, razón social, email y teléfono. El cuerpo debe incluir `displayName`, `legalName`, `email` y `phone` como texto y `expected` con los valores originales de esos cuatro campos, incluyendo `null` para opcionales vacíos. Se recortan los nuevos valores y los tres campos opcionales vacíos se guardan como `null`. Nombre: obligatorio, hasta 120 caracteres; razón social: hasta 160; email: hasta 254 y con formato válido; teléfono: hasta 40 con dígitos y separadores habituales. Entrada inválida o campos adicionales: 400; acceso no autorizado: 401/403; cliente inexistente: 404; datos originales desactualizados: 409. Se responde con la ficha actualizada y `Cache-Control: no-store`.

La escritura solo modifica esos cuatro campos y no altera direcciones, estado, identidad ni historial de envíos. El `UPDATE` compara de manera atómica los valores originales; ante un conflicto web y móvil conservan el borrador y ofrecen descartar y recargar. Esta protección compara los cuatro campos editables: no detecta cambios que vuelvan exactamente a sus valores originales, ni cambios en otros campos. La prueba HTTP con dobles cubre permisos y validaciones; `test/customers.postgres.test.mjs` comprobó persistencia y dos guardados simultáneos en un clúster PostgreSQL 17 aislado, con autenticación simulada. La prueba con ZITADEL y dispositivos reales sigue pendiente. Las reglas de duplicados y la auditoría de cambios siguen pendientes.

## Lectura administrativa habilitada

Por decisión del usuario, `CustomersModule` está registrado en `AppModule` y permite únicamente al rol local `ADMIN` habilitado consultar `GET /api/customers` y `GET /api/customers/:customerId`, después de validar el token; los demás roles reciben 403. Las respuestas exitosas indican `Cache-Control: no-store`. La edición de datos se describe arriba; la autogestión sigue pendiente. La ampliación a otros roles requiere definir sus permisos y alcance.

El controlador reutiliza el servicio y contrato descritos abajo. La prueba `node --test test/customers.http.test.mjs`, luego de `npm run build`, levanta `AppModule` con identidad y Prisma simulados para comprobar autenticación, autorización, parámetros, listado, ficha y 404. No acredita integración con PostgreSQL ni ZITADEL reales.

Este documento describe el contrato del backend en `cesarworkbench`: listado, ficha con direcciones y edición de nombre y contacto. Las vistas previas documentadas en `web-ohana/docs/scrum-21-preview.md` mantienen cambios en memoria; sus funciones de estado no representan endpoints de escritura. Este incremento no modifica esquema ni migraciones.

## Frontera de integración

`CustomersModule` contiene el controlador de lectura y está registrado en `AppModule`. Las consultas administrativas no están pensadas para autoservicio de un cliente.

Web y móvil tienen fuentes de lectura intercambiables conectadas en código a la API para administradores habilitados; la prueba con servicios reales sigue pendiente. Los datos ficticios solo se usan en vistas independientes de desarrollo, no como sustituto silencioso de una API fallida.

## Contrato de lectura

Consultas: `GET /api/customers` y `GET /api/customers/:customerId`.

Listado: `search` opcional (máximo 120 caracteres), `status` (`all`, `enabled`, `disabled`), `page` (1 a 100000) y `pageSize` (1 a 50, por defecto 20). Búsqueda por nombre visible, razón social, documento, email o teléfono. Orden por nombre e ID para resultados estables.

Respuesta: `{ items, page, pageSize, total, totalPages }`; sin resultados, `items: []` y `totalPages: 0`.

Resumen de cliente: `id`, `type` (`PERSON` o `COMPANY`), `displayName`, `legalName`, `documentType`, `documentNumber`, `email`, `phone`, `enabled` y `addressCount`. Los campos opcionales de base de datos se serializan como `null`.

Ficha: resumen más `addresses`, con `id`, `label`, `street`, `number`, `locality`, `department`, `reference`, `notes` y `active`. Un cliente inexistente produce 404; parámetros inválidos, 400. Se mantienen las excepciones estándar de NestJS.

## Criterios del incremento

- Buscar, filtrar habilitados/deshabilitados, paginar y abrir la ficha con contactos y direcciones desde la vista previa.
- Volver al listado conservando filtros y página; navegar con teclado y mostrar datos ausentes sin inventarlos.
- Contemplar carga, lista vacía, búsqueda sin resultados y errores con reintento; no confundir un error con una lista vacía.
- Mostrar claramente que los clientes son ficticios y que no hay persistencia real.
- Verificar límites de consulta, serialización de campos y cliente inexistente con `node:test` en API; verificar build y comportamiento de UI en navegador.

## Verificación y límites

API: `npm test`, `npm run build` (con `DATABASE_URL` local de desarrollo para generar Prisma). Web: `npm run build`; vista previa mediante `npm run dev -- --host 127.0.0.1` y `/customers-preview.html`.

Las pruebas unitarias de servicio usan dobles de Prisma; la prueba PostgreSQL indicada arriba ejercita guardado y concurrencia en un clúster aislado. Quedan pendientes el alta y desactivación de clientes y la asociación Usuario–Cliente. No se publicaron ramas automáticamente.
