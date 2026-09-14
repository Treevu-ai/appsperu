# appsperu-mcp-server

Servidor MCP que expone las 27 APIs de este repo (`apps/*/api`) como datos de solo lectura para
un agente Claude, vía **2 meta-tools** — no un tool por endpoint. Ver el plan de diseño y el
catálogo completo de tools en [`docs/conectores.md`](../docs/conectores.md) (cada `description`
de tool se deriva de esa ficha técnica).

## Interfaz: 2 meta-tools, no 142

En vez de registrar un tool MCP por cada una de las 142 entradas del catálogo (costo de contexto
fijo por sesión aunque el cliente use 2 o 3), el servidor expone:

- **`rastro_buscar_tools(query?, app?, limit?)`** — busca en `src/catalog.ts` por palabra clave
  y/o app, devuelve nombre + descripción + params de los que matchean. Úsalo primero.
- **`rastro_llamar(tool, args?)`** — ejecuta el nombre exacto encontrado con `rastro_buscar_tools`
  contra la API real de su app (`GET` 1:1, pass-through de `{ status, body }`, sin transformar
  el shape de la respuesta).

Onboardear una app nueva es solo agregar filas a `TOOL_CATALOG` (`src/catalog.ts`) — no crece la
cantidad de tools que un cliente MCP carga por adelantado en cada sesión. Ver `src/search.ts`
(implementación de la búsqueda) y `src/index.ts` (`registerMetaTools`).

## Requisito previo

Las 20 APIs deben estar corriendo (ver [`docs/ESTADO.md`](../docs/ESTADO.md) — `docker compose up
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

### Configurar en Claude Desktop/Claude Code

Agregar al `mcpServers` de la config del cliente MCP:

```json
{
  "mcpServers": {
    "appsperu": {
      "command": "node",
      "args": ["<ruta-absoluta-al-repo>/mcp-server/dist/index.js"]
    }
  }
}
```

### Puertos y URLs base

Por defecto cada tool le pega a `http://localhost:<puerto>` con los puertos de la tabla de
`README.md` (raíz del repo). Sobreescribible por app vía env var `<APP>_API_URL`, ej.:

```bash
RADAR_EJECUCION_API_URL=https://radar-ejecucion.miempresa.pe npm start
```

Nombres de env var por app: `RADAR_EJECUCION_API_URL`, `COMPRAS_PUBLICAS_API_URL`,
`RADAR_INVERSIONES_API_URL`, `INFOBRAS_API_URL`, `CEPLAN_ESTRATEGICO_API_URL`, `CEPLAN_GEO_API_URL`,
`IDENTIDAD_FISCAL_API_URL`, `SALUD_INSTITUCIONAL_API_URL`, `PROVEEDORES_SANCIONADOS_API_URL`,
`ACTIVIDAD_AGRARIA_API_URL`, `SEGURIDAD_CIUDADANA_API_URL`, `BCRP_COMERCIO_EXTERIOR_API_URL`,
`INVERSION_PRIVADA_API_URL`, `BCRP_LA_LIBERTAD_API_URL`, `SERVICIOS_SALUD_API_URL`,
`PROGRAMAS_SOCIALES_API_URL`, `ACTIVIDAD_EMPRESARIAL_API_URL`, `INFORMES_CONTROL_API_URL`,
`MINDEF_API_URL`, `MIMP_API_URL`, `RENAMU_API_URL`, `AUTORIDADES_ELECTAS_API_URL`,
`INSTITUCIONES_EDUCATIVAS_API_URL`, `INFRACCIONES_AMBIENTALES_API_URL`,
`RED_VIAL_SUBNACIONAL_API_URL`, `RESIDUOS_SOLIDOS_API_URL`, `INFRAESTRUCTURA_MTC_API_URL`.

## Catálogo de tools

142 entradas (27 apps) en `src/catalog.ts` — la fuente de verdad, cada una mapea 1:1 a un
`routes/*.ts` existente, sin inventar parámetros. Nombradas `<app>_<recurso>`, ej.
`radar_ejecucion_execution`, `compras_publicas_suppliers`, `salud_institucional_score`. Desde la
reingeniería del catálogo, esto ya **no** son 142 tools MCP registrados individualmente — son
filas que `rastro_buscar_tools` busca y `rastro_llamar` ejecuta (ver sección anterior).

Cada `description` incluye, cuando aplica: si la cobertura ingerida es parcial (ej. La Libertad,
no todo el país) y que **ninguna app tiene scheduler** — toda ingesta es manual, así que los
datos pueden no reflejar el estado más reciente de la fuente. Esto es intencional: el agente debe
ver la limitación en la descripción del tool, no descubrirla después de presentar un dato parcial
como si fuera completo.

## Alcance actual y lo que falta

- **Transporte**: stdio (default, uso local) y Streamable HTTP (`MCP_TRANSPORT=http`, para
  exponerlo remoto y agregarlo como "conector personalizado" en Claude Desktop — ver sección
  siguiente).
- **Sin autenticación por defecto**: igual que las 27 APIs que agrega (`helmet` + `cors` + rate
  limit, sin auth — confirmado en cada `app.ts`). Aceptable para stdio local; **no exponer este
  servidor ni las APIs subyacentes fuera de `localhost` sin resolver auth primero**.
- **Códigos de acceso `sk-rastro-...` (Fase 1, opt-in)**: para grupos controlados (talleres) que
  comparten un código con presupuesto de queries, sin exponer nada por HTTP todavía — el código se
  valida al arrancar el proceso stdio vía `MCP_API_KEY`, no por header. Ver
  [`docs/conectores.md`] o la sección siguiente. **Sin `MCP_API_KEY` en el entorno, el servidor
  funciona exactamente igual que antes** (sin auth, sin depender de Postgres para nada) — esto es
  una capa paralela, no un reemplazo.
  - Setup: `docker compose up -d` (Postgres local dedicado, puerto 5436) + `npm run migrate`.
  - Emitir un código: `npm run create-key -- --group "taller-2026-09" --limit 200` (se imprime una
    sola vez, no es recuperable — solo se guarda su hash SHA-256).
  - Usarlo: `MCP_API_KEY=sk-rastro-... npm start` — si es inválido/vencido/sin presupuesto, el
    proceso no arranca (falla rápido con mensaje explícito).
  - **Transporte Streamable HTTP (Fase 1-D)**: `MCP_TRANSPORT=http PORT=8080 npm run dev:http`
    (o `node dist/http-transport.js` tras build) expone `POST/GET/DELETE /mcp` y `GET /health`.
    A diferencia de stdio (un proceso = un código fijo validado al arrancar), acá **cada request
    valida el header `x-api-key`** (`auth/http-api-key.ts`) — un mismo proceso sirve muchas
    sesiones con códigos distintos a la vez. Sesión MCP vía header `mcp-session-id`, siguiendo el
    patrón de referencia del propio SDK (`StreamableHTTPServerTransport`, mapa de sesiones —
    ver `src/http-transport.ts`). Sin CORS (Claude Desktop no es un navegador). Probado en vivo
    con curl: handshake `initialize` → `tools/list` → `tools/call rastro_llamar` con datos reales
    y consumo de presupuesto correcto.
  - Despliegue a `mcp.rastro.fyi` en Fly.io (app nueva, standalone, no detrás del gateway
    compartido de las 27 APIs): ver `docs/FLY_DEPLOY_MCP.md`. Todos los pasos de `flyctl`/DNS los
    ejecuta un humano — requieren `flyctl auth login`, que Claude no puede hacer.
- **No incluye las ingestas** (`npm run ingest:*`) — este servidor es de solo lectura. Disparar
  ingestas desde un agente es una superficie de riesgo distinta (ejecución de scripts contra
  Postgres) que se dejó fuera de alcance a propósito.
- Validado manualmente: `tools/list` (expone exactamente `rastro_buscar_tools` + `rastro_llamar`,
  no 142), `rastro_buscar_tools` con query/app real, `rastro_llamar` con un nombre inexistente
  (error explícito, no crash) y con query params reales, manejo de error de conectividad cuando
  la app de destino no responde, y dos tests automatizados del catálogo:
  `src/__tests__/catalog.test.ts` (`EXPECTED_TOOLS_BY_APP`, detecta un tool renombrado/borrado sin
  querer) y `src/__tests__/routes-vs-catalog.test.ts` (CX-15, `src/route-introspection.ts` —
  compara `TOOL_CATALOG` contra los `router.get(...)` reales de `apps/*/api/src/routes/*.ts` vía
  parseo de texto, sin levantar las 27 APIs; detecta un endpoint sin tool o un tool sin endpoint
  real, el gap que dejó pasar `compras-publicas` antes de la auditoría de 2026-09-07). Ninguno de
  los dos hace requests HTTP contra las APIs corriendo — son chequeos estáticos, no integración.
  Autenticación (`src/auth/*`) y el transporte HTTP (`src/__tests__/http-*.test.ts`) tienen su
  propia suite con `pool`/`validateApiKey` mockeados, sin necesitar Postgres real para correr en CI.
