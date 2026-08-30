# PRD — CEPLAN Geo (contexto territorial e infraestructura) v1

**Versión:** 1.0  
**Estado:** planificado — sin implementación en código  
**Fecha:** 2026-08-26  
**Producto:** Rastro / Follow the Sol  
**Ámbito:** API, base de datos PostGIS, ingesta WFS, cruces con apps existentes, pruebas, documentación y MCP. **No incluye interfaz web.**

## 1. Decisión de producto

Rastro ya cruza presupuesto, inversión, obra, compra y entidad por claves administrativas (`SEC_EJEC`, CUI, RUC, nombre difuso). Le falta una capa que responda preguntas territoriales con evidencia reproducible:

1. ¿En qué distrito/provincia/departamento cae una inversión u obra según el catálogo oficial?
2. ¿Qué infraestructura logística (aeropuertos, puertos) publica CEPLAN cerca de un territorio?
3. ¿Qué ejecución presupuestal se concentra en un UBIGEO verificable?
4. ¿Qué vacíos impiden afirmar cobertura territorial o proximidad?

`ceplan-geo` no sustituye a `radar-ejecucion`, `infobras` ni `radar-inversiones`. Las enriquece con territorio e infraestructura publicados por el GeoServer de CEPLAN, usando estándares OGC (WFS) y PostGIS.

```text
Hoy:       inversión/obra/ejecución → departamento/provincia/distrito (texto) o UBIGEO puntual
Objetivo:  UBIGEO verificado → polígono/distrito oficial → infraestructura publicada → cruce HTTP con otras apps
```

## 2. Problema

La discusión territorial en Rastro hoy depende de campos textuales o de un catálogo UBIGEO derivado del MEF, sin geometría ni infraestructura de referencia. Eso limita el análisis:

| Fuente actual | Qué trae | Qué falta |
|---|---|---|
| `infobras` | `departamento`, `provincia`, `distrito` (texto) | UBIGEO, coordenadas |
| `radar-inversiones` | `ubigeo`, nombres territoriales | geometría, infraestructura |
| `radar-ejecucion` | `entities.ubigeo`, tabla `territories` sin geometría | polígonos, activos logísticos |
| GeoServer CEPLAN | 84 capas WFS/WMS, distritos con `ubigeo` | no integrado en Rastro |

Sin `ceplan-geo`, no hay una fuente canónica de territorio con geometría ni de infraestructura logística publicada por CEPLAN dentro del ecosistema.

## 3. Objetivo y no objetivos

### Objetivo v1

Construir la app standalone `ceplan-geo` que:

- ingiera capas territoriales e infraestructura clave del GeoServer CEPLAN vía WFS;
- persista geometrías en PostGIS con trazabilidad de lote (`raw_geoserver_batches`);
- exponga API de solo lectura para territorios, capas, features e infraestructura;
- cruce con `radar-inversiones` y `radar-ejecucion` por **UBIGEO exacto**;
- cruce con `infobras` por **nombre territorial normalizado** (departamento/provincia/distrito → UBIGEO), sin inventar coordenadas;
- documente cobertura, límites y restricciones de cada cruce.

El piloto territorial inicial será **La Libertad** para validar cruces end-to-end, con ingesta nacional de catálogos base (distritos, aeropuertos, puertos) porque el GeoServer publica el universo completo y el volumen es manejable.

### No objetivos

- No construir frontend web ni mapas interactivos en esta versión (política API-only para apps nuevas desde 2026-08-20).
- No geocodificar obras por proximidad, embeddings o nombre parecido cuando falte UBIGEO o tríada territorial completa.
- No afirmar causalidad (“la inversión beneficia al puerto cercano”) — solo proximidad o pertenencia territorial documentada.
- No reemplazar el catálogo `territories` de `radar-ejecucion`; conviven como fuentes distintas con reglas de cruce explícitas.
- No ingerir las 84 capas del GeoServer en v1; priorizar MVP territorial + infraestructura logística.
- No implementar scheduler automático; las ingestas siguen siendo manuales (`npm run ingest:*`).

## 4. Principios y jerarquía de evidencia

| Nivel | Evidencia o clave | Uso permitido | No permite afirmar |
|---|---|---|---|
| A | UBIGEO de 6 dígitos en capa `cb_limdistx` | Une inversión/ejecución con distrito oficial y geometría. | Impacto o cobertura poblacional. |
| A | Feature WFS con checksum y URL de request | Prueba de extracción y reproducción del lote. | Que la capa esté actualizada hoy. |
| A | Cruce HTTP con app origen + timestamp de respuesta | Enriquecimiento con datos de otra fuente ya ingerida. | Universo completo si la app origen es parcial. |
| B | Match departamento/provincia/distrito normalizado (`infobras`) | Resolver UBIGEO cuando la tríada coincide sin ambigüedad. | Ubicación exacta de la obra dentro del distrito. |
| C | Distancia a infraestructura (`ST_DWithin`) | Contexto logístico relativo al centroide del distrito o punto de infraestructura. | Corredor logístico validado o demanda de transporte. |
| Prohibido | Coordenadas inventadas, sede de entidad, distrito por similitud de nombre | Ningún cruce automático. | Pertenencia territorial oficial. |

## 5. Arquitectura y modelo de datos

### Stack

| Componente | Elección |
|---|---|
| API | Express + TypeScript |
| Base | Postgres 16 + **PostGIS** (Docker Compose) |
| Puertos | API `4005`, Postgres `5437` (web `3005` reservado, sin implementar) |
| Fuente | WFS 2.0 GeoJSON — `https://geo.ceplan.gob.pe/geoserver/geoceplan/wfs` |
| Patrón | Mismo scaffold que `infobras`, `radar-inversiones`, etc. |

### Entidades canónicas (v1)

| Entidad | Campos esenciales | Regla |
|---|---|---|
| `geo_layers` | `layer_name`, `geometry_type`, `feature_count`, `extent`, `last_ingested_at` | Catálogo derivado de `GetCapabilities` / `DescribeFeatureType`. |
| `geo_features` | `layer_id`, `feature_id`, `geometry`, `properties` JSONB | Geometría en EPSG:4326; índice GIST. |
| `territories` | `ubigeo`, nombres, `geometry`, `source_layer_id` | Distritos desde `geoceplan:cb_limdistx`; UBIGEO obligatorio. |
| `infrastructure` | `infra_type`, `name`, `geometry`, `properties`, `source_layer_id` | Tipos iniciales: `aeropuerto`, `puerto`. |
| `raw_geoserver_batches` | `layer_name`, `request_url`, `checksum`, `feature_count`, `payload` | Lake de evidencia por lote WFS. |
| `territory_name_crosswalk` | tríada normalizada → `ubigeo`, `match_status`, `source` | Para `infobras` sin UBIGEO; solo `confirmada` entra a agregados. |

### Cruces previstos

```text
radar-inversiones (ubigeo) ──exacto──> ceplan-geo.territories
radar-ejecucion (entities.ubigeo) ──exacto──> ceplan-geo.territories
infobras (depto/prov/dist) ──nombre normalizado──> territory_name_crosswalk ──> ubigeo
ceplan-geo.territories ──ST_DWithin──> infrastructure (contexto logístico)
```

## 6. Contratos de salida (API)

Rutas bajo `apps/ceplan-geo/api`, solo lectura:

```text
GET /api/health
GET /api/layers
GET /api/layers/:id
GET /api/layers/:id/features?bbox=&limit=
GET /api/territories?ubigeo=
GET /api/territories?departamento=&provincia=&distrito=
GET /api/territories/bbox?minx=&miny=&maxx=&maxy=
GET /api/infrastructure?type=aeropuerto|puerto
GET /api/infrastructure/near?ubigeo=&radius_km=&type=
GET /api/crossref/inversiones?departamento=LA%20LIBERTAD
GET /api/crossref/ejecucion?ubigeo=130101
GET /api/crossref/obras?departamento=LA%20LIBERTAD
```

Cada respuesta de cruce debe incluir:

- `corte` (fecha de ingesta GeoServer y de la app origen cuando aplique);
- `cobertura` (`COMPLETA_VERIFICADA`, `PARCIAL`, `SIN_DATOS_EN_FUENTE`, `BLOQUEADA`);
- `matcher` (`ubigeo_exacto`, `territorio_nombre`, `proximidad_infraestructura`);
- `restriccion` (qué no se puede afirmar);
- `dependencias` (URLs de apps consultadas y si respondieron).

Comandos de ingesta previstos:

```bash
npm run migrate
npm run ingest:discovery      # GetCapabilities + catálogo de capas
npm run ingest:territories    # cb_limdistx (+ opcional dpto/prov)
npm run ingest:infrastructure # cn_aeropuertosx, cn_puertosx
npm run crossref:build        # materializa territory_name_crosswalk para infobras
```

## 7. Capas GeoServer — alcance v1

Confirmado en vivo 2026-08-26: servicio activo, 84 `FeatureType`, GeoJSON en EPSG:4326.

| Prioridad | Capa WFS | Uso en v1 |
|---|---|---|
| P0 | `geoceplan:cb_limdistx` | Territorios con `ubigeo` |
| P1 | `geoceplan:cb_limdptog` | Agregación departamental |
| P1 | `geoceplan:cb_limprovg` | Agregación provincial |
| P1 | `geoceplan:cn_aeropuertosx` | Infraestructura logística |
| P1 | `geoceplan:cn_puertosx` | Infraestructura logística |
| P2 | `geoceplan:cb_redhidrica` | Solo tras medir tamaño y paginación |
| P2 | `geoceplan:cb_proyectos` | Validar relevancia y solapamiento con `infobras` |
| Fuera v1 | resto de capas | Backlog post-MVP |

**Nota de nomenclatura:** el data contract original citaba `cb_limprov` / `cb_limdist`; en vivo los nombres son `cb_limprovg` / `cb_limdistx`. El conector debe descubrir nombres desde `GetCapabilities`, no hardcodear alias obsoletos.

## 8. Fases, sprints y puertas de salida

| Sprint | Fase | Resultado | Puerta de salida |
|---|---|---|---|
| **3** | Infraestructura e ingesta | Scaffold, PostGIS, connector WFS, territorios + infra base ingeridos | ≥ 1 800 distritos persistidos; checksum por lote; migración idempotente |
| **4** | API y cruces MVP | Endpoints de lectura; cruces UBIGEO y nombre territorial; pruebas | Cruce La Libertad verificable contra `radar-inversiones` e `infobras`; latencia < 5 s en cruces departamentales |
| **5** | Escala y operación | MCP, optimización, cobertura territorial, documentación operativa | Tools MCP de solo lectura; `conectores.md` actualizado; reporte de cobertura por departamento |

### Puertas globales de v1

1. GeoServer responde y la ingesta es reproducible con `ingest:territories`.
2. Ningún cruce con `infobras` usa coordenadas inexistentes.
3. `GET /api/crossref/*` declara matcher, cobertura y restricción en cada fila.
4. Suite de pruebas API pasa sin depender de las otras apps corriendo (mocks/fakes).
5. Validación manual opcional documentada contra apps reales en localhost.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `infobras` no tiene UBIGEO ni coordenadas | Cruce por tríada textual + crosswalk; estados `candidata`/`sin_match`. |
| Capas WFS grandes agotan timeout o memoria | Paginación `startIndex`/`count`, lotes transaccionales, límites por capa. |
| Nombres territoriales inconsistentes entre fuentes | Normalización (mayúsculas, tildes, alias documentados); cola de revisión para ambiguos. |
| Duplicar catálogo territorial del MEF | Documentar fuente canónica por caso de uso; no sincronizar silenciosamente. |
| Política API-only vs roadmap con mapas | Excluir web de v1; consumo vía API/MCP/terminal. |
| GeoServer caído o capa renombrada | `ingest:discovery` detecta drift; fallar con error explícito, no datos stale sin aviso. |

## 10. Métricas de éxito

| Métrica | Objetivo v1 |
|---|---|
| Distritos ingeridos | ≥ 95 % del universo publicado en `cb_limdistx` |
| Infraestructura ingerida | 100 % de features en aeropuertos y puertos (universo pequeño) |
| Cruce por UBIGEO | 100 % de inversiones con `ubigeo` válido en piloto La Libertad enriquecidas |
| Cruce `infobras` por nombre | ≥ 80 % `confirmada` en La Libertad; el resto `candidata` o `sin_match` explícito |
| Performance | < 1 s consultas por UBIGEO; < 5 s cruces departamentales |
| Pruebas | ≥ 80 % cobertura en módulos ingest + routes críticas |
| MCP | 1 tool por endpoint `GET /api/*` real (patrón `mcp-server` existente) |

## 11. Dependencias

| Dependencia | Tipo | Notas |
|---|---|---|
| GeoServer CEPLAN | Externa, estable | WFS OGC; verificado 2026-08-26 |
| `radar-inversiones` API | Interna, HTTP | Cruce enriquecimiento; piloto requiere app corriendo |
| `radar-ejecucion` API | Interna, HTTP | Cruce por `ubigeo` / entidad |
| `infobras` API | Interna, HTTP | Cruce por departamento; sin coordenadas |
| PostGIS Docker image | Infra | Primera app del ecosistema con extensión espacial |
| `mcp-server` | Interna | Sprint 5 — registrar tools nuevos |

## 12. Definición de terminado v1

- Existe `apps/ceplan-geo/api` con Docker Compose PostGIS, migraciones, ingesta y API documentada.
- No hay frontend web ni dependencia de Leaflet/MapLibre.
- Data contract `docs/data-contracts/ceplan-geo.md` actualizado con nombres de capa verificados y límites de cruce.
- Ficha en `docs/conectores.md` para `ceplan-geo`.
- ADR-0004 referenciado; desviaciones (sin web, cruce por nombre en `infobras`) documentadas en este PRD.
- `docs/ESTADO.md` actualizado al cerrar Sprint 5.

## 13. Referencias

- `docs/roadmap-ceplan.md` — Fase 2 (Sprints 3-4) y Fase 3 (Sprint 5)
- `docs/adr/0004-ceplan-geo-app-standalone-y-connector-geoserver.md`
- `docs/adr/0005-matriz-de-cruces-ceplan-con-ecosistema-existente.md`
- `docs/data-contracts/ceplan-geo.md`
- `docs/ESTADO.md` — política API-only y puertos reservados
- Apps patrón: `apps/infobras`, `apps/radar-inversiones`
