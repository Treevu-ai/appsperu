# Despliegue del transporte HTTP del MCP server — `rastro.fyi`

> Endpoints de producción (ambos operativos):
> - `https://rastro.fyi` — proxy Cloudflare a gateway Fly.io  
> - `https://treevu-rastro-gw.fly.dev/mcp` — endpoint directo Fly.io

**DEPRECATED: `https://mcp.rastro.fyi/mcp`** — La app `treevu-rastro-mcp` fue una instancia standalone 
inicial. Se depreca en favor del gateway compartido `treevu-rastro-gw` que ya gestiona todas las 40 APIs.

**DEPRECADO TAMBIÉN: `api.rastro.pe`** — VPS 149.104.66.100 está offline. No usar.

## Endpoints operativos

| Endpoint | Stack | Transport | Status |
|----------|-------|-----------|--------|
| `https://rastro.fyi` | Cloudflare → treevu-rastro-gw (Fly.io) | HTTP(S) | ✓ 200 OK |
| `https://treevu-rastro-gw.fly.dev` | treevu-rastro-gw (Fly.io) directo | HTTP(S) | ✓ 200 OK |

Ambos resuelven al mismo gateway. Usar **`rastro.fyi`** (con proxy Cloudflare) para cliente externo;
usar **`treevu-rastro-gw.fly.dev`** para conexiones internas/desarrollo si no necesitas Cloudflare.

## Ingesta / Scheduler (no implementado)

Este servidor es **pasivo**: solo expone las 40 APIs ya levantadas como tools MCP. No ejecuta ingestas.

Todas las ingestas son manuales. Dispararlas desde:
```bash
cd apps/<app>/api
npm run dev              # inicia server
# en otra terminal:
npm run ingest:*         # según los scripts que declare cada app
```

O batch via script:
```bash
bash scripts/ingest-la-libertad-completo.sh
```

## Verificación

```bash
# Verificar ambos endpoints
curl -s https://rastro.fyi/health | jq .
curl -s https://treevu-rastro-gw.fly.dev/health | jq .
# Ambos deben responder 200 OK
```

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `https://rastro.fyi` responde 403 o error | Cloudflare bloqueando o DNS fuera de sync | `nslookup rastro.fyi` → debe resolver a Cloudflare IPs (2606:4700:*) |
| `https://treevu-rastro-gw.fly.dev` responde 502 | Gateway apagado o upstreams down | `flyctl status -a treevu-rastro-gw`, `flyctl logs -a treevu-rastro-gw` |
| MCP tools no responden | Alguna de las 40 APIs está suspendida en Fly | `flyctl apps list` → verificar estado de todas las `treevu-rastro-*` apps |

## Referencias

- [`docs/FLY_DEPLOY.md`](FLY_DEPLOY.md) — despliegue del gateway y las 40 APIs en Fly.io
- [`mcp-server/README.md`](../mcp-server/README.md) — arquitectura interna del servidor MCP
- [`mcp-server/FLY_DEPLOY_HTTP.md`](../mcp-server/docs/FLY_DEPLOY_HTTP.md) (si existe) — detalles HTTP del transporte remoto
