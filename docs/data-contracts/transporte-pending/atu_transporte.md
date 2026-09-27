# Data Contract: `atu_transporte` — Datos Abiertos ATU Lima/Callao

## Identificación

| Campo | Valor |
|---|---|
| **Conector** | `atu_transporte.py` |
| **Fuente** | `https://sistemas.protransporte.gob.pe/DatosAbiertos/` |
| **Naturaleza** | Archivos XLS/XLSX estáticos descubiertos por scraping HTML |
| **Frecuencia fuente** | No documentada. Suponer mensual o trimestral. |
| **Esquema** | Dinámico por archivo: depende de la estructura del XLS |
| **Última validación en vivo** | Desconocida — requiere prueba desde red peruana |

---

## Datasets de destino propuestos

### 1. `atu.manifest`

Índice de todas las descargas intentadas.

| Columna | Tipo | Descripción |
|---|---|---|
| `category` | `VARCHAR` | Categoría: Metropolitano, Corredores Complementarios, Transporte Regular, Transporte Especial, Ferroviario |
| `slug` | `VARCHAR` | Slug de la categoría |
| `url` | `VARCHAR` | URL de la categoría (página de índice) |
| `success` | `BOOL` | Si la página se cargó correctamente |
| `links_found` | `INT` | Cantidad de links a archivos detectados |
| `files_downloaded` | `INT` | Archivos efectivamente bajados |
| `rows_extracted` | `INT` | Filas extraídas de los XLS |
| `scraped_at` | `TIMESTAMP` | Cuándo se ejecutó el scrape |

**Primary key:** `(category, scraped_at)`  
**Unique por categoría:** filtrar por `MAX(scraped_at)` para versión más reciente.

### 2. `atu.files`

Metadata de cada archivo XLS/XLSX descargado.

| Columna | Tipo | Descripción |
|---|---|---|
| `url` | `VARCHAR` | URL del archivo |
| `label` | `VARCHAR` | Texto del enlace HTML |
| `filename` | `VARCHAR` | Nombre del archivo en disco |
| `local_path` | `VARCHAR` | Ruta local donde se guardó |
| `content_type` | `VARCHAR` | Content-Type del servidor |
| `downloaded` | `BOOL` | Si la descarga fue exitosa |
| `size` | `INT` | Tamaño en bytes |
| `parse_error` | `TEXT` | Error de parseo si falló (null si OK) |
| `category` | `VARCHAR` | FK → categoría del manifest |
| `scraped_at` | `TIMESTAMP` | Cuándo se descargó |

**Primary key:** `(url, scraped_at)`

### 3. `atu.{slug}_data` — Tablas por categoría

Cada categoría genera registros a partir de sus XLS/XLSX. Estructura genérica:

| Columna | Tipo | Descripción |
|---|---|---|
| `_sheet` | `VARCHAR` | Nombre de la hoja del XLS/XLSX |
| `_source_file` | `VARCHAR` | Archivo original |
| `_scraped_at` | `TIMESTAMP` | Cuándo se parseó |
| `*` | `*` | Columnas del XLS original (dinámicas) |

**Tablas propuestas:**

| Tabla | Categoría ATU | Descripción |
|---|---|---|
| `atu.metropolitano_data` | Metropolitano | Metropolitano de Lima (corredor rojo) |
| `atu.corredores_data` | Corredores Complementarios | Corredores azules, rojos, alimentadores |
| `atu.transporte_regular_data` | Transporte Regular | Transporte regular Lima/Callao |
| `atu.transporte_especial_data` | Transporte Especial | Taxis, colectivos, modos especiales |
| `atu.ferroviaria_data` | Ferroviario | Metro de Lima (en construcción) |

---

## Calidad esperada

| Aspecto | Observación |
|---|---|
| **XLS sin openpyxl** | Si `openpyxl` no está instalado, los XLSX no se parsean — se guardan como binario y se reportan con `parse_error` |
| **XLS sin xlrd** | Si `xlrd` no está instalado, los XLS legacy no se parsean |
| **Headers dinámicos** | La primera fila del XLS se toma como header — si el archivo tiene filas de metadata antes de los datos, las primeras filas se cargan como columnas |
| **Celdas vacías** | `None` se convierte a string vacío `""` — no hay distinción entre celda vacía y celda con string vacío |
| **Encoding XLS** | `xlrd` decodifica con encoding del sistema — puede generar garbled chars para caracteres especiales |
| **Multi-sheet** | Se procesan todas las hojas del workbook — puede generar muchas filas con estructura inconsistente entre hojas |

---

## Anomalías conocidas desde el código

1. **Fallback de enlaces**: si `find_download_links` no encuentra links, hace un segundo regex scan más amplio (incluye `href` y `src`) — el segundo scan es más ruidoso y puede capturar enlaces incorrectos.
2. **SIZE = 0 en HEAD**: si el HEAD request falla, se intenta la descarga igual con `size=0` — puede descargar contenido parcial.
3. **Col names desde None**: si la primera fila tiene `None` en una columna, se nombra `col_{j}` (índice) — genera columnas genéricas.
4. **Magic byte detection**: la detección de XLS vs XLSX se hace por magic bytes (PK para XLSX, OLE2 para XLS) — si el archivo tiene wrong extension, se parsea con el parser correcto igual.
5. **clean_text en headers**: se aplica `clean_text` a los headers — puede alterar nombres de columnas relevantes.

---

## Frecuencia de actualización

- **Fuente**: ATU no tiene SLA documentado. Histórico: los XLS se actualizan cada 1–3 meses.
- **Recomendado**: mensual. Comparar hash SHA256 de los archivos contra corrida anterior para detectar cambios.

---

## Notas de integración

- **Consolidación Lima/Callao**: los datos ATU cubren Lima y Callao — útil para cruzar con OSITRAN que tiene scope nacional.
- **Join con PNDA**: los datasets de ATU también están en el PNDA (bajo la org `atu`). Cruzar por `organization_name = "autoridad-de-transporte-urbano-para-lima-y-callao-atu"`.
- **Lineage**: `_source_file` permite trazar cada fila hasta el archivo original.
- **Normalizar fechas**: aplicar `parse_date` de `lib.normalizer` a columnas que parezcan fecha.
- **Multi-hoja**: antes de consolidar, verificar que las hojas de un mismo XLS tengan estructura compatible — si no, tratarlas como tablas separadas.

---

## ⚠️ PENDIENTE VALIDACIÓN EN VIVO

El portal de la ATU usa XLS estáticos. Requiere prueba desde red peruana:

1. Ejecutar `python -m tools.scrapers.scripts.atu_transporte --list` para confirmar que el portal responde.
2. Probar descarga real: `python -m tools.scrapers.scripts.atu_transporte --categories Metropolitano --max-size 20`
3. Verificar que los XLS parseados tengan más de 5 filas de datos (no solo headers o metadata).
4. **Verificar dependencias**: `openpyxl` y `xlrd` deben estar instalados — si no, los XLSX/XLS fallan silenciosamente.
5. **Riesgo**: si el portal tiene certificado HTTPS expirado o usa TLS antiguo, las descargas pueden fallar con error de handshake.
