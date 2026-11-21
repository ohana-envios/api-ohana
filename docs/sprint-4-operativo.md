# Avance operativo del Sprint 4

La jornada se consulta y confirma por fecha. El administrador selecciona repartidores activos y disponibles para hasta 50 envíos por operación; la interfaz presenta 20 por página. La selección no cambia los datos hasta la confirmación. La API verifica la asignación y fecha originales y confirma todos los cambios en una sola transacción; registra asignación, fecha y cambio de estado cuando corresponda, sin alterar custodia. Los envíos ya planificados en otra fecha no se mueven desde esta pantalla: el cambio de fecha queda para el flujo de reprogramación.

La vista de tareas de la jornada muestra solo envíos activos asignados al cadete autenticado y con fecha planificada. Se ordena por hora solicitada de retiro, prioridad y antigüedad. Las asignaciones anteriores sin fecha siguen visibles en la consulta general pero no aparecen como tareas de una fecha específica.

La etiqueta se obtiene con acceso de administrador o cliente propietario. Contiene código, destinatario, dirección y número de bulto; no incluye custodia ni historial. Web descarga un documento HTML imprimible y móvil permite compartirlo. Los envíos nuevos reciben un código corto y único; los anteriores conservan sus códigos largos. Un código de recuperación basado en la clave del intento permite localizar el envío tras un corte sin duplicarlo. La impresión real y el formato físico deben validarse.

Como regla conservadora, administración puede cancelar con motivo un envío pendiente o asignado solamente antes del retiro y mientras la custodia conocida sea del remitente. El historial se conserva; los envíos históricos con custodia desconocida no se cancelan por esta vía. El comportamiento posterior al retiro requiere acordar el flujo con el cliente.

Retiro, entrega, incidencias y reprogramación continúan en Sprint 5; sus transiciones no se simulan como finalizadas. Las pruebas de API usan PostgreSQL aislado e identidad simulada. Quedan pendientes las pruebas visuales y de dispositivo, el recorrido con ZITADEL real, la aplicación coordinada de migraciones en staging y la validación con Fernando.
