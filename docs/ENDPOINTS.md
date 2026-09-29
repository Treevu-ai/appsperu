# Endpoints de Rastro (2026-09-29)

> El MCP server tiene el código y el deploy listos (209/209 tools con handler
> contra Neon), pero **sin ruta pública activa todavía**: se publicó
> brevemente en `rastro.fyi/mcp` y se revirtió el mismo día al confirmar un
> hallazgo CRITICAL de security-review (el Worker acepta tráfico sin
> `x-api-key` — "modo abierto" — y quedaba expuesto a internet sin rate
> limit). Fly.io/VPS fue decommissionado por completo — ver
> [`docs/adr/0024-neon-en-lugar-de-d1.md`](adr/0024-neon-en-lugar-de-d1.md) y
> [`../mcp-server/RUNBOOK_NEON.md`](../mcp-server/RUNBOOK_NEON.md).

## Estado de cada endpoint

| Endpoint | Qué es | Stack | Estado 2026-09-29 |
|----------|--------|-------|-------------------|
| **https://www.rastro.fyi** | Sitio web (SPA) | Cloudflare Pages | Sirve HTML |
| `rastro-mcp-worker` | Protocolo MCP (Streamable HTTP), 209 tools vía 3 meta-tools | Cloudflare Worker + Neon | **Desplegado, sin ruta pública** (`routes = []`, `workers_dev = false` en `wrangler.toml`) |
| `https://mcp.rastro.fyi` | Subdominio viejo, apuntaba al Fly.io ya decommissionado | — | **502, DNS huérfano, no usar** |
| `https://api.rastro.pe` | VPS 149.104.66.100 | — | Offline (decommissionado) |
| `https://treevu-rastro-gw.fly.dev` | Gateway Caddy viejo | Fly.io | Offline (decommissionado) |

## Por qué no hay endpoint público todavía

`mcp-server/src/worker.ts` deja pasar requests sin `x-api-key` en "modo
abierto" (sin rate limit, sin presupuesto, sin log de uso). Mientras el Worker
no tenía ruta, eso no importaba porque era inalcanzable. En cuanto se le
asignó `rastro.fyi/mcp*` quedó explotable por cualquiera en internet contra
las ~38 bases de Neon. Se revirtió apenas se confirmó (borrando las routes
directamente vía API de Cloudflare, porque `wrangler deploy` con `routes = []`
no las quitó solo — hay que forzar el diff con la clave `routes` presente y
vacía, no omitida).

**Antes de reactivar la ruta pública, decidir una de estas dos:**
1. Aceptar el modo abierto como diseño intencional (datos públicos, sin PII
   sin enmascarar) y agregar un rate-limit a nivel de Cloudflare como control
   compensatorio.
2. Exigir `x-api-key` válida para todo tráfico HTTP público (el modo stdio
   local no se toca). La propia landing (`rastro-web`) ya asume esto: su
   flujo de "Solicitar acceso sk-rastro" y el snippet de setup muestran
   `x-api-key` como obligatorio.

## Cómo conectar al MCP hoy

### Cliente local por stdio (única forma soportada por ahora)

```bash
cd mcp-server
npm run dev
```

El meta-tool `rastro_health` reporta qué apps responden y cuántos tools tienen
backend. 209/209 tools tienen handler contra Neon. Excepción real (no de
código): `ceplan-geo` y `geo-intersections` (21 tools) — sus bases en Neon
todavía no se crearon, ver `RUNBOOK_NEON.md` sección "Pendientes conocidos".

### Reactivar el endpoint público (cuando se resuelva el punto de arriba)

```bash
cd mcp-server
# en wrangler.toml: descomentar el bloque `routes` y quitar `routes = []`
npx wrangler deploy
```

## Verificación

```bash
# Sitio web (Cloudflare Pages)
curl -I https://www.rastro.fyi

# Confirmar que el Worker sigue sin ruta pública (debe responder el landing, no el MCP)
curl -s https://www.rastro.fyi/mcp | head -c 200
```

## Decisión arquitectónica

- **Cloudflare Worker + Neon** es la capa del MCP — sin VPS, sin Fly.io, sin
  gateway aparte. Código y deploy completos.
- **Cloudflare Pages** en `rastro.fyi`/`www.rastro.fyi` sirve el sitio web.
- **Sin VPS** — `api.rastro.pe` está offline y decommissionado.
- **Sin ruta pública del Worker** hasta resolver el modo abierto (ver arriba).

**Actualizado:** 2026-09-29, tras completar la migración de handlers a Neon,
publicar y revertir la ruta pública del Worker por el hallazgo de seguridad.
