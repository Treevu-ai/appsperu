# appsperu-mcp-server

Servidor MCP que expone las 38 APIs del catálogo (`APP_KEYS` en `src/apps.ts`; de los 40 directorios
`apps/*/api`, `sunat-aduanas` y `territorio-inteligencia` quedan fuera) como datos de solo lectura para
un agente Claude, vía **2 meta-tools** — no un tool por endpoint. Ver el plan de diseño y el
catálogo completo de tools en [`docs/conectores.md`](../docs/conectores.md) (cada `description`
de tool se deriva de esa ficha técnica).

## Interfaz: 2 meta-tools, no 209

En vez de registrar un tool MCP por cada una de las 203 entradas del catálogo (costo de contexto
fijo por sesión aunque el cliente use 2 o 3), el servidor expone:

- **`rastro_buscar_tools(query?, app?, limit?)`** — busca en `src/catalog.ts` por palabra clave
  y/o app, devuelve nombre + descripción + params de los que matchean. Úsalo primero.
- **`rastro_llamar(tool, args?)`** — ejecuta el nombre exacto encontrado con `rastro_buscar_tools`
  contra la API real de su app (`GET` 1:1, pass-through de `{ status, body }`, sin transformar
  el shape de la respuesta).

Onboardear una app nueva es solo agregar filas a `TOOL_CATALOG` (`src/catalog.ts`) — no crece la
cantidad de tools que un cliente MCP carga por adelantado en cada sesión. Ver `src/search.ts`
(implementación de la búsqueda) y `src/index.ts` (`registerMetaTools`).

Auditoría completada 2026-09-25: **199 tools verificados vs 199 rutas Express reales, cero desincronizaciones** (CX-15 no se repite). Desde entonces el catálogo creció a **209 tools**; la auditoría de sincronización está pendiente de re-ejecutarse sobre el catálogo actual.

## Requisito previo

Las 38 APIs del catálogo deben estar corriendo (ver [`docs/ESTADO.md`](../docs/ESTADO.md) — `docker compose up
-d` + `npm run dev` en cada `apps/<nombre>/api`). Este servidor no las levanta ni las reemplaza,
solo las agrega detrás de una interfaz MCP. Si una app no está corriendo, sus tools devuelven un
error de conectividad explícito (`isError: true`) en vez de fallar en silencio o tumbar el
proceso completo — el resto de tools sigue funcionando.

## Uso

```bash
npm install
npm run build
npm start          # transporte stdio — para conectar desde Claude Desktop/Claude Code
```

Durante desarrollo, `npm run dev` corre `src/index.ts` directo con `tsx` (sin build previo).

### Configurar en Claude Desktop/Claude Code/Cursor/Kilo/MiniMax

Agregar al `mcpServers` de la config del cliente MCP:

```json
{
  "mcpServers": {
    "rastro": {
      "command": "node",
      "args": ["<ruta-absoluta-al-repo>/mcp-server/dist/index.js"]
    }
  }
}
```

Para Windows:
```json
{
  "mcpServers": {
    "rastro": {
      "command": "node",
      "args": ["C:\\Users\\<usuario>\\appsperu\\mcp-server\\dist\\index.js"]
    }
  }
}
```

### Puertos y URLs base

Por defecto cada tool le pega a `http://localhost:<puerto>` con los puertos de la tabla del
[README raíz](../README.md). Sobreescribible por app vía env var `<APP>_API_URL`, ej.:

```bash
RADAR_EJECUCION_API_URL=https://radar-ejecucion.miempresa.pe npm start
```

Nombres de env var por app: `RADAR_EJECUCION_API_URL`, `COMPRAS_PUBLICAS_API_URL`,
`RADAR_INVERSIONES_API_URL`, `INFOBRAS_API_URL`, etc. (ver `src/apps.ts`).

## Catálogo de tools

209 entradas (38 apps) en `src/catalog.ts` — la fuente de verdad, cada una mapea 1:1 a un
`routes/*.ts` existente, sin inventar parámetros. Nombradas `<app>_<recurso>`, ej.
`radar_ejecucion_execution`, `compras_publicas_suppliers`, `salud_institucional_score`.

Desde la reingeniería del catálogo, esto ya **no** son 209 tools MCP registrados individualmente — son
filas que `rastro_buscar_tools` busca y `rastro_llamar` ejecuta.

Cada `description` incluye, cuando aplica: si la cobertura ingerida es parcial (ej. La Libertad,
no todo el país) y que **ninguna app tiene scheduler** — toda ingesta es manual, así que los
datos pueden no reflejar el estado más reciente de la fuente. Esto es intencional: el agente debe
ver la limitación en la descripción del tool, no descubrirla después de presentar un dato parcial
como si fuera completo.

## Alcance actual y lo que falta

- **Transporte**: stdio (default, uso local) y Streamable HTTP (para exposición remota en `https://rastro.fyi` o `https://treevu-rastro-gw.fly.dev`).
- **Sin autenticación por defecto**: igual que las 38 APIs que agrega (`helmet` + `cors` + rate
  limit, sin auth — confirmado en cada `app.ts`). Aceptable para stdio local; **no exponer este
  servidor ni las APIs subyacentes fuera de `localhost` sin resolver auth primero** (en producción usa Fly.io + Cloudflare proxy).
- **Códigos de acceso `sk-rastro-...` (Fase 1, deprecated)**: fueron para grupos controlados (talleres) con presupuesto de queries.
  Ya no se usan — la infraestructura de rate limiting queda en el código pero no se aplica por defecto.
- **No incluye las ingestas** (`npm run ingest:*`) — este servidor es de solo lectura. Disparar
  ingestas desde un agente es una superficie de riesgo distinta (ejecución de scripts contra
  Postgres) que se dejó fuera de alcance a propósito.
- Validado manualmente: `tools/list` (expone exactamente `rastro_buscar_tools` + `rastro_llamar`,
  no 209), `rastro_buscar_tools` con query/app real, `rastro_llamar` con un nombre inexistente
  (error explícito, no crash), manejo de error de conectividad cuando la app de destino no responde.
  Tests automatizados: `src/__tests__/catalog.test.ts` (detección de tools renombrados/borrados),
  `src/__tests__/routes-vs-catalog.test.ts` (comparación estática contra rutas reales Express).

## Endpoints de producción

- **`https://rastro.fyi`** — web principal + gateway MCP (Cloudflare proxy, Fly.io backend)
- **`https://treevu-rastro-gw.fly.dev`** — gateway MCP directo (sin Cloudflare)

Usar **`rastro.fyi`** desde cliente externo. Usar **`treevu-rastro-gw.fly.dev`** para desarrollo local si prefieres evitar Cloudflare.
