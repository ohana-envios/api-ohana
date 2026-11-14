# SCRUM-21 — Primer incremento: consulta de clientes

Este documento describe el primer incremento y el contrato de lectura del backend en `cesarworkbench`: listado → ficha de cliente con direcciones. Las ampliaciones posteriores de edición y estados en memoria se documentan en `web-ohana/docs/scrum-21-preview.md`; no representan endpoints de escritura. Consultas de Prisma preparadas sin modificar autenticación, esquema, migraciones, CI ni pruebas del compañero.

## Frontera de integración

`CustomersModule` exportará un servicio de lectura, sin controladores y sin registrarse en `AppModule`. No habrá rutas públicas de clientes en este incremento. El consumidor futuro deberá resolver el usuario habilitado, sus permisos y alcance antes de invocar las consultas. Las consultas administrativas no están pensadas para autoservicio de un cliente.

La web tendrá una fuente de datos de lectura intercambiable. Los datos ficticios solo se usan en una página independiente de desarrollo, no como sustituto silencioso de una API fallida. La sección Clientes del panel normal mostrará que la conexión todavía está pendiente. La vista previa no se agrega al build de producción ni modifica el login existente.

## Contrato propuesto

Consultas futuras: `GET /api/customers` y `GET /api/customers/:customerId`, aún sin exponer.

Listado: `search` opcional (máximo 120 caracteres), `status` (`all`, `enabled`, `disabled`), `page` (1 a 100000) y `pageSize` (1 a 50, por defecto 20). Búsqueda por nombre visible, razón social, documento, email o teléfono. Orden por nombre e ID para resultados estables.

Respuesta: `{ items, page, pageSize, total, totalPages }`; sin resultados, `items: []` y `totalPages: 0`.

Resumen de cliente: `id`, `type` (`PERSON` o `COMPANY`), `displayName`, `legalName`, `documentType`, `documentNumber`, `email`, `phone`, `enabled` y `addressCount`. Los campos opcionales de base de datos se serializan como `null`.

Ficha: resumen más `addresses`, con `id`, `label`, `street`, `number`, `locality`, `department`, `reference` y `notes`. No agrega estados de dirección que el modelo todavía no soporta. Un cliente inexistente produce 404; parámetros inválidos, 400. Se mantienen las excepciones estándar de NestJS.

## Criterios del incremento

- Buscar, filtrar habilitados/deshabilitados, paginar y abrir la ficha con contactos y direcciones desde la vista previa.
- Volver al listado conservando filtros y página; navegar con teclado y mostrar datos ausentes sin inventarlos.
- Contemplar carga, lista vacía, búsqueda sin resultados y errores con reintento; no confundir un error con una lista vacía.
- Mostrar claramente que los clientes son ficticios y que no hay persistencia real.
- Verificar límites de consulta, serialización de campos y cliente inexistente con `node:test` en API; verificar build y comportamiento de UI en navegador.

## Verificación y límites

API: `npm test`, `npm run build` (con `DATABASE_URL` local de desarrollo para generar Prisma). Web: `npm run build`; vista previa mediante `npm run dev -- --host 127.0.0.1` y `/customers-preview.html`.

Las pruebas de servicio usan dobles de Prisma: no demuestran consultas reales a PostgreSQL. Este incremento de backend no incluye edición, alta, desactivación, asociación Usuario–Cliente ni autorización. No publica ramas automáticamente.
