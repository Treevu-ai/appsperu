# Data contract — areas-protegidas: Áreas Naturales Protegidas (SERNANP)

- Fuente oficial: SERNANP (Servicio Nacional de Áreas Naturales Protegidas por el Estado) — MINAM.
- URL del servicio: `https://geoservicios.sernanp.gob.pe/arcgis/rest/services/sernanp_visor/servicio_descarga/MapServer`
- Owner del conector: `apps/areas-protegidas/api` (puerto 4032, `mcp-server/src/apps.ts`).
- Verificado en vivo el 2026-09-21: ingesta real ejecutada contra Postgres, **466/466 filas insertadas, 0 rechazadas** (las 5 capas del PRD).

## Estado: IMPLEMENTADO (GEO-02)

## Capas confirmadas (metadata real)

```bash
curl -s ".../MapServer?f=json"
```

`HTTP 200`. IDs de capa reales (dentro del grupo "Base Fisica"):

| ID | Nombre | Alcance de este conector |
|---|---|---|
| 1 | ANP Nacional Definitiva | ✅ |
| 2 | Zona Reservada | ✅ |
| 3 | Area Conservacion Regional | ✅ |
| 4 | Area Conservacion Privada | ✅ |
| 5 | Sitios Prioritarios Nivel Nacional | ✅ |
| 6 | Areas de Alto Valor para la Conservacion Marina | ❌ fuera de alcance (no en el PRD original) |
| 7+ | Grupo "Gestion ANP" (zonificación, zona de amortiguamiento, etc.) | ❌ fuera de alcance |

## Schema real por capa

```bash
curl -s ".../MapServer/1?f=json"   # ANP Nacional Definitiva
```

Campos reales confirmados (relevantes), por capa:

| Capa | Prefijo | Campo de código | Campos propios (→ `atributos_extra`) |
|---|---|---|---|
| ANP Nacional Definitiva | `anp_` | `anp_codi` | — |
| Zona Reservada | `zr_` | `zr_codi` | — |
| Área de Conservación Regional | `acr_` | `acr_codi` | — |
| Área de Conservación Privada | `acp_` | `acp_codi` | `acp_fecad`, `acp_titu`, `acp_tipro`, `acp_tirec`, `acp_pareg` |
| Sitios Prioritarios Nivel Nacional | `sp_` | `sp_cod` | `sp_pri`, `sp_cf`, `sp_ib`, `sp_ci` (y `sp_sup` en vez de `anp_suleg` para superficie) |

Campos comunes normalizados a columnas propias (con su prefijo por capa): `_nomb` (nombre, ausente en Sitios Prioritarios), `_ubpo` (ubicación/departamento), `anp_suleg`/`sp_sup` (superficie en hectáreas), `_balec`/`_felec` (base legal y fecha de establecimiento), `_balem`/`_felem` (base legal y fecha de modificación), `_obs` (observaciones). Solo ANP Nacional Definitiva trae `anp_cate` (categoría: Parque Nacional, Reserva Nacional, Santuario Nacional, etc.) — el resto de capas no tiene un concepto de "categoría".

## Hallazgo real: sin clave estable para upsert incremental

**Verificado en vivo con la respuesta completa de la capa 1** (104 features):

```bash
curl -s -G ".../MapServer/1/query" --data-urlencode "where=1=1" --data-urlencode "outFields=*" --data-urlencode "returnGeometry=false" --data-urlencode "f=json"
```

```
anp_codi únicos: 95 de 104 filas
objectid únicos: 104 de 104 filas
anp_id únicos: 95 de 104 filas

Códigos duplicados: "RN18" (×4), "RN05" (×4), "PN01" (×2), "RVS03" (×3)
```

Mismo patrón confirmado en las otras capas (`acr_id`: 39/48 únicos, `acp_id`: 149/233 únicos) —
**un área con geometría multi-parte (islas, sectores disjuntos del mismo derecho de
conservación) se representa como varias filas que comparten el mismo código de negocio**.
`objectid` sí es único dentro de cada consulta (garantía estándar de ArcGIS), pero no hay
evidencia de que sea estable entre reconstrucciones del servicio — no se usa como clave de
upsert incremental.

**Decisión, ya prevista en el PRD (`docs/PRD_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md`,
GEO-02) tras un hallazgo real de CodeRabbit**: opción (a) — bloquear el upsert incremental y
tratar cada ingesta como snapshot completo. El conector borra todas las filas de una capa y
las reinserta en la misma transacción (`DELETE FROM sernanp_areas WHERE capa = $1`, sin `UNIQUE`
ni `ON CONFLICT` en la tabla).

## Correcciones reales de la revisión de Copilot (post-implementación)

- **`exceededTransferLimit` no se verificaba**: el conector asume que las 5 capas caben en una
  sola respuesta (confirmado en vivo: `maxRecordCount: 200000`, capas de 6 a 233 filas), pero no
  comprobaba ese supuesto en cada corrida — si una capa creciera más allá del límite, `features`
  sería solo la primera página y el snapshot (DELETE + INSERT) confirmaría una ingesta truncada
  sin darse cuenta. Ahora se exige `payload.exceededTransferLimit !== true` y `Array.isArray(payload.features)`
  antes de aceptar la respuesta — lanza error si cualquiera falla, en vez de asumir "capa vacía"
  o "capa completa".
- **Sin serialización entre corridas concurrentes**: dos corridas manuales solapadas de la misma
  capa podían confirmar la más vieja *después* de la más nueva. Se agregó
  `pg_advisory_xact_lock(hashtext('sernanp_areas_ingest'), hashtext($1))` (con `$1` = nombre de la
  capa) al abrir la transacción de cada capa.
- **`anp_gid`/`anp_id` (y equivalentes por capa: `zr_id`, `acr_id`, `acp_id`) se descartaban en
  silencio**: el fixture real de ANP Nacional Definitiva los trae, pero el mapeo `FIELD_MAP` de
  `normalize-sernanp.ts` tenía `extra: []` para esa capa, en contra del propio contrato
  documentado del conector ("nada se pierde, lo que no es común va a `atributos_extra`"). Ahora
  se preservan explícitamente. **Verificado en vivo, hallazgo adicional útil**: para el área
  "RN18" (2 filas, geometría multi-parte), ambas comparten `anp_id: 94` pero difieren en
  `anp_gid` (383 y 382) — confirma que `anp_gid` identifica la parte del polígono, `anp_id` el
  área lógica completa. Ninguno de los dos se usa como clave de upsert (ver arriba), pero quedan
  disponibles en `atributos_extra` para quien los necesite.

## Paginación: no hace falta (a diferencia de GEO-01)

```json
"advancedQueryCapabilities": { "supportsPagination": true, ... },
"maxRecordCount": 200000
```

Las 5 capas son pequeñas (6 a 233 filas cada una, verificado en vivo) — una sola consulta
`where=1=1&outFields=*&returnGeometry=false` trae el dataset completo de cada capa sin acercarse
al límite de 200,000.

## Verificación en vivo (2026-09-21)

```json
{
  "capas": [
    { "capa": "anp_nacional_definitiva", "filasOrigen": 104, "filasInsertadas": 104, "filasRechazadas": 0 },
    { "capa": "zona_reservada", "filasOrigen": 6, "filasInsertadas": 6, "filasRechazadas": 0 },
    { "capa": "area_conservacion_regional", "filasOrigen": 48, "filasInsertadas": 48, "filasRechazadas": 0 },
    { "capa": "area_conservacion_privada", "filasOrigen": 233, "filasInsertadas": 233, "filasRechazadas": 0 },
    { "capa": "sitios_prioritarios", "filasOrigen": 75, "filasInsertadas": 75, "filasRechazadas": 0 }
  ]
}
```

Contra Postgres real:

```sql
SELECT capa, COUNT(*) FROM sernanp_areas GROUP BY capa ORDER BY capa;
-- anp_nacional_definitiva: 104, area_conservacion_privada: 233,
-- area_conservacion_regional: 48, sitios_prioritarios: 75, zona_reservada: 6

SELECT codigo, nombre, categoria, ubicacion, superficie_ha FROM sernanp_areas
WHERE capa='anp_nacional_definitiva' AND ubicacion ILIKE '%libertad%';
-- BP02 Puquio Santa Rosa (Bosque de Protección, 72.5 ha)
-- CC02 Sunchubamba (Coto de Caza, 59,735 ha, Cajamarca y La Libertad)
-- RN07 de Calipuy (Reserva Nacional, 64,000 ha)
-- SN02 de Calipuy (Santuario Nacional, 4,500 ha)
```

## API (`src/routes/areas.ts`)

- `GET /api/areas` — filtros `capa` (enum de las 5 capas), `nombre`/`ubicacion` (ILIKE),
  `categoria` (solo aplica a `anp_nacional_definitiva`), paginado (`limit`/`offset`, default
  200/máx. 1000, ambos expuestos en la respuesta).
- `GET /api/areas/{capa}/{objectid}` — detalle por la clave real disponible (`objectid` dentro de
  la capa), no por el código de negocio. Responde `404` si no existe.

Ambos verificados en vivo contra la API real levantada localmente con datos reales ingeridos
(`/health`, `/readyz`, `/api/areas?ubicacion=La%20Libertad&limit=5`,
`/api/areas/anp_nacional_definitiva/17938`, `/api/areas/anp_nacional_definitiva/999999` → `404`).

## MCP

Tools registradas en `mcp-server/src/catalog.ts`: `areas_protegidas_areas`,
`areas_protegidas_area_detalle`. Verificado que
`mcp-server/src/__tests__/routes-vs-catalog.test.ts` pasa.

## Fuera de alcance de este conector

- Capa 6 (Áreas de Alto Valor para la Conservación Marina) y el grupo "Gestión ANP"
  (zonificación, zona de amortiguamiento) — no investigadas en esta pasada.
- Geometría de los polígonos (`SHAPE`) — se consulta con `returnGeometry=false`, no se ingiere.
- Cruces geoespaciales con `catastro-minero` u otras apps — candidato documentado en
  `docs/conectores.md`, no implementado.
- Scheduler, UI.
