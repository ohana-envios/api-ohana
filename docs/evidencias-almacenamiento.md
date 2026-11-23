# Almacenamiento de evidencia de entrega

`OHANA_EVIDENCE_DIR` debe ser una ruta absoluta privada y persistente, no publicada por la web. En el Compose de despliegue, el volumen `evidence_data` se monta en `/var/lib/ohana-evidence`. En desarrollo o pruebas se debe configurar una carpeta privada distinta por ambiente. La API crea archivos con nombre aleatorio, sin reutilizar el nombre recibido, y conserva en PostgreSQL la referencia, metadatos y SHA-256; al leer verifica tamaño e integridad. Los permisos y el alcance se comprueban antes de recuperar el archivo.

No se confirma la entrega con adjunto si falla su validación o escritura. Las escrituras al sistema de archivos y la base no comparten transacción: si un proceso falla después de escribir y antes de confirmar en PostgreSQL, puede quedar un archivo sin referencia. No borrar archivos automáticamente: primero comparar referencias con la base y hacer una revisión y respaldo. Los archivos referenciados no se modifican ni eliminan desde la aplicación.

En staging, el script de despliegue respalda primero PostgreSQL y después el volumen inmutable, de modo que el archivo posterior incluya los objetos referenciados por el dump. Guardar, proteger y recuperar ambos respaldos como un conjunto. La restauración debe probarse en un ambiente aislado, con la API detenida, restaurando el dump y el volumen correspondiente y verificando la lectura de evidencias con usuarios autorizados. No ejecutar una restauración sobre el entorno compartido sin coordinarla con Santiago.

La prueba automatizada cubre el guardado privado, denegación de acceso, fallas de configuración y detección de alteraciones. No se verificó el despliegue ni una restauración real del volumen. No se migran automáticamente los archivos históricos guardados como binarios en PostgreSQL; siguen pendientes un plan de migración, verificación y respaldo completo conforme a RNF-15. Se pueden agregar evidencias a incidencias y a movimientos de custodia ya registrados; la lectura de archivos históricos conserva su mecanismo anterior.


## Evidencias de incidencias

Los archivos de incidencia usan el mismo directorio privado y mecanismo de integridad que las evidencias de entrega. Cada archivo conserva una referencia a la incidencia y a un evento de auditoría independiente, sin modificar el registro original. Una clave de operación estable evita duplicados al reintentar. Si falla la transacción tras escribir el archivo, puede quedar un archivo huérfano; no se borra automáticamente ante un resultado de confirmación incierto. Hace falta una estrategia operativa de conciliación y respaldo del volumen.


## Evidencias posteriores de custodia

La web y la app permiten adjuntar archivos a eventos de custodia ya registrados, incluidos los asociados al retiro y a la entrega. El registro de auditoría apunta al evento original sin modificarlo. Siguen pendientes el traslado y la verificación de los archivos históricos, la conciliación de archivos sin referencia y la prueba de restauración.


Para auditar sin modificar datos, ejecutar `node scripts/audit-evidence-storage.mjs` con `DATABASE_URL` y `OHANA_EVIDENCE_DIR` configurados. El resultado cuenta referencias, archivos faltantes, alterados, huérfanos y registros históricos en PostgreSQL; devuelve error si faltan archivos o fallan sus controles de integridad. No elimina ni migra archivos. La revisión de huérfanos y la restauración requieren coordinación y respaldo previo.


## Copia controlada de archivos históricos

`scripts/copy-legacy-evidence.mjs` usa `DATABASE_URL` y `OHANA_EVIDENCE_DIR`. Sin argumentos muestra cuántos archivos requieren copia; con `--apply` copia uno a uno, verifica SHA-256 y tamaño, registra la referencia en `LegacyFileCopy` y deja intactos los registros originales. Una nueva ejecución comprueba las copias ya existentes. La auditoría incluye estas referencias. Las lecturas actuales siguen utilizando los datos originales de PostgreSQL: la copia es una etapa de transición, no una eliminación ni sustitución de los binarios históricos. Debe repetirse después de cualquier modificación de los originales y antes del corte definitivo. Un proceso interrumpido o dos concurrentes pueden dejar archivos huérfanos que deben revisarse con la auditoría, sin borrado automático.

## Respaldo y restauración de prueba

Con `DATABASE_URL`, `OHANA_EVIDENCE_DIR`, `pg_dump` y `pg_restore` configurados, ejecutar `node scripts/evidence-backup.mjs backup <carpeta-absoluta-nueva>`. El proceso toma el dump primero, copia los archivos inmutables, verifica las referencias y guarda un manifiesto de sumas. `node scripts/evidence-backup.mjs verify <carpeta-del-respaldo>` verifica el conjunto. Si es necesario indicar las herramientas, se pueden configurar `OHANA_PG_DUMP` y `OHANA_PG_RESTORE`. Los respaldos deben guardarse en un lugar privado y protegerse como datos sensibles.

Para un ensayo exclusivamente local, crear una base vacía cuyo nombre empiece con `ohana_isolated_`, configurar su conexión en `OHANA_RESTORE_DATABASE_URL` y ejecutar `node scripts/evidence-backup.mjs restore-test <carpeta-del-respaldo> <carpeta-destino-nueva>`. El script rechaza bases no locales, nombres que no cumplan esa condición y bases con objetos en public. Después se ejecuta la auditoría apuntando a la base y al directorio restaurados. Se ensayó en un entorno aislado, no en el VPS. La restauración del entorno compartido requiere coordinación y un procedimiento específico para ese entorno.
