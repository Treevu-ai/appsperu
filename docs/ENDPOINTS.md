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
