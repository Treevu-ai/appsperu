# CLI Market — MCP (`market-mcp`)

[CLI Market](https://cli-market.dev) es infraestructura de comercio para agentes IA (precios LATAM,
retailers, canasta, inflación, etc.). El backend público de este monorepo es **Rastro**; CLI Market
vive en el paquete PyPI [`cli-market-world`](https://pypi.org/project/cli-market-world/) y expone
MCP de dos formas equivalentes.

## API en producción

| Recurso | URL |
|---|---|
| API base | `https://cli-market-api.fly.dev` |
| Health | `GET /` |
| OpenAPI / Swagger | `GET /docs` |
| MCP (Streamable HTTP) | `POST/GET/DELETE /mcp` |
| Server card (descubrimiento) | `GET /.well-known/mcp/server-card.json` |

Verificado en vivo: el root responde `{"name":"CLI Market","status":"running",...}` y el MCP
acepta `initialize` sin token; **`tools/call` exige** `Authorization: Bearer sk-...`.

Clave gratis: registro en la API (`POST /auth/register`) o en [cli-market.dev](https://cli-market.dev).

Variables que entiende el cliente stdio `market-mcp` (ver `cli-market-core`):

- `MARKET_API_URL` — por defecto ya es `https://cli-market-api.fly.dev`; úsala solo si apuntas a
  un backend local (`http://127.0.0.1:8765`).
- `MARKET_API_TOKEN` o `CLI_MARKET_API_KEY` — la clave `sk-...`.

## Cursor / Claude — opción A: MCP remoto (recomendado)

No requiere Python local; el servidor MCP corre en Fly.io:

```json
{
  "mcpServers": {
    "market-mcp": {
      "url": "https://cli-market-api.fly.dev/mcp",
      "headers": {
        "Authorization": "Bearer sk-TU_CLAVE"
      }
    }
  }
}
```

## Cursor / Claude — opción B: stdio (`market-mcp`)

Tras `pip install cli-market-world` (o `uv tool install cli-market-world`):

```json
{
  "mcpServers": {
    "market-mcp": {
      "command": "market-mcp",
      "env": {
        "MARKET_API_URL": "https://cli-market-api.fly.dev",
        "MARKET_API_TOKEN": "sk-TU_CLAVE"
      }
    }
  }
}
```

Con `uvx` sin instalación global:

```json
{
  "mcpServers": {
    "market-mcp": {
      "command": "uvx",
      "args": ["--from", "cli-market-world", "market-mcp"],
      "env": {
        "MARKET_API_URL": "https://cli-market-api.fly.dev",
        "MARKET_API_TOKEN": "sk-TU_CLAVE"
      }
    }
  }
}
```

## Convivencia con Rastro

Este repo incluye **`rastro`** (`mcp-server/`, meta-tools `rastro_buscar_tools` + `rastro_llamar`
sobre las APIs del Estado peruano). **`market-mcp`** es independiente: datos de retail LATAM. Puedes
tener ambos en el mismo `~/.cursor/mcp.json` — ver `.mcp.json.example`.

## Comprobar conectividad

```bash
curl -sS https://cli-market-api.fly.dev/
curl -sS https://cli-market-api.fly.dev/.well-known/mcp/server-card.json | head
```

Con clave:

```bash
curl -sS -H "Authorization: Bearer sk-TU_CLAVE" \
  "https://cli-market-api.fly.dev/v1/stats" | head
```
