# Data Contract: `pnda_transporte` — Catálogo CKAN de Transporte PNDA

## Identificación

| Campo | Valor |
|---|---|
| **Conector** | `pnda_transporte.py` |
| **Fuente** | `https://www.datosabiertos.gob.pe` (portal CKAN/DKAN) |
| **Naturaleza** | Metadatos de catálogo + descarga de recursos de terceros |
| **Frecuencia fuente** | Los datasets son estáticos; no hay un SLA público de actualización |
| **Esquema** | Dinámico: depende del recurso descargado (no tiene columnas fijas) |
| **Última validación en vivo** | Desconocida — requiere prueba desde red peruana |

---

## Datasets de destino propuestos

### 1. `pnda_transporte.catalog`

Catálogo filtrado de datasets relevantes a transporte.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `VARCHAR` | ID del dataset en CKAN |
| `name` | `VARCHAR` | Slug del dataset |
| `title` | `VARCHAR` | Título legible |
| `notes` | `TEXT` | Descripción (máx 500 chars) |
| `organization` | `VARCHAR` | Nombre de la org |
| `organization_name` | `VARCHAR` | Slug de la org |
| `tags` | `JSON` | Lista de tags |
| `num_resources` | `INT` | Cantidad de recursos detectados |
| `created` | `TIMESTAMP` | Fecha de creación del dataset |
| `modified` | `TIMESTAMP` | Última modificación |
| `catalog_scraped_at` | `TIMESTAMP` | Cuándo se ejecutó el scrape |

**Primary key:** `id`  
**Unique:** `id`

### 2. `pnda_transporte.resources`

Índice de recursos disponibles (uno por dataset, el mejor rankeado).

| Columna | Tipo | Descripción |
|---|---|---|
| `resource_id` | `VARCHAR` | ID del recurso |
| `dataset_id` | `VARCHAR` | FK → `pnda_transporte.catalog.id` |
| `dataset_title` | `VARCHAR` | Título del dataset padre |
| `name` | `VARCHAR` | Nombre del recurso |
| `url` | `VARCHAR` | URL de descarga |
| `format` | `VARCHAR` | CSV, XLS, XLSX, JSON, GEOJSON, XML |
| `size_kb` | `FLOAT` | Tamaño en KB (puede ser null) |
| `created` | `TIMESTAMP` | Fecha de creación |
| `last_modified` | `TIMESTAMP` | Última modificación del recurso |
| `description` | `TEXT` | Descripción (truncada a 240 chars) |
| `resource_scraped_at` | `TIMESTAMP` | Cuándo se ejecutó el scrape |

**Primary key:** `resource_id`  
**Foreign key:** `dataset_id` → `pnda_transporte.catalog.id`

### 3. `pnda_transporte.downloads`

Archivo plano por recurso — cada fila es un registro del CSV/XLS/JSON original.

| Columna | Tipo | Descripción |
|---|---|---|
| `resource_id` | `VARCHAR` | FK → `pnda_transporte.resources.resource_id` |
| `_source_file` | `VARCHAR` | Nombre del archivo original |
| `*` | `*` | Columnas del recurso original (dinámicas) |

**Primary key:** `(resource_id, ROW_NUMBER())` — generar serial en carga

---

## Calidad esperada

| Aspecto | Observación |
|---|---|
| **Nulls** | `size_kb`, `created`, `last_modified` frecuentemente null (el CKAN no siempre los provee) |
| **Encoding** | Los XLS/XLSX parseados con `openpyxl` o `xlrd` — riesgo de caracteres especiales en tildes/símbolos |
| **Duplicados** | Un mismo dataset puede aparecer con múltiples IDs si hay aliasing en CKAN; se deduplica con `seen_ids` en código |
| **Recursos sin URL** | Los recursos sin `url` válida son filtrados en `norm_resource` |
| **Encoding en CSV** | Se decodifica como UTF-8 con `errors="replace"` — silently replace garbled bytes |
| **XLS legacy** | XLS (OLE2) requiere `xlrd`; si no está instalado, el archivo se guarda como binario |

---

## Anomalías conocidas desde el código

1. **DKAN-safe**: algunos portales DKAN devuelven `result` como lista en vez de dict — el código lo maneja con `isinstance(result, list)`.
2. **Formato inferido desde URL**: si CKAN no provee el campo `format`, se infiere de la extensión del URL — puede ser incorrecto.
3. **Solo un recurso por dataset**: el código descarga solo el recurso mejor rankeado (por preferencia de formato) — ignora el resto.
4. **Archivos > 100 MB**: se saltan sin descarga (hardcoded en `download_resource`).
5. **Preview corrupto**: el preview de contenido decodifica bytes crudos como UTF-8 con `errors="replace"` — no es confiable como validación de encoding.

---

## Frecuencia de actualización

- **Fuente**: no existe SLA documentado. Los datasets son estáticos y se actualizan manualmente por cada organización.
- **Recomendado**: semanal o quincenal para el catálogo; solo descarga de recursos nuevos (comparar `last_modified`).

---

## Notas de integración

- **Normalizar org slugs**: normalizar a minúsculas y comparar con `TRANSPORTE_ORGS` antes de cargar.
- **Filtrar orgs**: enfocarse en MTC, ATU, SUTRAN, OSITRAN, APN, DGAC — las 6 orgs principales.
- **Clave deMerge con OSITRAN/ATU/MTC**: `organization_name` del PNDA puede unirse con el campo `section` del manifest de OSITRAN y con el `BASE_URL` de ATU para trazar linaje.
- **Schema-on-read**: la tabla `downloads` requiere un schema registry dinámico (ej. datos de Glue, dbt-metadata, o tabla lateral de columnas).
- **Metadatos de calidad**: guardar `size_kb`, `resource_scraped_at`, `last_modified` como columnas de auditoría.

---

## ⚠️ PENDIENTE VALIDACIÓN EN VIVO

Este conector no ha sido probado desde una IP peruana. El portal `datosabiertos.gob.pe` puede responder distinto según geolocalización o rate-limiting. Pasos para validar:

1. Ejecutar `python -m tools.scrapers.scripts.pnda_transporte --quick --limit 20`
2. Revisar `reports/pnda_transporte_*.jsonl` — contar `items_success` vs `items_total`
3. Verificar que los CSV/XLS parseados no tengan filas vacías masivas
4. Confirmar que la API CKAN responde correctamente (la autenticación es pública)
