# Data contract — legislativo-congreso: Proyectos de Ley

- Fuente oficial: Congreso de la República del Perú — `spley-portal-service`.
- Contrato completo del endpoint, con evidencia `curl` reproducible: `docs/data-contracts/congreso-spley-portal-service.md` (ADS-15).
- Owner del conector: `apps/legislativo-congreso/api` (puerto 4030, `mcp-server/src/apps.ts`).
- Verificado en vivo el 2026-09-21: ingesta real ejecutada contra Postgres, **14,868/14,868 filas insertadas, 0 rechazadas**.

## Estado: IMPLEMENTADO (LEG-01/02/03)

## Schema real (`apps/legislativo-congreso/api/src/db/migrations/001_init.sql`)

```sql
raw_congreso_batches (id, source_url, per_par_id, record_count, fetched_at)
legislativo_congreso_proyectos (
  id, per_par_id, pley_num, proyecto_ley, estado, fecha_presentacion,
  titulo, proponente, autores, cod_tipo_parl, cod_tipo_parl_actual,
  source_batch_id, updated_at,
  UNIQUE (per_par_id, pley_num)
)
legislativo_congreso_proyectos_rejected (id, source_batch_id, raw_row, reason, rejected_at)
```

## Clave de upsert

`per_par_id` + `pley_num` (enteros) — verificada única sobre las 14,864 filas reales del periodo
2021 (0 duplicados vía `Set`, ver `docs/data-contracts/congreso-spley-portal-service.md`) y estable
entre dos ejecuciones HTTP separadas. `proyecto_ley` (código legible, ej. `"14864/2025-CR"`) se guarda
como columna informativa — contiene `/` y no se usa como clave ni como segmento de ruta.

## Conector (`src/ingest/congreso-connector.ts`)

1. `GET /periodo-parlamentario` — descubre en vivo qué `perParId` son válidos hoy (no se
   hardcodea; un repo de terceros que sí lo hace asume periodos 2016/2011/2006 que no existen en
   este servicio).
2. Por cada `perParId` descubierto: adquiere `pg_advisory_xact_lock(hashtext('legislativo_congreso_proyectos_ingest'), perParId)`
   al abrir la transacción — serializa corridas manuales solapadas del mismo periodo (hallazgo
   real de Copilot: sin esto, una corrida con datos más viejos podía confirmar DESPUÉS de una más
   nueva y dejar el snapshot desactualizado). Se libera solo al hacer COMMIT/ROLLBACK.
3. `POST /proyecto-ley/lista-con-filtro` con el body completo de `FiltroProyecLeyDto` (solo
   `perParId` distinto de `null`). Exige explícitamente que `data.proyectos` sea un array real —
   una respuesta `HTTP 200` con schema inesperado lanza error en vez de tratarse como "periodo sin
   proyectos" (hallazgo real de Copilot: el snapshot completo de abajo habría borrado todos los
   proyectos reales de ese periodo sin darse cuenta).
4. Transacción por periodo: inserta un `raw_congreso_batches`, normaliza (`normalize-congreso.ts`),
   hace `ON CONFLICT (per_par_id, pley_num) DO UPDATE` por lote de 1000 filas, guarda rechazados si
   los hay, actualiza `record_count`, commit. Si un periodo falla, los demás se intentan igual — los
   errores se acumulan y se lanzan al final (no queda un fallo parcial en silencio).

### Verificación en vivo (2026-09-21)

```json
{
  "periodosDescubiertos": [2026, 2021],
  "periodos": [
    { "perParId": 2026, "batchId": 1, "filasOrigen": 4, "filasInsertadas": 4, "filasRechazadas": 0 },
    { "perParId": 2021, "batchId": 2, "filasOrigen": 14864, "filasInsertadas": 14864, "filasRechazadas": 0 }
  ]
}
```

Verificado contra Postgres real:

```sql
SELECT COUNT(*) AS total, COUNT(DISTINCT (per_par_id, pley_num)) AS claves_unicas
FROM legislativo_congreso_proyectos;
-- total: 14868, claves_unicas: 14868
```

## API (`src/routes/proyectos.ts`)

- `GET /api/proyectos` — filtros `periodo` (exacto), `estado` (exacto), `autor` (ILIKE), `texto`
  (ILIKE sobre título), paginado (`limit`/`offset`, default 200/máx. 1000). A diferencia de
  `violencia-escolar`, no hay que filtrar por "batch más reciente": el upsert del conector ya
  mantiene una sola fila vigente por proyecto.
- `GET /api/proyectos/{periodo}/{numero}` — detalle por la clave real (`per_par_id`+`pley_num`),
  no por el código legible con `/`. Responde `404` si no existe.
- `GET /api/proyectos/periodos` — qué periodos están disponibles (ingeridos con éxito al menos una
  vez), con fecha de última ingesta y conteo. Distingue explícitamente "filtro sin match" de
  "periodo nunca ingerido" — un periodo ausente de esta lista **no** significa "cero proyectos
  confirmados".

Todas verificadas en vivo contra la API real levantada localmente con datos reales ingeridos
(`/health`, `/readyz`, `/api/proyectos/periodos`, `/api/proyectos?periodo=2021&limit=2`,
`/api/proyectos/2021/14864`, `/api/proyectos/2021/99999999` → `404`).

## MCP

Tools registradas en `mcp-server/src/catalog.ts`: `legislativo_congreso_proyectos`,
`legislativo_congreso_proyecto_detalle`, `legislativo_congreso_periodos`. Verificado que
`mcp-server/src/__tests__/routes-vs-catalog.test.ts` pasa (cada `GET` real tiene tool, cada tool
corresponde a un `GET` real).

## Fuera de alcance de este conector

- Clasificación temática, resumen con IA, búsqueda semántica — ver
  `docs/PRD_Inteligencia_Legislativa_Congreso_v1.md` §9 (Fase 2, no comprometida).
- Cruce con INFOBRAS/SEACE/presupuesto regional — Fase 3, no comprometida.
- Votaciones, asistencia, comisiones — ver ADS-20 (`docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`), no investigado todavía.
- Scheduler, UI.
