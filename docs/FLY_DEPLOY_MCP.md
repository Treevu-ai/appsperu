# Despliegue del transporte HTTP del MCP server — `mcp.rastro.fyi`

> Fase 1-D del spec de códigos `sk-rastro-...`. A diferencia de `docs/FLY_DEPLOY.md` (14 APIs +
> gateway compartido + Postgres compartido `rastro-api-pg`), esto es **una sola app standalone**,
> con su propio Postgres (la DB `rastro_keys`, hoy local vía Docker) y su propio subdominio — no
> pasa por el gateway Caddy `rastro-api-gw` ni comparte su red privada.

Todos los comandos de este runbook los ejecuta un humano. `flyctl` requiere sesión interactiva
(`flyctl auth login`) o `FLY_API_TOKEN` — ninguno de los dos está disponible para el agente en
este entorno.

## Requisitos

- Cuenta de Fly.io (misma consideración que `docs/FLY_DEPLOY.md` — evitar depender de una cuenta
  que Ricardo no controle).
- `flyctl` instalado y autenticado: `flyctl auth login`.
- Acceso de administrador a la zona `rastro.fyi` en Cloudflare (mismo lugar que ya gestiona
  `api.rastro.fyi` y `rastro-web`).
- Decidir antes de desplegar: **¿la DB de keys sigue siendo el Postgres local (Docker, puerto
  5436) o se promueve a un Postgres real?** Un proceso en Fly no puede conectarse a un Postgres
  en `localhost` de la máquina de desarrollo — hace falta un Postgres alcanzable desde Fly
  (`fly postgres create` para uno nuevo dedicado, o reusar `rastro-api-pg` con una base
  `rastro_keys` adicional). **No asumir cuál — confirmar antes de este paso.**

## Setup (una sola vez)

```bash
cd mcp-server
flyctl apps create rastro-mcp -o personal   # cambiar "rastro-mcp" si ya está tomado
flyctl postgres create ...                  # o adjuntar rastro_keys a un cluster ya existente,
                                             # según lo decidido arriba
flyctl secrets set MCP_API_DATABASE_URL="postgres://..." -a rastro-mcp
flyctl deploy -a rastro-mcp
```

`fly.toml` y `Dockerfile` ya están commiteados en `mcp-server/` (standalone, no usan el patrón
compartido de `infra/fly/Dockerfile.api` porque `mcp-server/` no es workspace member y vive en la
raíz del repo, no bajo `apps/<slug>/api`).

## DNS + certificado (mismo baile de dos pasos que `api.rastro.fyi`)

```bash
flyctl ips list -a rastro-mcp
# anotar la IPv4 y la IPv6 propias de ESTA app (no las del gateway rastro-api-gw)
```

En Cloudflare, zona `rastro.fyi`:
1. Crear registro `A` (IPv4) y `AAAA` (IPv6) para `mcp` apuntando a esas IPs, **DNS-only** (nube
   gris, sin proxy) — Fly necesita esto para poder emitir su propio certificado Let's Encrypt.
2. `flyctl certs add mcp.rastro.fyi -a rastro-mcp`
3. `flyctl certs show mcp.rastro.fyi -a rastro-mcp` — esperar "Ready" (puede tardar unos minutos;
   si se queda en "Awaiting configuration", verificar con `dig mcp.rastro.fyi` que resuelve a las
   IPs de Fly, no a las de Cloudflare, mientras el DNS-only sigue activo).
4. Recién con el cert "Ready", activar el proxy de Cloudflare (nube naranja) para `mcp`.

## Verificación

```bash
curl -s https://mcp.rastro.fyi/health
# → {"status":"ok"}
```

Emitir un código de prueba y probar el handshake completo (mismo flujo ya validado en local):

```bash
cd mcp-server
npm run create-key -- --group "prueba-prod" --limit 3
curl -s -i -X POST https://mcp.rastro.fyi/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: sk-rastro-..." \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl-test","version":"1.0"}},"id":1}'
```

Después, en Claude Desktop: Configuración → Conectores → Agregar conector personalizado, URL
`https://mcp.rastro.fyi/mcp`, con el código `sk-rastro-...` como credencial (el campo exacto lo
define la UI de conectores de Claude Desktop en el momento — puede ser un header custom o un
campo de API key dedicado; confirmar contra la UI real al momento de configurarlo).

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `fly apps create` falla con "name taken" | `rastro-mcp` ya existe (otra cuenta) | Usar otro nombre, ej. `rastro-mcp-v2`, y actualizar `app` en `mcp-server/fly.toml` |
| `fly certs show` en "Awaiting configuration" | DNS no propagó, o quedó proxied antes de tiempo | `dig mcp.rastro.fyi` debe resolver a las IPs de Fly directamente mientras se espera el cert |
| 401 en `/mcp` con una key que sabés que es válida | Probablemente falta el header `x-api-key` o el cliente lo manda con otro nombre | Confirmar el nombre exacto de header/campo que use la UI de conectores de Claude Desktop |
| 502 / la app no arranca | Migración fallida contra `MCP_API_DATABASE_URL`, o la variable no está seteada | `fly logs -a rastro-mcp` — el entrypoint corre la migración con `set -e`, así que un fallo de schema tumba el arranque en vez de servir en silencio |
