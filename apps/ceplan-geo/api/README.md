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

Los endpoints de lectura y cruces llegan en Sprint 4. Ver `docs/PRD_CEPLAN_Geo_v1.md`.
