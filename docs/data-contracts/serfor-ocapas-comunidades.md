# Data contract — geo-intersections: Comunidades Campesinas/Nativas (SERFOR OCAPAS_MIDAGRI)

- Fuente: SERFOR (réplica de datos MIDAGRI, no el catastro oficial MIDAGRI directo).
- URL del servicio: `https://geo.serfor.gob.pe/geoservicios/rest/services/Visor/OCAPAS_MIDAGRI/MapServer`
- Owner del conector: `apps/geo-intersections/api` (mismo pool PostGIS que INGEMMET/SERFOR forestal).
- Verificado en vivo el 2026-10-06: migración + ingest corridos contra Postgres real
  (`geo-intersections-postgres-1`), con los 4 endpoints probados contra datos reales.
- **Migración + ingest corridos también contra la base Neon de producción
  (`geo_intersections`, proyecto `appsperu`) el 2026-10-06** — ver sección final.

## Estado: IMPLEMENTADO, VERIFICADO EN VIVO (POSTGRES LOCAL + NEON PRODUCCIÓN)

## Capas y schema real (corregido tras la v1 de la investigación)

La investigación inicial (`docs/investigacion-agro-digital-2026-10-06.md`) y el plan v1
(`docs/plan-implementacion-catastro-rural-v1.md`) asumieron un schema de campos (`NOMPRE`,
`AREA`, `PERIME`, `TITULO`, `ZUTM`, `COORX`/`COORY`) que corresponde a las capas de **predios
por departamento** (IDs 1-25), no a las capas de **comunidades** (26, 27) que implementa este
conector. Confirmado contra la API en vivo:

```bash
curl -s ".../MapServer/26?f=json"   # Comunidades Campesinas
curl -s ".../MapServer/27?f=json"   # Comunidades Nativas
```

Campos comunes a ambas capas: `OBJECTID`, `nomcom` (nombre), `depar`, `provi`, `distr`
(departamento/provincia/distrito **ya separados**, sin necesidad de parsear `ubidis`), `ubidis`
(código UBIGEO distrital, ej. `"160301"` — no es un nombre), `Aarea`, `centroide_e`/`centroide_n`,
`painre`, `ofinre`, `feinre`, `accion`, `fecha_carga`, `gml_id`.

- `comunidades_nativas` (capa 27) además: `prodem`, `restit`, `titcom` (título comunal, ej.
  `"058-2016-GRL-DRA-L"`), `codigo`, `fereti`, `fectit`.
- `comunidades_campesinas` (capa 26) además: `OBJECTID_WFS`, `prodes`.

**`Aarea` está en hectáreas** — verificado comparando contra `SHAPE.STArea()` (grados²)
convertido a km² vía el factor de conversión en la latitud real de las muestras; coincide dentro
de redondeo con `Aarea` para varias filas de ambas capas.

**No existen** en ninguna de las dos capas: `ZUTM`, `COORX`/`COORY`, `PERIME`, `TITULO`, `NOMPRE`,
`AREA` — el normalizador no debe asumirlos (ver `atributos_extra` para todo lo demás).

## Consulta de features

```
GET https://geo.serfor.gob.pe/geoservicios/rest/services/Visor/OCAPAS_MIDAGRI/MapServer/{26|27}/query
    ?where=1=1&outFields=*&returnGeometry=true&outSR=4326&f=json
```

`maxRecordCount`: 1,000,000 (confirmado vía metadata `?f=json`). **Sin paginación necesaria**:
verificado trayendo el dataset completo de ambas capas en una sola consulta, sin
`exceededTransferLimit` en la respuesta final.

## Verificación en vivo (2026-10-06) — dataset completo, sin paginar

| Capa | Features recibidas | Normalizadas | Rechazadas | `exceededTransferLimit` |
|---|---|---|---|---|
| comunidades_campesinas (26) | 3,090 | 3,090 | 0 | ausente (no se necesitó paginar) |
| comunidades_nativas (27) | 1,402 | 1,402 | 0 | ausente |

Notas de calidad de datos reales (no son bugs del conector):
- Capa 26: 2,337/3,090 filas (~76%) sin `distr` poblado en la fuente (llega como `" "`, el
  normalizador lo trata como `null` vía trim). 6 filas sin `nomcom`.
- Capa 27: solo 9/1,402 filas sin `distr`.
- Ninguna fila de ninguna capa carece de `depar` ni `Aarea`.

Peso de la respuesta completa (con geometría, sin paginar): capa 26 ≈ 59 MB, capa 27 ≈ 33 MB.
`fetch()` nativo de Node con `AbortSignal.timeout()` tuvo timeouts intermitentes contra
respuestas de este tamaño en el entorno de verificación; `curl` las trajo sin problema en
18-36s. Si el conector real (`ocapas-connector.ts`, que usa `fetch()`) muestra timeouts en
producción, subir el timeout de 60s o investigar si el entorno de ejecución tiene la misma
sensibilidad que se vio aquí.

## Verificación en vivo (2026-10-06) — ingest real contra Postgres

Migración (`005_rural_communities.sql`) y `npm run ingest:ocapas:comunidades` corridos contra
`geo-intersections-postgres-1` (el contenedor estaba `Up` pero sin publicar el puerto 5466 que
el `docker-compose.yml` ya declaraba — recreado con `docker compose up -d`, volumen preservado).

**Primer intento falló**: `area_km2` estaba definida como columna `GENERATED ALWAYS AS
(ST_Area(geometry::geography) / 1_000_000) STORED`. PostGIS devolvió
`lwgeom_area_spher(oid) returned area < 0.0` en **ambas** capas (3,090 y 1,402 filas, toda la
transacción revertida) — mismo error documentado en `replicate-geometries.ts` para
`mining_rights`/`forest_titles`: polígonos self-intersecting/inválidos hacen que
`ST_Area(::geography)` devuelva área negativa. Corregido: `area_km2` pasó a columna plana,
poblada en un `UPDATE ... SET area_km2 = ST_Area(ST_MakeValid(geometry)::geography) / 1e6
WHERE source_batch_id = $1 AND area_km2 IS NULL` después del insert — mismo patrón que el resto
del conector de geometrías.

**Segundo intento, exitoso**:

```json
{"capa":"comunidades_campesinas","batchId":"1","filasOrigen":3090,"filasInsertadas":3090,"filasRechazadas":0}
{"capa":"comunidades_nativas","batchId":"2","filasOrigen":1402,"filasInsertadas":1402,"filasRechazadas":0}
```

Contra Postgres real: `rural_communities` tiene 3,090 + 1,402 = 4,492 filas, **todas** con
`area_km2` poblado (0 `NULL`), 0 filas en `rural_communities_rejected`. `area_ha / 100 ≈
area_km2` consistente (ej. objectid 1, comunidades_nativas: 258.05 ha → 2.58 km²).

Los 4 endpoints probados contra el servidor real levantado con estos datos:
- `GET /api/communities?limit=2` → 200, filas reales.
- `GET /api/communities/stats` → 200, `{"capa":"comunidades_campesinas","total":"3090",...}` /
  `{"capa":"comunidades_nativas","total":"1402",...}` — confirma que la ruta llega al handler
  correcto, no a `/:objectid`.
- `GET /api/communities/1` → 200, PUCA URCO (comunidades_campesinas).
- `GET /api/communities/999999999` → 404.
- `GET /api/communities/intersect?geometry=<point>` sin parámetro → 400. Con un punto real
  (`ST_PointOnSurface` del polígono de PUCA URCO) → 200, devuelve exactamente esa fila.

## Normalizador (`src/ingest/normalize-ocapas.ts`)

- `OBJECTID` ausente → fila rechazada (`rural_communities_rejected`).
- `geometry.rings` ausente o vacío → fila rechazada.
- Cada ring se valida (array, ≥3 puntos, puntos `[number, number]`) — un ring inválido rechaza
  la fila entera, en vez de llegar a `ST_GeomFromGeoJSON` y hacer fallar/rollback todo el batch
  (hallazgo real de revisión CodeRabbit/Copilot).
- Anillos no cerrados se cierran automáticamente antes de convertir a GeoJSON.
- **Geometría de salida: `MultiPolygon`, no `Polygon`** — hallazgo real de revisión, confirmado
  contra el dataset completo: 212/4,492 features (≈4.7%) tienen más de un ring, y no todos son
  holes. Ej. real: OBJECTID 7 "PUERTO ANGEL" (comunidades_campesinas) tiene 2 rings, **ambos
  clockwise** (dos shells exteriores disjuntos, confirmado con `ST_NumGeometries(geometry) = 2`
  tras el fix). La v1 trataba todo ring después del primero como hole sin importar su
  orientación — con esta feature real, el segundo polígono se habría leído como agujero del
  primero, corrompiendo la geometría que `/intersect` consulta directamente (`ST_MakeValid` solo
  repara el cálculo de área, no la semántica del hole mal asignado). El normalizador agrupa
  rings por orientación (regla de Esri: clockwise = nuevo shell exterior, counter-clockwise =
  hole del shell exterior más reciente) y siempre emite `MultiPolygon` (incluso con un solo
  shell), para tipo consistente en la columna `GEOMETRY(MultiPolygon, 4326)`.
- `titulo` solo se puebla para `comunidades_nativas` (desde `titcom`); queda `null` para
  `comunidades_campesinas` (la capa no tiene campo equivalente).
- `zona_utm` y `perimetro` quedan siempre `null` — la fuente no los expone para estas capas.
  Si se necesita perímetro en metros, calcularlo con `ST_Perimeter(geometry::geography)` sobre
  la geometría ya insertada, no inventar un valor en el normalizador.
- Todo campo no mapeado explícitamente (incluyendo `ubidis`) va a `atributos_extra` (JSONB).

## Conector (`src/ingest/ocapas-connector.ts`)

1. Trae la capa completa en una sola consulta (sin paginación, ver arriba).
2. Adquiere `pg_advisory_xact_lock(hashtext('rural_communities_ingest'), hashtext(capa))` —
   serializa ingestas solapadas por capa, mismo patrón que `catastro-forestal`.
3. Snapshot completo por capa: `DELETE FROM rural_communities WHERE capa = $1` + reinserción en
   lotes de 1000 filas.
4. La columna `geometry` se inserta con `ST_GeomFromGeoJSON($N)` explícito en el SQL — **no**
   pasar el string GeoJSON crudo como parámetro sin ese cast (bug real encontrado y corregido en
   esta misma implementación: PostGIS no castea un string JSON a `GEOMETRY` implícitamente).
5. Guarda batch en `raw_ocapas_batches`, filas rechazadas en `rural_communities_rejected`.
6. Si la fuente devuelve `features: []`, el ingest se aborta ANTES de tocar la tabla (lanza error,
   no hace `DELETE`) — sin esto, un `features=[]` transitorio (ej. blip de red que igual
   responde HTTP 200) habría borrado todo lo ya ingerido para esa capa y confirmado una tabla
   vacía (hallazgo real de revisión CodeRabbit).
7. `batchId` se trata como `string` en todo el conector (`CapaIngestSummary.batchId: string`),
   no `number` — `raw_ocapas_batches.id` es `BIGSERIAL` y node-postgres lo devuelve como string
   sin un parser numérico registrado (hallazgo real de revisión CodeRabbit).

## API (`src/routes/rural-communities.ts`)

- `GET /api/communities?capa=&departamento=&limit=&offset=` — `limit` validado (1-1000, default
  100) y `offset` (≥0, default 0) con Zod; valores inválidos (`limit=abc`, `limit=5000`) → 400
  antes de tocar la DB (hallazgo real de revisión: `parseInt` sin validar dejaba pasar `NaN`/
  valores sin cota hasta Postgres). `ORDER BY nombre, capa, objectid` — tie-breaker agregado
  porque `nombre` no es único y paginar solo por él podía repetir/omitir filas entre páginas
  (hallazgo real de revisión).
- `GET /api/communities/intersect?geometry=<geojson>&limit=&offset=` — **debe** declararse
  antes de `/:objectid` en el router (bug real encontrado y corregido: Express matcheaba
  `objectid="intersect"` y nunca llegaba al handler real). `geometry` se valida como JSON con
  un campo `type` reconocido de GeoJSON antes de llegar a `ST_GeomFromGeoJSON` (hallazgo real:
  JSON malformado o no-geometría causaba 500 en vez de 400). Ahora pagina con `limit`/`offset`
  igual que el listado — antes devolvía TODAS las filas que intersectan sin cota, incluyendo su
  geometría completa (hallazgo real: una geometría que cubre todo Perú podía devolver las 4,492
  filas con sus polígonos completos en una sola respuesta).
- `GET /api/communities/stats` — mismo motivo que `/intersect`, debe ir antes de `/:objectid`.
- `GET /api/communities/:objectid?capa=` — **`capa` es obligatorio** (hallazgo real y confirmado
  con datos reales: `objectid=1` existe en AMBAS capas — PUCA URCO en comunidades_campesinas,
  LAS MALVINAS en comunidades_nativas — porque la tabla garantiza `UNIQUE(capa, objectid)`, no
  `UNIQUE(objectid)` a solas; sin `capa` la ruta devolvía una fila arbitraria de las dos).
  `objectid` se valida como entero dentro del rango int32 de Postgres antes de la query
  (hallazgo real: `/api/communities/abc` llegaba a una comparación `INTEGER` inválida y daba 500).

Verificado en vivo contra servidor real con datos ingeridos (ver sección anterior), incluyendo
todos los casos de validación arriba y el caso de ambigüedad `objectid=1`.

## MCP (`mcp-server/src/handlers/geo-intersections/communities.ts`)

4 tools registradas en `mcp-server/src/catalog.ts`: `geo_intersections_comunidades`,
`geo_intersections_comunidad_detalle` (con `capa` obligatorio en el querySchema, mismo motivo
que la ruta Express), `geo_intersections_comunidades_intersect` (con `limit`/`offset`),
`geo_intersections_comunidades_stats`. SQL y validaciones idénticas a `rural-communities.ts` —
los handlers MCP ejecutan contra Neon directamente (no proxy HTTP a la app Express), así que
necesitan las mismas validaciones por su cuenta, no las heredan de la ruta.

Esto no era opcional: `mcp-server/src/__tests__/routes-vs-catalog.test.ts` (CX-15) es un gate de
CI que falla si cualquier endpoint GET real de una app del catálogo no tiene tool MCP — el job
`mcp-server` falló en el primer push de este PR por dejarlo pendiente.

## Migración + ingest en Neon producción (2026-10-06)

Corridos contra el proyecto Neon `appsperu` (`jolly-breeze-71813141`), branch `production`,
base `geo_intersections` — la misma que consultan los handlers MCP en producción:

- `005_rural_communities.sql` aplicada (3 tablas: `rural_communities`, `raw_ocapas_batches`,
  `rural_communities_rejected`; ya existían `mining_rights`/`forest_titles`/etc. de 001-004,
  no se re-corrieron — solo se aplicó el `CREATE TABLE/INDEX IF NOT EXISTS` de 005).
- Ingest real: **3,090/3,090 filas (comunidades_campesinas), 1,402/1,402
  (comunidades_nativas), 0 rechazadas** — mismos números que la verificación local.
- `ST_IsValid(geometry) = false` en 21 + 4 = 25 filas — idéntico a la verificación local.
- Confirmado contra Neon: OBJECTID 7 "PUERTO ANGEL" es `MultiPolygon` con
  `ST_NumGeometries = 2`; `objectid=1` existe en ambas capas (PUCA URCO / LAS MALVINAS).
- **Los 4 handlers MCP invocados directamente contra esta data (no solo SQL manual)**:
  `list` (200, filas reales), `detalle` sin `capa` (400), `detalle` con `capa` distinta para el
  mismo `objectid=1` (200, devuelve la fila correcta en cada caso), `stats` (200, totales
  correctos), `intersect` con geometry inválida (400), `intersect` con un punto dentro del
  segundo shell de PUERTO ANGEL (200, devuelve exactamente esa fila — confirma el fix de
  multi-shell funcionando en la base real que consulta producción).

## Pendiente

- `ST_GeomFromGeoJSON` acepta las geometrías reales sin error de inserción, pero 25/4,492
  (`ST_IsValid(geometry) = false`) son geométricamente inválidas (polígonos self-intersecting) —
  el `UPDATE` de `area_km2` usa `ST_MakeValid` para el cálculo de área, pero la columna
  `geometry` en sí se guarda tal cual llega de la fuente (mismo criterio que
  `mining_rights`/`forest_titles`, no es una regresión de este conector).

## Fuera de alcance de este conector

- Capas de predios por departamento (IDs 1-25) — Fase 2 del plan, no implementada.
- AgroDigital (parcelas PPA) — Fase 3, requiere contacto oficial con MIDAGRI, no implementada.
- Georural Catastro Rural (fuente oficial MIDAGRI, distinta de esta réplica SERFOR) — evaluada
  en la investigación, no implementada (requiere paginación, `MaxRecordCount=1000`).
