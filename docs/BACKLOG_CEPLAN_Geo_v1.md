# Backlog ejecutable — CEPLAN Geo v1

**Producto:** ALSOL / Follow the Sol  
**PRD:** [`docs/PRD_CEPLAN_Geo_v1.md`](PRD_CEPLAN_Geo_v1.md)  
**Regla transversal:** API/terminal/MCP únicamente. Sin web. Sin coordenadas inventadas. Todo cruce declara matcher, cobertura y restricción.  
**Estimación:** S ≤ 1 día, M 2–3 días, L 4–6 días. No es compromiso de calendario.

## Resumen de sprints

| Sprint | Objetivo | Tickets | Puerta de salida |
|---|---|---|---|
| **3** | Scaffold, PostGIS, connector WFS, ingesta territorial e infraestructura | CG-01 a CG-10 | Distritos + aeropuertos + puertos persistidos con lotes trazables |
| **4** | API de lectura, cruces MVP, pruebas, validación La Libertad | CG-11 a CG-20 | Cruces UBIGEO y nombre territorial verificables end-to-end |
| **5** | MCP, cobertura, optimización, documentación operativa | CG-21 a CG-26 | Ecosistema documentado; tools MCP; reporte de cobertura |

## Secuencia estratégica

```text
Sprint 3:  scaffold → PostGIS → discovery → ingest territorios → ingest infra → raw batches
Sprint 4:  API layers/territories/infra → crosswalk infobras → crossref APIs → tests → piloto LL
Sprint 5:  índices/perf → cobertura CLI → MCP → docs → validación manual integrada
```

## Tickets

### Sprint 3 — Infraestructura e ingesta

| ID | Épica | Objetivo | Criterios de aceptación | Dep. | P | Esf. | Sprint |
|---|---|---|---|---|---|---|---|
| CG-01 | Scaffold | Crear `apps/ceplan-geo/api` con estructura estándar del ecosistema. | Directorios `src/{db,ingest,routes,crossref,lib}`, `package.json`, `tsconfig`, `vitest`, `.env.example`, `helmet`/CORS/rate-limit como apps existentes; puerto 4005. | — | P0 | S | 3 |
| CG-02 | Infra | Configurar Docker Compose con Postgres + PostGIS en puerto 5437. | Imagen con extensión PostGIS; volumen persistente; healthcheck; sin Adminer obligatorio. | CG-01 | P0 | S | 3 |
| CG-03 | Modelo | Migraciones idempotentes para tablas canónicas y PostGIS. | `006_enable_postgis.sql` + tablas `geo_layers`, `geo_features`, `territories`, `infrastructure`, `raw_geoserver_batches`, `territory_name_crosswalk`; índices GIST en geometrías; `npm run migrate` repetible. | CG-02 | P0 | M | 3 |
| CG-04 | Discovery | Implementar `ingest:discovery` contra WFS GetCapabilities. | Lista capas, geometry type, bbox y feature count cuando esté disponible; persiste/actualiza `geo_layers`; detecta drift de nombres (`cb_limprovg`, `cb_limdistx`). | CG-03 | P0 | M | 3 |
| CG-05 | Connector | Implementar cliente WFS GetFeature (GeoJSON) con paginación y retry. | `startIndex`/`count`; timeout configurable; backoff; checksum SHA-256; guarda lote en `raw_geoserver_batches`; tests con fixture HTTP. | CG-03 | P0 | L | 3 |
| CG-06 | Ingesta | `ingest:territories` — capa `geoceplan:cb_limdistx`. | ≥ 1 800 distritos; `ubigeo` obligatorio; geometría EPSG:4326; propiedades preservadas en JSONB; rechazo trazable si falta UBIGEO. | CG-04, CG-05 | P0 | M | 3 |
| CG-07 | Ingesta | `ingest:territories` — capas departamental y provincial. | `cb_limdptog` y `cb_limprovg` ingeridas; vínculo jerárquico documentado en propiedades; no bloquea MVP si una capa falla (warning + estado parcial). | CG-06 | P1 | S | 3 |
| CG-08 | Ingesta | `ingest:infrastructure` — aeropuertos y puertos. | `cn_aeropuertosx` y `cn_puertosx` con `infra_type` normalizado; nombre y geometría persistidos; conteo en respuesta CLI. | CG-05 | P0 | M | 3 |
| CG-09 | Normalización | Utilidades PostGIS (`ST_IsValid`, `ST_MakeValid`, upsert geometría). | Inserción idempotente por `(layer_id, feature_id)`; invalidación registrada; tests unitarios de parseo GeoJSON → WKT/geom. | CG-03 | P0 | M | 3 |
| CG-10 | Calidad S3 | Pruebas de ingesta y migración Sprint 3. | Tests de discovery, paginación y normalize; migración aplicable en CI local; documentar comando de corrida manual en README de la app. | CG-06–CG-09 | P0 | S | 3 |

**Puerta Sprint 3:** `npm run ingest:territories && npm run ingest:infrastructure` deja datos consultables en SQL; al menos un distrito de La Libertad (`ubigeo` `13xxxx`) verificable.

---

### Sprint 4 — API y cruces MVP

| ID | Épica | Objetivo | Criterios de aceptación | Dep. | P | Esf. | Sprint |
|---|---|---|---|---|---|---|---|
| CG-11 | API | Endpoints de capas y features. | `GET /api/layers`, `/api/layers/:id`, `/api/layers/:id/features` con validación Zod, paginación y bbox opcional; respuestas JSON estables. | CG-10 | P0 | M | 4 |
| CG-12 | API | Endpoints de territorios. | `GET /api/territories` por `ubigeo` o tríada nombre; `GET /api/territories/bbox`; 404 explícito si no existe. | CG-10 | P0 | M | 4 |
| CG-13 | API | Endpoints de infraestructura. | `GET /api/infrastructure?type=` y `/near?ubigeo=&radius_km=` usando centroide de distrito; distancias en km; máximo N resultados. | CG-10 | P0 | M | 4 |
| CG-14 | Crosswalk | `crossref:build` — tríada `infobras` → UBIGEO. | Normaliza mayúsculas/tildes; match exacto contra `territories`; estados `confirmada`/`candidata`/`sin_match`; persistencia en `territory_name_crosswalk`; prueba con fixtures de nombres reales LL. | CG-06, CG-12 | P0 | L | 4 |
| CG-15 | Crossref | `GET /api/crossref/inversiones?departamento=` | Llama `radar-inversiones` HTTP; enriquece cada fila con territorio CEPLAN por `ubigeo`; incluye `corte`, `matcher`, `cobertura`, `restriccion`; falla graceful si API destino caída. | CG-12, CG-13 | P0 | L | 4 |
| CG-16 | Crossref | `GET /api/crossref/ejecucion?ubigeo=` | Llama `radar-ejecucion` HTTP; agrega contexto territorial e infra cercana; no mezcla MP/MD más allá de lo que la fuente permita. | CG-12, CG-13 | P1 | M | 4 |
| CG-17 | Crossref | `GET /api/crossref/obras?departamento=` | Llama `infobras` HTTP; resuelve UBIGEO vía crosswalk; **no** usa lat/lon; filas sin match quedan con `matcher: sin_match` y restricción visible. | CG-14 | P0 | L | 4 |
| CG-18 | Seguridad | Alinear seguridad con apps existentes. | `helmet`, CORS (`WEB_ORIGIN`), rate limit 100 req/min en `/api/*`; variables en `.env.example`. | CG-11 | P1 | S | 4 |
| CG-19 | Calidad S4 | Suite API + crossref con mocks HTTP. | Tests de rutas, validación de query duplicada, crossref con fake de apps destino; ≥ 80 % en módulos tocados. | CG-11–CG-17 | P0 | M | 4 |
| CG-20 | Piloto | Validación manual La Libertad. | Documento de corrida: apps levantadas, requests de ejemplo, conteos confirmados/candidatos/sin_match; actualizar data contract si hay anomalía de nombres. | CG-15–CG-17 | P0 | S | 4 |

**Puerta Sprint 4:** Con `radar-inversiones`, `infobras` y `ceplan-geo` corriendo, `GET /api/crossref/inversiones?departamento=LA%20LIBERTAD` devuelve filas enriquecidas; `GET /api/crossref/obras` no afirma coordenadas.

---

### Sprint 5 — Escala, MCP y operación

| ID | Épica | Objetivo | Criterios de aceptación | Dep. | P | Esf. | Sprint |
|---|---|---|---|---|---|---|---|
| CG-21 | Performance | Índices y optimización de consultas espaciales. | Índices GIST revisados; `EXPLAIN` documentado para `/near` y bbox; latencia < 5 s en cruce departamental de referencia. | CG-20 | P1 | M | 5 |
| CG-22 | Cobertura | Reporte CLI de cobertura territorial de la ingesta GeoServer. | Comando `npm run cobertura:geoserver` con conteos por capa, último lote, checksum y departamentos con 0 distritos; alineado semántica PRD Cobertura Territorial. | CG-10 | P1 | M | 5 |
| CG-23 | MCP | Registrar tools de solo lectura en `mcp-server`. | Un tool por endpoint `GET /api/*`; descripciones con cobertura parcial y sin scheduler; tests de catálogo como apps existentes. | CG-20 | P1 | M | 5 |
| CG-24 | Docs | Actualizar `conectores.md`, `ceplan-geo.md` y `ESTADO.md`. | Ficha conector; nombres de capa verificados; puertos; política sin web; estado implementado. | CG-20 | P0 | S | 5 |
| CG-25 | Cruce P2 | Exploración capas `cb_redhidrica` / `cb_proyectos` (spike). | Informe de tamaño, paginación necesaria y decisión `AUTOMATIZABLE` / `POSPONER`; sin comprometer MVP si el tamaño es excesivo. | CG-05 | P2 | M | 5 |
| CG-26 | Calidad S5 | Build, pruebas integradas y checklist de release. | `npm test` + `npm run build` en api y mcp-server; checklist DoD del PRD marcado; sin regresiones en apps existentes. | CG-21–CG-24 | P0 | S | 5 |

**Puerta Sprint 5:** `mcp-server` expone `ceplan-geo`; documentación al día; cobertura CLI reproducible.

---

## Definition of Done (por ticket)

- Fuente WFS, URL de request, checksum y fecha de extracción documentados o persistidos.
- Prueba negativa: no se usa coordenada inventada ni match territorial por similitud laxa.
- Respuestas API declaran `matcher`, `cobertura` y `restriccion` cuando el ticket toca cruces.
- Migraciones idempotentes; ingesta repetible sin duplicar features.
- Sin frontend web ni dependencias de mapas en el bundle de la API.
- README de `apps/ceplan-geo/api` actualizado si el ticket cambia comandos o variables de entorno.

## Bloqueos que no se fuerzan

1. **`infobras` sin UBIGEO:** se conserva `sin_match`; no se geocodifica por nombre de obra.
2. **Tríada territorial ambigua** (distrito homónimo en dos provincias): `candidata` en crosswalk; no entra a agregados como confirmada.
3. **GeoServer no responde:** ingesta falla con error explícito; no se sirven geometrías stale sin `corte` visible.
4. **App destino caída en crossref:** respuesta parcial con `cobertura: BLOQUEADA` y dependencia en error.
5. **Capa nacional demasiado grande:** spike CG-25 decide posponer; MVP no se bloquea.

## Fuera de backlog v1 (registrado, no Sprint 3–5)

| Tema | Motivo | Dónde queda |
|---|---|---|
| Frontend Next.js + Leaflet/MapLibre | Política API-only 2026-08-20 | Roadmap Fase 4 / producto futuro |
| Cruce `ceplan-estrategico ↔ ceplan-geo` | CEPLAN estratégico solo agregado GN/GR | Pendiente datos per-entidad |
| Ingesta de las 84 capas | Volumen y relevancia no validados | Post CG-25 |
| Scheduler automático de ingestas | Fuera de alcance ecosistema actual | Manual `npm run ingest:*` |
| Sincronización bidireccional con `radar-ejecucion.territories` | Riesgo de fuentes divergentes | ADR futuro si se unifica catálogo |

## Mapa de dependencias entre tickets

```text
CG-01 → CG-02 → CG-03 → CG-04 → CG-06 → CG-07
                    └→ CG-05 → CG-08
                    └→ CG-09
CG-06, CG-08, CG-09 → CG-10 → CG-11..13 → CG-14..17 → CG-19 → CG-20
CG-20 → CG-21, CG-22, CG-23, CG-24 → CG-26
CG-05 → CG-25 (paralelo, P2)
```

## Comandos de verificación por sprint

### Sprint 3

```bash
cd apps/ceplan-geo/api
docker compose up -d
cp .env.example .env
npm run migrate
npm run ingest:discovery
npm run ingest:territories
npm run ingest:infrastructure
npm test
```

### Sprint 4

```bash
npm run dev   # ceplan-geo :4005
# Con radar-inversiones :4002 e infobras :4003 levantados:
curl "http://localhost:4005/api/territories?ubigeo=130101"
curl "http://localhost:4005/api/crossref/inversiones?departamento=LA%20LIBERTAD"
curl "http://localhost:4005/api/crossref/obras?departamento=LA%20LIBERTAD"
npm run crossref:build
npm test
```

### Sprint 5

```bash
npm run cobertura:geoserver
cd ../../../mcp-server && npm test
npm run build
```

## Referencias

- [`docs/PRD_CEPLAN_Geo_v1.md`](PRD_CEPLAN_Geo_v1.md)
- [`docs/roadmap-ceplan.md`](roadmap-ceplan.md)
- [`docs/adr/0004-ceplan-geo-app-standalone-y-connector-geoserver.md`](adr/0004-ceplan-geo-app-standalone-y-connector-geoserver.md)
- [`docs/data-contracts/ceplan-geo.md`](data-contracts/ceplan-geo.md)
