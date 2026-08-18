# Data contract — CEPLAN: GeoServer (Capas geoespaciales)

- Fuente oficial: CEPLAN GeoServer — https://geo.ceplan.gob.pe
- Owner del conector: equipo App 06 (CEPLAN Geo)
- Confirmado en vivo el 2026-08-17 (investigación de servicios públicos programáticos).

## Estado: CONFIRMADO

CEPLAN mantiene un **GeoServer público accesible sin autenticación** que expone estándares OGC (Open Geospatial Consortium). A diferencia de la capa estratégica, aquí sí hay una interfaz programática estándar y documentada.

---

## Servicio GeoServer

### URL base
```
https://geo.ceplan.gob.pe/geoserver/geoceplan
```

### Servicios disponibles

#### WMS (Web Map Service)
- **Endpoint**: `/wms`
- **Formato**: imágenes renderizadas (PNG, JPEG, etc.)
- **Uso**: visualización de mapas, no extracción de datos vectoriales
- **Parámetros estándar**: `service=WMS`, `version=1.3.0`, `request=GetMap`, `layers=...`, `bbox=...`, etc.

#### WFS (Web Feature Service)
- **Endpoint**: `/wfs`
- **Formato**: datos vectoriales (GML, GeoJSON, Shapefile)
- **Uso**: extracción programática de features
- **Parámetros estándar**: `service=WFS`, `version=2.0.0`, `request=GetFeature`, `typeName=...`, etc.

#### WMTS / GeoWebCache
- **Endpoint**: `/gwc/service/wmts`
- **Formato**: tiles pre-generados
- **Uso**: visualización rápida de mapas

---

## Capas publicadas confirmadas

Según la investigación, el GeoServer de CEPLAN tiene **83 capas publicadas** en el workspace `geoceplan`. Capas relevantes para Follow the Sol:

### Territoriales
- `geoceplan:cb_limdptog` — Límites departamentales
- `geoceplan:cb_limprov` — Límites provinciales
- `geoceplan:cb_limdist` — Límites distritales

### Infraestructura
- `geoceplan:cn_aeropuertosx` — Aeropuertos
- `geoceplan:cn_puertosx` — Puertos
- `geoceplan:cb_redhidrica` — Red hídrica

### Social/territorial
- `geoceplan:cb_comunidades` — Comunidades campesinas
- `geoceplan:cb_capitales_prov` — Capitales provinciales

### Proyectos/obras
- `geoceplan:cb_proyectos` — Proyectos
- `geoceplan:cb_lotes` — Lotes

### Otras capas territoriales
- (Listado completo disponible vía `GetCapabilities` del WMS/WFS)

---

## Método de acceso recomendado: WFS

Para extracción programática de datos vectoriales, usar **WFS (Web Feature Service)** en formato GeoJSON:

### Ejemplo de solicitud WFS
```
GET https://geo.ceplan.gob.pe/geoserver/geoceplan/wfs?
  service=WFS&
  version=2.0.0&
  request=GetFeature&
  typeName=geoceplan:cb_limdptog&
  outputFormat=application/json
```

### Obtener capabilities (listado de capas)
```
GET https://geo.ceplan.gob.pe/geoserver/geoceplan/wfs?
  service=WFS&
  version=2.0.0&
  request=GetCapabilities
```

---

## Entidades del modelo canónico

### `geo_layers`
- `id`: UUID
- `layer_name`: VARCHAR — nombre de la capa en GeoServer (ej. `geoceplan:cb_limdptog`)
- `layer_title`: TEXT — título legible
- `workspace`: VARCHAR — (ej. `geoceplan`)
- `service_type`: VARCHAR — (WMS, WFS, WMTS)
- `geometry_type`: VARCHAR — (Point, LineString, Polygon, MultiPolygon)
- `extent_minx`: NUMERIC
- `extent_miny`: NUMERIC
- `extent_maxx`: NUMERIC
- `extent_maxy`: NUMERIC
- `feature_count`: INTEGER — número de features en la capa
- `last_updated`: DATE — fecha de última actualización (si disponible)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

### `geo_features`
- `id`: UUID
- `layer_id`: UUID (FK → `geo_layers`)
- `feature_id`: VARCHAR — ID del feature en la capa original
- `geometry`: GEOMETRY(PostGIS) — geometría vectorial
- `properties`: JSONB — atributos del feature (variables según capa)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

### `territories`
- `id`: UUID
- `ubigeo`: VARCHAR — código INEI (5 dígitos)
- `departamento`: VARCHAR
- `provincia`: VARCHAR
- `distrito`: VARCHAR
- `geometry`: GEOMETRY(PostGIS) — polígono del territorio
- `source_layer_id`: UUID (FK → `geo_layers`)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

### `infrastructure`
- `id`: UUID
- `infra_type`: VARCHAR — (aeropuerto, puerto, carretera, etc.)
- `name`: VARCHAR
- `geometry`: GEOMETRY(PostGIS) — punto/línea/polígono
- `properties`: JSONB — atributos específicos (ej. tipo de aeropuerto, capacidad de puerto)
- `source_layer_id`: UUID (FK → `geo_layers`)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

### `raw_geoserver_batches`
- `id`: SERIAL
- `layer_name`: VARCHAR
- `request_url`: TEXT
- `checksum`: TEXT — SHA256 del payload
- `feature_count`: INTEGER
- `payload`: JSONB — datos crudos (GeoJSON)
- `ingested_at`: TIMESTAMPTZ

---

## Cruces con otras apps

### Con `infobras`
- **Cruce por**: ubicación geográfica (point-in-polygon, buffer, etc.)
- **Propósito**: enriquecer obras con contexto territorial e infraestructura
- **API endpoint**: `GET /api/crossref?feature_type=obras&bbox={minx,miny,maxx,maxy}`
- **Matcher**: espacial (PostGIS ST_Intersects, ST_DWithin, etc.)

### Con `radar-inversiones`
- **Cruce por**: ubicación geográfica (UBIGEO, coordenadas)
- **Propósito**: enriquecer inversiones con contexto territorial
- **API endpoint**: `GET /api/crossref?feature_type=inversiones&bbox={minx,miny,maxx,maxy}`
- **Matcher**: espacial

### Con `radar-ejecucion`
- **Cruce por**: UBIGEO (territorio)
- **Propósito**: análisis geográfico de ejecución presupuestal
- **API endpoint**: `Get /api/crossref?feature_type=ejecucion&ubigeo={code}`
- **Matcher**: exacto (UBIGEO)

---

## Operaciones espaciales soportadas

### Point-in-polygon
Determinar en qué territorio (departamento/provincia/distrito) está una obra/inversión:
```sql
SELECT t.departamento, t.provincia, t.distrito
FROM territories t
WHERE ST_Intersects(t.geometry, ST_SetSRID(ST_MakePoint(lon, lat), 4326))
```

### Buffer
Encontrar obras/inversiones dentro de un radio de una infraestructura:
```sql
SELECT i.*
FROM infrastructure i, geo_features f
WHERE ST_DWithin(i.geometry, f.geometry, 5000) -- 5km
  AND f.layer_id = (SELECT id FROM geo_layers WHERE layer_name = 'geoceplan:cn_aeropuertosx')
```

### Proximity analysis
Encontrar inversiones viales cerca de puertos:
```sql
SELECT i.*
FROM geo_features i, geo_features p
WHERE ST_DWithin(i.geometry, p.geometry, 10000) -- 10km
  AND i.layer_id = (SELECT id FROM geo_layers WHERE layer_name = 'geoceplan:cb_proyectos')
  AND p.layer_id = (SELECT id FROM geo_layers WHERE layer_name = 'geoceplan:cn_puertosx')
```

---

## Estrategia de ingesta recomendada

### Fase 1: Descubrimiento de capas
- Ejecutar `GetCapabilities` del WFS para obtener el listado completo de capas
- Catalogar capas relevantes por tipo (territoriales, infraestructura, proyectos)
- Extraer metadatos (extent, feature count, geometry type)

### Fase 2: Ingesta de capas territoriales
- Prioridad alta: límites departamentales, provinciales, distritales
- Método: WFS `GetFeature` en formato GeoJSON
- Carga: carga inicial completa + actualizaciones incrementales (si hay versión temporal)

### Fase 3: Ingesta de infraestructura
- Prioridad media: aeropuertos, puertos, red hídrica
- Método: WFS `GetFeature` en formato GeoJSON
- Carga: carga inicial completa

### Fase 4: Ingesta de proyectos/obras
- Prioridad baja (validar relevancia para Follow the Sol)
- Método: WFS `GetFeature` en formato GeoJSON
- Carga: carga inicial completa

---

## Cautelas

1. **Tamaño de las capas**: algunas capas pueden ser muy grandes (ej. red hídrica nacional) — considerar paginación WFS (`startIndex`, `count`)
2. **Rendimiento de WFS**: GeoServer puede tener límites de request — implementar retry con backoff
3. **CRS (Coordinate Reference System)**: verificar que todas las capas usan el mismo CRS (probablemente EPSG:4326)
4. **Actualizaciones**: no está documentado con qué frecuencia se actualizan las capas — puede requerir ingesta completa periódica
5. **Licencia de uso**: verificar términos de uso del GeoServer de CEPLAN

---

## Indicadores geoespaciales a construir

### Territorial coverage
```
Territorial Coverage = (Departamentos con inversión / Total departamentos) * 100
```

### Infrastructure proximity
```
Inversiones viales cerca de puertos = COUNT(inversiones WHERE ST_DWithin(inversion, puerto, 10km))
```

### Accessibility analysis
```
Distritos con baja accesibilidad = COUNT(distritos WHERE COUNT(carreteras_dentro < UMBRAL))
```

### Corridor alignment
```
Proyectos en corredores logísticos = COUNT(proyectos WHERE ST_Intersects(proyecto, corredor_logistico))
```

---

## MVP recomendado

Para el MVP, recomiendo enfocarse en:
1. **Capas territoriales** (límites departamentales, provinciales, distritales) — base para todos los análisis geoespaciales
2. **Infraestructura clave** (aeropuertos, puertos) — para análisis de corredores logísticos
3. **Cruce con `infobras`** — enriquecer obras con contexto territorial

Las capas adicionales (red hídrica, comunidades, proyectos) pueden agregarse en fases posteriores una vez validado el MVP.
