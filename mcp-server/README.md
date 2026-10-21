# appsperu-mcp-server

Servidor MCP que expone el catálogo de APIs (`APP_KEYS` en `src/apps.ts`) como datos de solo
lectura para un agente Claude, vía **meta-tools** — no un tool por endpoint. Ver el plan de diseño
y el catálogo completo de tools en [`docs/conectores.md`](../docs/conectores.md) (cada
`description` de tool se deriva de esa ficha técnica).

> **La cifra exacta de apps/tools cambia con cada conector nuevo — no la copies de aquí.**
> Obtenla en vivo:
> ```bash
> node -e "const {TOOL_CATALOG}=require('./dist/catalog.js'); \
>   console.log(TOOL_CATALOG.length, 'tools,', new Set(TOOL_CATALOG.map(t=>t.app)).size, 'apps')"
> ```
> (`npm run build` primero si `dist/` no está al día). Al 2026-10-21: **269 tools, 46 apps**,
> todas con `handler` propio — incluidas `sunat-aduanas` y `territorio-inteligencia`, que en
> versiones anteriores de este documento figuraban como excluidas. Ya no lo están.

## Interfaz: meta-tools, no un tool por endpoint

En vez de registrar un tool MCP por cada entrada del catálogo (costo de contexto fijo por sesión
aunque el cliente use 2 o 3), el servidor expone 4 tools MCP (ver `registerMetaTools` en
`src/index.ts`):

- **`rastro_buscar_tools(query?, app?, limit?)`** — busca en `src/catalog.ts` por palabra clave
  y/o app, devuelve nombre + descripción + params de los que matchean. Úsalo primero.
- **`rastro_llamar(tool, args?)`** — ejecuta el nombre exacto encontrado con `rastro_buscar_tools`:
  si el tool tiene `handler`, corre SQL directo contra Neon; si no, hace `GET` 1:1 por HTTP proxy
  contra la API Express real de su app (pass-through de `{ status, body }`, sin transformar el
  shape de la respuesta) — ver "Flujo local completo" más abajo.
- **`rastro_health(app?)`** — diagnóstico: `GET /health` de cada app (o de una sola), para
  distinguir "la app está caída" de "no hay datos en la fuente" antes de gastar una consulta.
- **`riesgo_territorial_resumen(departamento, ruc?)`** — vista compuesta que orquesta varias
  fuentes territoriales en una sola llamada.

Onboardear una app nueva es solo agregar filas a `TOOL_CATALOG` (`src/catalog.ts`) — no crece la
cantidad de tools que un cliente MCP carga por adelantado en cada sesión. Ver `src/search.ts`
(implementación de la búsqueda) y `src/index.ts` (`registerMetaTools`).

Auditoría de sincronización catálogo↔rutas Express: `src/__tests__/routes-vs-catalog.test.ts`
(comparación estática) y `src/__tests__/catalog.test.ts` (detección de tools renombrados/borrados).
Correr `npm test` para el estado actual — no asumas que la última auditoría manual (2026-09-25,
199 tools) sigue describiendo el catálogo de hoy.

## Flujo local completo

```
Cliente MCP (Claude Desktop/Code, Cursor, Kiro, MiniMax)
  → node mcp-server/dist/index.js   (transporte stdio)
  → rastro_buscar_tools              (busca en src/catalog.ts, no pega a ninguna API)
  → rastro_llamar(tool, args)
       ├─ tool.handler definido Y hay NEON_DATABASE_URL en el entorno
       │     → ejecuta SQL directo contra Neon (src/handlers/<app>/*.ts)
       └─ si no (caso por defecto en stdio sin NEON_DATABASE_URL)
             → proxy HTTP a la API Express local de esa app (ver tabla de puertos abajo)
```

Para el fallback HTTP necesitas las apps Express del catálogo corriendo en local (ver
[`docs/ESTADO.md`](../docs/ESTADO.md) — `docker compose up -d` + `npm run dev` en cada
`apps/<nombre>/api`). Este servidor no las levanta ni las reemplaza, solo las agrega detrás de una
interfaz MCP. Si una app no está corriendo, sus tools devuelven un error de conectividad explícito
(`isError: true`) en vez de fallar en silencio o tumbar el proceso completo — el resto de tools
sigue funcionando. Con `NEON_DATABASE_URL` definida, los tools con `handler` (incluidos los
MCP-only que no tienen ruta Express, ej. MINCETUR/Comtrade/WDI) funcionan en stdio sin que la app
Express correspondiente esté levantada — ver `resolveStdioEnv` en `src/index.ts`.

## Uso

```bash
npm install
npm run build
npm start          # transporte stdio — para conectar desde Claude Desktop/Claude Code
```

Durante desarrollo, `npm run dev` corre `src/index.ts` directo con `tsx` (sin build previo).

### Configurar en Claude Desktop/Claude Code/Cursor/Kiro/MiniMax

Ver [`../CONFIGURACION_MCP_CLIENTES.md`](../CONFIGURACION_MCP_CLIENTES.md) para la config completa
de cada cliente (todos usan la misma estructura: ruta absoluta + `env`). Resumen:

```json
{
  "mcpServers": {
    "rastro": {
      "command": "node",
      "args": ["C:\\Users\\<usuario>\\appsperu\\mcp-server\\dist\\index.js"],
      "env": {
        "NEON_DATABASE_URL": "<opcional — ver matriz de variables en CONFIGURACION_MCP_CLIENTES.md>"
      }
    }
  }
}
```

**Nota sobre rutas relativas**: el `.mcp.json` de la raíz del repo (usado por Claude Code para
*este* proyecto) sí puede usar la ruta relativa `mcp-server/dist/index.js`, porque Claude Code fija
el cwd en la raíz del proyecto al leer `.mcp.json`. Los demás clientes (Claude Desktop, Cursor,
Kiro, MiniMax) tienen su propio archivo de config global, sin ese cwd garantizado — ahí la ruta
**debe** ser absoluta.

### Puertos y URLs base

Por defecto cada tool le pega a `http://localhost:<puerto>` con los puertos de la tabla del
[README raíz](../README.md). Sobreescribible por app vía env var `<APP>_API_URL`, ej.:

```bash
RADAR_EJECUCION_API_URL=https://radar-ejecucion.miempresa.pe npm start
```

Nombres de env var por app: `RADAR_EJECUCION_API_URL`, `COMPRAS_PUBLICAS_API_URL`,
`RADAR_INVERSIONES_API_URL`, `INFOBRAS_API_URL`, etc. (ver `src/apps.ts`).

## Catálogo de tools

`src/catalog.ts` es la fuente de verdad (cifra exacta: ver el comando al inicio de este README),
cada entrada mapea 1:1 a un `routes/*.ts` existente, sin inventar parámetros. Nombradas
`<app>_<recurso>`, ej. `radar_ejecucion_execution`, `compras_publicas_suppliers`,
`identidad_fiscal_ruc_consulta_masiva`.

Estas filas **no** son tools MCP registrados individualmente — son entradas que
`rastro_buscar_tools` busca y `rastro_llamar` ejecuta.

Cada `description` incluye, cuando aplica: si la cobertura ingerida es parcial (ej. La Libertad,
no todo el país) y que **ninguna app tiene scheduler** — toda ingesta es manual, así que los
datos pueden no reflejar el estado más reciente de la fuente. Esto es intencional: el agente debe
ver la limitación en la descripción del tool, no descubrirla después de presentar un dato parcial
como si fuera completo.

## Alcance actual y lo que falta

- **Transporte**: solo dos, nada más.
  - **stdio** (`src/index.ts`, `npm run dev` / `npm start`) — el único modo para clientes locales
    (Claude Desktop/Code, Cursor, Kiro, MiniMax). Sin auth por defecto.
  - **Cloudflare Worker** (`src/worker.ts`, `npm run dev:worker` / `npm run deploy`) — el único
    transporte HTTP remoto. Sirve `https://www.rastro.fyi/mcp` en producción. `x-api-key`
    obligatoria (401 si falta o es inválida) — ver "Autenticación" abajo.
  - Hubo un tercer transporte (`http-transport.ts`, Express + pg Pool, para un contenedor Fly.io)
    que se **eliminó**: Fly.io está decommissionado (ver
    [`docs/ENDPOINTS.md`](../docs/ENDPOINTS.md)) y el Worker ya cubre ese caso de uso. No queda
    código muerto de ese camino en el repo.
- **Autenticación — dos modos, no uno**:
  - **stdio local**: sin auth por defecto (`MCP_API_KEY` no definida) — igual que las APIs Express
    que agrega (`helmet` + `cors` + rate limit, sin auth propia). Si defines `MCP_API_KEY`, el
    proceso valida el código **una sola vez al arrancar** (no hay concepto de "header" en stdio)
    contra `MCP_API_DATABASE_URL` (Postgres local, `docker compose up -d` en este directorio) y
    aplica presupuesto de queries en cada `rastro_llamar`. Si el código no es válido, el proceso
    **no arranca**.
  - **Worker remoto (`rastro.fyi/mcp`)**: `x-api-key` **siempre** obligatoria — no hay modo sin
    auth en este transporte. Se valida contra la base `mcp` del mismo proyecto Neon
    (`NEON_DATABASE_URL`), no contra el Postgres local de stdio. Son dos almacenes de claves
    físicamente distintos que comparten el mismo esquema SQL (`mcp_api_keys`) — una clave emitida
    para uno no sirve en el otro.
  - `MCP_API_DATABASE_URL` solo es obligatoria si usas auth local (`MCP_API_KEY` definida). Sin
    auth, el servidor no toca esa variable para nada.
- **No incluye las ingestas** (`npm run ingest:*`) — este servidor es de solo lectura. Disparar
  ingestas desde un agente es una superficie de riesgo distinta (ejecución de scripts contra
  Postgres) que se dejó fuera de alcance a propósito.
- Prueba reproducible: `npm run smoke-test` (ver [`scripts/smoke-test.ts`](scripts/smoke-test.ts))
  cubre build, arranque stdio, `tools/list`, una consulta real, y el comportamiento sin
  `NEON_DATABASE_URL`. Tests automatizados: `npm test` (incluye
  `src/__tests__/catalog.test.ts` y `src/__tests__/routes-vs-catalog.test.ts`).

## Endpoints de producción

Fuente de verdad: [`docs/ENDPOINTS.md`](../docs/ENDPOINTS.md) (incluye verificación con `curl` y
el historial de por qué Fly.io/VPS quedaron decommissionados). Resumen:

- **`https://www.rastro.fyi`** — sitio web (Cloudflare Pages).
- **`https://www.rastro.fyi/mcp`** — único endpoint MCP remoto (Cloudflare Worker + Neon),
  `x-api-key` obligatoria. `https://rastro.fyi/mcp` redirige (301) al mismo.
- **`https://treevu-rastro-gw.fly.dev`**, `https://api.rastro.pe`, `https://mcp.rastro.fyi` — los
  tres **offline, decommissionados**. No los uses ni los documentes como alternativa viva en
  ningún lugar nuevo.
