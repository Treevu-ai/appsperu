# Arquitectura: Ingesta OSITRAN → infraestructura-mtc

## Contexto

El scraper `tools/scrapers/scripts/ositran_data.py` genera:

- **`cache/ositran_data/manifest_YYYY-MM-DD.json`** — índice de todos los reportes scrapeados en esa corrida
- **`cache/ositran_data/{code:03d}_{slug}_{date}.json`** — datos de cada reporte individual

Cada archivo JSON sigue la estructura `ReportResult` (dataclass Python):

```json
{
  "code": 1,
  "slug": "info",
  "section": "aeropuertos",
  "label": "Aeropuertos - Información",
  "url": "https://.../reporte.jsp?code=1",
  "success": true,
  "tables_count": 1,
  "rows_count": 42,
  "cols_count": 12,
  "headers": ["Aeropuerto", "Región", "Concesionaria", ...],
  "data": [{ "Aeropuerto": "Jorge Chávez", "Región": "Lima", ... }, ...],
  "error": "",
  "duration_sec": 3.2,
  "scraped_at": "2026-09-24T00:00:00+00:00"
}
```

El conector TypeScript consume el manifest más reciente y sus archivos asociados, e ingiere cada reporte en su tabla PostgreSQL correspondiente.

---

## Convenciones heredadas de los conectores existentes

| Aspecto | Patrón |
|---|---|
| **Upsert** | `ON CONFLICT (natural_key, fecha_corte) DO UPDATE` |
| **Tracking** | Tabla `raw_*_batches` con `source_url`, `checksum`, `record_count`, `fetched_at` |
| **Rechazados** | Tabla `{tabla}_rejected` con `source_batch_id`, `raw_row JSONB`, `reason` |
| **Batch** | `BEGIN` → insert batch → `COMMIT` / `ROLLBACK` en error |
| **Checksum** | `sha256` del JSON original (stringificado con indent) |
| **Fecha corte** | Extraída del nombre del archivo: `{date}` |
| **Normalización** | Funciones `toText`, `toDecimal`, `toBooleanFromFlag` |
| **Encoding** | UTF-8 (el scraper Python escribe JSON con `ensure_ascii=False`) |

---

## 1. Manifest y tracking

### Tabla: `raw_ositran_batches`

```sql
CREATE TABLE IF NOT EXISTS raw_ositran_batches (
  id              BIGSERIAL PRIMARY KEY,
  dataset         TEXT NOT NULL DEFAULT 'ositran',
  source_url      TEXT NOT NULL,          -- URL del manifest o "local://{filename}"
  checksum        TEXT NOT NULL,          -- sha256 del manifest JSON
  record_count    INTEGER NOT NULL,       -- cantidad de reportes en el manifest
  scraped_at      TIMESTAMPTZ NOT NULL,   -- scraped_at del manifest (no ahora)
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Tabla: `ositran_manifest`

Almacena el catálogo de códigos OSITRAN. Se upsertea con cada ingesta para mantener la referencia de `section`, `slug`, `label` actualizadas.

```sql
CREATE TABLE IF NOT EXISTS ositran_manifest (
  id              BIGSERIAL PRIMARY KEY,
  code            INTEGER NOT NULL,        -- 1-59
  slug            TEXT NOT NULL,
  section         TEXT NOT NULL,           -- aeropuertos | carreteras | metro | puertos
                                           -- inversiones | reclamos | puentes | atencion | integridad
  label           TEXT NOT NULL,
  url             TEXT NOT NULL,
  scraped_at      TIMESTAMPTZ NOT NULL,   -- de este manifest
  source_batch_id BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (code, scraped_at)
);

-- Índice para lookup rápido por código (último scrape)
CREATE INDEX IF NOT EXISTS idx_ositran_manifest_code ON ositran_manifest (code);
```

### Tabla: `ositran_scrape_results`

Resultado de cada reporte individual. Útil para auditing y detectar cambios en estructura de columnas.

```sql
CREATE TABLE IF NOT EXISTS ositran_scrape_results (
  id                BIGSERIAL PRIMARY KEY,
  report_code       INTEGER NOT NULL REFERENCES ositran_manifest(code),
  report_slug       TEXT NOT NULL,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  success          BOOLEAN NOT NULL,
  tables_count     INTEGER,
  rows_count       INTEGER,
  cols_count       INTEGER,
  headers          TEXT[],                 -- PostgreSQL array de columnas
  error            TEXT,
  duration_sec     NUMERIC,
  scraped_at       TIMESTAMPTZ NOT NULL,
  UNIQUE (report_code, scraped_at)
);

CREATE INDEX IF NOT EXISTS idx_ositran_scrape_results_code ON ositran_scrape_results (report_code);
```

### Tabla: `ositran_{section}_{slug}_rejected`

Una por cada reporte con filas que fallan validación. Misma estructura que las existentes:

```sql
CREATE TABLE IF NOT EXISTS ositran_{section}_{slug}_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 2. Tablas de datos por sección

### 2a. Aeropuertos (códigos 1–6)

Seis reportes: `info`, `pasajeros`, `carga`, `operaciones`, `recaudacion`, `llamadas`.

```sql
-- Tabla consolidada: una fila por (codigo_aeropuerto, scraped_at, tipo_reporte)
CREATE TABLE IF NOT EXISTS ositran_aeropuertos (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,      -- 1-6
  slug_reporte         TEXT NOT NULL,         -- info | pasajeros | carga | ...
  -- Dimensiones comunes (de códigos 1, 7, 22, 36 — info)
  nombre              TEXT,
  region              TEXT,
  ciudad              TEXT,
  departamento        TEXT,
  concesionaria       TEXT,
  -- Columnas dinámicas del reporte específico
  columnas_jsonb      JSONB NOT NULL,         -- { "pasajeros_nacionales": 123, ... }
  scraped_at          TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, slug_reporte)
);

CREATE INDEX IF NOT EXISTS idx_ositran_aeropuertos_nombre ON ositran_aeropuertos (nombre);
CREATE INDEX IF NOT EXISTS idx_ositran_aeropuertos_concesionaria ON ositran_aeropuertos (concesionaria);
```

**Alternativa desnormalizada (recomendada para dashboards):** crear una tabla pivot por tipo de reporte:

```sql
CREATE TABLE IF NOT EXISTS ositran_aeropuertos_pasajeros (
  id                  BIGSERIAL PRIMARY KEY,
  nombre              TEXT NOT NULL,
  region              TEXT,
  ciudad              TEXT,
  pasajeros_totales   NUMERIC,
  pasajeros_nacionales NUMERIC,
  pasajeros_internacionales NUMERIC,
  variacion_pct       NUMERIC,
  scraped_at          TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (nombre, scraped_at)
);
```

**Decisión de diseño:** dado que los headers HTML varían entre scrapeos sin aviso (riesgo conocido del portal JSP), se usa `columnas_jsonb` como storage columnar flexible que captura cualquier combinación de columnas. Se pueden crear vistas materializadas o funciones de extracción para los reportes más estables (info, pasajeros, carga).

---

### 2b. Carreteras (códigos 7–21)

Quince reportes: `info`, `trafico`, `imd`, `ejes`, `recaudacion`, `reclamos`, `consumos`, `accidentes`, `velocidad`, `tiempo`, `pavimento`, `senalizacion`, `iluminacion`, `pasajes`, `nivel-servicio`.

```sql
-- Tabla base consolidada
CREATE TABLE IF NOT EXISTS ositran_carreteras (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,      -- 7-21
  slug_reporte         TEXT NOT NULL,
  -- Dimensiones comunes (de código 7 — info)
  nombre_carretera     TEXT,
  numero_ruta          TEXT,                  -- PE-1N, PE-3N, etc.
  concesionaria        TEXT,
  inicio_tramo         TEXT,
  fin_tramo            TEXT,
  departamento         TEXT,
  -- Columnas dinámicas del reporte específico
  columnas_jsonb       JSONB NOT NULL,
  scraped_at           TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, slug_reporte,
          COALESCE(nombre_carretera, ''), COALESCE(numero_ruta, ''))
);

CREATE INDEX IF NOT EXISTS idx_ositran_carreteras_nombre ON ositran_carreteras (nombre_carretera);
CREATE INDEX IF NOT EXISTS idx_ositran_carreteras_concesionaria ON ositran_carreteras (concesionaria);
CREATE INDEX IF NOT EXISTS idx_ositran_carreteras_ruta ON ositran_carreteras (numero_ruta);
```

**Reportes críticos para join con `peajes` existentes:**

- **IMD (código 9):** Volumen vehicular promedio diario — permite cruzar con ubicación del peaje
- **Accidentes (código 14):** Permite enriquecer `peajes` con historial de incidentes en el tramo
- **Pavimento (código 17):** Estado de superficie — join geográfico aproximado por ruta

---

### 2c. Metro de Lima (códigos 22–29, excluyendo 26)

Ocho reportes: `info`, `pasajeros`, `km`, `recaudacion`, `incidentes-bp`, `incidentes-so`, `averias`.

```sql
CREATE TABLE IF NOT EXISTS ositran_metro (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,      -- 22-25, 27-29
  slug_reporte         TEXT NOT NULL,
  linea                TEXT,                  -- Línea 1, Línea 2, Ramal, etc.
  estacion             TEXT,
  empresa_operadora    TEXT,
  -- Columnas dinámicas
  columnas_jsonb       JSONB NOT NULL,
  scraped_at           TIMESTAMPTZ NOT NULL,
  source_batch_id      BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, slug_reporte,
          COALESCE(linea, ''), COALESCE(estacion, ''))
);

CREATE INDEX IF NOT EXISTS idx_ositran_metro_estacion ON ositran_metro (estacion);
CREATE INDEX IF NOT EXISTS idx_ositran_metro_linea ON ositran_metro (linea);
```

---

### 2d. Puertos (códigos 36, 49–51, 53–55)

Seis reportes: `info`, `naves`, `carga`, `contenedores`, `accidentes`, `ingresos-usd`, `ingresos-pen`.

```sql
CREATE TABLE IF NOT EXISTS ositran_puertos (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,      -- 36, 49-51, 53-55
  slug_reporte         TEXT NOT NULL,
  nombre_puerto       TEXT,
  tipo_puerto          TEXT,                  -- Marítimo | Fluvial | Lacustre
  region              TEXT,
  departamento        TEXT,
  empresa_concesionaria TEXT,
  -- Columnas dinámicas
  columnas_jsonb       JSONB NOT NULL,
  scraped_at           TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, slug_reporte,
          COALESCE(nombre_puerto, ''))
);

CREATE INDEX IF NOT EXISTS idx_ositran_puertos_nombre ON ositran_puertos (nombre_puerto);
CREATE INDEX IF NOT EXISTS idx_ositran_puertos_tipo ON ositran_puertos (tipo_puerto);
```

---

### 2e. Inversiones (códigos 38–41, 43)

Cinco reportes: `info`, `aeropuerto`, `carreteras`, `ferreas`, `puertos`.

```sql
CREATE TABLE IF NOT EXISTS ositran_inversiones (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,      -- 38-41, 43
  slug_reporte         TEXT NOT NULL,          -- info | aeropuerto | carreteras | ferreas | puertos
  modo                TEXT NOT NULL,           -- aeropuerto | carreteras | ferreas | puertos | total
  empresa_concesionaria TEXT,
  nombre_proyecto     TEXT,
  monto_inversion_usd NUMERIC,
  monto_inversion_sol NUMERIC,
  estado              TEXT,                   -- En ejecución | Culminado | En negociación
  avance_porcentaje   NUMERIC,
  fecha_inicio        DATE,
  fecha_termino       DATE,
  scraped_at          TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, modo,
          COALESCE(empresa_concesionaria, ''), COALESCE(nombre_proyecto, ''))
);

CREATE INDEX IF NOT EXISTS idx_ositran_inversiones_modo ON ositran_inversiones (modo);
CREATE INDEX IF NOT EXISTS idx_ositran_inversiones_estado ON ositran_inversiones (estado);
```

---

### 2f. Reclamos (códigos 44–48)

Cinco reportes: `info`, `aeropuerto`, `carreteras`, `metro`, `puertos`.

```sql
CREATE TABLE IF NOT EXISTS ositran_reclamos (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,      -- 44-48
  slug_reporte         TEXT NOT NULL,          -- info | aeropuerto | carreteras | metro | puertos
  modo                TEXT NOT NULL,           -- aeropuerto | carreteras | metro | puertos | total
  empresa_concesionaria TEXT,
  reclamos_totales     INTEGER,
  reclamos_favorables  INTEGER,
  reclamos_desestimados INTEGER,
  tiempo_promedio_dias NUMERIC,
  scraped_at          TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, modo,
          COALESCE(empresa_concesionaria, ''))
);

CREATE INDEX IF NOT EXISTS idx_ositran_reclamos_modo ON ositran_reclamos (modo);
```

---

### 2g. Atención al usuario (códigos 30–31)

Dos reportes: `consultas`, `educacion`.

```sql
CREATE TABLE IF NOT EXISTS ositran_atencion (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,      -- 30, 31
  slug_reporte         TEXT NOT NULL,         -- consultas | educacion
  modo                TEXT,                   -- aeropuerto | carreteras | metro | puertos | todos
  tipo_atencion        TEXT,                   -- Telefónica | Presencial | Web | App
  cantidad            INTEGER,
  descripcion          TEXT,
  scraped_at           TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, slug_reporte,
          COALESCE(modo, ''), COALESCE(tipo_atencion, ''))
);
```

---

### 2h. Integridad (códigos 57–59)

Tres reportes: `dashboard`, `servidores`, `proveedores`.

```sql
CREATE TABLE IF NOT EXISTS ositran_integridad (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,      -- 57-59
  slug_reporte         TEXT NOT NULL,         -- dashboard | servidores | proveedores
  modo                TEXT,
  indicador           TEXT,                   -- nombre del KPI
  valor               NUMERIC,
  unidad              TEXT,
  scraped_at          TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, slug_reporte,
          COALESCE(modo, ''), COALESCE(indicador, ''))
);

CREATE INDEX IF NOT EXISTS idx_ositran_integridad_indicador ON ositran_integridad (indicador);
```

---

### 2i. Puentes en alerta (código 56)

Un solo reporte: `alerta`.

```sql
CREATE TABLE IF NOT EXISTS ositran_puentes_alerta (
  id                  BIGSERIAL PRIMARY KEY,
  nombre_puente       TEXT,
  ubicacion           TEXT,                   -- carretera + km
  departamento        TEXT,
  nivel_alerta        TEXT,                   -- Rojo | Amarillo | Verde
  causa               TEXT,
  fecha_deteccion     DATE,
  acciones_requeridas TEXT,
  scraped_at          TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (nombre_puente, scraped_at)
);

CREATE INDEX IF NOT EXISTS idx_ositran_puentes_departamento ON ositran_puentes_alerta (departamento);
CREATE INDEX IF NOT EXISTS idx_ositran_puentes_nivel ON ositran_puentes_alerta (nivel_alerta);
```

---

## 3. Foreign keys y joins con tablas existentes

### 3.1. Terminales portuarios → OSITRAN puertos

```sql
-- Join por nombre normalizado (sin tildes, minúsculas)
SELECT
  tp.nombre_terminal,
  tp.concesionaria AS mtc_concesionaria,
  tp.departamento  AS mtc_departamento,
  op.nombre_puerto   AS ositran_nombre,
  op.empresa_concesionaria AS ositran_concesionaria,
  op.columnas_jsonb  ->> 'carga_total' AS ositran_carga_toneladas
FROM terminales_portuarios tp
LEFT JOIN ositran_puertos op
  ON LOWER(REGEXP_REPLACE(tp.nombre_terminal, '[áéíóúñ]', '', 'gi')) =
     LOWER(REGEXP_REPLACE(op.nombre_puerto, '[áéíóúñ]', '', 'gi'))
WHERE tp.fecha_corte = (SELECT MAX(fecha_corte) FROM terminales_portuarios)
  AND op.scraped_at  = (SELECT MAX(scraped_at) FROM ositran_puertos);
```

**Clave de join:** nombre del terminal/puerto normalizado (sin tildes, lowercased).
**Riesgo:** OSITRAN usa nombres como "Terminal Portuario del Callao" vs MTC "DP World Callao" — revisar alias antes de automatizar.

---

### 3.2. Aeródromos → OSITRAN aeropuertos

```sql
-- Join por código OACI (más estable que nombre)
SELECT
  a.nombre             AS mtc_nombre,
  a.codigo_oaci        AS mtc_oaci,
  a.departamento       AS mtc_departamento,
  a.concesionaria      AS mtc_concesionaria,
  aa.columnas_jsonb     ->> 'pasajeros_totales' AS ositran_pasajeros,
  aa.scraped_at        AS ositran_fecha
FROM aerodromos a
LEFT JOIN ositran_aeropuertos aa
  ON LOWER(TRIM(a.codigo_oaci)) = LOWER(TRIM(aa.columnas_jsonb ->> 'codigo_oaci'))
   OR LOWER(REGEXP_REPLACE(a.nombre, '[áéíóúñ]', '', 'gi')) =
      LOWER(REGEXP_REPLACE(
        aa.columnas_jsonb ->> 'nombre', '[áéíóúñ]', '', 'gi'))
WHERE a.fecha_corte = (SELECT MAX(fecha_corte) FROM aerodromos)
  AND aa.slug_reporte = 'pasajeros';
```

**Clave de join:** `codigo_oaci` primero (único), nombre como fallback.
**Riesgo:** algunos códigos OACI pueden venir nulos en OSITRAN — confirmar cobertura.

---

### 3.3. Peajes → OSITRAN carreteras

```sql
-- Join por número de ruta + nombre de carreta normalizado
SELECT
  p.nombre              AS mtc_nombre,
  p.codigo_ruta         AS mtc_ruta,
  p.concesionaria       AS mtc_concesionaria,
  p.departamento        AS mtc_departamento,
  oc.nombre_carretera   AS ositran_carretera,
  oc.concesionaria      AS ositran_concesionaria,
  oc.columnas_jsonb     ->> 'imd'        AS ositran_imd,
  oc.columnas_jsonb     ->> 'accidentes' AS ositran_accidentes_mes
FROM peajes p
LEFT JOIN ositran_carreteras oc
  ON LOWER(TRIM(p.codigo_ruta)) = LOWER(TRIM(oc.numero_ruta))
   AND LOWER(REGEXP_REPLACE(p.nombre, '[áéíóúñ]', '', 'gi')) LIKE
       '%' || LOWER(REGEXP_REPLACE(oc.nombre_carretera, '[áéíóúñ]', '', 'gi')) || '%'
WHERE p.fecha_corte = (SELECT MAX(fecha_corte) FROM peajes)
  AND oc.slug_reporte IN ('imd', 'accidentes');
```

**Clave de join:** `codigo_ruta` primero, luego similarity de nombre.
**Riesgo:** la ruta puede no estar en el reporte OSITRAN (muchos tramos sin datos de tráfico).

---

## 4. Normalización de datos OSITRAN

### Helper functions recomendadas

```typescript
// normalize-ositran.ts — junto a normalize.ts

export function toDecimalOSITRAN(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value)
    .replace(/\s/g, '')
    .replace(/\./g, '')    // miles separator: "1.234" → "1234"
    .replace(',', '.')     // decimal: "1234,56" → "1234.56"
    .replace(/%/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function toIntegerOSITRAN(value: unknown): number | null {
  const n = toDecimalOSITRAN(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

// OSITRAN usa formato DD/MM/YYYY — regex confirmado desde el portal
export function toDateOSITRAN(value: unknown): string | null {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

// Limpieza de texto (maneja nulls, guiones, "N/A")
export function toTextOSITRAN(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '' || s === '-' || s === 'N/A' || s === 'n/a') return null;
  return s;
}
```

### Parsing de columnas dinámicas

Cada archivo JSON de reporte trae headers en `headers[]` y datos en `data[]`. Para construir `columnas_jsonb`:

```typescript
function extractColumnsJSONB(
  headers: string[],
  row: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    // Solo incluir columnas no-vacías para reducir ruido
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      const normalizedKey = key.trim();
      const numValue = toDecimalOSITRAN(value);
      result[normalizedKey] = numValue ?? toTextOSITRAN(value);
    }
  }
  return result;
}
```

---

## 5. Flujo del conector OSITRAN

```
ositran-connector.ts
├── readManifest()
│   └── Busca manifest_*.json más reciente en cache/
├── loadReportsFromManifest(manifest)
│   └── Para cada entry: lee {code:03d}_{slug}_{date}.json
├── ingestOSITRAN()
│   ├── BEGIN
│   ├── saveRawBatch() → raw_ositran_batches
│   ├── upsertManifest() → ositran_manifest (por código)
│   ├── upsertScrapeResults() → ositran_scrape_results (por reporte)
│   ├── ingestReport(report)
│   │   ├── detectSchema(report.headers)
│   │   ├── normalizeRows(report.data, report.headers)
│   │   ├── upsertData(report) → ositran_{section}_{slug}
│   │   └── insertRejected() → ositran_{section}_{slug}_rejected
│   └── COMMIT
└── ───────────────────────────────────────
```

**Orden de ingesta:** se ingiere primero el manifest y scrape_results (orden 1), luego los reportes de datos (orden 2+). Si un reporte falla, solo ese queda en rejected — no afecta los demás.

---

## 6. Calidad y caveats

| Aspecto | Caveat |
|---|---|
| **Headers dinámicos** | OSITRAN puede cambiar nombres de columnas sin aviso. `columnas_jsonb` absorbe cambios; columnas typed requieren validación contra `headers` del scrape_result |
| **Fechas DD/MM/YYYY** | Validar con regex `\d{2}/\d{2}/\d{4}` antes de parsear. Si falla, guardar como texto en `columnas_jsonb` |
| **Miles separator "."** | Los números usan `.` como separador de miles y `,` como decimal — `toDecimalOSITRAN` los invierte correctamente |
| **Valores nulos** | OSITRAN usa "-", "N/A", vacío indistintamente — `toTextOSITRAN` los trata como null |
| **Celdas rowspan/colspan** | El scraper no los maneja — las celdas spanning se pierden. Confirmar cobertura con datos de prueba |
| **Paginación** | El scraper solo captura la primera página visible — verificar si hay paginación en el portal |
| **Frecuencia fuente** | OSITRAN no publica SLA. Histórico: trimestral para tráfico, mensual para reclamos |
| **Consistencia de nombres** | El mismo puerto/carretera puede tener nombres distintos en MTC vs OSITRAN. Usar fuzzy matching con threshold > 0.85 |

---

## 7. Script de migración sugerido

Ubicación: `apps/infraestructura-mtc/api/src/db/migrations/002_ositran.sql`

```sql
-- Ingesta OSITRAN (2026-09-24)
-- Ver: docs/arquitectura/ositran-integracion-infraestructura-mtc.md

BEGIN;

-- 1. Batch tracking
CREATE TABLE IF NOT EXISTS raw_ositran_batches (
  id              BIGSERIAL PRIMARY KEY,
  dataset         TEXT NOT NULL DEFAULT 'ositran',
  source_url      TEXT NOT NULL,
  checksum        TEXT NOT NULL,
  record_count    INTEGER NOT NULL,
  scraped_at      TIMESTAMPTZ NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Manifest
CREATE TABLE IF NOT EXISTS ositran_manifest (
  id              BIGSERIAL PRIMARY KEY,
  code            INTEGER NOT NULL,
  slug            TEXT NOT NULL,
  section         TEXT NOT NULL,
  label           TEXT NOT NULL,
  url             TEXT NOT NULL,
  scraped_at      TIMESTAMPTZ NOT NULL,
  source_batch_id BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (code, scraped_at)
);
CREATE INDEX IF NOT EXISTS idx_ositran_manifest_code ON ositran_manifest (code);

-- 3. Scrape results
CREATE TABLE IF NOT EXISTS ositran_scrape_results (
  id                BIGSERIAL PRIMARY KEY,
  report_code       INTEGER NOT NULL,
  report_slug       TEXT NOT NULL,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  success          BOOLEAN NOT NULL,
  tables_count     INTEGER,
  rows_count       INTEGER,
  cols_count       INTEGER,
  headers          TEXT[],
  error            TEXT,
  duration_sec     NUMERIC,
  scraped_at       TIMESTAMPTZ NOT NULL,
  UNIQUE (report_code, scraped_at)
);
CREATE INDEX IF NOT EXISTS idx_ositran_scrape_results_code ON ositran_scrape_results (report_code);

-- 4. Aeropuertos (códigos 1-6)
CREATE TABLE IF NOT EXISTS ositran_aeropuertos (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,
  slug_reporte         TEXT NOT NULL,
  nombre              TEXT,
  region              TEXT,
  ciudad              TEXT,
  departamento        TEXT,
  concesionaria       TEXT,
  columnas_jsonb      JSONB NOT NULL,
  scraped_at          TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, slug_reporte)
);
CREATE INDEX IF NOT EXISTS idx_ositran_aeropuertos_nombre ON ositran_aeropuertos (nombre);
CREATE INDEX IF NOT EXISTS idx_ositran_aeropuertos_concesionaria ON ositran_aeropuertos (concesionaria);

-- 5. Carreteras (códigos 7-21)
CREATE TABLE IF NOT EXISTS ositran_carreteras (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,
  slug_reporte         TEXT NOT NULL,
  nombre_carretera     TEXT,
  numero_ruta          TEXT,
  concesionaria        TEXT,
  inicio_tramo         TEXT,
  fin_tramo            TEXT,
  departamento         TEXT,
  columnas_jsonb       JSONB NOT NULL,
  scraped_at           TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, slug_reporte,
          COALESCE(nombre_carretera, ''), COALESCE(numero_ruta, ''))
);
CREATE INDEX IF NOT EXISTS idx_ositran_carreteras_nombre ON ositran_carreteras (nombre_carretera);
CREATE INDEX IF NOT EXISTS idx_ositran_carreteras_concesionaria ON ositran_carreteras (concesionaria);
CREATE INDEX IF NOT EXISTS idx_ositran_carreteras_ruta ON ositran_carreteras (numero_ruta);

-- 6. Metro (códigos 22-25, 27-29)
CREATE TABLE IF NOT EXISTS ositran_metro (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,
  slug_reporte         TEXT NOT NULL,
  linea                TEXT,
  estacion             TEXT,
  empresa_operadora    TEXT,
  columnas_jsonb       JSONB NOT NULL,
  scraped_at           TIMESTAMPTZ NOT NULL,
  source_batch_id      BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, slug_reporte,
          COALESCE(linea, ''), COALESCE(estacion, ''))
);
CREATE INDEX IF NOT EXISTS idx_ositran_metro_estacion ON ositran_metro (estacion);
CREATE INDEX IF NOT EXISTS idx_ositran_metro_linea ON ositran_metro (linea);

-- 7. Puertos (códigos 36, 49-51, 53-55)
CREATE TABLE IF NOT EXISTS ositran_puertos (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,
  slug_reporte         TEXT NOT NULL,
  nombre_puerto       TEXT,
  tipo_puerto          TEXT,
  region              TEXT,
  departamento        TEXT,
  empresa_concesionaria TEXT,
  columnas_jsonb       JSONB NOT NULL,
  scraped_at           TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, slug_reporte,
          COALESCE(nombre_puerto, ''))
);
CREATE INDEX IF NOT EXISTS idx_ositran_puertos_nombre ON ositran_puertos (nombre_puerto);
CREATE INDEX IF NOT EXISTS idx_ositran_puertos_tipo ON ositran_puertos (tipo_puerto);

-- 8. Inversiones (códigos 38-41, 43)
CREATE TABLE IF NOT EXISTS ositran_inversiones (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,
  slug_reporte         TEXT NOT NULL,
  modo                TEXT NOT NULL,
  empresa_concesionaria TEXT,
  nombre_proyecto     TEXT,
  monto_inversion_usd NUMERIC,
  monto_inversion_sol NUMERIC,
  estado              TEXT,
  avance_porcentaje   NUMERIC,
  fecha_inicio        DATE,
  fecha_termino       DATE,
  scraped_at          TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, modo,
          COALESCE(empresa_concesionaria, ''), COALESCE(nombre_proyecto, ''))
);
CREATE INDEX IF NOT EXISTS idx_ositran_inversiones_modo ON ositran_inversiones (modo);
CREATE INDEX IF NOT EXISTS idx_ositran_inversiones_estado ON ositran_inversiones (estado);

-- 9. Reclamos (códigos 44-48)
CREATE TABLE IF NOT EXISTS ositran_reclamos (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,
  slug_reporte         TEXT NOT NULL,
  modo                TEXT NOT NULL,
  empresa_concesionaria TEXT,
  reclamos_totales     INTEGER,
  reclamos_favorables  INTEGER,
  reclamos_desestimados INTEGER,
  tiempo_promedio_dias NUMERIC,
  scraped_at          TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, modo,
          COALESCE(empresa_concesionaria, ''))
);
CREATE INDEX IF NOT EXISTS idx_ositran_reclamos_modo ON ositran_reclamos (modo);

-- 10. Atención (códigos 30-31)
CREATE TABLE IF NOT EXISTS ositran_atencion (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,
  slug_reporte         TEXT NOT NULL,
  modo                TEXT,
  tipo_atencion        TEXT,
  cantidad            INTEGER,
  descripcion          TEXT,
  scraped_at           TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, slug_reporte,
          COALESCE(modo, ''), COALESCE(tipo_atencion, ''))
);

-- 11. Integridad (códigos 57-59)
CREATE TABLE IF NOT EXISTS ositran_integridad (
  id                  BIGSERIAL PRIMARY KEY,
  codigo_reporte       INTEGER NOT NULL,
  slug_reporte         TEXT NOT NULL,
  modo                TEXT,
  indicador           TEXT,
  valor               NUMERIC,
  unidad              TEXT,
  scraped_at           TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (codigo_reporte, scraped_at, slug_reporte,
          COALESCE(modo, ''), COALESCE(indicador, ''))
);
CREATE INDEX IF NOT EXISTS idx_ositran_integridad_indicador ON ositran_integridad (indicador);

-- 12. Puentes alerta (código 56)
CREATE TABLE IF NOT EXISTS ositran_puentes_alerta (
  id                  BIGSERIAL PRIMARY KEY,
  nombre_puente       TEXT,
  ubicacion           TEXT,
  departamento        TEXT,
  nivel_alerta        TEXT,
  causa               TEXT,
  fecha_deteccion     DATE,
  acciones_requeridas TEXT,
  scraped_at           TIMESTAMPTZ NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_ositran_batches(id),
  UNIQUE (nombre_puente, scraped_at)
);
CREATE INDEX IF NOT EXISTS idx_ositran_puentes_departamento ON ositran_puentes_alerta (departamento);
CREATE INDEX IF NOT EXISTS idx_ositran_puentes_nivel ON ositran_puentes_alerta (nivel_alerta);

COMMIT;
```

---

## 8. Ubicación de archivos

```
apps/infraestructura-mtc/
├── api/
│   └── src/
│       ├── ingest/
│       │   ├── infraestructura-mtc-connector.ts   (existente)
│       │   ├── normalize.ts                        (existente)
│       │   ├── ositran-connector.ts               ⬅ NUEVO
│       │   └── normalize-ositran.ts              ⬅ NUEVO (helpers)
│       └── db/
│           └── migrations/
│               ├── 001_init.sql                    (existente)
│               └── 002_ositran.sql                  ⬅ NUEVO (migración)
```

---

## 9. Próximos pasos

1. **Validar en vivo**: ejecutar el scraper Python desde red peruana para confirmar que el portal responde y capturar el formato real de los headers de cada reporte
2. **Revisar覆盖率 de joins**: ejecutar las queries de join de sección 3 contra los datos reales de MTC para estimar % de match
3. **Decidir estrategia de columnas**: `columnas_jsonb` (flexible) vs columnas typed (type-safe). Recomendación: empezar con `columnas_jsonb`, crear vistas materializadas para los reportes más estables
4. **Monitoreo de cambios**: agregar check en el conector que alerte si `cols_count` o `headers` cambian respecto al último scrape exitoso
