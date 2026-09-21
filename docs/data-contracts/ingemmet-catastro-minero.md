# Data contract — catastro-minero: Derechos Mineros (INGEMMET)

- Fuente oficial: INGEMMET — Instituto Geológico, Minero y Metalúrgico del Perú.
- URL del servicio: `https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CATASTRO_MINERO/MapServer`
- Owner del conector: `apps/catastro-minero/api` (puerto 4031, `mcp-server/src/apps.ts`).
- Verificado en vivo el 2026-09-21: ingesta real ejecutada contra Postgres, **66,823/66,823 filas insertadas, 0 rechazadas** (cobertura nacional completa).

## Estado: IMPLEMENTADO (GEO-01)

## Método de acceso

### Metadata de capas

```bash
curl -s "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CATASTRO_MINERO/MapServer?f=json"
```

`HTTP 200`. Dos capas: `id=0` ("Catastro Minero", derechos mineros — la usada por este
conector) e `id=1` ("Catastro Minero - DGM (MINEM)", fuera de alcance de este ticket).

### Schema real de la capa 0

```bash
curl -s "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CATASTRO_MINERO/MapServer/0?f=json"
```

Campos reales confirmados (relevantes): `OBJECTID`, `CODIGOU` (código único, ver clave de
upsert), `FEC_DENU` (fecha, epoch ms), `CONCESION`, `TIT_CONCES` (titular), `HECTAGIS`
(hectáreas), `ESTADO` (código de una letra), `D_ESTADO` (descripción legible), `SUSTANCIA`,
`DEPA`/`PROVI`/`DISTRI` (territorial), `FECHA_ACTUALIZACION` (epoch ms).

### Consulta de features

```
GET https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CATASTRO_MINERO/MapServer/0/query
    ?where=<filtro SQL>&outFields=<campos>&orderByFields=OBJECTID ASC&returnGeometry=false&f=json
```

**Verificado en vivo con una fila real (`WHERE DEPA='LA LIBERTAD'`)**:

```json
{
  "attributes": {
    "OBJECTID": 109172,
    "CODIGOU": "010033716",
    "FEC_DENU": 1451883600000,
    "CONCESION": "HUACRACANCHA 04",
    "TIT_CONCES": "MINERA YANACOCHA S.R.L.",
    "HECTAGIS": 899.9835,
    "ESTADO": "T",
    "D_ESTADO": "D.M. Titulado D.L. 708",
    "SUSTANCIA": "M",
    "DEPA": "LA LIBERTAD",
    "PROVI": "JULCAN / SANTIAGO DE CHUCO",
    "DISTRI": "QUIRUVILCA / CALAMARCA",
    "FECHA_ACTUALIZACION": 1790014185000
  }
}
```

`FEC_DENU`/`FECHA_ACTUALIZACION` llegan como epoch milliseconds (`esriFieldTypeDate`), no texto
ISO — el conector los convierte explícitamente, no asume formato de texto.

## Hallazgo real: sin paginación estándar

```bash
curl -s -G ".../MapServer/0/query" --data-urlencode "where=1=1" --data-urlencode "resultRecordCount=5" --data-urlencode "f=json"
# {"error":{"code":400,"message":"Pagination is not supported.","details":[]}}
```

`advancedQueryCapabilities.supportsPagination` es `false` — el servicio rechaza
`resultRecordCount`/`resultOffset` explícitamente. `maxRecordCount` (confirmado): `1000` filas
por respuesta, sin ese parámetro.

**Solución verificada — paginación por rango de `OBJECTID`**:

```bash
curl -s "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CATASTRO_MINERO/MapServer/0/query?where=OBJECTID%3E0&outFields=OBJECTID,CODIGOU&orderByFields=OBJECTID%20ASC&returnGeometry=false&f=json"
```

Devuelve exactamente 1000 features y `"exceededTransferLimit":true`. El conector repite la
consulta con `WHERE OBJECTID > <último_id_de_la_página_anterior>` mientras
`exceededTransferLimit` siga en `true` — patrón estándar de ArcGIS REST para este límite.

## Hallazgo real: TLS y Node.js

`fetch()` de Node.js (v25, CA bundle propio) rechaza el certificado de
`geocatmin.ingemmet.gob.pe` con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, mientras que `curl` (CA store
del sistema operativo) sí confía en la cadena completa. **No es un problema del servidor ni una
razón para deshabilitar la verificación TLS** — es que el bundle de CAs que Node.js empaqueta por
defecto no incluye (o no encadena correctamente) la CA intermedia que usa este servidor. La
solución correcta, verificada en vivo, es `node --use-system-ca` (o `tsx --use-system-ca`), que
hace que Node use el almacén de confianza del sistema operativo — el mismo que ya usa `curl` — en
vez de deshabilitar la verificación (`NODE_TLS_REJECT_UNAUTHORIZED=0`, que sí sería inseguro).
`apps/catastro-minero/api/package.json` declara el script `ingest:ingemmet` con esta flag.

## Clave de upsert

`CODIGOU` (columna `codigou`) — verificada única sobre las 66,823 filas de la ingesta nacional
completa (`COUNT(*) = COUNT(DISTINCT codigou) = 66823`, verificado con SQL real contra Postgres).

## Conector (`src/ingest/ingemmet-connector.ts`)

1. Pagina por `OBJECTID` (ver arriba) hasta agotar el catastro completo.
2. Inserta un `raw_ingemmet_batches` por corrida completa.
3. Normaliza (`normalize-ingemmet.ts`) — convierte fechas epoch a ISO, valida `OBJECTID`/`CODIGOU`
   como campos obligatorios, el resto es opcional (`null` si ausente).
4. `ON CONFLICT (codigou) DO UPDATE` por lote de 1000 filas — refleja el catastro vigente.

### Verificación en vivo (2026-09-21)

```json
{ "batchId": 1, "filasOrigen": 66823, "filasInsertadas": 66823, "filasRechazadas": 0 }
```

Contra Postgres real:

```sql
SELECT COUNT(*) AS total, COUNT(DISTINCT codigou) AS claves_unicas FROM catastro_minero_derechos;
-- total: 66823, claves_unicas: 66823
SELECT COUNT(*) FROM catastro_minero_derechos WHERE departamento = 'LA LIBERTAD';
-- 4787
```

## API (`src/routes/derechos.ts`)

- `GET /api/derechos` — filtros `departamento`/`provincia`/`distrito`/`estado`/`sustancia`
  (exactos), `concesion`/`titular` (ILIKE), paginado (`limit`/`offset`, default 200/máx. 1000).
  `estado` se expone tal cual la fuente (código de una letra, ej. `"T"`) — no se normaliza a un
  enum binario, se agrega `estadoDescripcion` con el texto legible de `D_ESTADO`.
- `GET /api/derechos/{codigou}` — detalle por la clave real. Responde `404` si no existe.

Ambos verificados en vivo contra la API real levantada localmente con datos reales ingeridos
(`/health`, `/readyz`, `/api/derechos?departamento=LA%20LIBERTAD&limit=2`,
`/api/derechos/010033716`, `/api/derechos/000000000` → `404`).

## MCP

Tools registradas en `mcp-server/src/catalog.ts`: `catastro_minero_derechos`,
`catastro_minero_derecho_detalle`. Verificado que `mcp-server/src/__tests__/routes-vs-catalog.test.ts`
pasa (cada `GET` real tiene tool, cada tool corresponde a un `GET` real).

## PII

`TIT_CONCES` (titular) puede ser una empresa o, en minería artesanal/pequeña, una persona
natural. Se trata como dato público de un registro de derecho minero (análogo a un registro de
propiedad SUNARP), no se enmascara — pero queda documentado aquí explícitamente para cualquier
análisis futuro.

## Fuera de alcance de este conector

- Capa `id=1` ("Catastro Minero - DGM (MINEM)") — no investigada en esta pasada.
- Geometría de los polígonos (`SHAPE`) — se consulta con `returnGeometry=false`, no se ingiere.
- Cruces con otras apps del catálogo — candidato documentado en `docs/conectores.md`, no implementado.
- Scheduler, UI.
