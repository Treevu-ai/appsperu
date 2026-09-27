# Despliegue del transporte HTTP del MCP server — `mcp.rastro.fyi`

> Fase 1-D del spec de códigos `sk-rastro-...`. A diferencia de `docs/FLY_DEPLOY.md` (14 APIs +
> gateway compartido + Postgres compartido `treevu-rastro-pg`), esto es **una sola app
> standalone**, con su propio subdominio — no pasa por el gateway Caddy `treevu-rastro-gw` ni
> comparte su red privada.

**DESPLEGADO EN PRODUCCIÓN (2026-09-21).** Este runbook queda como referencia para un
redeploy/recreación, no como pasos pendientes. Estado real:

- App: `treevu-rastro-mcp` (no `rastro-mcp` — se usó el prefijo `treevu-rastro-*` de las otras 14
  apps ya desplegadas, evita colisión de nombre global en Fly).
- DB de keys (`rastro_keys`): **no** es un Postgres dedicado — se adjuntó como base adicional al
  cluster ya existente `treevu-rastro-pg` (`flyctl postgres attach`, ver Setup abajo). Más barato
  y simple que un cluster nuevo.
- URL: `https://mcp.rastro.fyi/mcp`.

## Requisitos

- Cuenta de Fly.io (misma consideración que `docs/FLY_DEPLOY.md` — evitar depender de una cuenta
  que Ricardo no controle).
- `flyctl` instalado y autenticado: `flyctl auth login` requiere una terminal interactiva real
  (no funciona dentro de la sesión de Claude Code vía `!comando` — confirmado en vivo 2026-09-21,
  el shell de la herramienta no es un TTY completo). Abrir PowerShell/cmd directo en Windows, o
  usar un token de acceso personal (`FLY_API_TOKEN`, creado en
  https://fly.io/user/personal_access_tokens) si se necesita correr `flyctl` desde un entorno no
  interactivo.
- Acceso de administrador a la zona `rastro.fyi` en Cloudflare (mismo lugar que ya gestiona
  `api.rastro.fyi` y `rastro-web`).

## Setup (ya ejecutado — referencia para redeploy)

```bash
flyctl apps create treevu-rastro-mcp -o personal

# Adjunta rastro_keys al cluster ya existente treevu-rastro-pg (no crea un
# Postgres nuevo) y setea MCP_API_DATABASE_URL automáticamente como secret:
flyctl postgres attach treevu-rastro-pg -a treevu-rastro-mcp \
  --database-name rastro_keys --database-user rastro_mcp \
  --variable-name MCP_API_DATABASE_URL -y

cd mcp-server
flyctl deploy -a treevu-rastro-mcp
```

`fly.toml` y `Dockerfile` ya están commiteados en `mcp-server/` (standalone, no usan el patrón
compartido de `infra/fly/Dockerfile.api` porque `mcp-server/` no es workspace member y vive en la
raíz del repo, no bajo `apps/<slug>/api`).

**Bug real encontrado en el primer intento de deploy (PR #174, 2026-09-21):** `tsc` solo compila
`.ts`, nunca copia los `.sql` de `src/db/migrations/` — el contenedor crasheaba 10 veces
(`ENOENT` en `dist/db/migrations`) hasta que Fly lo marcaba muerto. El `Dockerfile` ya tiene el
fix (`RUN mkdir -p dist/db/migrations && cp src/db/migrations/*.sql dist/db/migrations/`, mismo
patrón que `infra/fly/Dockerfile.api` usa para las otras 27 apps) — si se toca el Dockerfile,
verificar con un build local (`docker build .` + `docker run --entrypoint ls ... dist/db/migrations`)
antes de deployar a Fly, no confiar solo en que `tsc` compiló sin errores.

## DNS + certificado (mismo baile de dos pasos que `api.rastro.fyi`)

```bash
flyctl ips list -a treevu-rastro-mcp
# anotar la IPv4 y la IPv6 propias de ESTA app (no las del gateway treevu-rastro-gw)
```

En Cloudflare, zona `rastro.fyi`:
1. Crear registro `A` (IPv4) y `AAAA` (IPv6) para `mcp` apuntando a esas IPs, **DNS-only** (nube
   gris, sin proxy) — Fly necesita esto para poder emitir su propio certificado Let's Encrypt.
2. `flyctl certs add mcp.rastro.fyi -a treevu-rastro-mcp`
3. `flyctl certs show mcp.rastro.fyi -a treevu-rastro-mcp` — esperar "Issued"/"Ready" (puede
   tardar unos minutos; si se queda en "Not verified"/"Awaiting configuration", verificar con
   `nslookup mcp.rastro.fyi` que resuelve a las IPs de Fly, no a las de Cloudflare, mientras el
   DNS-only sigue activo).
4. Recién con el cert emitido, activar el proxy de Cloudflare (nube naranja) para `mcp`.

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

`npm run create-key` corre localmente y necesita `MCP_API_DATABASE_URL` apuntando a la DB real —
el secret ya está seteado en Fly (usable desde dentro de la red privada de la app), pero para
correr el script desde la máquina de desarrollo hace falta la connection string pública/externa
del cluster `treevu-rastro-pg`, no la interna `.flycast` que usa la app en producción.

Después, en Claude Desktop: Configuración → Conectores → Agregar conector personalizado, URL
`https://mcp.rastro.fyi/mcp`, con el código `sk-rastro-...` como credencial (el campo exacto lo
define la UI de conectores de Claude Desktop en el momento — puede ser un header custom o un
campo de API key dedicado; confirmar contra la UI real al momento de configurarlo).

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `fly apps create` falla con "name taken" | `treevu-rastro-mcp` ya existe, o el nombre elegido colisiona con otra cuenta | Usar otro nombre y actualizar `app` en `mcp-server/fly.toml` |
| `fly certs show` en "Not verified"/"Awaiting configuration" | DNS no propagó, o quedó proxied antes de tiempo | `nslookup mcp.rastro.fyi` debe resolver a las IPs de Fly directamente mientras se espera el cert |
| 401 en `/mcp` con una key que sabés que es válida | Probablemente falta el header `x-api-key` o el cliente lo manda con otro nombre | Confirmar el nombre exacto de header/campo que use la UI de conectores de Claude Desktop |
| Contenedor crashloopea, `ENOENT ... dist/db/migrations` | El Dockerfile no copió los `.sql` al build (ver nota arriba) | Verificar con un build local antes de deployar |
| 502 / la app no arranca | Migración fallida contra `MCP_API_DATABASE_URL`, o la variable no está seteada | `flyctl logs -a treevu-rastro-mcp --no-tail` — el entrypoint corre la migración con `set -e`, así que un fallo de schema tumba el arranque en vez de servir en silencio |
