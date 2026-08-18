# ADR-0004: CEPLAN Geo — App standalone y connector GeoServer

## Contexto

CEPLAN mantiene un GeoServer público que expone estándares OGC (WFS/WMS/WMTS) sin autenticación. A diferencia de la capa estratégica, aquí sí hay una interfaz programática estándar y documentada. Para integrar la capa geoespacial en Follow the Sol, necesitamos construir una app standalone siguiendo el patrón establecido por las apps existentes.

## Decisión

### Arquitectura general

**Nombre**: `ceplan-geo`

**Stack** (igual que apps existentes + PostGIS):
- **API**: Express + TypeScript + Postgres + PostGIS (Docker Compose)
- **Web**: Next.js + Leaflet/MapLibre (para visualización de mapas)
- **Puertos**:
  - API: 4005
  - Web: 3005
  - Postgres: 5437

**Estructura de directorios**:
```
apps/ceplan-geo/
├── api/
│   ├── src/
│   │   ├── db/
│   │   │   ├── pool.ts
│   │   │   ├── migrate.ts
│   │   │   └── migrations/
│   │   │       ├── 001_create_geo_layers.sql
│   │   │       ├── 002_create_geo_features.sql
│   │   │       ├── 003_create_territories.sql
│   │   │       ├── 004_create_infrastructure.sql
│   │   │       ├── 005_create_raw_geoserver_batches.sql
│   │   │       └── 006_enable_postgis.sql
│   │   ├── ingest/
│   │   │   ├── geoserver-connector.ts
│   │   │   ├── normalize.ts
│   │   │   └── postgis-utils.ts
│   │   ├── crossref/
│   │   │   ├── spatial-match.ts
│   │   │   └── territory-match.ts
│   │   ├── routes/
│   │   │   ├── index.ts
│   │   │   ├── layers.ts
│   │   │   ├── features.ts
│   │   │   ├── territories.ts
│   │   │   └── crossref.ts
│   │   └── index.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── docker-compose.yml
│   └── .env.example
└── web/
    ├── src/
    │   ├── app/
    │   ├── components/
    │   │   ├── Map.tsx
    │   │   ├── LayerControl.tsx
    │   │   └── FeaturePopup.tsx
    │   └── lib/
    ├── package.json
    ├── tsconfig.json
    └── .env.example
```

---

## Connector GeoServer

### Estrategia de ingesta

Dado que GeoServer expone estándares OGC, el connector usará **WFS (Web Feature Service)** en formato GeoJSON:

1. **Discovery**: Ejecutar `GetCapabilities` del WFS para obtener:
   - Listado completo de capas
   - Metadatos (extent, feature count, geometry type)
   - CRS (Coordinate Reference System)

2. **Download**: Implementar descarga de features usando:
   - WFS `GetFeature` en formato GeoJSON
   - Paginación (`startIndex`, `count`) para capas grandes
   - Manejo de rate limiting (backoff exponencial)

3. **Parse**:
   - GeoJSON → PostgreSQL/PostGIS
   - Validación de geometrías (ST_IsValid, ST_MakeValid si es necesario)
   - Transformación de CRS (si es necesario, usar ST_Transform)

4. **Normalize**:
   - Mapeo de propiedades (field-mapping)
   - Extracción de atributos relevantes
   - Manejo de valores nulos y anomalías

5. **Upsert**:
   - Guardar en tablas canónicas (geo_layers, geo_features, territories, infrastructure)
   - Guardar lote crudo en raw_geoserver_batches (lake de evidencia)

### Scripts de ingest

**package.json scripts**:
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "migrate": "tsx src/db/migrate.ts",
    "ingest:geoserver": "tsx src/ingest/geoserver-connector.ts",
    "ingest:discovery": "tsx src/ingest/geoserver-discovery.ts",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Variables de entorno

**.env.example**:
```env
# Database
DATABASE_URL=postgresql://ceplan_geo:ceplan_geo@localhost:5437/ceplan_geo

# GeoServer
GEOSERVER_BASE_URL=https://geo.ceplan.gob.pe/geoserver/geoceplan
GEOSERVER_WORKSPACE=geoceplan
GEOSERVER_REQUEST_TIMEOUT=60000
GEOSERVER_RATE_LIMIT_DELAY=500

# Crossref
INFOBRAS_API_URL=http://localhost:4003
RADAR_INVERSIONES_API_URL=http://localhost:4002
RADAR_EJECUCION_API_URL=http://localhost:4000
```

---

## API Endpoints

### Capas geoespaciales
```
GET /api/layers
GET /api/layers/:id
GET /api/layers/:id/features
```

### Territorios
```
GET /api/territories?ubigeo={code}
GET /api/territories?departamento={name}
GET /api/territories/bbox?minx={minx}&miny={miny}&maxx={maxx}&maxy={maxy}
```

### Infraestructura
```
GET /api/infrastructure?type={type}
GET /api/infrastructure/near?lat={lat}&lon={lon}&radius={km}
```

### Cruce espacial con infobras
```
GET /api/crossref?feature_type=obras&bbox={minx,miny,maxx,maxy}
```
Respuesta:
```json
{
  "features": [
    {
      "id": "...",
      "type": "obra",
      "name": "Construcción de escuela...",
      "location": {
        "lat": -8.123,
        "lon": -79.456
      },
      "territory": {
        "departamento": "La Libertad",
        "provincia": "Trujillo",
        "distrito": "Trujillo"
      },
      "nearby_infrastructure": [
        {
          "type": "aeropuerto",
          "name": "Aeropuerto Cap. FAP Carlos Martínez de Pinillos",
          "distance_km": 12.5
        }
      ]
    }
  ]
}
```

---

## Cruce espacial con otras apps

### Con infobras (point-in-polygon)

**crossref/spatial-match.ts**:
```typescript
export async function matchObrasWithTerritories(obras: any[]) {
  const results = [];

  for (const obra of obras) {
    // Buscar territorio que contiene la obra
    const territory = await pool.query(
      `SELECT departamento, provincia, distrito, ubigeo
       FROM territories
       WHERE ST_Intersects(
         geometry,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)
       )
       LIMIT 1`,
      [obra.lon, obra.lat]
    );

    // Buscar infraestructura cercana
    const infrastructure = await pool.query(
      `SELECT type, name,
              ST_Distance(
                geometry,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)
              ) / 1000 as distance_km
       FROM infrastructure
       WHERE ST_DWithin(
         geometry,
         ST_SetSRID(ST_MakePoint($1, $2), 4326),
         10000 -- 10km
       )
       ORDER BY distance_km
       LIMIT 5`,
      [obra.lon, obra.lat]
    );

    results.push({
      obra: obra,
      territory: territory.rows[0] || null,
      nearby_infrastructure: infrastructure.rows
    });
  }

  return results;
}
```

### Con radar-inversiones (proximity analysis)

**crossref/spatial-match.ts**:
```typescript
export async function matchInversionesWithPorts(inversiones: any[]) {
  const results = [];

  for (const inversion of inversiones) {
    // Buscar puertos cercanos
    const ports = await pool.query(
      `SELECT name,
              ST_Distance(
                geometry,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)
              ) / 1000 as distance_km
       FROM infrastructure
       WHERE type = 'puerto'
         AND ST_DWithin(
           geometry,
           ST_SetSRID(ST_MakePoint($1, $2), 4326),
           50000 -- 50km
         )
       ORDER BY distance_km
       LIMIT 3`,
      [inversion.lon, inversion.lat]
    );

    results.push({
      inversion: inversion,
      nearby_ports: ports.rows
    });
  }

  return results;
}
```

---

## Utilidades PostGIS

**ingest/postgis-utils.ts**:
```typescript
import type { PoolClient } from "pg";

export async function ensurePostGIS(client: PoolClient) {
  await client.query("CREATE EXTENSION IF NOT EXISTS postgis");
}

export function parseGeoJSONFeature(feature: any): {
  geometry: string;
  properties: Record<string, unknown>;
} {
  // GeoJSON geometry → WKT
  const geometry = JSON.stringify(feature.geometry);
  const properties = feature.properties || {};

  return { geometry, properties };
}

export async function insertFeature(
  client: PoolClient,
  layerId: string,
  featureId: string,
  geometry: string,
  properties: Record<string, unknown>
): Promise<void> {
  await client.query(
    `INSERT INTO geo_features (layer_id, feature_id, geometry, properties)
     VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4)
     ON CONFLICT (layer_id, feature_id) DO UPDATE
       SET geometry = EXCLUDED.geometry,
           properties = EXCLUDED.properties`,
    [layerId, featureId, geometry, JSON.stringify(properties)]
  );
}
```

---

## Alternativas consideradas

### Alternativa 1: PostGIS vs GeoJSON puro
**Decisión**: PostGIS
**Razón**:
- Permite operaciones espaciales nativas (ST_Intersects, ST_DWithin, etc.)
- Mejor rendimiento para queries espaciales
- Indexación espacial (GIST) para queries rápidas
- Pattern estándar para apps geoespaciales

### Alternativa 2: WFS vs WMS
**Decisión**: WFS (Web Feature Service)
**Razón**:
- WFS retorna datos vectoriales (GeoJSON), no imágenes
- Permite análisis espacial (no solo visualización)
- WMS es solo para visualización (mapas renderizados)
- Necesitamos los datos crudos para cruces con otras apps

### Alternativa 3: Ingesta completa vs diferencial
**Decisión**: Ingesta completa con detección de cambios
**Razón**:
- No está documentado si GeoServer soporta versionamiento temporal
- Ingesta completa es más robusta (no depende de timestamp)
- Upsert evita duplicados (ON CONFLICT DO UPDATE)
- Para optimizar: comparar checksums antes de re-ingerir

---

## Consecuencias

### Positivas
- GeoServer es un estándar OGC — más estable que scraping de interfaces web
- PostGIS permite operaciones espaciales potentes (point-in-polygon, buffer, proximity)
- Pattern consistente con apps existentes (misma arquitectura base)
- Cruce espacial con infobras y radar-inversiones enriquece análisis territoriales

### Negativas
- Requiere PostGIS (dependencia adicional vs apps existentes)
- GeoJSON puede ser muy grande para capas con muchos features
- Necesita manejo de CRS (Coordinate Reference Systems) — todas las capas deben usar el mismo CRS
- Rendimiento de WFS puede ser lento para capas grandes (requiere paginación)

---

## Fases de implementación

### Fase 1: Scaffold de la app
- Crear estructura de directorios
- Configurar Docker Compose (Postgres + PostGIS + Adminer)
- Configurar package.json y scripts
- Configurar TypeScript y ESLint

### Fase 2: Migraciones de base de datos
- Habilitar extensión PostGIS
- Crear tablas canónicas (geo_layers, geo_features, territories, infrastructure)
- Crear tabla de raw batches (lake de evidencia)
- Crear índices espaciales (GIST)

### Fase 3: Connector GeoServer (MVP)
- Discovery: GetCapabilities del WFS
- Implementar descarga de capas (WFS GetFeature)
- Implementar parseo GeoJSON → PostGIS
- Implementar normalización y upsert

### Fase 4: API endpoints
- Endpoints de capas y features
- Endpoints de territorios
- Endpoints de infraestructura
- Endpoint de crossref espacial

### Fase 5: Cruce espacial
- Implementar point-in-polygon (obras → territorios)
- Implementar proximity analysis (inversiones → puertos/aeropuertos)
- Implementar buffer queries (infraestructura cercana)

### Fase 6: Frontend Next.js + Mapas
- Componente Map (Leaflet/MapLibre)
- Control de capas (layer control)
- Popup de features
- Visualización de cruces espaciales

### Fase 7: Testing y validación
- Tests unitarios de connector
- Tests de API endpoints
- Validación con datos reales del GeoServer

---

## Referencias

- Data contract: `docs/data-contracts/ceplan-geo.md`
- Pattern apps existentes: `apps/radar-ejecucion`, `apps/infobras`
- ADR-0001: Modelo canónico
- ADR-0002: Infobras app standalone y cruce por CUI
- ADR-0003: CEPLAN Estratégico app standalone
- OGC WFS Standard: https://www.ogc.org/standards/wfs
- PostGIS Documentation: https://postgis.net/documentation/
