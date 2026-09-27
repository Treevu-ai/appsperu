# Data Contract: `mtc_geoserver` — Geoservicios WFS del MTC

## Identificación

| Campo | Valor |
|---|---|
| **Conector** | `mtc_geoserver.py` |
| **Fuente** | `http://mtcgeo2.mtc.gob.pe:8080/geoserver/` (WFS OGC) |
| **Naturaleza** | Capas vectoriales geoespaciales servidas como WFS (GeoJSON, CSV, Shapefile) |
| **Frecuencia fuente** | Datos base: 2015–2018 (estáticos). Peajes 2024-2025: trimestral. |
| **Esquema** | Semi-dinámico: cada capa tiene su propio schema de atributos |
| **Última validación en vivo** | Desconocida — el Geoserver está bloqueado desde redes externas |

---

## Datasets de destino propuestos

### 1. `mtc_gis.layers_manifest`

Catálogo de capas disponibles.

| Columna | Tipo | Descripción |
|---|---|---|
| `layer_key` | `VARCHAR` | Clave en formato `workspace:layer` |
| `workspace` | `VARCHAR` | Workspace: MTC_pg o MTC_gis |
| `layer` | `VARCHAR` | Nombre de la capa en Geoserver |
| `title` | `VARCHAR` | Título legible |
| `description` | `TEXT` | Descripción de la capa |
| `geometry_type` | `VARCHAR` | Point, LineString, Polygon, MultiPolygon |
| `estimated_features` | `INT` | Cantidad aproximada de features |
| `output_formats` | `JSON` | Formatos disponibles: geojson, csv, shp |

**Primary key:** `layer_key`

### 2. `mtc_gis.download_results`

Log de descargas intentadas por corrida.

| Columna | Tipo | Descripción |
|---|---|---|
| `layer_key` | `VARCHAR` | FK → `mtc_gis.layers_manifest.layer_key` |
| `output_format` | `VARCHAR` | Formato descargado: geojson, csv, shp |
| `success` | `BOOL` | Si la descarga fue exitosa |
| `features_count` | `INT` | Features en la respuesta |
| `bytes_downloaded` | `INT` | Tamaño en bytes |
| `output_path` | `VARCHAR` | Ruta local del archivo |
| `error` | `TEXT` | Mensaje de error si falló |
| `scraped_at` | `TIMESTAMP` | Cuándo se ejecutó |

**Primary key:** `(layer_key, scraped_at)`

### 3. `mtc_gis.red_vial_*` — Capas de red vial (LineString)

Tres tablas para cada nivel de la red vial:

| Capa | Key | Geometría | Features aprox |
|---|---|---|---|
| `red_vial_nacional` | `MTC_pg:red_vial_nacional_dic18` | LineString | ~50,000 |
| `red_vial_departamental` | `MTC_pg:red_vial_departamental_dic18` | LineString | ~80,000 |
| `red_vial_vecinal` | `MTC_pg:red_vial_vecinal_dic18` | LineString | ~100,000 |

**Atributos esperados** (confirmar tras descarga):
| Columna | Tipo | Descripción |
|---|---|---|
| `gid` | `INT` | ID del feature |
| `nombre` | `VARCHAR` | Nombre de la vía |
| `codigo` | `VARCHAR` | Código de la carretera |
| `longitud` | `FLOAT` | Longitud en km |
| `estado` | `VARCHAR` | Estado de la vía |
| `tipo` | `VARCHAR` | Tipo de superficie/pavimento |
| `_geometry` | `GEOMETRY(LineString)` | Geometría de la vía |
| `_geometry_type` | `VARCHAR` | Tipo de geometría |
| `_scraped_at` | `TIMESTAMP` | Cuándo se descargó |

### 4. `mtc_gis.infraestructura_point` — Capas de infraestructura puntual

| Capa | Key | Geometría | Features aprox |
|---|---|---|---|
| `terminales_terrestres` | `MTC_gis:terminal_terrestre` | Point | ~350 |
| `aerodromos` | `MTC_pg:aerodromo_dic18` | Point | ~300 |
| `terminales_portuarios` | `MTC_pg:terminal_portuario_dic18` | Point | ~60 |
| `estaciones_ferroviarias` | `MTC_gis:estacion_ferroviaria` | Point | ~100 |
| `estaciones_pesaje` | `MTC_pg:pesaje_dic16` | Point | ~100 |
| `peajes_2024_2025` | `MTC_pg:peajes_2024_2025` | Point | ~150 |

**Atributos esperados** (confirmar tras descarga):
| Columna | Tipo | Descripción |
|---|---|---|
| `gid` | `INT` | ID del feature |
| `nombre` | `VARCHAR` | Nombre del punto |
| `departamento` | `VARCHAR` | Departamento |
| `provincia` | `VARCHAR` | Provincia |
| `distrito` | `VARCHAR` | Distrito |
| `_geometry` | `GEOMETRY(Point)` | Coordenadas |
| `_geometry_type` | `VARCHAR` | Point |
| `_scraped_at` | `TIMESTAMP` | Cuándo se descargó |

### 5. `mtc_gis.lineas_ferreas`

| Capa | Key | Geometría | Features aprox |
|---|---|---|---|
| `lineas_ferreas` | `MTC_gis:linea_ferrea_dic15` | LineString | ~5,000 |

---

## Calidad esperada

| Aspecto | Observación |
|---|---|
| **Bloqueo por IP** | CRÍTICO: el Geoserver está bloqueado desde redes externas — requiere IP peruana |
| **Schema variable** | Los atributos de cada capa varían — hay que confirmar los nombres reales de columnas tras la primera descarga |
| **Encoding CSV** | GeoJSON se convierte a CSV con UTF-8 — los nombres de vías con tildes/ñ pueden requerir limpieza |
| **Geometría** | La columna `_geometry` guarda el GeoJSON de la geometría como string — para queries espaciales, recargar como PostGIS geometry |
| **Chunks** | Capas grandes (>5,000 features) se descargan en chunks de `maxFeatures=5000` — hay que concatenar |
| **Null en atributos** | Los atributos pueden ser null para features sin datos — convertir a NULL real en carga |

---

## Anomalías conocidas desde el código

1. **Detección de bloqueo por IP**: el código clasifica errores "connection refused", "timeout", "unable to connect" y "回去" como posible bloqueo por IP — esta es la anomalía más frecuente.
2. **Redirección 302 en WFS**: el servidor puede responder con redirección en vez de datos — `urllib` sigue las redirecciones por defecto, pero hay que verificar que no se termine en una página de login.
3. **Tasa de requests**: el rate limit es 4 req/s (hardcoded) — si se aumenta, el Geoserver puede bans por flood detection.
4. **BBOX incompleto**: si se usa `--bbox` parcial, se pueden perder features en los bordes del bounding box.
5. **Features en archivos grandes**: la red vial vecinal (~100k features) puede superar los 100 MB en GeoJSON — confirmar que no se corte por memory/timeout.
6. **GetCapabilities vacío**: `wfs_get_feature` con `layer=""` y `output_format="gml"` puede devolver un XML vacío si el workspace no tiene capas públicas.

---

## Frecuencia de actualización

- **Datos base (vial, aeropuertos, puertos, ferroviario)**: **estáticos** — actualizados por última vez entre 2015 y 2018.
- **Peajes 2024-2025**: trimestral (II Trimestre 2025 como último已知).
- **Recomendado**: mensual para peajes; anual o por demanda para datos base.

---

## Notas de integración

- **PostGIS / GeoPandas**: las geometrías se pueden cargar directamente a PostGIS con `ST_GeomFromGeoJSON` o a GeoPandas con `gpd.read_file`.
- **Consolidación multimodal**: unir `aerodromos`, `terminales_terrestres`, `terminales_portuarios`, `estaciones_ferroviarias` para un mapa de infraestructura de transporte.
- **Join con OSITRAN**: cruzar `terminales_terrestres` con OSITRAN carreteras (códigos 7–21) por nombre de terminal o ubicación geográfica.
- **Join con ATU**: cruzar `estaciones_ferroviarias` con `atu.ferroviaria_data` por nombre de estación.
- **Peajes 2024-2025 como alternativa**: si el Geoserver está bloqueado, usar el GeoJSON del PNDA para peajes (disponible sin restricción de IP).
- **Departamentos como FK**: normalizar `departamento`, `provincia`, `distrito` a códigos INEI para joins con otros datasets.

---

## ⚠️ PENDIENTE VALIDACIÓN EN VIVO

El Geoserver del MTC está **bloqueado desde redes externas**. Este es el conector con mayor riesgo de falla.

1. Ejecutar `python -m tools.scrapers.scripts.mtc_geoserver --list` — si responde, el Geoserver está accesible.
2. Probar descarga pequeña: `python -m tools.scrapers.scripts.mtc_geoserver --layer terminal_terrestre --format geojson`
3. Si falla con "connection refused" o "回去", **confirmar que se está ejecutando desde una IP peruana** (VPN o máquina local en Perú).
4. **Como fallback**: el dataset de peajes está disponible en el PNDA sin restricción de IP — usar `pnda_transporte` con filtro por org `mtc` para acceder a datos de peaje 2024-2025.
5. **Riesgo crítico**: si el Geoserver cambió de IP o dominio, todos los URLs del código quedarán obsoletos. Monitorear errores de conexión periódicamente.
