# Ramas y ambientes de Ohana

Los tres repositorios usan la misma secuencia:

```text
feature/* → dev → staging → main
             │       │         │
          desarrollo ensayo  producción
```

`dev` integra trabajo revisado; `staging` contiene el candidato que se prueba de extremo a extremo; `main` representa la versión aprobada para producción. Se crearon inicialmente `dev` y `staging` desde el `main` existente, sin mover todavía código de las ramas de funcionalidad. Cada promoción debe hacerse por PR con CI verde y revisión de otro integrante. No hacer push directo a `main` ni usar `git push --force` en estas ramas.

## Orden de integración actual

1. Retargetear el PR de SCRUM-12/13 de `main` a `dev`, revisar y mergear allí.
2. Abrir PR de la rama de autenticación hacia `dev` después de integrar SCRUM-12/13. Antes de eso, puede mantenerse como PR apilado sobre `feat/scrum-12-13-backend-modelo`.
3. Abrir PR de web y móvil hacia sus respectivos `dev`. Revisar CI y los avisos de dependencias.
4. Crear PR `dev → staging` solo cuando las tres bases estén listas para probar juntas. Ejecutar migraciones y smoke tests en el entorno staging real.
5. Crear PR `staging → main` tras aceptación, backup y revisión. La rama `main` por sí sola no prueba que exista un despliegue funcional; verificar el sitio/servidor y su commit desplegado.

## GitHub Actions y GitHub Environments

Los workflows de los tres repositorios escuchan pushes y PR hacia `dev`, `staging` y `main`. En GitHub conviene crear los Environments `dev`, `staging` y `production`; estos son objetos distintos de las ramas. Configurar `production` con aprobación de otro integrante, restringir ramas permitidas y separar secretos. Los environments no deben contener valores hasta tener URLs, VPS y instancia ZITADEL confirmados.
`bash scripts/setup-github-environments.sh` crea únicamente los Environments ausentes con una política de rama inicial; no toca los existentes ni añade secretos o revisores.

Checks iniciales:

| Repositorio | Check | Qué verifica |
| --- | --- | --- |
| API | `API CI / verify` | PostgreSQL efímero, migración, esquema, tests, HTTP, Compose y Docker build. |
| Web | `Web CI / build` | `npm ci`, auditoría de severidad alta, TypeScript y build. |
| Móvil | `Mobile CI / verify` | `npm ci`, auditoría de severidad alta, TypeScript y bundles iOS/Android. |

Activar reglas de protección de `dev`, `staging` y `main` en GitHub cuando los checks ya existan: PR obligatorio, revisión del otro integrante y checks correspondientes. Para `main`, exigir además que el PR venga de `staging` por convención del equipo; GitHub puede requerir una ruleset para imponer la rama origen de forma automática. Revisar que las reglas del plan de GitHub utilizado estén disponibles antes de confiar en ellas.

## Destino de cada ambiente

- **Desarrollo local:** Compose PostgreSQL y procesos web/API locales. El móvil usa el servidor de desarrollo Expo. Un despliegue remoto de `dev` es opcional y requiere recursos propios.
- **Staging:** API y PostgreSQL aislados en el VPS, web en un preview de Vercel ligado a la rama `staging` o en un proyecto separado, proyecto ZITADEL de prueba y HTTPS. Un preview Vercel puede tener variables específicas para esa rama; verificar su configuración antes de usarlo para aceptación.
- **Producción:** `main` es la rama fuente aprobada. El despliegue web/API debe estar conectado a esa rama y tener recursos separados de staging. La app móvil requiere un proceso de distribución propio; actualizar `main` no publica automáticamente en tiendas.

El detalle de Docker, variables, migraciones y backups está en [environments.md](environments.md). Antes de conectar despliegues automáticos, registrar dominios, proveedor, rutas de rollback, responsable de aprobar producción y resultado de una restauración de respaldo.
