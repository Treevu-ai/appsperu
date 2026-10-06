# Data contract — geo-intersections: réplica de territories + backfill de distrito

- Fuente: `ceplan_geo.territories` (1,874 distritos reales del Perú, `MultiPolygon`) vía
  `CEPLAN_GEO_DATABASE_URL` — mismo nombre de variable que `apps/catastro-forestal/api`.
- Owner: `apps/geo-intersections/api`.
- Verificado en vivo el 2026-10-06: exploración con `ROLLBACK` primero (sin tocar nada), luego
  implementación real corrida contra Postgres local Y Neon producción, resultados idénticos.

## Estado: IMPLEMENTADO Y VERIFICADO EN VIVO (POSTGRES LOCAL + NEON PRODUCCIÓN)

## Motivación

El 76% de `comunidades_campesinas` (2,337/3,090) y 9/1,402 `comunidades_nativas` llegaban de
SERFOR OCAPAS sin `distrito` poblado (campo `distr` vacío en la fuente — ver
`docs/data-contracts/serfor-ocapas-comunidades.md`). Esto degradaba silenciosamente el cruce
comunidades∩minero/forestal recién construido (`docs/data-contracts/comunidades-cruce-minero-forestal.md`)
y cualquier filtro por distrito en la API/MCP.

## Por qué una réplica local y no un cruce cross-base en vivo

`apps/catastro-forestal/api/src/db/external-pools.ts` ya tiene un patrón de cruce cross-base
contra `ceplan_geo.territories` (`CEPLAN_GEO_DATABASE_URL`), pero ese patrón traduce UBIGEO →
nombre con un `JOIN` de texto liviano (`WHERE ubigeo = ANY($1)`). Esto necesita comparar
**geometrías** (`ST_Intersects`), y PostGIS no puede comparar `geometry` entre dos bases
Postgres distintas en una sola consulta SQL — ni siquiera estando en el mismo cluster físico de
Neon (confirmado: `geo_intersections` y `ceplan_geo` son bases separadas en el mismo proyecto,
pero siguen siendo conexiones independientes). Una réplica local real es la única forma de
hacer esto con un join geométrico, no solo texto.

## Exploración antes de construir (con `ROLLBACK`)

Antes de escribir migración o conector, se validó la viabilidad completa sin tocar nada
persistente: se descargaron los 1,874 territorios reales, se insertaron en una `TEMP TABLE`
dentro de una transacción en `geo_intersections`, se corrió el `JOIN` real, y se hizo
`ROLLBACK` al final. Resultado: **100% de las comunidades sin distrito matchean** (2,337 + 9 =
2,346 de 2,346). Solo después de confirmar esto se implementó la versión persistente.

## Esquema (migración 007)

- `territories` — réplica de `ceplan_geo.territories`: `ubigeo` (único), `departamento`,
  `provincia`, `distrito`, `geometry` (`MultiPolygon`), `geometry_valid` (poblada con
  `ST_MakeValid`, mismo patrón que `mining_rights`/`forest_titles`/`rural_communities`).
- `raw_territories_batches` — trazabilidad de cada réplica.

## Conector (`src/ingest/replicate-territories.ts`)

1. Conecta a `CEPLAN_GEO_DATABASE_URL` (variable obligatoria para este script — si falta,
   lanza error explícito en vez de fallar silenciosamente).
2. `SELECT ubigeo, departamento, provincia, distrito, ST_AsGeoJSON(ST_Multi(geometry))`.
3. Guarda batch, snapshot completo (`DELETE` + `INSERT`) con advisory lock, mismo patrón que
   `ocapas-connector.ts`. Aborta si la fuente devuelve 0 filas (protección contra vaciar un
   snapshot poblado, mismo criterio que el hallazgo real de revisión en el PR #243).
4. `UPDATE territories SET geometry_valid = ST_MakeValid(geometry)`.
5. **Backfill**: `UPDATE rural_communities SET distrito = ..., provincia = COALESCE(...)`
   usando `DISTINCT ON (rc.id) ... ORDER BY ST_Area(ST_Intersection(...)::geography) DESC` —
   el territorio con **mayor área de solapamiento real**, no el primero que matchee (una
   comunidad puede tocar más de un distrito en sus bordes). Nunca pisa un valor ya existente
   (`WHERE rc.distrito IS NULL` / `COALESCE(rc.provincia, ...)`) — seguro de re-correr.

## Verificación en vivo (2026-10-06)

Corrido dos veces (Postgres local y Neon producción `geo_intersections`), resultados
**idénticos**:

- 1,874 territorios replicados.
- **2,346 comunidades actualizadas** (2,337 comunidades_campesinas + 9 comunidades_nativas —
  el 100% de las que tenían `distrito IS NULL`).
- **0 comunidades sin distrito después del backfill**, en ambas capas.
- Idempotencia confirmada: segunda corrida del conector → **0 comunidades actualizadas**
  (ninguna ya tenía `distrito IS NULL`).
- Muestra verificada contra la fuente original: PUCA URCO (objectid=1, comunidades_campesinas)
  → `distrito` completado a "ALTO NANAY", `provincia` preservada como "MAYNAS" (el valor que
  ya traía SERFOR OCAPAS, no sobrescrito — confirma que el backfill respeta datos existentes).

## Hallazgos reales de revisión (PR #246) y corrección

Copilot y CodeRabbit marcaron, independientemente, el mismo problema de fondo antes de
mergear:

1. **El backfill se deshacía solo con volver a correr el ingest de comunidades.**
   `ocapas-connector.ts` hace `DELETE FROM rural_communities WHERE capa = $1` + reinsert en
   cada corrida de `npm run ingest:ocapas:comunidades` — las filas nuevas vuelven a traer
   `distrito = NULL` de la fuente, deshaciendo este backfill hasta que alguien recordara
   correr `ingest:territories` a mano otra vez. **Corregido**: `ingestOcapas()` ahora llama a
   `backfillDistrito()` automáticamente al final de cada corrida, usando lo que ya esté
   replicado localmente en `territories` (no requiere `CEPLAN_GEO_DATABASE_URL` en ese punto —
   solo lectura local).
2. **`geometry_valid` tampoco se repoblaba tras un re-ingest.** La migración 006 solo la
   pobló una vez, al aplicarse. Un `DELETE` + reinsert posterior dejaba `geometry_valid = NULL`
   para las filas nuevas — `compute-community-intersections.ts` las excluía silenciosamente
   (`WHERE geometry_valid IS NOT NULL`) y el backfill de distrito tampoco matcheaba nada.
   **Corregido**: `ingestCapa()` ahora puebla `geometry_valid` con `ST_MakeValid` justo después
   de insertar cada capa, mismo patrón que ya usaba para `area_km2`.
3. **`ST_Intersects` sin filtrar área real.** `ST_Intersects` es verdadero incluso cuando dos
   polígonos solo se tocan en un borde o un punto (área de solapamiento cero) — sin filtrar
   esto, una comunidad podía quedar asignada a un distrito con el que apenas comparte un
   borde. **Corregido**: `backfillDistrito()` ahora exige
   `ST_Area(ST_Intersection(...)::geography) > 0`.
4. **Match contra un territorio sin distrito poblado.** Si el mejor match por área fuera una
   fila de `territories` con `distrito IS NULL`, el `UPDATE` igual contaba la comunidad como
   "actualizada" sin dejarle un distrito real. **Corregido**: se exige `t.distrito IS NOT NULL`
   entre los candidatos.

**Verificación de la corrección #1/#2 (regresión real, no solo lectura de código)**: se
re-corrió `npm run ingest:ocapas:comunidades comunidades_nativas` contra Postgres local
después de que el backfill inicial ya había completado las 9 comunidades sin distrito. El
`DELETE` + reinsert volvió a dejarlas en `NULL` como se esperaba, y el backfill automático al
final de `ingestOcapas()` las corrigió solo en la misma corrida — log real: `✓ 9 comunidades
actualizadas con distrito/provincia (backfill automático)`. `geometry_valid` confirmado
repoblado (`0` filas en `NULL` después de la corrida).

## Pendiente

- `territories` queda disponible como tabla reutilizable para futuros cruces (ej. el candidato
  `infrastructure` de `ceplan_geo` — red hídrica principal, aeropuertos, puertos — evaluado
  pero no implementado).
- No se agregó a `docs/conectores.md` como "app" nueva (es una tabla de soporte interna de
  `geo-intersections`, no un conector de cara a datos públicos nuevos) — documentado como
  sección dentro de la ficha existente de `geo-intersections`.
