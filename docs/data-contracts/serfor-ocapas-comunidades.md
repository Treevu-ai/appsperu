# Data contract — geo-intersections: Comunidades Campesinas/Nativas (SERFOR OCAPAS_MIDAGRI)

- Fuente: SERFOR (réplica de datos MIDAGRI, no el catastro oficial MIDAGRI directo).
- URL del servicio: `https://geo.serfor.gob.pe/geoservicios/rest/services/Visor/OCAPAS_MIDAGRI/MapServer`
- Owner del conector: `apps/geo-intersections/api` (mismo pool PostGIS que INGEMMET/SERFOR forestal).
- Verificado en vivo el 2026-10-06: migración + ingest corridos contra Postgres real
  (`geo-intersections-postgres-1`), con los 4 endpoints probados contra datos reales.

## Estado: IMPLEMENTADO Y VERIFICADO EN VIVO CONTRA POSTGRES REAL

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
- Anillos no cerrados se cierran automáticamente antes de convertir a GeoJSON.
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

## API (`src/routes/rural-communities.ts`)

- `GET /api/communities?capa=&departamento=&limit=&offset=`
- `GET /api/communities/intersect?geometry=<geojson>` — **debe** declararse antes de
  `/:objectid` en el router (bug real encontrado y corregido: Express matcheaba
  `objectid="intersect"` y nunca llegaba al handler real).
- `GET /api/communities/stats` — mismo motivo, debe ir antes de `/:objectid`.
- `GET /api/communities/:objectid`

Verificado en vivo contra servidor real con datos ingeridos (ver sección anterior).

## MCP

No registrado aún en `mcp-server/src/catalog.ts`. Pendiente de decidir si corresponde.

## Pendiente

- Registrar tools MCP en `mcp-server/src/catalog.ts` si corresponde al alcance del catálogo.
- `ST_GeomFromGeoJSON` acepta las geometrías reales sin error de inserción, pero no se verificó
  `ST_IsValid` sobre las ~4,492 geometrías insertadas — el `UPDATE` de `area_km2` usa
  `ST_MakeValid` para el cálculo de área, pero la columna `geometry` en sí se guarda tal cual
  llega de la fuente (mismo criterio que `mining_rights`/`forest_titles`, no es una regresión de
  este conector).

## Fuera de alcance de este conector

- Capas de predios por departamento (IDs 1-25) — Fase 2 del plan, no implementada.
- AgroDigital (parcelas PPA) — Fase 3, requiere contacto oficial con MIDAGRI, no implementada.
- Georural Catastro Rural (fuente oficial MIDAGRI, distinta de esta réplica SERFOR) — evaluada
  en la investigación, no implementada (requiere paginación, `MaxRecordCount=1000`).
