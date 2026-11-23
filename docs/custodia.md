# Custodia y transferencias

El estado operativo, la asignación y la custodia física son datos separados. El alta conserva la custodia inicial `SENDER` y los registros históricos desconocidos permanecen sin custodio. El nuevo esquema agrega custodia por repartidor o ubicación y una versión para evitar cambios simultáneos. No se aplicó la migración a un ambiente compartido.

`GET /api/shipments/:id/custody?search=` devuelve custodia e historial al administrador y al repartidor asignado o que mantiene la custodia. Los resultados de repartidores activos se pueden buscar por nombre; como máximo se devuelven 100 y se indica si hay más. El cliente no ve custodia ni eventos internos.

`PATCH /api/shipments/:id/custody` recibe `expectedVersion`, `kind` (`COURIER` o `DEPOT`), respectivamente `courierId` o `location`, y una observación opcional. También admite multipart con un archivo opcional de evidencia PDF, PNG o JPG de hasta 5 MB. Un administrador puede registrar una transferencia; un repartidor solo cuando tiene físicamente el paquete. La custodia anterior debe ser conocida y posterior al retiro. Se verifica la versión, se rechaza el mismo destino y se conservan actor, fecha y descripción anterior y nueva en el historial inmutable. El archivo se vincula al evento y se guarda en la misma transacción; un archivo inválido impide la transferencia. La operación no cambia el estado ni la asignación.

La evidencia se consulta desde el historial de custodia: administración, el repartidor asignado o el custodio actual pueden descargarla. El cliente no tiene acceso. Esta implementación permite adjuntarla al registrar la transferencia; agregar evidencia después y asociarla a otros tipos de evento siguen pendientes.

`GET /api/shipments/custody/mine` lista para cada repartidor activo únicamente los identificadores y códigos de los paquetes que tiene físicamente, también cuando la tarea fue reasignada. Web y móvil ofrecen desde esa lista la gestión de la transferencia. La consulta general de tareas continúa limitada a las asignadas. La reasignación de un envío activo no cambia ni la custodia ni el estado.

El retiro y la entrega son acciones separadas y aún no están implementados. Por tanto, con el flujo actual los envíos nuevos siguen en custodia del remitente y no alcanzan por sí solos la primera transferencia; las pruebas establecen esa condición mediante datos aislados. Faltan pruebas visuales, con ZITADEL y dispositivos reales.

Las migraciones `202611210006_custody_transfers` y `202611210007_custody_evidence` se verificaron solo en PostgreSQL aislado. Antes de aplicarlas en staging hay que coordinar el despliegue y el respaldo con el responsable del entorno.
