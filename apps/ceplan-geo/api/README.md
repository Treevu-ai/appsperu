# CEPLAN Geo API

App standalone de contexto territorial e infraestructura para ALSOL. Ingiere capas del GeoServer público de CEPLAN vía WFS y las persiste en Postgres/PostGIS.

- **API:** puerto `4005`
- **Postgres/PostGIS:** puerto `5437`
- **Fuente:** `https://geo.ceplan.gob.pe/geoserver/geoceplan/wfs`

## Levantar

```bash
docker compose up -d
cp .env.example .env
npm install
npm run migrate
```

## Ingestas (manuales)

```bash
npm run ingest:discovery
npm run ingest:territories
npm run ingest:infrastructure
```

## Desarrollo

```bash
npm run dev
npm test
```

## Alcance Sprint 3

- Scaffold API + PostGIS
- Migraciones canónicas (`geo_layers`, `geo_features`, `territories`, `infrastructure`, `raw_geoserver_batches`)
- Connector WFS con paginación y lotes trazables
- Ingesta de distritos (`cb_limdistx`), departamentos/provincias e infraestructura (aeropuertos, puertos)

## Alcance Sprint 4

```bash
npm run crossref:build   # materializa territory_name_crosswalk desde infobras
npm run dev
```

Endpoints:

- `GET /api/layers`, `/api/layers/:id`, `/api/layers/:id/features`
- `GET /api/territories?ubigeo=`, `?departamento=&provincia=&distrito=`, `/api/territories/bbox`
- `GET /api/infrastructure?type=`, `/api/infrastructure/near?ubigeo=&radius_km=`
- `GET /api/crossref/inversiones?departamento=`
- `GET /api/crossref/obras?departamento=`
- `GET /api/crossref/ejecucion?ubigeo=`

Requiere `radar-inversiones`, `infobras` y/o `radar-ejecucion` corriendo para los cruces HTTP.

Ver `docs/PRD_CEPLAN_Geo_v1.md`.
