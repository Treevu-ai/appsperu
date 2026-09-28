# Endpoints de Rastro (2026-09-27)

> **El MCP server es solo para uso local por stdio.** No hay hosting ni deploy
> del MCP, y el gateway **no** lo expone. Toda la infraestructura Fly.io está
> detenida por decisión de costo. Detalle verificado en
> [`docs/FLY_DEPLOY_MCP.md`](FLY_DEPLOY_MCP.md).

## Estado de cada endpoint

| Endpoint | Qué es | Stack | Estado 2026-09-27 |
|----------|--------|-------|-------------------|
| **https://rastro.fyi** | Sitio web (SPA). Devuelve el `index.html` del SPA para cualquier path, incluido `/mcp`; no es MCP ni proxy al gateway | Cloudflare Pages | Sirve HTML |
| **https://treevu-rastro-gw.fly.dev** | API Gateway (Caddy) que enruta `/<slug>/*` a las APIs del catálogo. No tiene handler `/mcp` (ver `infra/fly/gateway/Caddyfile`) | Fly.io (`treevu-rastro-gw`) | Apagado (Fly) |
| `https://mcp.rastro.fyi/mcp` | Era el **único** endpoint que servía el protocolo MCP (app `treevu-rastro-mcp`, header `x-api-key`) | Fly.io | Apagado (Fly), sin deploy |
| `https://api.rastro.pe` | VPS 149.104.66.100; nada escucha en 443 | — | Offline |

## Cómo conectar al MCP

### Cliente local por stdio (única forma soportada)

```bash
cd mcp-server
npm run dev
# Conexión: stdio local (Claude Desktop, Cursor, Kilo CLI, etc.)
```

Para levantar las APIs locales que consume el MCP ver `scripts/dev-local.sh`.
El meta-tool `rastro_health` reporta qué apps responden y cuántos tools tienen
backend.

### Cliente remoto

No disponible: el MCP no tiene hosting. El transporte HTTP
(`MCP_TRANSPORT=http`) existe en el código pero no está desplegado en ningún
lado.

## Verificación

```bash
# Sitio web (Cloudflare Pages)
curl -I https://rastro.fyi

# Gateway (hoy apagado; cuando esté encendido responde en / y en /<slug>/*)
curl -I https://treevu-rastro-gw.fly.dev
curl https://treevu-rastro-gw.fly.dev/radar-ejecucion/health
```

## Decisión arquitectónica

- **Un gateway compartido** (`treevu-rastro-gw`) expone las APIs del catálogo vía HTTP (`/<slug>/*`); **no** expone el MCP
- **MCP solo local por stdio** — sin MCP server hosteado, sin deploy; simplifica mantenimiento y reduce costos
- **Cloudflare Pages** en `rastro.fyi` sirve el sitio web
- **Sin VPS** — `api.rastro.pe` está offline

**Actualizado:** 2026-09-27, alineado con `docs/FLY_DEPLOY_MCP.md` (MCP solo local, Fly apagado).
