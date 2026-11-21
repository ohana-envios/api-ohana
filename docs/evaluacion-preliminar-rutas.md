# Evaluación preliminar de servicios para rutas

Revisión realizada el 21/11/2026 para la tarea de investigación del Sprint 2. Es una comparación documental; no se crearon cuentas, no se enviaron direcciones de clientes ni se ejecutaron solicitudes de prueba. La integración o prototipo de rutas se planifica para el Sprint 8.

| Alternativa | Lo que ofrece | Puntos a validar para Ohana |
| --- | --- | --- |
| openrouteservice / HeiGIT | Direcciones, matrices y un servicio de optimización externo basado en VROOM. La documentación de su API alojada indica un máximo de tres vehículos por consulta de optimización. | Comprobar cuotas y condiciones vigentes, precisión de direcciones y cobertura en Uruguay, y si el límite alcanza para la operativa de Fernando. El optimizador no viene incluido automáticamente al instalar el backend propio. |
| GraphHopper | API de optimización con restricciones como horarios y capacidades; ofrece un plan inicial y utiliza créditos según el tamaño de las solicitudes. | Revisar límites, condiciones de uso comercial y costo esperado según cantidad de vehículos y paradas; comprobar direcciones y cobertura con datos de prueba. |
| Google Route Optimization | Optimización de recorridos con restricciones de vehículos, horarios y capacidad. Requiere habilitar facturación y cobra según los envíos procesados y el tipo de operación. | Estimar el costo según volumen, verificar condiciones y evaluar la cobertura; requiere una cuenta de facturación. |

Para una primera prueba técnica, openrouteservice es una candidata razonable si su límite y condiciones se ajustan a la operativa real. Es una recomendación provisional: aún no hay evidencia de cobertura o precisión suficiente en las direcciones de Ohana, ni una elección definitiva de proveedor.

Antes de integrar, acordar con Fernando cuántos repartidores y paradas se planifican por jornada, confirmar el tratamiento de direcciones y datos personales, estimar el consumo y comparar los resultados con una planificación manual. La aplicación debe conservar la planificación manual cuando el servicio externo no esté disponible. Mantener las credenciales únicamente en el servidor y no enviar información personal innecesaria.

Fuentes oficiales consultadas: [restricciones del servicio alojado de openrouteservice](https://giscience.github.io/openrouteservice/hosted-api-restrictions), [servicios incluidos en openrouteservice](https://giscience.github.io/openrouteservice/v9.10.0/api-reference/endpoints/), [planes de GraphHopper](https://www.graphhopper.com/pricing/), [créditos de GraphHopper](https://www.graphhopper.com/faq/what-is-one-credit/) y [facturación y límites de Google Route Optimization](https://developers.google.com/maps/documentation/route-optimization/usage-and-billing).
