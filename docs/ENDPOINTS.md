# Endpoints de Rastro (2026-09-26)

## Operativos ✓

| Endpoint | Descripción | Stack | Status |
|----------|-------------|-------|--------|
| **https://rastro.fyi** | Web + API Gateway (recomendado) | Cloudflare → Fly.io (treevu-rastro-gw) | ✓ HTTP 200 |
| **https://treevu-rastro-gw.fly.dev** | API Gateway directo (sin Cloudflare) | Fly.io | ✓ HTTP 200 |

## Deprecados ✗

| Endpoint | Razón |
|----------|-------|
| `https://mcp.rastro.fyi/mcp` | App `treevu-rastro-mcp` reemplazada por gateway compartido |
| `https://api.rastro.pe` | VPS 149.104.66.100 offline desde hace semanas |

## Cómo conectar

### Cliente local (desarrollo)

```bash
cd C:\Users\acuba\appsperu\mcp-server
npm run dev
# Conexión: stdio local (Claude Desktop, Cursor, Kilo CLI, etc.)
```

### Cliente remoto (producción)

```
Usar: https://rastro.fyi
Header (si requiere auth): x-api-key: <clave-si-aplica>
```

## Verificación

```bash
# Ambos endpoints operativos
curl -I https://rastro.fyi
curl -I https://treevu-rastro-gw.fly.dev

# Búsqueda de tools
curl https://treevu-rastro-gw.fly.dev/api/tools?query=presupuesto

# Ejecución de tool
curl -X POST https://treevu-rastro-gw.fly.dev/api/call \
  -H "Content-Type: application/json" \
  -d '{"tool":"radar_ejecucion_execution","args":{"anio":"2026"}}'
```

## Decisión arquitectónica

- **Un gateway compartido** (`treevu-rastro-gw`) expone todas las 38 APIs del catálogo + MCP
- **Cloudflare proxy** en `rastro.fyi` para caché, DDoS protection, y SSL
- **Sin VPS** — todo en Fly.io (más confiable, auto-healing, escalable)
- **Sin MCP server standalone** — simplifica mantenimiento, reduce costos

**Actualizado:** 2026-09-26, después de auditoría y reactivación post-suspensión.
