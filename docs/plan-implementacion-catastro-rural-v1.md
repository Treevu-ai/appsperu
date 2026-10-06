# Plan de Implementación: Catastro Rural - SERFOR OCAPAS_MIDAGRI

## Resumen

**Fase**: 1 - SERFOR OCAPAS_MIDAGRI (Comunidades Campesinas/Nativas)
**Prioridad**: Alta
**Viabilidad**: Recomendada (MaxRecordCount=1M, sin paginación necesaria)
**Estimación**: 2-3 días de desarrollo

---

## 1. Arquitectura

### 1.1 Decisión: Nueva App vs Extensión

**Opción A: Nueva app `catastro-rural`**
- Pros: Independencia, separación clara de dominios
- Contras: Overhead de setup (docker-compose, package.json, etc.)

**Opción B: Extender `geo-intersections`**
- Pros: Reutiliza pool PostGIS existente, ya maneja geometrías, consistencia
- Contras: Mezcla dominios (minero/forestal + rural)

**Recomendación**: **Opción B - Extender `geo-intersections`**
- Ya tiene pool PostGIS configurado
- Ya tiene patrones de manejo de geometrías
- Mismo tipo de datos (polígonos geoespaciales)
- Menor overhead de setup

### 1.2 Estructura de archivos

```
apps/geo-intersections/api/src/
├── ingest/
│   ├── replicate-geometries.ts         # Existente (INGEMMET + SERFOR forestal)
│   ├── ocapas-connector.ts             # NUEVO - Conector SERFOR OCAPAS
│   └── normalize-ocapas.ts             # NUEVO - Normalizador
├── db/
│   ├── migrations/
│   │   ├── 001_init.sql                # Existente
│   │   ├── 002_fix_serfor_types.sql    # Existente
│   │   └── 003_rural_communities.sql   # NUEVO
│   └── pool.ts                         # Existente
└── routes/
    ├── index.ts                        # Existente
    └── rural-communities.ts            # NUEVO - Endpoints API
```

---

## 2. Schema de Base de Datos

### 2.1 Tabla principal: `rural_communities`

```sql
-- apps/geo-intersections/api/src/db/migrations/003_rural_communities.sql

CREATE TABLE IF NOT EXISTS rural_communities (
  id BIGSERIAL PRIMARY KEY,
  capa TEXT NOT NULL, -- 'comunidades_campesinas' o 'comunidades_nativas'
  objectid INTEGER NOT NULL,
  nombre TEXT, -- nomcom
  departamento TEXT, -- depar
  provincia TEXT, -- provi
  distrito TEXT, -- distr
  area_ha NUMERIC, -- Aarea (confirmado en hectáreas)
  perimetro NUMERIC, -- sin fuente confiable en metros; queda NULL
  titulo TEXT, -- titcom (solo comunidades_nativas)
  zona_utm INTEGER, -- sin fuente; la API no expone zona UTM para estas capas
  coordenada_x NUMERIC, -- centroide_e
  coordenada_y NUMERIC, -- centroide_n
  geometry GEOMETRY(Polygon, 4326),
  area_km2 NUMERIC GENERATED ALWAYS AS (ST_Area(geometry::geography) / 1_000_000) STORED,
  atributos_extra JSONB,
  source_batch_id BIGINT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (capa, objectid)
);

CREATE INDEX IF NOT EXISTS idx_rural_communities_capa ON rural_communities(capa);
CREATE INDEX IF NOT EXISTS idx_rural_communities_departamento ON rural_communities(departamento);
CREATE INDEX IF NOT EXISTS idx_rural_communities_geometry ON rural_communities USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_rural_communities_batch ON rural_communities(source_batch_id);
```

### 2.2 Tabla de batches: `raw_ocapas_batches`

```sql
CREATE TABLE IF NOT EXISTS raw_ocapas_batches (
  id BIGSERIAL PRIMARY KEY,
  source_url TEXT NOT NULL,
  capa TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_ocapas_batches_capa ON raw_ocapas_batches(capa);
```

### 2.3 Tabla de rechazos: `rural_communities_rejected`

```sql
CREATE TABLE IF NOT EXISTS rural_communities_rejected (
  id BIGSERIAL PRIMARY KEY,
  source_batch_id BIGINT NOT NULL,
  raw_row JSONB NOT NULL,
  reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rural_communities_rejected_batch ON rural_communities_rejected(source_batch_id);
```

---

## 3. Conector: `ocapas-connector.ts`

### 3.1 Configuración

```typescript
// apps/geo-intersections/api/src/ingest/ocapas-connector.ts

const OCAPAS_BASE = "https://geo.serfor.gob.pe/geoservicios/rest/services/Visor/OCAPAS_MIDAGRI/MapServer";

const LAYERS: Record<string, number> = {
  comunidades_campesinas: 26,
  comunidades_nativas: 27,
  // Opcional: capas por departamento
  predios_amazonas: 1,
  predios_ancash: 2,
  predios_apurimac: 3,
  predios_arequipa: 4,
  predios_ayacucho: 5,
  predios_cajamarca: 6,
  predios_callao: 7,
  predios_cusco: 8,
  predios_huancavelica: 9,
  predios_huanuco: 10,
  predios_ica: 11,
  predios_junin: 12,
  predios_la_libertad: 13,
  predios_lambayeque: 14,
  predios_lima: 15,
  predios_loreto: 16,
  predios_madre_de_dios: 17,
  predios_moquegua: 18,
  predios_pasco: 19,
  predios_piura: 20,
  predios_puno: 21,
  predios_san_martin: 22,
  predios_tacna: 23,
  predios_tumbes: 24,
  predios_ucayali: 25,
};

const INSERT_BATCH_SIZE = 1000;
```

### 3.2 Interfaces

```typescript
interface ArcGISFeature {
  attributes: Record<string, unknown>;
  geometry: { rings: number[][][] };
}

interface ArcGISResponse {
  features?: ArcGISFeature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

interface CanonicalCommunity {
  capa: string;
  objectid: number;
  nombre: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  area_ha: number | null;
  perimetro: number | null;
  titulo: string | null;
  zona_utm: number | null;
  coordenada_x: number | null;
  coordenada_y: number | null;
  geometry: string; // GeoJSON Polygon
  atributos_extra: Record<string, unknown> | null;
}

interface RejectedRow {
  raw: ArcGISFeature;
  reason: string;
}
```

### 3.3 Función principal de fetch

```typescript
async function fetchLayerFeatures(capa: string, layerId: number): Promise<ArcGISFeature[]> {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  });

  const url = `${OCAPAS_BASE}/${layerId}/query?${params.toString()}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw new Error(`SERFOR OCAPAS devolvió ${res.status} al consultar capa "${capa}"`);
  }

  const payload = (await res.json()) as ArcGISResponse;
  if (payload.error) {
    throw new Error(`SERFOR OCAPAS devolvió error ${payload.error.code}: ${payload.error.message}`);
  }
  if (!Array.isArray(payload.features)) {
    throw new Error(`SERFOR OCAPAS devolvió respuesta sin "features" para capa "${capa}"`);
  }

  // Con MaxRecordCount=1M, no debería haber exceededTransferLimit, pero verificamos
  if (payload.exceededTransferLimit === true) {
    throw new Error(
      `SERFOR OCAPAS devolvió exceededTransferLimit=true para capa "${capa}" -- ` +
        "agregar paginación por resultOffset/resultRecordCount"
    );
  }

  return payload.features;
}
```

### 3.4 Función de ingesta por capa

```typescript
async function ingestCapa(capa: string, layerId: number, client: PoolClient) {
  const features = await fetchLayerFeatures(capa, layerId);
  const { rows, rejected } = normalizeOcapasFeatures(features, capa);

  // Guardar batch
  const batchRes = await client.query<{ id: number }>(
    `INSERT INTO raw_ocapas_batches (source_url, capa, record_count)
     VALUES ($1, $2, 0) RETURNING id`,
    [`${OCAPAS_BASE}/${layerId}/query`, capa]
  );
  const batchId = batchRes.rows[0].id;

  // Advisory lock para serializar
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('rural_communities_ingest'), hashtext($1))",
    [capa]
  );

  // Snapshot completo: borrar y reinsertar
  await client.query("DELETE FROM rural_communities WHERE capa = $1", [capa]);

  // Insertar en lotes
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    await insertBatch(client, batchId, rows.slice(i, i + INSERT_BATCH_SIZE));
  }

  // Insertar rechazos
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO rural_communities_rejected (source_batch_id, raw_row, reason)
       VALUES ($1, $2, $3)`,
      [batchId, JSON.stringify(bad.raw), bad.reason]
    );
  }

  // Actualizar record_count
  await client.query(
    "UPDATE raw_ocapas_batches SET record_count = $1 WHERE id = $2",
    [features.length, batchId]
  );

  return {
    capa,
    batchId,
    filasOrigen: features.length,
    filasInsertadas: rows.length,
    filasRechazadas: rejected.length,
  };
}
```

### 3.5 Función principal

```typescript
export async function ingestOcapas(capas?: string[]) {
  const capasAIngerir = capas || Object.keys(LAYERS);
  const resultados = [];
  const errores = [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const capa of capasAIngerir) {
      if (!(capa in LAYERS)) {
        errores.push(`${capa}: capa no definida en LAYERS`);
        continue;
      }

      try {
        const layerId = LAYERS[capa];
        const resultado = await ingestCapa(capa, layerId, client);
        resultados.push(resultado);
      } catch (error) {
        errores.push(`${capa}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (errores.length > 0) {
      throw new Error(`Fallaron ${errores.length} capa(s): ${errores.join("; ")}`);
    }

    await client.query("COMMIT");
    return { capas: resultados };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
```

---

## 4. Normalizador: `normalize-ocapas.ts`

> ⚠️ **Actualización 2026-10-06**: la v1 de este plan asumía el schema de campos de las
> capas de predios por departamento (`NOMPRE`, `AREA`, `UBIDIS` como string distrital,
> `PERIME`, `TITULO`, `ZUTM`, `COORX`/`COORY`). Al consultar en vivo las capas 26
> (comunidades_campesinas) y 27 (comunidades_nativas) — que son las que implementa esta
> Fase 1 — el schema real es distinto. Ver el mapeo corregido abajo y el data contract
> actualizado en la sección 7.

### 4.1 Schema real confirmado (capas 26 y 27, consultado en vivo)

Campos comunes a ambas capas: `nomcom`, `painre`, `ofinre`, `depar`, `provi`, `distr`,
`ubidis` (código UBIGEO distrital, ej. `"160301"` — no un nombre), `OBJECTID`, `gml_id`,
`feinre`, `Aarea` (área **en hectáreas**, confirmado comparando contra `SHAPE.STArea()`
convertido a km²), `centroide_e`/`centroide_n` (coordenadas), `accion`, `fecha_carga`.

- `comunidades_nativas` (27) además trae: `prodem`, `restit`, `titcom` (título comunal),
  `codigo`, `fereti`, `fectit`.
- `comunidades_campesinas` (26) además trae: `OBJECTID_WFS`, `prodes`.
- **No existe** `ZUTM`, `COORX`/`COORY`, `PERIME`, `TITULO` ni `NOMPRE` en ninguna de las
  dos capas — `depar`/`provi`/`distr` ya vienen como columnas separadas, no requieren
  parseo de `ubidis`.

### 4.2 Función de normalización

```typescript
// apps/geo-intersections/api/src/ingest/normalize-ocapas.ts

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const FIXED_KEYS = new Set([
  "OBJECTID", "nomcom", "depar", "provi", "distr", "Aarea",
  "centroide_e", "centroide_n", "titcom",
  "SHAPE.STArea()", "SHAPE.STLength()", "Shape",
]);

export function normalizeOcapasFeatures(
  features: readonly ArcGISFeature[],
  capa: string
): { rows: CanonicalCommunity[]; rejected: RejectedRow[] } {
  const rows: CanonicalCommunity[] = [];
  const rejected: RejectedRow[] = [];

  for (const f of features) {
    const a = f.attributes;

    const objectid = a.OBJECTID as number | null;
    if (objectid == null) {
      rejected.push({ raw: f, reason: "OBJECTID ausente" });
      continue;
    }

    if (!f.geometry?.rings || !Array.isArray(f.geometry.rings) || f.geometry.rings.length === 0) {
      rejected.push({ raw: f, reason: "geometry.rings ausente o vacío" });
      continue;
    }

    const rings = f.geometry.rings.map((ring) => {
      if (ring.length < 3) return ring;
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        return [...ring, [...first]];
      }
      return ring;
    });

    const geojson = JSON.stringify({ type: "Polygon", coordinates: rings });

    const atributosExtra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(a)) {
      if (!FIXED_KEYS.has(k)) atributosExtra[k] = v;
    }

    rows.push({
      capa,
      objectid,
      nombre: trimOrNull(a.nomcom),
      departamento: trimOrNull(a.depar),
      provincia: trimOrNull(a.provi),
      distrito: trimOrNull(a.distr),
      area_ha: typeof a.Aarea === "number" ? a.Aarea : null,
      perimetro: null, // SHAPE.STLength() viene en grados; sin campo de perímetro en metros en la fuente
      titulo: trimOrNull(a.titcom), // solo existe en comunidades_nativas (capa 27)
      zona_utm: null, // la fuente no expone zona UTM para estas capas
      coordenada_x: typeof a.centroide_e === "number" ? a.centroide_e : null,
      coordenada_y: typeof a.centroide_n === "number" ? a.centroide_n : null,
      geometry: geojson,
      atributos_extra: Object.keys(atributosExtra).length > 0 ? atributosExtra : null,
    });
  }

  return { rows, rejected };
}
```

---

## 5. Endpoints API: `rural-communities.ts`

### 5.1 GET /api/communities

```typescript
// apps/geo-intersections/api/src/routes/rural-communities.ts

import { Router } from "express";
import { pool } from "../db/pool.js";

const router = Router();

// GET /api/communities?capa=comunidades_campesinas&departamento=LA LIBERTAD
router.get("/", async (req, res) => {
  const { capa, departamento, limit = "100", offset = "0" } = req.query;

  let query = "SELECT * FROM rural_communities WHERE 1=1";
  const params: unknown[] = [];
  let paramIndex = 1;

  if (capa) {
    query += ` AND capa = $${paramIndex++}`;
    params.push(capa);
  }

  if (departamento) {
    query += ` AND departamento ILIKE $${paramIndex++}`;
    params.push(`%${departamento}%`);
  }

  query += ` ORDER BY nombre LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(parseInt(limit as string), parseInt(offset as string));

  const result = await pool.query(query, params);
  res.json(result.rows);
});

// GET /api/communities/:objectid
router.get("/:objectid", async (req, res) => {
  const { objectid } = req.params;
  const result = await pool.query(
    "SELECT * FROM rural_communities WHERE objectid = $1",
    [objectid]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Comunidad no encontrada" });
  }
  res.json(result.rows[0]);
});

// GET /api/communities/intersect?geometry=<geojson>
router.get("/intersect", async (req, res) => {
  const { geometry } = req.query;
  if (!geometry) {
    return res.status(400).json({ error: "Se requiere parámetro geometry" });
  }

  const result = await pool.query(
    `SELECT * FROM rural_communities
     WHERE ST_Intersects(geometry, ST_GeomFromGeoJSON($1))
     ORDER BY nombre`,
    [geometry]
  );
  res.json(result.rows);
});

export default router;
```

### 5.2 Integración en `index.ts`

```typescript
// apps/geo-intersections/api/src/index.ts

import ruralCommunitiesRoutes from "./routes/rural-communities.js";

app.use("/api/communities", ruralCommunitiesRoutes);
```

---

## 6. Scripts de package.json

```json
{
  "scripts": {
    "ingest:ocapas": "tsx src/ingest/ocapas-connector.ts",
    "ingest:ocapas:comunidades": "tsx src/ingest/ocapas-connector.ts comunidades_campesinas comunidades_nativas",
    "ingest:ocapas:predios-la-libertad": "tsx src/ingest/ocapas-connector.ts predios_la_libertad"
  }
}
```

---

## 7. Data Contract

Crear `docs/data-contracts/serfor-ocapas-comunidades.md`:

```markdown
# Data Contract — SERFOR OCAPAS: Comunidades Campesinas/Nativas

## Fuente
- URL: https://geo.serfor.gob.pe/geoservicios/rest/services/Visor/OCAPAS_MIDAGRI/MapServer
- Capas: 26 (Comunidades Campesinas), 27 (Comunidades Nativas)
- Formato: ArcGIS REST API (JSON/GeoJSON)

## Estado
- Confirmado en vivo: 2026-10-06
- MaxRecordCount: 1,000,000
- Sin paginación necesaria

## Campos (confirmados en vivo, 2026-10-06)
Comunes a ambas capas (26 y 27):
- OBJECTID: Clave primaria
- nomcom: Nombre de la comunidad
- depar, provi, distr: Departamento/provincia/distrito (ya separados, sin parseo)
- ubidis: Código UBIGEO distrital (ej. "160301"), no un nombre — se guarda en atributos_extra
- Aarea: Área **en hectáreas** (confirmado contra SHAPE.STArea() convertido a km²)
- centroide_e, centroide_n: Coordenadas del centroide
- Shape: Geometría del polígono

Solo en comunidades_nativas (27):
- titcom: Título comunal (resolución, ej. "058-2016-GRL-DRA-L")
- codigo, fereti, fectit, prodem, restit

Solo en comunidades_campesinas (26):
- OBJECTID_WFS, prodes

No existen en ninguna capa: NOMPRE, AREA, PERIME, TITULO, ZUTM, COORX, COORY
(esos nombres pertenecen a las capas de predios por departamento, IDs 1-25).

## Limitaciones
- No es la fuente oficial de MIDAGRI (réplica en SERFOR)
- No incluye información de productores (RUC/DNI)
- Sin vínculo directo con PPA
- Sin perímetro en metros ni zona UTM en la fuente (se puede derivar perímetro vía
  `ST_Perimeter(geometry::geography)` si se necesita)

## Cruces
- Cruzable con ejecución presupuestal por geometría (ST_Intersects)
- Cruzable con proyectos de inversión por territorio
```

---

## 8. Testing

### 8.1 Tests unitarios

```typescript
// apps/geo-intersections/api/src/__tests__/ocapas-connector.test.ts

import { describe, it, expect } from "vitest";
import { normalizeOcapasFeatures } from "../ingest/normalize-ocapas.js";

describe("normalizeOcapasFeatures", () => {
  it("debería normalizar features válidos", () => {
    const features = [
      {
        attributes: {
          OBJECTID: 1,
          NOMPRE: "Comunidad Test",
          UBIDIS: "LA LIBERTAD",
          AREA: 100.5,
          PERIME: 50.2,
        },
        geometry: {
          rings: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        },
      },
    ];

    const { rows, rejected } = normalizeOcapasFeatures(features, "comunidades_campesinas");

    expect(rows).toHaveLength(1);
    expect(rejected).toHaveLength(0);
    expect(rows[0].objectid).toBe(1);
    expect(rows[0].nombre).toBe("Comunidad Test");
  });

  it("debería rechazar features sin OBJECTID", () => {
    const features = [
      {
        attributes: {},
        geometry: { rings: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      },
    ];

    const { rows, rejected } = normalizeOcapasFeatures(features, "comunidades_campesinas");

    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe("OBJECTID ausente");
  });
});
```

### 8.2 Test de integración

```bash
# Correr migración
npm run migrate

# Ingerir una capa de prueba
npm run ingest:ocapas:comunidades

# Verificar datos
psql -d geo_intersections -c "SELECT COUNT(*) FROM rural_communities;"
psql -d geo_intersections -c "SELECT COUNT(*) FROM rural_communities_rejected;"
```

---

## 9. Checklist de Implementación

- [ ] Crear migración `003_rural_communities.sql`
- [ ] Crear `ocapas-connector.ts`
- [ ] Crear `normalize-ocapas.ts`
- [ ] Crear `rural-communities.ts` (rutas)
- [ ] Integrar rutas en `index.ts`
- [ ] Agregar scripts a `package.json`
- [ ] Crear data contract `serfor-ocapas-comunidades.md`
- [ ] Escribir tests unitarios
- [ ] Correr migración en desarrollo
- [ ] Ingerir datos de prueba (capa 26 o 27)
- [ ] Verificar geometrías en PostGIS
- [ ] Probar endpoints API
- [ ] Documentar en `docs/conectores.md`

---

## 10. Estimación de Tiempo

| Tarea | Estimación |
|-------|-----------|
| Migración de base de datos | 30 min |
| Conector `ocapas-connector.ts` | 2 horas |
| Normalizador `normalize-ocapas.ts` | 1 hora |
| Rutas API `rural-communities.ts` | 1 hora |
| Integración y scripts | 30 min |
| Data contract | 30 min |
| Tests | 1 hora |
| Pruebas de integración | 1 hora |
| **Total** | **7-8 horas (~1 día)** |

---

## 11. Riesgos y Mitigaciones

### Riesgo 1: Schema diferente por capa
**Descripción**: Las capas de Comunidades Campesinas/Nativas pueden tener campos diferentes a los predios por departamento

**Mitigación**:
- Implementar normalizador genérico que extrae campos fijos conocidos
- Guardar campos extra en `atributos_extra` (JSONB)
- Hacer query de prueba a cada capa antes de implementar

### Riesgo 2: Geometrías inválidas
**Descripción**: Algunos polígonos pueden ser self-intersecting o inválidos

**Mitigación**:
- Usar `ST_MakeValid()` al insertar (ya implementado en patrón existente)
- Guardar geometrías rechazadas en tabla de rechazos
- Calcular áreas después de validar geometrías

### Riesgo 3: Servicio caído o lento
**Descripción**: SERFOR OCAPAS puede estar caído o responder lentamente

**Mitigación**:
- Usar timeout de 60s (ya implementado)
- Implementar reintentos con backoff exponencial
- Guardar logs de errores en tabla de batches

### Riesgo 4: MaxRecordCount insuficiente
**Descripción**: A pesar de 1M, alguna capa puede exceder el límite

**Mitigación**:
- Verificar `exceededTransferLimit` después de cada query
- Si es true, implementar paginación por resultOffset
- Este caso es poco probable pero está considerado

---

## 12. Próximos Pasos

1. **Aprobación del plan**: Revisar con el equipo y aprobar la arquitectura
2. **Implementación**: Seguir el checklist de implementación
3. **Pruebas**: Ingerir datos de prueba y validar
4. **Documentación**: Actualizar `docs/conectores.md` con la nueva fuente
5. **MCP Server**: Registrar handlers en el MCP server si es necesario
6. **Producción**: Desplegar a producción y monitorear

---

## 13. Referencias

- Investigación completa: `docs/investigacion-agro-digital-2026-10-06.md`
- Patrón SERFOR: `apps/catastro-forestal/api/src/ingest/serfor-connector.ts`
- Patrón Geometrías: `apps/geo-intersections/api/src/ingest/replicate-geometries.ts`
- Data contract SERFOR: `docs/data-contracts/serfor-catastro-forestal.md`
