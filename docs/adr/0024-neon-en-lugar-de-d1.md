# ADR-0024 — Neon en lugar de D1 como capa de datos del MCP Worker

Fecha: 2026-09-28. Estado: aceptada. Reemplaza la fase 2 de
[`PLAN_MIGRACION_MCP_WORKER.md`](../PLAN_MIGRACION_MCP_WORKER.md), que asumía D1.

## Contexto

[`PLAN_MIGRACION_MCP_WORKER.md`](../PLAN_MIGRACION_MCP_WORKER.md) propose migrar
Rastro de 38 APIs Express sobre Postgres en un VPS a un Cloudflare Worker que
hablara directamente con la base de datos, sin capa HTTP intermedia. El Worker ya
está escrito y despliega; la decisión abierta era **qué base de datos**.

El plan original asumía Cloudflare D1 (SQLite) y dejaba la alternativa de Neon
(Postgres serverless) como plan B por si D1 no rendía. Un escaneo de las 38 apps se hizo antes de decidir, para no elegir sobre intuición.

## Evidencia recogida

### D1, tres bloqueos duros

1. **Sin PostGIS.** `geo-intersections` es un producto que *es* `ST_Intersects` /
   `ST_Intersection` sobre polígonos indexados con GIST
   (`src/ingest/compute-intersections.ts:70-81`). `ceplan-geo` tiene 3 tablas
   `geometry`, 5 índices GIST y `ST_MakeEnvelope` / `ST_DWithin` /
   `ST_Centroid` repartidos entre routes, crossrefs y lib. Ninguna tiene
   equivalente en SQLite.

2. **Sin transacciones, sin locks, sin concurrencia real.** 38 de 38 apps hacen
   `pool.connect()` + `BEGIN` manual en sus migraciones y conectores de ingesta;
   8 apps usan `pg_advisory_xact_lock`; 3 usan `BEGIN ... ISOLATION LEVEL
   REPEATABLE READ`. D1 no ofrece ninguno de los tres.

3. **Tope de 6 conexiones simultáneas por invocación del Worker**, y es la misma
   en los planes Free y Paid. El repo tiene 24 pools cross-app en 15 apps
   (`salud-institucional` lee 5 bases y no tiene ninguna propia). Es
   evitable —se secuencializa— pero es una restricción permanente.

### Lo que sí era portable a D1

Menos de lo que el plan temía. `DISTINCT ON`, `ILIKE`, `ARRAY_AGG`, casts `::` y
`ON CONFLICT` tienen conversión mecánica, y no hay full-text search, enums,
triggers, `LISTEN/NOTIFY` ni tipos rango en ninguna de las 38 apps. El riesgo
real de D1 no era el SQL: era el punto 1 y el 2.

### Neon, dos hallazgos que ajustaron el plan

- **Hyperdrive queda descartado como vía de conexión**: el máximo son **25
  configuraciones por cuenta** (10 en Free) y hacen falta 38. Se usa
  `@neondatabase/serverless` sobre WebSocket, que no tiene ese tope.
- **Las 36 bases caben en un solo proyecto**: Neon admite hasta 500 bases por
  rama, así que un proyecto, 36 bases, un host, un rol, un compute. No hay
  36 proyectos que administrar ni 36 secrets.

### El hallazgo que reduce el alcance del problema

La ingesta **no corre en el Worker**. Los 62 conectores son scripts locales que
el usuario dispara a mano (`npm run ingest:*`). El Worker solo ejecuta `SELECT`
de lectura para atender tools. Por tanto los bloqueos del punto 2 no afectan al
Worker: las transacciones y los advisory locks se quedan en el lado local,
conectando a Neon con `pg` de toda la vida, sin tocar una línea.

## Decisión

**Neon (Postgres serverless) como capa de datos del MCP Worker.** Un proyecto,
36 bases —35 apps más `mcp` para auth y budgets—, un secret
(`NEON_DATABASE_URL`) del que se deriva el nombre de base por app.

**`geo-intersections` y `ceplan-geo` se posponen a una segunda fase.** No por
imposibilidad técnica —Neon tiene PostGIS— sino por alcance: son las dos apps
más pesadas del plan, y arrancarlas diferidas deja un `rastro_health` que las
reporta como `diferida` en vez de como caída.

## Consecuencias

### A favor

- **El SQL de los handlers es idéntico al de `apps/*/api/src/routes/*.ts`**,
  placeholders `$n` incluidos. Sin traducción de dialecto, sin CTE reescrito,
  sin `GROUP_CONCAT` en lugar de `ARRAY_AGG`.
- La migración de un app a handler es un copiado con `pool.query` → `db.query`.
  El `LATEST_BUDGET_CTE` compartido no se toca.
- `pg_advisory_lock`, transacciones y `ON CONFLICT` siguen funcionando donde ya
  funcionaban.
- Sin límite de 10 GB por base, sin tope de 30 s por query, sin límite de 6
  conexiones para lectura.

### En contra

- **Dos proveedores.** El Worker es Cloudflare y la base es Neon (Databricks).
  Dos paneles, dos facturación, dos posibles puntos de falla.
- **Coste variable.** Los planes Free dan 0.5 GB por proyecto, insuficiente para
  ~40 GB. hace falta Launch ($0.106/CU-h, $0.35/GB-mes) más $5 de Workers Paid.
  Con scale-to-zero tras 5 min de inactividad y uso manual, la factura real
  debería ser baja, pero deja de ser un número fijo conocido.
- **Cold start.** La primera consulta tras 5 min de inactividad paga el despertar
  del compute. Irrelevante para uso manual; se sentiría en un agente que
  consulta sin parar.
- **Hyperdrive no disponible** (tope de 25 configs), así que no hay el pooling
  en el edge que Hyperdrive daría con menos de 25 bases.

### Neutro

- El plan original de D1 preveía 39 bindings en `wrangler.toml`. Se revierte a
  cero bindings y un secret: menos superficie de configuración.
- `wrangler` sigue en la v3 (avisa estar desactualizada). La v4 es recomendada
  por Cloudflare y conviene subirla, pero es un cambio mayor del tool de deploy
  y no se mezcló con esta migración.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **38 D1 puras** | Sin PostGIS no hay `geo-intersections` ni `ceplan-geo`; reescribir intersectores de polígonos a mano en JS es meses de geometría con riesgo de error silencioso. Además `radar-ejecucion` guarda evidencia en `jsonb` sin tope por fila y es la tabla de la que dependen 12 apps. |
| **Híbrido D1 + Neon** | Es lo que la evidencia por app sugiere (D1 para las 33 pequeñas), pero es la más cara en complejidad: dos clientes, dos dialects, dos auth, y un triage "qué app va dónde" que hay que mantener para siempre. El límite de 6 conexiones tampoco desaparece, y cruzar un D1 con un Neon es más difícil que dos D1. |

## Cómo se verifica

- `npx tsc -p tsconfig.json --noEmit` — limpio.
- `npx vitest run` en `mcp-server/` — 183 tests.
- `src/__tests__/latest-budget.test.ts` compara el CTE del MCP contra el de
  `packages/shared-queries` y falla si divergen. Existe porque
  `mcp-server/tsconfig.json` fija `rootDir: "src"` y el paquete compartido no se
  puede importar sin romper el bundle del Worker.
- `npx wrangler deploy --dry-run` — empaqueta en 2.9 MB (644 KB gzip), sin
  bindings, que es lo esperado con un único secret.
- `rastro_health` con `NEON_DATABASE_URL` presente distingue `ok`, `caida`,
  `sin_base` y `diferida`; los tests cubren los cuatro.

## Consecuencias para la secuencia de trabajo

El orden se invierte respecto al plan D1. Ya no se empieza reescribiendo 209
tools y 38 conectores: se ocupa el DDL existente en Neon y se valida el Worker
contra datos reales, app por app. Cada app pasa a Neon como tres pasos
independientes: crear la base, correr sus migraciones (Postgres, sin cambios),
copiar sus routes a handler. Si alguna app resultara problemática, se puede
dejar en Neon sin haber pasado nunca por D1 — la migración por app, no total.
