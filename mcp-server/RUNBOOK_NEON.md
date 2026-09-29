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

### Después de migrar `identidad-fiscal`: calcular el cruce entidad ↔ padrón

`identidad_fiscal_crossref_entidades` (tool `identidad_fiscal_crossref_entidades`)
no calcula el cruce en cada request como hacía el route de Express: lee la tabla
`entity_padron_crosswalk` (migración `009_entity_padron_crosswalk.sql`). Ese cruce
salía de un matching difuso por nombre contra el padrón acotado por prefijo UBIGEO
(~107k contribuyentes en La Libertad), y correrlo por request compite con los
límites de CPU y memoria del isolate de Workers. Es el mismo patrón que ya usa
`compras-publicas` con `entity_crosswalk`.

Hay que correr el cálculo a mano una vez tras cargar los datos y cada vez que
cambien el padrón o el matcher:

```bash
cd apps/identidad-fiscal/api
DATABASE_URL="postgresql://…/identidad_fiscal" \
RADAR_EJECUCION_DATABASE_URL="postgresql://…/radar_ejecucion" \
  npx tsx src/crossref/build-crosswalk.ts
```

Imprime un resumen (entidades MEF, filas de padrón, confirmadas, candidatas, sin
match). Advertencia del propio script: si el departamento no tiene entidades
ingeridas, el `DELETE` previo es un no-op y pueden quedar filas obsoletas.

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

## Fase 6 — Portar los handlers (COMPLETA, 2026-09-29)

**209/209 tools tienen handler.** Las 38 apps del catálogo están portadas,
incluidas `geo-intersections` y `ceplan-geo` (PostGIS) y `salud-institucional`
(cruza 5 bases, secuencial).

**`ceplan_geo` y `geo_intersections` ya están provisionadas en Neon**
(2026-09-29): bases creadas, PostGIS habilitado, schema completo (migraciones
001-011 de `ceplan-geo` y 001-004 de `geo-intersections` aplicadas vía Neon
MCP). El gate hardcodeado `DEFERRED_APPS` en `src/tools/health.ts` se
eliminó — `rastro_health` ahora las chequea igual que cualquier otra app.
**Sin datos todavía** (Fase 3, ingesta, no se corrió): las tablas existen
vacías, así que `rastro_health` las reporta `ok` (la base responde) pero los
tools devuelven listas vacías hasta correr los conectores de ingesta de cada
app (`apps/ceplan-geo/api/src/ingest/*`, `apps/geo-intersections/api/src/ingest/*`).

Lo de abajo queda como referencia del proceso ya aplicado (útil si se agrega
una app 39 al catálogo en el futuro):

Por cada app, en orden de valor:

1. `src/catalog.ts` — añadir `handler: "modulo:funcion"` a sus tools.
2. `src/handlers/<app>/<modulo>.ts` — copiar la query de
   `apps/<app>/api/src/routes/<modulo>.ts` y cambiar `pool.query(sql, [params])`
   por `db.query(sql, [params])`. **El SQL no se toca**: placeholders `$n`,
   `DISTINCT ON`, `ILIKE` y casts `::` funcionan igual.
3. `npx vitest run src/__tests__/sql-fidelity.test.ts` — comprueba que cada
   literal SQL del handler exista en el route de origen. Es la única red contra
   los errores que sí compilan: renombrar una columna, inventar un alias o
   cambiar el case de una tabla. Los tres ya ocurrieron y habrían fallado en
   runtime, no en el typecheck.
4. **Regenerar el mapa de módulos** (obligatorio, paso 4 de cada app):
   ```bash
   cd mcp-server && node scripts/gen-handler-registry.mjs
   ```
   `src/handlers/modules.ts` es un archivo GENERADO con imports estáticos de
   cada módulo. No se edita a mano. Existe porque `resolveHandler` usaba un
   `import()` de ruta dinámica: esbuild no puede resolverla, la degrada a un
   glob que no matchea los `.ts`, y el bundle se despliega **sin ningún
   handler** mientras todos los tests pasan en verde. El typecheck y
   `src/__tests__/handler-resolution.test.ts` son la red contra esa regresión.
5. Probar el tool por el MCP y comparar la respuesta con la del route Express.

Prioridad sugerida: las apps que los agentes más consultan —
`radar-ejecucion` (hecha), `compras-publicas`, `identidad-fiscal`, `infobras`.

## Pendientes conocidos

- **`ceplan_geo` y `geo_intersections` tienen schema pero sin datos** — falta
  correr Fase 3 (ingesta) para esas 2 apps. Ver nota en la Fase 6 de arriba.
- ~~`ceplan_geo`/`geo_intersections` no existían como bases~~ — resuelto
  2026-09-29, provisionadas vía Neon MCP.
- ~~`salud-institucional` cruza 5 bases~~ — resuelto: `src/handlers/salud-institucional/score.ts`
  las consulta secuencialmente (radar-ejecucion → infobras → radar-inversiones
  → compras-publicas → identidad-fiscal), nunca en paralelo.
- ~~`rastro_riesgo_territorial` degradación explícita~~ — resuelto sin cambios:
  `src/tools/riesgo-territorial.ts` no tiene SQL propio, orquesta
  `geo_intersections_reporte` y `emergencias_indeci_preparacion_riesgo` vía
  `invokeTool`, así que la degradación mejora sola en cuanto esos handlers
  responden real (ya lo hacen, salvo por el pendiente de PostGIS de arriba).
- ~~5 llamadas HTTP entrantes de `ceplan-geo`~~ — no existían: se verificó que
  las 16 tools de `ceplan-geo` están respaldadas por tablas PostGIS ya
  ingeridas, ninguna hace proxy a GeoServer en runtime.
