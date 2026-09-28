# Plan de migración — MCP Worker (sin VPS, sin rastro-web)

> **Decisión tomada el 2026-09-28: Neon, no D1.** Ver
> [`adr/0024-neon-en-lugar-de-d1.md`](adr/0024-neon-en-lugar-de-d1.md) para la
> decisión y su evidencia, y [`../mcp-server/RUNBOOK_NEON.md`](../mcp-server/RUNBOOK_NEON.md)
> para el procedimiento de provisioning. Este documento se conserva como
> registro del análisis original; **las secciones 3 y 5 (schema D1, conversión
> de SQL) quedaron descartadas** y la tabla "Arquitectura objetivo" ya no
> refleja el estado real. Leyelo como historia, no como guía.

> **Contexto:** El usuario solo consume Rastro desde terminal/agentes IA (Claude Code, Cursor).
> El VPS está parado (no se usa, no se sabe manejar). Todo es manual/a demanda.
> Quiere migrar el MCP server a un Cloudflare Worker.

## Estado actual (`docs/FLY_DEPLOY_MCP.md`)

- **VPS (`api.rastro.pe`)**: ONLINE pero parado. 38 apps Express + Postgres 5432-5459.
- **MCP HTTP (Fly.io `treevu-rastro-mcp`)**: APAGADO desde 2026-09-27.
- **rastro-web (Cloudflare Pages)**: FUNCIONANDO pero solo el usuario no lo usa.
- **Local (stdio)**: MCP server + 38 APIs + Postgres vía Docker (`scripts/dev-local.sh`).

## Arquitectura objetivo

```
Agente (Claude Code/Cursor/Claude Desktop)
    → MCP Worker (Cloudflare Workers, rastro.fyi/mcp)
        → D1 databases (una por app, 38 DBs)
                ↑
    Scripts de ingestión (local, on-demand → D1 HTTP API)
```

### Cambios principales

| Capa | Antes | Después |
|---|---|---|
| MCP Server | Node + Express + Fly.io (APAGADO) | Cloudflare Worker (ESM) |
| Auth | API keys en Postgres (`mcp_api_keys`) | D1 binding (`rastro_mcp_db`) |
| Rate limit | Postgres-backed | D1-backed (presupuestos por key) |
| Data layer | 38× Postgres (VPS Docker) | 38× D1 bindings |
| API layer | 38× Express servers (VPS) | **ELIMINADO** — SQL directo desde MCP Worker |
| rastro-web | SPA React (14 dashboards) | **ELIMINADO** — MCP es el único canal |
| Ingesta | Scripts locales → Postgres VPS | Scripts locales → D1 HTTP API (on-demand) |

### Qué implica cada componente

#### 1. MCP Worker (`mcp-server/`)

- `http-transport.ts` (Express) → `worker.ts` (Cloudflare Workers fetch handler)
- `src/index.ts` (`invokeTool`): `callApi(url)` de HTTP → `env.DB.prepare(sql).bind(...params).all()` directamente
- Cada tool necesita su handler de SQL extraído de `apps/<app>/api/src/routes/*.ts`
- `http-client.ts` → `db-client.ts` (D1)
- Auth (`auth/api-key.ts`): migrar de `pg` a D1 queries
- `rastro_health`: ahora verifica D1 connections, no HTTP `/health`

#### 2. Catálogo de tools — de HTTP a D1

Antes:
```typescript
// catalog.ts — tool → URL de API
{ name: "radar_ejecucion_execution", app: "radar-ejecucion",
  pathTemplate: "/api/execution", querySchema: {...} }

// invokeTool: fetch(http://localhost:4000/api/execution?...)
```

Después:
```typescript
// catalog.ts — tool → handler de SQL
{ name: "radar_ejecucion_execution", app: "radar-ejecucion",
  handler: "execution",  // nombre del handler en handlers/radar-ejecucion/execution.ts
  querySchema: {...} }

// invokeTool: executeSql(env, tool.handler, validatedArgs)
```

El handler es el código de `apps/radar-ejecucion/api/src/routes/execution.ts` pero con
`pool.query` → `env.DB.prepare` y placeholders Postgres (`$1`) → D1 (`?`).

#### 3. Schema D1 (migration Postgres → SQLite)

Conversiones requeridas:
- `$1, $2` → `?` (parameter binding)
- `::int`, `::text` → eliminar cast (SQLite auto-convierte) o usar `CAST()`
- `DISTINCT ON (...)` → `ROW_NUMBER() OVER (...) + FILTER WHERE rn=1`
- `ILIKE` → `LIKE` (SQLite LIKE es case-insensitive para ASCII)
- `ARRAY_AGG` → `GROUP_CONCAT` (separador diferente, manejarlo)
- `jsonb` → `JSON` (con `.extract()` → `json_extract()`)
- `ON CONFLICT DO UPDATE` → sintaxis SQLite (`ON CONFLICT(col) DO UPDATE SET ...`)
- CTEs → compatibles en D1 (SQLite soporta CTEs recursivos)

Las migraciones `src/db/migrations/*.sql` también necesitan conversión.

#### 4. rastro-web — eliminación completa

- Borrar `apps/rastro-web/` (SPA no se usa)
- Borrar `apps/rastro-web/DEPLOY.md`, `README.md`
- Borrar references en `README.md` raíz, `wrangler.toml`, `.github/workflows/`
- Borrar `docs/` que son específicos de rastro-web (`ESTADO.md` → actualizar o archivar)
- Borrar `infra/api-proxy/` (nginx + PM2 + Caddyfile para rastro-web)
- Borrar `rastro-landing.html`

#### 5. VPS / Fly.io — decommission

- `infra/fly/` → archivar (gateway Caddy, Dockerfile.api)
- `infra/api-proxy/` → borrar (nginx, PM2 ecosystem, apps.tsv)
- `scripts/start-all-apis.sh`, `start-all-postgres.sh` → actualizar o archivar
- `scripts/dev-local.sh` → actualizar para D1
- `docs/FLY_DEPLOY_MCP.md`, `docs/API_PROXY_DEPLOY.md` → archivar

#### 6. Ingestion — D1 HTTP API

Los scripts de ingestión (`apps/*/api/src/ingest/*-connector.ts`) corren localmente
y escriben a D1 vía:
```bash
npx wrangler d1 execute <DB_NAME> --command="..." --remote
```
o la D1 HTTP API directamente (`@cloudflare/d1`).

Opcionalmente: un Worker "ingest endpoint" que reciba datos y los inserta.

## Fases de ejecución

### Fase 1 — Limpieza (1 día)
1. Borrar `apps/rastro-web/` del monorepo
2. Borrar `infra/api-proxy/` (nginx, PM2, apps.tsv)
3. Archivar `docs/FLY_DEPLOY_MCP.md`, `docs/API_PROXY_DEPLOY.md`, `docs/FLY_DEPLOY.md`
4. Actualizar `README.md` raíz (remover referencias a rastro-web, VPS)
5. Actualizar `docs/ESTADO.md` → `docs/HISTORIAL.md` (archivo, no se actualiza más)
6. Borrar workflows de GitHub Actions para rastro-web (`rastro-web-ci.yml`, `rastro-web-deploy.yml`)

### Fase 2 — MCP Worker + D1 (3-5 días)
1. Crear `mcp-server/src/handlers/` — un subdirectorio por app, con los handlers SQL extraídos
2. Convertir migraciones Postgres → D1 (script de conversión automática donde posible)
3. Migrar `mcp-server/src/index.ts` para usar D1 en vez de HTTP proxy
4. Migrar `mcp-server/src/auth/` a D1
5. Migrar `mcp-server/src/tools/health.ts` a D1 connectivity checks
6. `wrangler.toml` con D1 bindings para todas las apps
7. Deploy + test con datos reales

### Fase 3 — Ingesta a D1 (2-3 días)
1. Actualizar ingestion scripts para usar D1 HTTP API
2. Script de migración de datos: Postgres (VPS) → dump → D1 import
3. Verificar queries con datos migrados

### Fase 4 — Decommission VPS (inmediato después de Fase 3)
1. Apagar VPS, borrar DNS `api.rastro.pe`
2. Borrar Fly.io apps (`treevu-rastro-mcp`, `treevu-rastro-gw`, `treevu-rastro-pg`)
3. Actualizar `docs/conectores.md` para reflejar D1

## Riesgos y consideraciones

- **D1 tiene 10GB por DB**: `identidad-fiscal` (~2.3M rows) y `seguridad-ciudadana` (~369K rows) necesitan verificación de tamaño. Si excede, usar Neon como alternativa (Postgres serverless, compatible con queries existentes).
- **D1 tiene límite de request/response de 1MB**: queries que devuelven muchas filas (ej. listados completos) necesitan paginación obligatoria.
- **D1 tiene timeout de 50ms (min) / 30s (max) para queries**: algunas queries complejas pueden necesitar optimización.
- **No hay PostGIS en D1**: si alguna app usa geometría, necesita `geo-intersections` que usa PostGIS. Alternativa: migrar a Cloudflare D1 + Vectorizar para geometría, o usar Neon (tiene PostGIS).
- **Cross-app queries**: algunos Express routes hacen HTTP fetch a otras apps. En el Worker, esos becomes D1-to-D1 queries o lógica en el handler.

## Alternativa si D1 no funciona (Neon)

Si D1 presenta problemas (PostGIS, tamaño, funciones Postgres específicas):

1. Usar **Neon** (Postgres serverless) como D1 reemplazar
2. MCP Worker usa `@neondatabase/serverless` (WebSocket, compatible con Workers)
3. SQL stays en dialecto Postgres (casi cero conversión)
4. Ingesta: scripts locales → Neon connection string
5. Cuesta: Neon tiene free tier generoso (3GB), paga a partir de ahí

## Comandos clave

```bash
# Fase 1: borrar rastro-web
rm -rf apps/rastro-web/
rm -rf infra/api-proxy/

# Fase 2: deploy MCP Worker
cd mcp-server
npm run build
npx wrangler deploy

# Fase 3: migrar datos (desde dump Postgres o re-ingestar)
npx wrangler d1 execute rastro_radar_ejecucion --file=migration.sql --remote

# Testing local
npx wrangler dev mcp-server/src/worker.ts
```

---

**Decisión del usuario (2026-09-28): Neon.** Ver
[`adr/0024-neon-en-lugar-de-d1.md`](adr/0024-neon-en-lugar-de-d1.md).

El escaneo de las 38 apps descartó D1 por tres bloqueos: sin PostGIS, sin
transacciones ni advisory locks, y 6 conexiones simultáneas por invocación
contra las 24 conexiones cross-app que ya usa el repo. La decisión además
descartó Hyperdrive como vía de conexión —su tope de 25 configuraciones por
cuenta no alcanza para 38 bases— y confirmó que las 36 caben en un solo proyecto
Neon. El procedimiento está en
[`../mcp-server/RUNBOOK_NEON.md`](../mcp-server/RUNBOOK_NEON.md).
