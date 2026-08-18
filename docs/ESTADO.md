# Estado del proyecto — Follow the Sol

Última actualización: 2026-08-16.

Cuatro apps standalone construidas, probadas y verificadas contra datos reales. Cada una
sigue el mismo patrón: Postgres propio (Docker Compose), API Express propia, frontend Next.js
propio, mismo lenguaje visual (`globals.css` compartido por copia, no por paquete).

## Apps

| App | Dominio | API | Web | Postgres | Estado |
|---|---|---|---|---|---|
| `radar-ejecucion` | Presupuesto/ejecución (MEF) + benchmark territorial | 4000 | 3000 | 5432 | Construida, probada, verificada |
| `compras-publicas` | Contrataciones (OECE/OCDS) + proveedores/concentración | 4001 | 3001 | 5433 | Construida, probada, verificada |
| `radar-inversiones` | Inversiones (Invierte.pe) | 4002 | 3002 | 5434 | Construida, probada, verificada |
| `infobras` | Obras públicas (Contraloría) | 4003 | 3003 | 5435 | Construida, probada, verificada |

## Cruces entre apps (todos verificados con datos reales)

- **radar-inversiones ↔ radar-ejecucion**, por `SEC_EJEC` (match exacto, sin fuzzy) —
  `GET /api/crossref` en `radar-inversiones/api`.
- **compras-publicas ↔ radar-ejecucion**, por nombre de entidad (matcher difuso,
  `confirmada`/`candidata`) — `GET /api/crossref` en `compras-publicas/api`, persistido en
  `entity_crosswalk` (recalculable vía `npm run crossref:build`).
- **infobras ↔ radar-inversiones**, por `CUI` (match exacto, sin fuzzy) —
  `GET /api/crossref` en `infobras/api`.
- **infobras ↔ radar-ejecucion**, por nombre de entidad (mismo matcher difuso que
  compras-publicas, copiado, `confirmada`/`candidata`) — `GET /api/crossref/ejecucion` en
  `infobras/api`, persistido en `entity_crosswalk` (recalculable vía `npm run crossref:build`,
  necesita `EJECUCION_DATABASE_URL` en `.env`).

## Cómo levantar todo de nuevo

Por cada app (`apps/<nombre>/api`):

```bash
docker compose up -d          # levanta Postgres (los datos ya ingeridos persisten en el volumen)
cp .env.example .env          # si no existe ya
npm run migrate               # idempotente, solo aplica migraciones nuevas
npm run dev                   # API
```

Y en `apps/<nombre>/web`:

```bash
cp .env.example .env
npm run dev                   # frontend
```

Los 4 contenedores de Postgres quedan corriendo entre sesiones (no se detuvieron al cerrar);
los procesos `npm run dev` sí se detuvieron al final de esta sesión.

Los puertos de Postgres ahora se publican en `127.0.0.1` (no `0.0.0.0`) y Adminer ya no se
levanta por defecto — solo en `radar-ejecucion` y `ceplan-estrategico`, vía
`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d adminer`.

Cada API aplica `helmet`, CORS restringido al origin del frontend (`WEB_ORIGIN` en `.env`,
default `http://localhost:<puerto-web>`) y rate limiting (100 req/min) en `/api/*`.

Toolchain actualizado (2026-08-17): `vitest`/`vite`/`@vitejs/plugin-react` a sus últimas
majors (0 vulnerabilidades) en las 5 apps, y `next` 14 → 15.5.23 en las 4 webs (React se
queda en 18.3, Next 15 lo soporta). Las páginas con rutas dinámicas (`[id]`, `[ocid]`, etc.)
y `searchParams` ahora usan el patrón async de Next 15 (`params`/`searchParams` son
`Promise`). Queda un residual de `npm audit` en las 4 webs (`next`/`postcss`/`sharp`) que
solo se resuelve saltando a Next 16 (requiere React 19) — no se hizo ese salto porque
ninguna de estas apps procesa CSS de usuario ni sube imágenes, así que esas CVEs
(XSS en CSS, lectura de `.map` arbitrario, libvips) no tienen superficie de ataque real acá.

## Documentación

- `docs/data-contracts/` — un archivo por fuente externa (MEF, OECE, Invierte.pe, INFOBRAS),
  con lo confirmado en vivo: URLs reales, formato real, anomalías de datos, tasas de cobertura.
- `docs/adr/` — decisiones arquitectónicas con su razón, no solo el qué.
- `docs/Follow_the_Sol_Peru_Public_Spending_Graph.pdf` — el documento fuente original con el
  roadmap de apps.

## Nuevas apps planificadas (CEPLAN Integration)

Tras investigación detallada de CEPLAN, se identificaron 2 nuevas apps para integrar:

| App | Dominio | API | Web | Postgres | Estado |
|---|---|---|---|---|---|
| `ceplan-estrategico` | Gestión estratégica del Estado (ObservaPerú, agregado por nivel de gobierno) | 4004 | 3004 | 5436 | API Sprint 1 construida y probada con datos reales; web pendiente |
| `ceplan-geo` | GeoServer (capas territoriales/infraestructura) | 4005 | 3005 | 5437 | 📋 Planificado |

### `ceplan-estrategico` — Sprint 1 (2026-08-17)

Ingesta real desde `https://observaperu.ceplan.gob.pe` (JSON estático, no requiere sesión —
ver data contract). El modelo per-entidad planeado originalmente no fue posible con datos
públicos: se ingieren indicadores agregados por nivel de gobierno (`GN`/`GR`/`MP`/`MD`/`Total`),
no por pliego. `GET /api/indicators` expone el catálogo completo; `GET /api/crossref` cruza
con `radar-ejecucion` solo en `GN`/`GR` (único bucket exacto entre las dos fuentes). Detalle
completo, incluida la limitación de PIM=0 en la muestra de `radar-ejecucion` para 2026, en
`docs/data-contracts/ceplan-strategic-planning.md`.

### Documentación de planificación
- Data contracts: `docs/data-contracts/ceplan-strategic-planning.md`, `docs/data-contracts/ceplan-geo.md`
- ADRs: `docs/adr/0003-ceplan-estrategico-app-standalone-y-connector-observaperu.md`, `docs/adr/0004-ceplan-geo-app-standalone-y-connector-geoserver.md`
- Matriz de cruces: `docs/adr/0005-matriz-de-cruces-ceplan-con-ecosistema-existente.md`
- Roadmap: `docs/roadmap-ceplan.md`

### Indicadores derivados propuestos
- **Strategic Execution Gap (SEG)**: discrepancias entre gasto y resultado físico
- **Execution Efficiency**: distinción entre entidades que ejecutan bien vs las que solo gastan
- **Plan–Budget Alignment**: conexión entre discurso estratégico y asignación real de recursos
- **Enriquecimiento territorial**: contexto geoespacial para obras e inversiones

## Pendientes conocidos (no bloqueantes, para cuando se retome)

1. Implementación de `ceplan-estrategico` (Sprint 1-2 del roadmap CEPLAN)
2. Implementación de `ceplan-geo` (Sprint 3-4 del roadmap CEPLAN)
3. El resto del PRD de INFOBRAS (sprints 1-6: MCP tools, resolución de identidad avanzada,
   dashboard consolidado) — quedó fuera de alcance de la rebanada construida hoy.
4. Todas las ingestas son parciales por diseño (`isPartial`, muestras acotadas por
   `maxPages`/`maxBytes`/departamento) — ampliar cobertura (más departamentos, más páginas) es
   un siguiente paso natural si se necesita ver más allá de La Libertad.
