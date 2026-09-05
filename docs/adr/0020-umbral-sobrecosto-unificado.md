# ADR-0020: Umbral unificado de "sobrecosto" entre INFOBRAS y salud-institucional

**Estado:** Aceptado
**Fecha:** 2026-09-05
**Ticket origen:** CX-10 (`docs/TICKETS_Consolidacion_Logica_Compartida_y_Rigor_Temporal_v1.md`)

## Contexto

El PRD de Consolidación de Lógica Compartida asumía tres implementaciones distintas de
"sobrecosto" (`infobras`, `radar-inversiones`, `salud-institucional`). Al investigar para
escribir este ADR, esa premisa resultó **parcialmente incorrecta** — corrección igual que
la que tuvo CX-08 sobre el número real de copias de `LATEST_BUDGET_CTE`:

- `apps/infobras/api/src/signals/signals.ts` — `costDriftPct(montoViable, costoActualizado)`
  calcula un **porcentaje continuo** de desvío para una **obra** de INFOBRAS. No clasifica
  nada como "con/sin sobrecosto" — expone el número crudo en `GET /api/public-works` para que
  quien lo lea decida.
- `apps/salud-institucional/api/src/routes/score.ts:75` — `COUNT(*) FILTER (WHERE
  costo_actualizado > monto_viable)` sobre `investments` (Invierte.pe), agregado por entidad
  para alimentar `computeEntityScore` (componente `inversionesSinSobrecosto`).
- **`apps/radar-inversiones/api/src/routes/crossref.ts` NO tiene ninguna clasificación de
  sobrecosto** — solo suma `monto_viable_total`/`costo_actualizado_total` sin comparar ni
  clasificar. La suposición original de que ahí había un tercer criterio era errónea.

Son solo dos implementaciones, y miden granularidades distintas: `costDriftPct` opera sobre
una **obra física** (INFOBRAS); el filtro de `salud-institucional` opera sobre una
**inversión** (Invierte.pe, identificada por CUI) — no son necesariamente el mismo objeto
(una inversión puede tener 0, 1 o varias obras asociadas, ver el cruce por CUI de
`infobras/routes/crossref.ts`). Aun así, el concepto —"¿qué % de desvío entre lo aprobado y
lo actualizado cuenta como sobrecosto?"— es el mismo, y hoy tiene dos definiciones textuales
distintas sin relación explícita entre sí: una es un porcentaje continuo sin clasificar, la
otra es un booleano `> 0` sin nombre ni documentación de por qué el umbral es cero.

## Decisión

**No se inventa un umbral numérico distinto de 0% sin evidencia real.** Este proyecto no
tiene, en esta sesión, acceso a la distribución real de `costDriftPct` sobre los datos ya
ingeridos (obras/inversiones de La Libertad) para justificar un valor como "10%" o "15%" —
inventar uno sería exactamente el tipo de afirmación no verificada que el resto del proyecto
evita (mismo criterio que ADR-0007 con MIDAGRI/MINCETUR: sin poder confirmar en vivo, se
declara el nivel de confianza en vez de asumir).

**Lo que sí se decide:**

1. `costDriftPct` se mueve a un paquete compartido (`packages/shared-signals`), con
   `apps/infobras/api/src/signals/signals.ts` re-exportándola — mismo patrón que
   `budget-coverage.ts`/`temporal-status.ts` en CX-08/CX-09.
2. Se agrega una constante nombrada y documentada, `SOBRECOSTO_UMBRAL_PCT = 0`, en el mismo
   paquete — reemplaza el `0` implícito en la comparación `>` de `salud-institucional`. El
   valor no cambia (sigue siendo "cualquier desvío positivo cuenta"), pero ahora es un nombre
   con una razón escrita, no un número mágico.
3. `salud-institucional/routes/score.ts` **no se reescribe para calcular `costDriftPct` fila
   por fila en JavaScript** — eso cambiaría la query de una agregación `COUNT(*) FILTER` en
   SQL a traer todas las inversiones y calcular en memoria, con impacto de performance no
   evaluado y fuera del alcance de una consolidación. En su lugar, la comparación SQL
   `costo_actualizado > monto_viable` queda como está, con un comentario explícito que la
   vincula a `SOBRECOSTO_UMBRAL_PCT` y advierte que si el umbral deja de ser 0, esta condición
   SQL debe actualizarse en conjunto (`costo_actualizado > monto_viable * (1 +
   SOBRECOSTO_UMBRAL_PCT / 100)`).
4. Se abre **CX-14** (ticket de seguimiento, no incluido en el alcance original de CX-10):
   analizar la distribución real de `costDriftPct` sobre datos ya ingeridos y decidir, con
   evidencia, si el umbral debería subir de 0% — y si conviene, ahí sí, refactorizar
   `salud-institucional` para calcular el % real en vez de un booleano ciego.

## Consecuencias

- No hay cambio de comportamiento observable hoy: `costo_actualizado > monto_viable` sigue
  siendo la regla, en ambos lugares, para "cuenta como sobrecosto".
- La próxima vez que alguien quiera cambiar el umbral, hay un solo lugar (`SOBRECOSTO_UMBRAL_PCT`)
  que cambiar, con una nota en el código que apunta a la comparación SQL que también hay que
  tocar — reduce, pero no elimina del todo, el riesgo de que ambos se desincronicen (eliminarlo
  del todo requeriría el refactor de CX-14).
- `docs/conectores.md` (fichas de `infobras` y `salud-institucional`) se actualiza para
  mencionar `SOBRECOSTO_UMBRAL_PCT` y enlazar este ADR.
- Este ADR no autoriza inventar el valor del umbral en el futuro sin el análisis de datos que
  CX-14 exige — si CX-14 nunca se ejecuta, el umbral se mantiene en 0% indefinidamente, lo
  cual es una postura válida (conservadora), no un estado transitorio urgente.
