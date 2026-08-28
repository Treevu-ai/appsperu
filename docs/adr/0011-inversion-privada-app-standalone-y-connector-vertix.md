# ADR-0011: `inversion-privada` — App standalone y connector VERTIX (cartera APP/PA)

- Estado: Aceptado — implementado en `apps/inversion-privada`.
- Fecha: 2026-08-28
- Ámbito: primera fuente de **inversión privada promovida por PROINVERSIÓN** (APP y PA), complementaria
  a `radar-inversiones` (Invierte.pe / inversión pública SNIP).

## Contexto

`ADR-0010` verificó en vivo que la cartera VERTIX es accesible vía POST multipart a
`vertixService.php` en `investinperu.pe` — 340 proyectos (226 APP + 114 PA) sin autenticación,
sin CUI para cruce exacto con Invierte/INFOBRAS. Ver
`docs/data-contracts/proinversion-vertix-cartera-app-pa-oxi.md`.

## Decisión

### Arquitectura general

**Nombre**: `inversion-privada` — dominio (APP/PA/OxI futuro), no nombre de fuente (`proinversion-*`
/ `vertix-*`).

**Stack**: API Express + TypeScript + Postgres (Docker Compose). Sin frontend.

**Puertos**: API `4012`, Postgres `5443` (siguiente bloque libre tras `bcrp-comercio-exterior`).

```
apps/inversion-privada/
└── api/
    ├── src/
    │   ├── db/
    │   │   ├── pool.ts
    │   │   ├── migrate.ts
    │   │   └── migrations/
    │   │       └── 001_init.sql
    │   ├── ingest/
    │   │   ├── vertix-connector.ts
    │   │   └── normalize.ts
    │   ├── routes/
    │   │   ├── projects.ts
    │   │   └── meta.ts
    │   ├── lib/
    │   └── index.ts
    ├── package.json
    ├── docker-compose.yml
    └── .env.example
```

### Modelo canónico

- `raw_vertix_batches` — lake de evidencia (checksum + `records_total` + snapshot JSON del lote).
- `private_investment_projects` — un registro por `vertix_id`, upsert en cada ingesta.
- `departamentos_inei` / `departamentos` — arrays rellenados en ingesta consultando los 25
  filtros departamentales del buscador (el JSON por proyecto no trae departamento).

OxI queda **fuera** de este ADR — pendiente parseo del XLSX (`investmentpromotionExport.php`).

### Connector

`vertix-connector.ts`:

- POST multipart a `vertixService.php` con `PageLimit=500`.
- Enriquecimiento territorial: 25 requests con `DepartamentoList=<código INEI>`.
- `npm run ingest:vertix` — manual, snapshot completo (`isPartial: false` si `RecordsTotal` =
  filas persistidas).

### API

```
GET /api/projects?departamento=LA+LIBERTAD&sector=&tipo=APP|PA&titular=
GET /api/meta/sources
```

Sin `GET /api/crossref` en el MVP: no hay CUI ni `SEC_EJEC`; un cruce con `radar-inversiones` sería
por nombre y quedaría fuera del estándar de confianza del proyecto.

## Alternativas consideradas

**Extender `radar-inversiones`** — descartada. Universos y claves distintas (CUI vs `vertix_id`).

**Scraping de `vertix.proinversion.gob.pe`** — descartada. Login obligatorio.

## Consecuencias

- Habilita consultar cartera APP/PA junto al resto del ecosistema vía MCP.
- Endpoint no oficial — requiere monitoreo de `RecordsTotal` y checksum entre corridas.
- Departamento inferido por filtro del buscador, no por campo nativo del JSON.

## Referencias

- Spike: `docs/adr/0010-research-spike-proinversion-vertix-cartera-app-pa-oxi.md`
- Data contract: `docs/data-contracts/proinversion-vertix-cartera-app-pa-oxi.md`
- Conector público: `docs/conectores.md#inversion-privada`
