# Sesión — `inversion-privada` (PROINVERSIÓN / VERTIX)

Fecha de ejecución: 2026-08-28 (UTC).

## Propósito

Incorporar al ecosistema AppsPeru la **inversión privada promovida por PROINVERSIÓN** (plataforma
VERTIX en investinperu.pe), complementaria a `radar-inversiones` (Invierte.pe / inversión pública
SNIP). Alcance territorial de producto: **La Libertad**; las ingestas son snapshot **nacional**
con filtro departamental en la API.

## Entregables mergeados

| PR | Contenido |
|---|---|
| [#34](https://github.com/Treevu-ai/appsperu/pull/34) | Spike ADR-0010 + app `inversion-privada` + connector VERTIX (APP/PA) |
| [#35](https://github.com/Treevu-ai/appsperu/pull/35) | OxI, GIS status, crossref SNIP, scripts de corrida La Libertad |

## App `inversion-privada`

| Recurso | Valor |
|---|---|
| Ruta | `apps/inversion-privada/api` |
| API | `4012` |
| Postgres | `5443` |
| ADRs | `docs/adr/0010-*.md`, `docs/adr/0011-*.md` |
| Data contract | `docs/data-contracts/proinversion-vertix-cartera-app-pa-oxi.md` |
| Conector público | `docs/conectores.md#inversion-privada` |

### Fuentes y conectores

| Conector | Endpoint | Comando | Tabla destino |
|---|---|---|---|
| `vertix-connector.ts` | `vertixService.php` (POST multipart) | `npm run ingest:vertix` | `private_investment_projects` |
| `oxi-connector.ts` | `oxi/investmentpromotionExport.php` (XLSX base64) | `npm run ingest:oxi` | `oxi_promotion_projects` |

Evidencia cruda: `raw_vertix_batches`, `raw_oxi_batches`.

### API (`GET`)

| Ruta | Descripción |
|---|---|
| `/api/projects` | Cartera APP/PA — filtros: `departamento`, `sector`, `tipo`, `titular`, `fase` |
| `/api/projects/:vertixId` | Detalle por Id interno PROINVERSIÓN |
| `/api/oxi/projects` | Cartera OxI en promoción — filtros: `departamento`, `provincia`, `entidad`, `codigoSnip` |
| `/api/oxi/projects/:oxiId` | Detalle OxI |
| `/api/crossref?departamento=` | Contexto territorial + coincidencias SNIP con `radar-inversiones` |
| `/api/gis/status` | Metadatos GIS — sin geometría pública |
| `/api/meta/sources` | Lotes de ingesta y desgloses |

### MCP

7 tools (`inversion_privada_*`). Catálogo total del monorepo: **82 tools** (13 apps).

## Corte verificado en vivo (2026-08-28)

| Métrica | Nacional | La Libertad |
|---|---:|---:|
| Proyectos APP/PA (VERTIX) | 340 | ~22 |
| Proyectos OxI en promoción | 761 | ~55 |
| OxI con código SNIP/Invierte | 761 (100%) | 55 |
| APP/PA con CUI | 0 | 0 |
| APP/PA con `url_geo` | 0 | 0 |

Desglose nacional APP/PA: 226 APP + 114 PA (`RecordsTotal` = filas en `Data` con `PageLimit=500`).

## Cruces con el ecosistema

| Cruce | Viabilidad | Implementación |
|---|---|---|
| OxI ↔ `radar-inversiones` | **Sí** — match exacto por código SNIP | `GET /api/crossref` |
| APP/PA ↔ `radar-inversiones` | **No** — VERTIX no publica CUI | Solo contexto agregado por departamento |
| APP/PA ↔ `infobras` | **No** — sin CUI | — |
| GIS ↔ `ceplan-geo` | **No** — mapa embebido autenticado | `GET /api/gis/status` documenta el límite |

## Límites conocidos (no bloqueantes)

1. **API no oficial** — proxies PHP de WordPress en investinperu.pe; monitorear `RecordsTotal` y checksum entre corridas.
2. **Departamento APP/PA inferido** — 25 consultas con filtro INEI; no es campo nativo del JSON por proyecto.
3. **GIS** — `gis-vertix` embebe `vertix.proinversion.gob.pe/gis/dashboard` (login); sin GeoJSON/WFS público.
4. **Sin scheduler** — ingestas manuales, igual que el resto del proyecto.
5. **OxI ≠ APP/PA** — universos distintos (IOARR/promoción vs concesiones); no deduplicar por nombre.

## Operación local

### Corrida integrada La Libertad

```powershell
# Windows
.\scripts\corrida-operativa-la-libertad.ps1 -StartApis
```

```bash
# Linux/macOS
./scripts/ingest-la-libertad-completo.sh
```

Ambos incluyen `ingest:vertix` e `ingest:oxi` en `apps/inversion-privada/api`.

### Solo inversion-privada

```bash
cd apps/inversion-privada/api
cp .env.example .env
docker compose up -d
npm install
npm run migrate
npm run ingest:vertix
npm run ingest:oxi
npm run dev
```

Para crossref SNIP, `radar-inversiones` debe estar en `:4002` (`RADAR_INVERSIONES_API_URL`).

### Smoke sugerido

```http
GET http://localhost:4012/health
GET http://localhost:4012/api/projects?departamento=LA+LIBERTAD
GET http://localhost:4012/api/oxi/projects?departamento=LA+LIBERTAD
GET http://localhost:4012/api/crossref?departamento=LA+LIBERTAD
GET http://localhost:4012/api/gis/status
```

## Verificación automatizada

- `apps/inversion-privada/api`: **6/6** tests (`normalize`, `oxi-xlsx`).
- CI monorepo: jobs existentes en verde al merge de #35.

## Pendientes sugeridos (fuera de esta sesión)

1. Certificar `inversion-privada` en `territorial_coverage` para La Libertad.
2. Memo analítico La Libertad: sector APP/PA + OxI con cruce SNIP a Invierte.pe.
3. Regresión periódica de cardinalidad (`RecordsTotal` VERTIX, filas OxI).

## Referencias

- Mensaje para producto: [`MENSAJE_PRODUCTO_INVERSION_PRIVADA_PROINVERSION_2026-08-28.md`](MENSAJE_PRODUCTO_INVERSION_PRIVADA_PROINVERSION_2026-08-28.md)
