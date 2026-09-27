# Integración MTC Geoserver → ceplan-geo

**Fecha:** 2026-09-24  
**Estado:** Diseño  
**Autor:** Arquitectura ceplan-geo

---

## Resumen ejecutivo

Se integran 10 capas WFS del Geoserver MTC (`mtcgeo2.mtc.gob.pe:8080/geoserver/`) en la base de datos PostGIS de `ceplan-geo`, usando el patrón de ingesta existente (`ingestInfrastructureLayer`). Las capas de red vial (~230k features, LineString) y las capas puntuales (~1,200 features, Point) conviven en la tabla `infrastructure` existente.

---

## 1. Decisión de arquitectura

### 1.1 Opción elegida: tabla `infrastructure` única

| Criterio | Tabla única (`infrastructure`) | Tablas separadas (`infrastructure` + `infrastructure_lines`) |
|----------|-------------------------------|--------------------------------------------------------------|
| Simplicidad | ✅ Un solo upsert, un solo route | ❌ Dos patrones de ingesta, dos endpoints |
| Queries espaciales | ✅ ST_DWithin/Intersects funciona con geometría genérica | ✅ Filters nativos por tipo |
| Consistencia | ✅ foreign key única, coherencia transaccional | ❌ JOIN entre tablas para queries cross-type |
| Mantenimiento | ✅ Una migración, un script | ❌ Dos tablas, dos índices, dos patrones |
| Performance red vial | ⚠️ Requiere índice GIST (ya existe) | ✅ Tabla pequeña para Point |

**Decisión:** tabla `infrastructure` única con columna `geometry_type` como discriminador derivadas.

**Justificación:**
- La columna `geometry` en la tabla actual es `geometry(Geometry, 4326)` — PostGIS soporta cualquier tipo (Point, LineString, Polygon) en una columna genérica.
- El índice GIST existente (`idx_infrastructure_geometry`) cubre queries espaciales para cualquier geometría.
- Agregar `geometry_type` permite filtering eficiente sin cambiar el schema de tablas.
- No hay requerimiento actual para separar LineStrings de Points en tablas distintas.

---

## 2. Schema SQL propuesto

### 2.1 Nueva migración: `012_mtc_geoserver_infrastructure.sql`

```sql
-- Agrega geometry_type a infrastructure para filtering eficiente
ALTER TABLE infrastructure
  ADD COLUMN IF NOT EXISTS geometry_type TEXT
    GENERATED ALWAYS AS (GeometryType(geometry)) STORED;

-- Extiende infra_type con los tipos MTC
-- Nota: los valores existentes ('aeropuerto', 'puerto') se mantienen
-- Nuevos valores MTC:
--   'red_vial_nacional'      -- LineString
--   'red_vial_departamental' -- LineString
--   'red_vial_vecinal'       -- LineString
--   'terminal_terrestre'     -- Point
--   'aerodromo'              -- Point
--   'terminal_portuario'     -- Point
--   'linea_ferrea'           -- LineString
--   'estacion_ferroviaria'   -- Point
--   'estacion_pesaje'       -- Point
--   'peaje'                  -- Point

-- Índice compuesto para queries por tipo + departamento
CREATE INDEX IF NOT EXISTS idx_infrastructure_type_dpto
  ON infrastructure (infra_type, (properties->>'iddpto'));

-- Índice para queries de red vial (LineString) por código de vía
CREATE INDEX IF NOT EXISTS idx_infrastructure_road_code
  ON infrastructure (infra_type, (properties->>'cod_via'))
  WHERE infra_type LIKE 'red_vial_%';

-- CHECK constraint para valores válidos de geometry_type
ALTER TABLE infrastructure
  ADD CONSTRAINT chk_geometry_type
  CHECK (geometry_type IN ('Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'));
```

### 2.2 Actualización de tipos TypeScript

```typescript
// apps/ceplan-geo/api/src/ingest/layers.ts

export type InfraType =
  | "aeropuerto"
  | "puerto"
  | "red_hidrica_principal"
  | "proyecto_sectorial_agro"
  // MTC Geoserver
  | "red_vial_nacional"
  | "red_vial_departamental"
  | "red_vial_vecinal"
  | "terminal_terrestre"
  | "aerodromo"
  | "terminal_portuario"
  | "linea_ferrea"
  | "estacion_ferroviaria"
  | "estacion_pesaje"
  | "peaje";

export const INFRA_TYPE_VALUES = [
  "aeropuerto",
  "puerto",
  "red_hidrica_principal",
  "proyecto_sectorial_agro",
  // MTC
  "red_vial_nacional",
  "red_vial_departamental",
  "red_vial_vecinal",
  "terminal_terrestre",
  "aerodromo",
  "terminal_portuario",
  "linea_ferrea",
  "estacion_ferroviaria",
  "estacion_pesaje",
  "peaje",
] as const satisfies readonly InfraType[];
```

---

## 3. Configuración de capas MTC

```typescript
// apps/ceplan-geo/api/src/ingest/ingest-infrastructure.ts

export const MTC_LAYER_CONFIG: InfrastructureLayerConfig[] = [
  // ── Red Vial (LineString, ~230k features total) ──
  {
    layerName: "MTC_pg:red_vial_nacional_dic18",
    infraType: "red_vial_nacional",
    parseName: (props) => props?.nombre?.toString() ?? props?.des_via?.toString() ?? null,
  },
  {
    layerName: "MTC_pg:red_vial_departamental_dic18",
    infraType: "red_vial_departamental",
    parseName: (props) => props?.nombre?.toString() ?? props?.des_via?.toString() ?? null,
  },
  {
    layerName: "MTC_pg:red_vial_vecinal_dic18",
    infraType: "red_vial_vecinal",
    parseName: (props) => props?.nombre?.toString() ?? props?.des_via?.toString() ?? null,
  },

  // ── Infraestructura puntual (~1,200 features) ──
  {
    layerName: "MTC_gis:terminal_terrestre",
    infraType: "terminal_terrestre",
    parseName: (props) => props?.nombre?.toString() ?? props?.denominaci?.toString() ?? null,
  },
  {
    layerName: "MTC_pg:aerodromo_dic18",
    infraType: "aerodromo",
    parseName: (props) => props?.nombre?.toString() ?? props?.denominaci?.toString() ?? null,
  },
  {
    layerName: "MTC_pg:terminal_portuario_dic18",
    infraType: "terminal_portuario",
    parseName: (props) => props?.nombre?.toString() ?? props?.denominaci?.toString() ?? null,
  },
  {
    layerName: "MTC_gis:linea_ferrea_dic15",
    infraType: "linea_ferrea",
    parseName: (props) => props?.nombre?.toString() ?? props?.descripcio?.toString() ?? null,
  },
  {
    layerName: "MTC_gis:estacion_ferroviaria",
    infraType: "estacion_ferroviaria",
    parseName: (props) => props?.nombre?.toString() ?? props?.denominaci?.toString() ?? null,
  },
  {
    layerName: "MTC_pg:pesaje_dic16",
    infraType: "estacion_pesaje",
    parseName: (props) => props?.nombre?.toString() ?? props?.denominaci?.toString() ?? null,
  },
  {
    layerName: "MTC_pg:peajes_2024_2025",
    infraType: "peaje",
    parseName: (props) => props?.nombre?.toString() ?? props?.denominaci?.toString() ?? null,
  },
];
```

---

## 4. Patrón de ingesta

### 4.1 Opción elegida: B (cache → TypeScript)

| Opción | Pros | Cons |
|--------|------|------|
| A: subprocess Python | Reutiliza código existente | Acoplamiento, IP del MTC en CI |
| **B: cache → TypeScript** | **Clean separation, testable** | **Requiere чеache pre-poblado** |
| C: reescribir en TS | Todo en TypeScript | Duplica código WFS, trabajo innecesario |

**Flujo recomendado:**

```
┌─────────────────────────────────────────────────────────────────┐
│  CI/CD o cron job                                               │
│                                                                  │
│  1. python -m tools.scrapers.scripts.mtc_geoserver               │
│     → descarga GeoJSONs a cache/mtc_geoserver/                  │
│                                                                  │
│  2. npx tsx api/src/ingest/run-infrastructure.ts --mtc          │
│     → lee cache/*.geojson                                       │
│     → upsert en PostGIS                                         │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Extensión de `ingest-infrastructure.ts`

```typescript
// apps/ceplan-geo/api/src/ingest/ingest-infrastructure.ts

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { FeatureCollection } from "geojson";

// ── Configuración de fuentes ──
export type LayerSource =
  | { type: "geoserver"; config: InfrastructureLayerConfig }
  | { type: "cache"; config: InfrastructureLayerConfig; cacheDir: string };

// ── Función para leer desde cache ──
async function ingestFromCache(
  config: InfrastructureLayerConfig,
  cacheDir: string
): Promise<InfrastructureIngestSummary> {
  const client = await pool.connect();
  let accepted = 0;
  let rejected = 0;

  try {
    await client.query("BEGIN");
    const layerId = await ensureLayer(client, config.layerName);

    // Buscar archivo GeoJSON más reciente en cache
    const files = readdirSync(cacheDir)
      .filter((f) => f.endsWith(".geojson") && f.startsWith(config.layerName.split(":")[1]))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.warn(`[cache] No se encontró GeoJSON para ${config.layerName}`);
      return { layerName: config.layerName, infraType: config.infraType, accepted: 0, rejected: 0 };
    }

    const geojson = JSON.parse(readFileSync(join(cacheDir, files[0]), "utf-8")) as FeatureCollection;

    for (const feature of geojson.features) {
      if (!feature.geometry) { rejected += 1; continue; }

      const name = config.parseName(feature.properties ?? null);
      if (!name) { rejected += 1; continue; }

      const { featureId, geometryJson } = geometryJsonFromFeature(feature, accepted + rejected);
      await upsertGeoFeature(client, layerId, feature, featureId);
      await upsertInfrastructure(client, {
        infraType: config.infraType,
        name,
        geometryJson,
        properties: feature.properties ?? {},
        sourceLayerId: layerId,
        featureId,
      });
      accepted += 1;
    }

    await touchLayerIngested(client, layerId, accepted);
    await client.query("COMMIT");
    return { layerName: config.layerName, infraType: config.infraType, accepted, rejected };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Runner principal ──
export async function runInfrastructureIngest(
  configs: InfrastructureLayerConfig[] = CLASSIC_LAYERS,
  options: { useCache?: boolean; cacheDir?: string } = {}
): Promise<InfrastructureIngestSummary[]> {
  const summaries: InfrastructureIngestSummary[] = [];

  for (const config of configs) {
    if (options.useCache) {
      // Opción B: leer desde cache (scripts Python ya descargaron)
      summaries.push(await ingestFromCache(config, options.cacheDir ?? DEFAULT_MTC_CACHE_DIR));
    } else {
      // Opción original: descargar directo del Geoserver CEPLAN
      const geoserver = new GeoserverClient();
      summaries.push(await ingestInfrastructureLayer(geoserver, config));
    }
  }

  return summaries;
}

// Constante para uso en scripts
export const DEFAULT_MTC_CACHE_DIR = join(process.cwd(), "cache", "mtc_geoserver");
```

### 4.3 CLI extendido

```typescript
// apps/ceplan-geo/api/src/ingest/run-infrastructure.ts

import { runInfrastructureIngest } from "./ingest-infrastructure.js";
import { MTC_LAYER_CONFIG } from "./ingest-infrastructure.js";

const args = process.argv.slice(2);

if (args.includes("--mtc")) {
  console.log("[MTC] Ejecutando ingesta de capas MTC Geoserver...");
  const results = await runInfrastructureIngest(MTC_LAYER_CONFIG, {
    useCache: true,
    cacheDir: DEFAULT_MTC_CACHE_DIR,
  });
  console.table(results);
} else {
  // Comportamiento original: CEPLAN
  await runInfrastructureIngest();
}
```

---

## 5. Nuevos endpoints API

### 5.1 Extensión de `GET /api/infrastructure`

```typescript
// apps/ceplan-geo/api/src/routes/infrastructure.ts

const InfrastructureQuerySchema = z.object({
  type: z.enum(INFRA_TYPE_VALUES).optional(),
  departamento: z
    .string()
    .regex(/^\d{2}$/, "Código INEI de 2 dígitos")
    .optional(),
  geometry_type: z.enum(["Point", "LineString"]).optional(), // filtro adicional
  limit: z.coerce.number().min(1).max(5000).default(1000),
});
```

**Query mejorada:**

```sql
-- apps/ceplan-geo/api/src/routes/infrastructure.ts

const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

const { rows } = await pool.query(
  `SELECT infra_type,
          geometry_type,  -- nueva columna derivada
          name,
          properties,
          ST_AsGeoJSON(geometry) AS geometry_geojson,
          ST_Length(geometry::geography) / 1000 AS length_km  -- solo para LineString
   FROM infrastructure
   ${where}
   ORDER BY name
   LIMIT $${params.length + 1}`,
  [...params, parsed.limit]
);
```

### 5.2 Nuevo endpoint: red vial por departamento

```
GET /api/infrastructure/vial?departamento=13&tipo=nacional
```

```typescript
// apps/ceplan-geo/api/src/routes/infrastructure.ts

infrastructureRouter.get(
  "/vial",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(VialQuerySchema, req.query, res);
    if (!parsed) return;

    const params: unknown[] = [parsed.departamento];
    const conditions = [`properties->>'iddpto' = $1`];

    if (parsed.tipo) {
      params.push(parsed.tipo);
      conditions.push(`infra_type = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT infra_type,
              name,
              properties,
              ST_AsGeoJSON(geometry) AS geometry_geojson,
              ST_Length(geometry::geography) / 1000 AS length_km,
              properties->>'cond_fis' AS condicion_fisica,
              properties->>'superficie' AS superficie
       FROM infrastructure
       WHERE ${conditions.join(" AND ")}
         AND infra_type LIKE 'red_vial_%'
       ORDER BY properties->>'iddpto', properties->>'cod_via'`,
      params
    );

    res.json({
      departamento: parsed.departamento,
      tipo: parsed.tipo ?? "todos",
      resultados: rows,
      metrica: "longitud_km_total",
      longitud_total_km: rows.reduce((sum, r) => sum + (Number(r.length_km) || 0), 0),
    });
  })
);
```

### 5.3 Cruce con INFOBRAS (obras cerca de infraestructura)

```
GET /api/infrastructure/cruce?type=terminal_terrestre&departamento=13
```

**Concepto:** Cruzar ubicación de infraestructura MTC con obras INFOBRAS/BNG para identificar brechas.

```typescript
// apps/ceplan-geo/api/src/routes/infrastructure.ts

infrastructureRouter.get(
  "/cruce",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(CruceQuerySchema, req.query, res);
    if (!parsed) return;

    // Cruce: terminal_terrestre + obras INFOBRAS en radio de 10km
    const { rows } = await pool.query(
      `SELECT
         i.infra_type,
         i.name AS infraestructura,
         i.geometry AS infra_geom,
         COALESCE(bng.codigo_snip, bng.codigo_unico) AS obra_codigo,
         bng.nombre_proyecto AS obra_nombre,
         bng.monto_inversion,
         ST_Distance(i.geometry::geography, ST_Centroid(bng.geometry)::geography) / 1000 AS distancia_km
       FROM infrastructure i
       LEFT JOIN infobras_bng bng
         ON ST_DWithin(i.geometry::geography, ST_Centroid(bng.geometry)::geography, 10000)
       WHERE i.infra_type = $1
         AND i.properties->>'iddpto' = $2
       ORDER BY distancia_km`,
      [parsed.type, parsed.departamento]
    );

    res.json({
      tipo_infra: parsed.type,
      departamento: parsed.departamento,
      resultados: rows,
      nota: "JOIN con INFOBRAS/BNG es opcional. Si la tabla no existe, retorna infraestructura sin obras.",
    });
  })
);
```

---

## 6. Índices recomendados para queries con red vial

```sql
-- apps/ceplan-geo/api/src/db/migrations/012_mtc_geoserver_infrastructure.sql

-- Índice para queries de red vial por departamento (uso frecuente)
CREATE INDEX IF NOT EXISTS idx_infrastructure_vial_dpto
  ON infrastructure (infra_type, (properties->>'iddpto'))
  WHERE infra_type LIKE 'red_vial_%';

-- Índice para buscar vías por código (útil para cruces con proyectos)
CREATE INDEX IF NOT EXISTS idx_infrastructure_vial_code
  ON infrastructure ((properties->>'cod_via'))
  WHERE infra_type LIKE 'red_vial_%';

-- Partición lógica por geometry_type (Postgres puede usar esto en queries)
-- Nota: no requiere物理 partitioning, solo ayuda al planner
CREATE INDEX IF NOT EXISTS idx_infrastructure_geometry_type
  ON infrastructure (geometry_type, infra_type);
```

---

## 7. Checklist de implementación

| # | Tarea | Prioridad |
|---|-------|-----------|
| 1 | Crear migración `012_mtc_geoserver_infrastructure.sql` | 🔴 Alta |
| 2 | Actualizar `layers.ts` con tipos MTC | 🔴 Alta |
| 3 | Extender `ingest-infrastructure.ts` con `ingestFromCache()` | 🔴 Alta |
| 4 | Agregar capas MTC a `CLASSIC_LAYERS` / `MTC_LAYER_CONFIG` | 🔴 Alta |
| 5 | Crear CLI `run-infrastructure.ts --mtc` | 🟡 Media |
| 6 | Extender endpoint `GET /api/infrastructure` con `geometry_type` | 🟡 Media |
| 7 | Crear endpoint `GET /api/infrastructure/vial` | 🟡 Media |
| 8 | Crear endpoint `GET /api/infrastructure/cruce` | 🟢 Baja |
| 9 | Ejecutar `python -m tools.scrapers.scripts.mtc_geoserver` locally para poblar cache | 🟡 Media |
| 10 | Test de ingesta con 1 capa (terminal_terrestre, ~350 features) | 🔴 Alta |

---

## 8. Caveats已知

1. **Bloqueo por IP:** El Geoserver MTC (`mtcgeo2.mtc.gob.pe`) está bloqueado desde redes externas. La ingesta debe ejecutarse desde una IP peruana o el script Python debe descargarse manualmente en un entorno con acceso.

2. **Red vial (~230k features):** La ingesta de las 3 capas de red vial puede tomar 30-60 minutos según conexión. Considerar ejecutar en background con `run_in_background: true`.

3. **Actualización trimestral:** Las capas `peajes_2024_2025` son trimestrales. Agregar al cron de actualización.

4. **Coordenadas:** Todas las capas usan SRID 4326 (WGS84). No se requiere reproyección.

5. **Propiedades inconsistentes:** Los nombres de propiedades varían entre capas MTC (ej. `nombre`, `des_via`, `denominaci`). El `parseName` es heurístico; revisar los primeros 10 features de cada capa antes de producción.

---

## 9. Referencias

- Script Python: `tools/scrapers/scripts/mtc_geoserver.py`
- Ingesta actual: `apps/ceplan-geo/api/src/ingest/ingest-infrastructure.ts`
- Migraciones: `apps/ceplan-geo/api/src/db/migrations/`
- WFS MTC: `http://mtcgeo2.mtc.gob.pe:8080/geoserver/`
- Catálogo de capas: ver `mtc_geoserver.py` líneas 79-180
