# Data Contract: `ositran_data` — Reportes Dinámicos OSITRAN

## Identificación

| Campo | Valor |
|---|---|
| **Conector** | `ositran_data.py` |
| **Fuente** | `https://serviciosdigitales.ositran.gob.pe:8443/PortalDatosOsitran/` |
| **Naturaleza** | Tablas HTML renderizadas por JSP/JSPX — scrapeadas con Playwright (Chromium) |
| **Frecuencia fuente** | No documentada. Suponer trimestral. |
| **Esquema** | Por reporte: 40+ reportes con columnas propias — cada uno es una tabla independiente |
| **Última validación en vivo** | Desconocida — requiere prueba desde red peruana |

---

## Datasets de destino propuestos

### 1. `ositran.manifest`

Índice maestro de todos los reportes disponibles.

| Columna | Tipo | Descripción |
|---|---|---|
| `code` | `INT` | Código numérico del reporte (1–59) |
| `slug` | `VARCHAR` | Slug del reporte |
| `section` | `VARCHAR` | Sección: aeropuertos, carreteras, metro, puertos, inversiones, reclamos, puentes, atencion, integridad |
| `label` | `VARCHAR` | Título oficial del reporte |
| `url` | `VARCHAR` | URL del reporte |
| `scraped_at` | `TIMESTAMP` | Cuándo se ejecutó el scrape |

**Primary key:** `code`

### 2. `ositran.scrape_results`

Resultado de la última corrida por reporte.

| Columna | Tipo | Descripción |
|---|---|---|
| `code` | `INT` | FK → `ositran.manifest.code` |
| `scraped_at` | `TIMESTAMP` | Timestamp de la corrida |
| `success` | `BOOL` | Si el scrape fue exitoso |
| `tables_count` | `INT` | Cantidad de tablas detectadas en la página |
| `rows_count` | `INT` | Filas extraídas de la tabla principal |
| `cols_count` | `INT` | Columnas de la tabla principal |
| `error` | `TEXT` | Mensaje de error si falló |

**Primary key:** `(code, scraped_at)`  
**Último valor por código:** filtrar por `MAX(scraped_at)` para tener la versión más reciente.

### 3. `ositran.{section}_{slug}` — Tablas por reporte

Cada reporte genera su propia tabla. Estructura genérica:

| Columna | Tipo | Descripción |
|---|---|---|
| `_scraped_at` | `TIMESTAMP` | Cuándo se extrajo |
| `_source_url` | `VARCHAR` | URL del reporte |
| `*` | `VARCHAR` | Columnas dinámicas del reporte (normalizadas desde headers HTML) |

**Proponer tablas consolidadas por sección:**

#### 3a. `ositran.aeropuertos_info`
Códigos: 1 (info), 2 (pasajeros), 3 (carga), 4 (operaciones), 5 (recaudación), 6 (llamadas)

#### 3b. `ositran.carreteras_trafico`
Códigos: 7–21 (info, tráfico, IMD, ejes, recaudación, reclamos, consumos, accidentes, velocidad, tiempo, pavimento, señalización, iluminación, pasajes, nivel de servicio)

#### 3c. `ositran.metro`
Códigos: 22–25, 27–29 (info, pasajeros, km, recaudación, incidentes BP/SO, averías)

#### 3d. `ositran.puertos`
Códigos: 36, 49–51, 53–55 (info, naves, carga, contenedores, accidentes, ingresos USD/PEN)

#### 3e. `ositran.inversiones`
Códigos: 38–41, 43 (info, aeropuerto, carreteras, ferreas, puertos)

#### 3f. `ositran.reclamos`
Códigos: 44–48 (info, aeropuerto, carreteras, metro, puertos)

#### 3g. `ositran.puentes_alerta`
Código: 56

#### 3h. `ositran.atencion`
Códigos: 30–31 (consultas, educación)

#### 3i. `ositran.integridad`
Códigos: 57–59 (dashboard, servidores, proveedores)

---

## Calidad esperada

| Aspecto | Observación |
|---|---|
| **Columnas dinámicas** | Los headers se extraen de la primera fila HTML `<tr>` — si la página cambia el formato, las columnas cambian sin aviso |
| **Nulls en filas** | Filas con celdas colspan pueden tener menos columnas que el header — el código hace padding con `zip(headers[:len(row)], row)` |
| **Encoding** | Playwright extrae `.inner_text()` del DOM — riesgo de caracteres no-ASCII mal renderizados si la página usa charset incorrecto |
| **Tablas múltiples** | Si hay más de una tabla, se selecciona la más grande (`max(tables, key=len)`) — puede no ser la relevante |
| **Filas vacías** | Filtradas con `any(c.strip() for c in cell_texts)` — las filas con solo espacios son descartadas |
| **Sesión Playwright** | El navegador se abre una vez y se reutiliza — si la sesión caduca, todos los reportes fallan |

---

## Anomalías conocidas desde el código

1. **Puerto 8443 con HTTPS auto-negociado**: el código ignora HTTPS errors con `ignore_https_errors=True` — puede haber MITM si el cert está expirado.
2. **Timeout de 20s por defecto**: algunas tablas JSP tardan más de 20s en renderizar — se puede perder contenido.
3. **Selección de tabla por tamaño**: si hay una tabla de navegación (menú lateral) con más filas que la de datos, se selecciona la wronga.
4. **Celdas con `rowspan`/`colspan`**: el código no los maneja — las celdas spanning se pierden.
5. **Sin paginación**: si el reporte tiene más filas de las visibles, solo se captura la primera página.

---

## Frecuencia de actualización

- **Fuente**: OSITRAN no publica SLA de actualización. Histórico: datos trimestrales para tráfico; mensuales para reclamos y atención.
- **Recomendado**: mensual. Monitorear `scraped_at` y comparar `rows_count` vs corrida anterior — si baja drásticamente, la página cambió formato.

---

## Notas de integración

- **Foreign keys**: `code` → `ositran.manifest.code` en todas las tablas.
- **Normalización de fechas**: los reportes OSITRAN usan formato DD/MM/YYYY — validar con regex `\d{2}/\d{2}/\d{4}` antes de parsear.
- **Consolidación de tráfico**: los códigos 2, 8, 23, 49 pueden unirse para un dashboard consolidado de tráfico multimodal.
- **Join con MTC Geoserver**: `aeropuertos` (códigos 1–6) pueden cruzarse con la capa `aerodromos` del MTC por nombre de infraestructura.
- **Join con ATU**: reportes de `metro` (22–29) complementan los datos de `Ferroviario` del scraper ATU.

---

## ⚠️ PENDIENTE VALIDACIÓN EN VIVO

El portal OSITRAN usa JSP con tablas dinámicas. Requiere prueba desde IP peruana:

1. Ejecutar `python -m tools.scrapers.scripts.ositran_data --list-codes` para confirmar que el portal responde.
2. Probar códigos específicos: `python -m tools.scrapers.scripts.ositran_data --codes 1 2 3 --timeout 30`
3. Verificar que las columnas extraídas matcheen con las esperadas (comparar con captura manual del navegador).
4. **Riesgo crítico**: si el portal requiere certificado cliente o IP whitelisted, el scraper fallará silenciosamente (la página carga pero las tablas no existen).
