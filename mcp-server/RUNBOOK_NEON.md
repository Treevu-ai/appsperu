# Runbook — provisionar Rastro en Neon

Todo es manual y a pedido, por decisión del usuario. No hay scheduler ni
automatismo: este runbook se corre una vez y después se repite por app.

Razón de cada paso y alternativas descartadas:
[`ADR-0024`](../adr/0024-neon-en-lugar-de-d1.md).

**Estado actual:** el Worker compila, tipa, pasa 183 tests y empaqueta. Falta
todo lo de abajo. Hasta que haya un secret, `rastro_health` reporta las 38 apps
como `sin_base` y ningún tool más allá de los 2 con handler devuelve datos.

---

## Fase 0 — Cuenta y proyecto

1. Crear cuenta en Neon y subir al plan **Launch**. El Free da 0.5 GB por
   proyecto y el dataset ronda los 40 GB, así que no alcanza. Launch es
   pay-as-you-go, sin mínimo mensual.
2. Crear **un solo proyecto** con la región más cercana a Lima
   (`aws-sa-east-1` si está disponible; si no, la más cercana en US East).
   Región importa: cada query paga el viaje.
3. Verificar que la versión de Postgres sea 17 o superior.

> Un proyecto, no 36. Neon admite hasta 500 bases por rama, y las 36 comparten
> host, rol y compute. Eso también es lo que hace viable un único secret en
> lugar de 36.

## Fase 1 — Crear las bases

El SQL se genera desde `APP_KEYS`, para que la lista no se mantenga a mano:

```bash
cd mcp-server
node scripts/gen-neon-provisioning.mjs            # imprime el SQL
node scripts/gen-neon-provisioning.mjs --checks   # checklist con el nombre de cada app
```

Son **37 `CREATE DATABASE`**: 36 apps más `mcp`, que hospeda `mcp_api_keys`,
`mcp_usage_log`, budgets y rate limits.

`geo_intersections` y `ceplan_geo` **no se crean en esta fase** — ambas requieren
PostGIS y quedan para la segunda fase.

## Fase 2 — Migraciones de cada app

Las migraciones son Postgres nativo y **se aplican sin cambios**:

```bash
cd apps/<app>/api
DATABASE_URL="postgresql://…@ep-xxx.aws.neon.tech/<nombre_base>" npm run migrate
```

Para la base `mcp`:

```bash
cd mcp-server
DATABASE_URL="postgresql://…@ep-xxx.aws.neon.tech/mcp" npm run migrate
```

`salud-institucional` y `territorio-inteligencia` no tienen base propia ni
migraciones: calculan cruzando otras. No se les crea base.

## Fase 3 — Cargar datos

El orden importa por las dependencias de ingesta: `identidad-fiscal` y
`compras-publicas` son fuentes que otras apps cruzan.

```bash
cd apps/identidad-fiscal/api && npm run ingest:padron
cd apps/compras-publicas/api   && npm run ingest:contrataciones
cd apps/radar-ejecucion/api    && npm run ingest:mef
# …el resto, con los scripts de docs/conectores.md
```

Los conectores **no cambian**: usan `pg` de siempre, con transacciones y
`pg_advisory_lock` intactos. Solo cambia el `DATABASE_URL` al que apuntan.

Para bases grandes (`identidad_fiscal` con 2.34M de filas,
`instituciones_educativas` con 2.39M) conviene `pg_dump | psql` en vez de
reingerir, para no depender de que la fuente oficial siga igual.

## Fase 4 — Configurar el Worker

Un solo secret. La connection string puede apuntar a cualquier base —el
resolver reescribe el path para cada app:

```bash
cd mcp-server
npx wrangler secret put NEON_DATABASE_URL
# postgresql://USER:PASS@ep-xxx.<region>.aws.neon.tech/postgres?sslmode=require
```

Para desarrollo local, `.dev.vars` con la misma clave.

## Fase 5 — Desplegar y verificar

```bash
cd mcp-server
npm run build
npx wrangler deploy
```

Luego, desde un agente:

```
rastro_health
```

Cada app debe salir `ok`. Estados posibles:

| Estado | Significado | Acción |
|---|---|---|
| `ok` | La base responde | — |
| `sin_base` | La base no existe o el secret falta | Fase 1 / Fase 4 |
| `caida` | La base existe pero no responde | Revisar compute en el panel de Neon |
| `diferida` | Pospuesta a la segunda fase | Esperado para `geo-intersections` y `ceplan-geo` |

## Fase 6 — Portar los handlers

De 209 tools, hoy **2 tienen handler**. El resto sigue el fallback HTTP, que ya
no tiene destino con el VPS decommissionado.

Por cada app, en orden de valor:

1. `src/catalog.ts` — añadir `handler: "modulo:funcion"` a sus tools.
2. `src/handlers/<app>/<modulo>.ts` — copiar la query de
   `apps/<app>/api/src/routes/<modulo>.ts` y cambiar `pool.query(sql, [params])`
   por `db.query(sql, [params])`. **El SQL no se toca**: placeholders `$n`,
   `DISTINCT ON`, `ILIKE` y casts `::` funcionan igual.
3. Probar el tool por el MCP y comparar la respuesta con la del route Express.

Prioridad sugerida: las apps que los agentes más consultan —
`radar-ejecucion` (hecha), `compras-publicas`, `identidad-fiscal`, `infobras`.

## Pendientes conocidos

- **`wrangler` sigue en v3** y avisa estar desactualizada. Cloudflare recomienda
  v4. Subirla es un cambio mayor del tool de deploy; conviene hacerlo con calma,
  no mezclado con la migración.
- **`salud-institucional` cruza 5 bases** en un solo request. Con 6 conexiones
  simultáneas por invocación hay que secuenciar, no paralelizar.
- **`rastro_riesgo_territorial` orquesta 4 fuentes** con degradación explícita
  cuando alguna falla. Hay que conservar ese contrato al portarlo, no convertirlo
  en un error duro.
- **Segunda fase**: `geo-intersections` y `ceplan-geo`. PostGIS sí funciona en
  Neon; lo que falta es el trabajo de portar sus handlers y decidir qué pasa con
  las 5 llamadas HTTP entrantes que `ceplan-geo` recibe.
