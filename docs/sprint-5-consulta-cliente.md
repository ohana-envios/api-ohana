# Consulta de envíos del cliente — Sprint 5

El caso CU14 reutiliza el registro y la consulta de envíos desarrollados previamente. El cliente habilitado puede listar sus envíos, buscar por código o destinatario, consultar el estado y el historial básico, y volver a intentar una consulta fallida desde web y móvil. La API limita las consultas a la cuenta aprobada y activa y excluye del historial del cliente la custodia y los datos internos.

Las pruebas HTTP con PostgreSQL aislado verifican búsqueda de envíos propios, ausencia de resultados de otros clientes, acceso denegado al detalle y al historial ajenos, filtrado del historial, lecturas sin modificaciones y denegación cuando el cliente está deshabilitado. Las identidades se simularon: quedan pendientes pruebas con ZITADEL, usuarios reales y dispositivos, así como la validación con Fernando.
