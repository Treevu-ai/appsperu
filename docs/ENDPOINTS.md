# Endpoints de Rastro (2026-09-29)

> El MCP server está **en producción con endpoint público**, `x-api-key`
> obligatoria. Fly.io/VPS fue decommissionado por completo — ver
> [`docs/adr/0024-neon-en-lugar-de-d1.md`](adr/0024-neon-en-lugar-de-d1.md) y
> [`../mcp-server/RUNBOOK_NEON.md`](../mcp-server/RUNBOOK_NEON.md).

## Estado de cada endpoint

| Endpoint | Qué es | Stack | Estado 2026-09-29 |
|----------|--------|-------|-------------------|
| **https://www.rastro.fyi** | Sitio web (SPA) | Cloudflare Pages | Sirve HTML |
| **https://www.rastro.fyi/mcp** | Protocolo MCP (Streamable HTTP), 209 tools vía 3 meta-tools | Cloudflare Worker + Neon | **En producción**, `x-api-key` obligatoria |
| **https://rastro.fyi/mcp** | Mismo Worker — el apex redirige (301) a `www` antes de evaluar routes | Cloudflare Worker + Neon | En producción (vía redirect) |
| `https://mcp.rastro.fyi` | Subdominio viejo, apuntaba al Fly.io ya decommissionado | — | **502, DNS huérfano, no usar** |
| `https://api.rastro.pe` | VPS 149.104.66.100 | — | Offline (decommissionado) |
| `https://treevu-rastro-gw.fly.dev` | Gateway Caddy viejo | Fly.io | Offline (decommissionado) |

## Historial de seguridad (resuelto)

`mcp-server/src/worker.ts` dejaba pasar requests sin `x-api-key` en "modo
abierto". Al publicar la ruta el mismo día, `security-reviewer` marcó
CRITICAL: cualquiera en internet podía llamar a los 209 tools sin límite.
Se revirtió la ruta, se cerró el modo abierto en el código (`x-api-key`
ahora obligatoria — 401 si falta o es inválida, tanto en GET como POST) y se
reactivó. El modo stdio local (`resolveActiveKey` en `index.ts`) no se tocó.

## Cómo conectar al MCP

### Cliente remoto (recomendado)

```
URL: https://www.rastro.fyi/mcp
Headers:
  Accept: application/json, text/event-stream
  x-api-key: sk-rastro-...
```

Sin `x-api-key` válida: `401`. Las keys se emiten a mano
(`npm run create-key -- --group <nombre> --limit <n> --tier <workshop|pilot|internal|admin>`)
contra la base `mcp` de Neon — no hay autoservicio.

209/209 tools tienen handler contra Neon. `rastro_health`: **38/38 apps `ok`,
209/209 tools operativos** — con datos reales, incluidas `ceplan-geo` y
`geo-intersections` (5831 intersecciones minería∩bosque calculadas, ver
`RUNBOOK_NEON.md`).

## Repo vs. desplegado: el catálogo va por delante del Worker

Las cifras de arriba son del **despliegue del 2026-09-29**, no del repo. El
repo ya tiene más tools que el Worker desplegado y esa diferencia no se
documentaba en ninguna parte, lo que hace el número ambiguo: no se sabe si
"209" describe lo desplegado o lo que hay en código.

| | Tools | Apps |
|---|---|---|
| **Build anterior a #223** (lo que reporta `rastro_health`) | 209 | 38 |
| **Repo** (`mcp-server/src/catalog.ts`) | 220 | 40 |

El doc ya decía 209/38 sin decir de dónde salía el número, y esa es la
ambigüedad que hace esta sección: no se sabe si describe un despliegue o el
código. Las dos filas son de fuentes distintas y verificables por separado.

Las 2 apps que faltan en ese build son `ositran-reclamos` y
`osinergmin-combustibles` (PR #223). De las 11 tools de diferencia, 2 son
`legislativo_congreso_cruces_infobras` y
`legislativo_congreso_cruce_infobras_proyecto` (PR #234, pendiente de
merge). El resto del delta viene de apps que ya estaban en el repo.

El "209 / 38" se obtuvo de `rastro_health` contra un cliente MCP conectado
por stdio que corre un build anterior a #223. Es consistente con un Worker
sin redesplegar, pero **no es una verificación del Worker de producción**:
para esa hace falta el `curl` de más abajo con `x-api-key`.

En el repo **220/220 tools tienen handler** contra Neon — se verifica con:

```bash
cd mcp-server
node -e "const {TOOL_CATALOG}=require('./dist/catalog.js');
  console.log(TOOL_CATALOG.length, new Set(TOOL_CATALOG.map(t=>t.app)).size,
              TOOL_CATALOG.filter(t=>t.handler).length)"
# 220 40 220   (total tools, apps, tools con handler)
```

Que el repo vaya por delante **no** significa que el Worker sirva esos
endpoints: llamar a un tool que no está en el build desplegado falla. El
estado real del Worker hay que sacarlo de él, no del repo:

```bash
curl -s https://www.rastro.fyi/mcp -X POST \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: sk-rastro-..." \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"rastro_health","arguments":{}}}'
```

**Ojo con `rastro_health` en stdio:** sin `NEON_DATABASE_URL` en el entorno
reporta todas las apps como `sin_base` y `toolsOperativos: 0`. Eso es el
cliente local sin base configurada, no el estado del Worker — para lo
último sirve el `curl` de arriba.

### Cliente local por stdio (para desarrollo)

```bash
cd mcp-server
npm run dev
```

## Verificación

```bash
# Sitio web (Cloudflare Pages)
curl -I https://www.rastro.fyi

# MCP sin key — debe dar 401
curl -s https://www.rastro.fyi/mcp -X POST \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# MCP con key — handshake
curl -s https://www.rastro.fyi/mcp -X POST \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: sk-rastro-..." \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0.0.1"}}}'
```

## Decisión arquitectónica

- **Cloudflare Worker + Neon** sirve el MCP público — sin VPS, sin Fly.io,
  sin gateway aparte.
- **`x-api-key` obligatoria** en el transporte HTTP público (no en stdio).
- **Cloudflare Pages** en `rastro.fyi`/`www.rastro.fyi` sirve el sitio web;
  el Worker toma prioridad sobre Pages solo para el path `/mcp*`.
- **Sin VPS** — `api.rastro.pe` está offline y decommissionado.

**Actualizado:** 2026-09-29, migración completa: 209/209 tools, endpoint
público con auth obligatoria, `ceplan_geo`/`geo_intersections` provisionadas
y con datos reales en Neon.
