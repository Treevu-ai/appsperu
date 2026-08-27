# appsperu-mcp-server

Servidor MCP que expone las 11 APIs de este repo (`apps/*/api`) como tools de solo lectura para
un agente Claude. No transforma los datos: cada tool hace un `GET` 1:1 contra el endpoint REST
ya existente y devuelve `{ status, body }` tal cual. Ver el plan de diseño y el catálogo completo
de tools en [`docs/conectores.md`](../docs/conectores.md) (cada `description` de tool se deriva
de esa ficha técnica).

## Requisito previo

Las 11 APIs deben estar corriendo (ver [`docs/ESTADO.md`](../docs/ESTADO.md) — `docker compose up
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
`ACTIVIDAD_AGRARIA_API_URL`, `SEGURIDAD_CIUDADANA_API_URL`.

## Catálogo de tools

64 tools, uno por endpoint `GET /api/*` real de las 11 apps (`src/catalog.ts` es la fuente de
verdad — cada entrada mapea 1:1 a un `routes/*.ts` existente, sin inventar parámetros). Nombrados
`<app>_<recurso>`, ej. `radar_ejecucion_execution`, `compras_publicas_suppliers`,
`salud_institucional_score`.

Cada `description` incluye, cuando aplica: si la cobertura ingerida es parcial (ej. La Libertad,
no todo el país) y que **ninguna app tiene scheduler** — toda ingesta es manual, así que los
datos pueden no reflejar el estado más reciente de la fuente. Esto es intencional: el agente debe
ver la limitación en la descripción del tool, no descubrirla después de presentar un dato parcial
como si fuera completo.

## Alcance actual y lo que falta

- **Transporte**: solo stdio (uso local, agente y las 11 APIs en la misma máquina). Streamable
  HTTP para exponerlo remoto es un paso posterior, no implementado.
- **Sin autenticación**: igual que las 11 APIs que agrega (`helmet` + `cors` + rate limit, sin auth
  — confirmado en cada `app.ts`). Aceptable para stdio local; **no exponer este servidor ni las
  APIs subyacentes fuera de `localhost` sin resolver auth primero**.
- **No incluye las ingestas** (`npm run ingest:*`) — este servidor es de solo lectura. Disparar
  ingestas desde un agente es una superficie de riesgo distinta (ejecución de scripts contra
  Postgres) que se dejó fuera de alcance a propósito.
- Validado manualmente: registro de tools, llamada con query params reales, manejo de error de
  conectividad cuando la app de destino no responde, y test automatizado del catálogo
  (`src/__tests__/catalog.test.ts`). No hay suite contra las 11 APIs reales corriendo en CI.
