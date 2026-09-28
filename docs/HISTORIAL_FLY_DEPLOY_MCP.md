# Despliegue del transporte HTTP del MCP server — `rastro.fyi`

> **Documentación archivada.** Describe el deploy en Fly.io, que está apagado.
> No aplica al uso local. Para usar el MCP en local (stdio) ver
> [`docs/ENDPOINTS.md`](ENDPOINTS.md), `scripts/dev-local.sh` y la tool `rastro_health`.

> **Estado verificado en vivo el 2026-09-27.** Toda la infraestructura Fly.io
> está detenida (0 máquinas encendidas) por decisión de costo y no se hacen
> deploys. Para uso local ver `scripts/dev-local.sh`; el MCP corre por stdio con `npm run dev` y no
> necesita ningún deploy.
>
> El que sigue es el mapa de lo que se verificó, no de lo que está operativo hoy.

## Endpoints — qué es cada uno de verdad

Verificado contra el servidor, no contra la documentación anterior (que estaba
equivocada en tres de las cuatro filas):

| Endpoint | Qué es realmente | Estado 2026-09-27 |
|----------|------------------|-------------------|
| `https://mcp.rastro.fyi/mcp` | **El único que sirve el protocolo MCP** — la app `treevu-rastro-mcp` (Express + MCP SDK). Exige header `x-api-key`; sin él responde `401`. | Apagada (Fly) |
| `https://rastro.fyi/mcp` | El SPA de Cloudflare Pages. Responde HTML, no MCP. | Sirve HTML |
| `https://treevu-rastro-gw.fly.dev/mcp` | Responde `200` con **cuerpo vacío**. El `Caddyfile` del gateway no tiene handler `/mcp` (ver `infra/fly/gateway/Caddyfile`), así que no hay MCP detrás. | Apagada (Fly) |
| `https://api.rastro.pe` | `connection refused` en 443. DNS resuelve a `149.104.66.100` (Fly), pero nada escucha. | Offline |

**Corrección importante:** este doc marcaba `mcp.rastro.fyi` como *deprecado* a
favor del gateway. Era al revés — `mcp.rastro.fyi` es el único endpoint MCP
real, y el gateway no expone `/mcp` en absoluto. `rastro.fyi` no es "proxy
Cloudflare al gateway": es el sitio de Cloudflare Pages, que devuelve el
`index.html` del SPA para cualquier path.

## Autenticación

Header `x-api-key` con un código `sk-rastro-...`, validado **en cada request**
contra la tabla `mcp_api_keys` de `treevu-rastro-pg` (solo hash SHA-256;
`mcp-server/src/auth/api-key.ts:70`). Transporte streamable HTTP sobre SSE:
`initialize` devuelve `mcp-session-id` y las llamadas siguientes lo requieren.

## Envs que faltaban en producción

`mcp-server` resuelve la URL de cada app con `baseUrlFor()`
(`mcp-server/src/apps.ts`), que lee `<APP>_API_URL` del entorno y cae a
`http://localhost:<puerto>` si no está. En Fly nunca se seteó ninguna de las 38
variables, así que **las 169 tools que anunciaba producción fallaban todas** con
`No se pudo conectar a http://localhost:4000/...`. La app Fly tampoco define
`[env]` para ellas ni el `docker-entrypoint.sh` las genera.

Para diagnosticar ese tipo de problema existe el meta-tool `rastro_health`,
que reporta qué apps responden de verdad y cuántos tools tienen backend.

## Ingesta / Scheduler (no implementado)

Este servidor es **pasivo**: solo expone las 38 APIs del catálogo como tools MCP. No ejecuta ingestas.

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

## Verificación (histórico)

> Estos checks eran para el deploy archivado en Fly. Hoy el gateway está
> apagado y no hay que esperar `200`. Para diagnosticar en local usar
> `rastro_health` y `scripts/dev-local.sh`.

```bash
# Histórico: verificación de ambos endpoints cuando el deploy estaba activo
curl -s https://rastro.fyi/health | jq .
curl -s https://treevu-rastro-gw.fly.dev/health | jq .
# (Con el deploy activo) ambos respondían 200 OK
```

## Troubleshooting (histórico)

> Los comandos `flyctl` de esta tabla eran para el deploy archivado en Fly;
> **no usarlos hoy**. Para diagnosticar el MCP en local: la tool `rastro_health`
> (qué apps responden y cuántos tools tienen backend) y `scripts/dev-local.sh`.

| Síntoma | Causa probable | Fix |
|---|---|---|
| `https://rastro.fyi` responde 403 o error | Cloudflare bloqueando o DNS fuera de sync | `nslookup rastro.fyi` → debe resolver a Cloudflare IPs (2606:4700:*) |
| `https://treevu-rastro-gw.fly.dev` responde 502 | Gateway apagado o upstreams down | `flyctl status -a treevu-rastro-gw`, `flyctl logs -a treevu-rastro-gw` |
| MCP tools no responden | Alguna de las 38 APIs del catálogo está suspendida en Fly | `flyctl apps list` → verificar estado de todas las `treevu-rastro-*` apps |

## Referencias

- [`docs/FLY_DEPLOY.md`](FLY_DEPLOY.md) — despliegue del gateway y las APIs en Fly.io (hay 40 directorios `apps/*/api`; el catálogo MCP cubre 38) — archivado
- [`mcp-server/README.md`](../mcp-server/README.md) — arquitectura interna del servidor MCP
- [`mcp-server/FLY_DEPLOY_HTTP.md`](../mcp-server/docs/FLY_DEPLOY_HTTP.md) (si existe) — detalles HTTP del transporte remoto
