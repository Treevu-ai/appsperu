# Data contract — geo-intersections: Comunidades Campesinas/Nativas (SERFOR OCAPAS_MIDAGRI)

- Fuente: SERFOR (réplica de datos MIDAGRI, no el catastro oficial MIDAGRI directo).
- URL del servicio: `https://geo.serfor.gob.pe/geoservicios/rest/services/Visor/OCAPAS_MIDAGRI/MapServer`
- Owner del conector: `apps/geo-intersections/api` (mismo pool PostGIS que INGEMMET/SERFOR forestal).
- Verificado en vivo el 2026-10-06: normalizador corrido contra el dataset completo real de
  ambas capas. **No** se ha corrido la migración ni el ingest contra Postgres (sin acceso a
  `DATABASE_URL` desde el entorno donde se hizo esta verificación — pendiente en un entorno con
  el stack docker-compose levantado).

## Estado: NORMALIZADOR VERIFICADO EN VIVO — INGEST A POSTGRES PENDIENTE

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

No verificado contra un servidor real levantado con datos ingeridos (pendiente, requiere DB).

## MCP

No registrado aún en `mcp-server/src/catalog.ts`. Pendiente de decidir si corresponde, una vez
que el ingest real esté verificado contra Postgres.

## Pendiente (bloqueado por falta de acceso a Postgres desde este entorno)

- Correr `npm run migrate` (aplica `003_rural_communities.sql`).
- Correr `npm run ingest:ocapas:comunidades` contra la DB real y verificar
  `SELECT COUNT(*) FROM rural_communities` / `rural_communities_rejected`.
- Probar los 4 endpoints contra el servidor real levantado con datos reales.
- Confirmar que `ST_GeomFromGeoJSON` acepta las ~3,090 + ~1,402 geometrías reales sin errores de
  geometría inválida (polígonos self-intersecting, etc.) — el normalizador cierra anillos pero
  no valida con `ST_IsValid`/`ST_MakeValid`.

## Fuera de alcance de este conector

- Capas de predios por departamento (IDs 1-25) — Fase 2 del plan, no implementada.
- AgroDigital (parcelas PPA) — Fase 3, requiere contacto oficial con MIDAGRI, no implementada.
- Georural Catastro Rural (fuente oficial MIDAGRI, distinta de esta réplica SERFOR) — evaluada
  en la investigación, no implementada (requiere paginación, `MaxRecordCount=1000`).
