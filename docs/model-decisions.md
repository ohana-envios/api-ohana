# Decisiones del modelo inicial — SCRUM-13

Este esquema cubre solamente la base relacional. Se tomó como referencia el anteproyecto de Ohana y CU01 Registrar envío: código alfanumérico único por envío, cliente con varias direcciones habituales, estado inicial pendiente y bultos del mismo envío con un código compartido. Las decisiones siguientes deben validarse con Fernando antes de implementar los flujos completos.

1. **Identificación de bultos.** Cada `Package` tiene `sequence` única dentro del envío; su identificación visible es `Shipment.code` más la secuencia. Confirmar si hace falta un código individual para retiros, transferencias o entregas parciales.
2. **Estados y eventos.** El enum contiene los cuatro estados ya usados en documentación (`PENDING`, `IN_ROUTE`, `DELIVERED`, `CANCELED`). `ShipmentEvent.type` queda como texto para no fijar prematuramente el catálogo de eventos. Confirmar transiciones, estados intermedios e incidencias.
3. **Roles y Auth0.** Se modela un rol principal por usuario y un `externalAuthId` opcional y único. Confirmar si una persona necesita varios roles o pertenecer a varios clientes. Ninguna cuenta de Auth0 se crea en esta entrega.
4. **Clientes e identificación.** `documentNumber` es opcional e indexado, pero no único hasta conocer reglas de cédula/RUT, clientes sin documento y sucursales. Confirmar también los campos obligatorios de contacto y razón social.
5. **Direcciones.** `Address` guarda datos habituales editables del cliente. `Shipment` copia calle, número, localidad, departamento y referencia al momento del alta. Confirmar si se necesita conservar más campos (apartamento, coordenadas, instrucciones de acceso) y si también se versionan cambios posteriores dentro de un envío.
6. **Remitente y destinatario.** El envío almacena nombres y teléfonos como snapshot. Confirmar si destinatarios frecuentes deben transformarse en entidad independiente y cómo se manejan datos personales.
7. **Custodia y parciales.** La custodia inicial y las entregas/retiros parciales figuran en CU01 y comentarios de Jira, pero no se implementan como módulo en esta entrega. Antes de registrar operaciones reales, definir su modelo y los eventos asociados.
8. **Prioridad y horarios.** Solo se distinguen `NORMAL` y `HIGH`, con fecha de retiro solicitada opcional. Confirmar SLA, franjas y urgencias antes de imponer reglas adicionales.

Los borrados en cascada están deshabilitados en todas las relaciones. El trigger de `ShipmentEvent` hace que el historial sea solo de inserción. Cuando se implemente un flujo de alta, el estado del envío y su evento inicial deberán escribirse en la misma transacción.
