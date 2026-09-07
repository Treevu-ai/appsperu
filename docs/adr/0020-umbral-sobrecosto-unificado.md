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

## Actualización 2026-09-07 — CX-14 ejecutado, `SOBRECOSTO_UMBRAL_PCT` confirmado en 0%

A diferencia de la sesión que escribió este ADR, esta sí tuvo acceso a las bases locales ya
ingeridas (Docker Postgres por app, mismo mecanismo usado en todo el resto de la investigación
de esta semana) — el bloqueo de CX-14 era de acceso a datos, no estructural, y se pudo levantar.

**Hallazgo no anticipado sobre la fuente de `infobras`**: `public_works.costo_actualizado`
viene en `0.00` para el **100%** de las 10,134 obras ingeridas (7,742 con `monto_viable`
distinto de cero como base de comparación) — sin excepción, mientras que campos vecinos
(`avance_fisico_real_pct`, `monto_viable`) sí varían con normalidad. No es un bug de índice de
columna (`COL.costoActualizado = 27`, verificado en vivo, adyacente a `montoViable = 26` que sí
funciona) — es casi seguro una característica real de la fuente: INFOBRAS solo popula "Costo
Actualizado de la inversión" cuando la entidad reporta una reformulación presupuestal formal, y
la inmensa mayoría de obras nunca la tuvo. **Efecto práctico hoy**: `costDriftPct` en `infobras`
es sistemáticamente `-100%` (nunca positivo) para toda obra con base de comparación válida, así
que `esSobrecosto()` devuelve `false` para el 100% de las obras — el umbral es irrelevante en
`infobras` específicamente, porque la señal fuente no discrimina nada en el corte actual. No es
un bug de este proyecto ni algo que este ADR deba corregir; queda documentado como limitación
conocida de la fuente (candidato a nota en `docs/data-contracts/infobras-obras-publicas.md` si
se retoma ese análisis).

**La distribución real y útil vino de `radar-inversiones` (Invierte.pe)** — la fuente que
efectivamente consume `salud-institucional/routes/score.ts`, 7,985 inversiones con base de
comparación válida, 100% de La Libertad (la app está acotada a ese departamento):

| Percentil | `costDriftPct` |
|---|---|
| p10 | -17.0% |
| p25 | 0% |
| p50 (mediana) | 0% |
| p75 | 13.6% |
| p90 | 60.7% |
| p95 | 113.5% |
| p99 | 398.5% |

| Umbral candidato | Inversiones clasificadas "con sobrecosto" |
|---|---|
| 0% (actual) | 3,124 / 7,985 (39.1%) |
| 1% | 2,994 (37.5%) |
| 5% | 2,543 (31.8%) |
| 10% | 2,199 (27.5%) |
| 20% | 1,729 (21.6%) |

**Decisión (con el usuario, con esta evidencia delante)**: se **mantiene `SOBRECOSTO_UMBRAL_PCT
= 0`**. Con la mediana exactamente en 0% y solo ~130 de los 3,124 casos positivos cayendo en la
banda de posible ruido de redondeo (0%–1%), subir el umbral no elimina ruido de forma
significativa — solo excluiría inversiones con sobrecosto real, aunque pequeño. 0% sigue siendo
el criterio más simple de explicar ante un fiscalizador ("gastó más de lo aprobado", sin zona
gris que justificar) y ya no es una postura conservadora sin evidencia: la evidencia real
confirma que es defendible, no solo que no había datos para objetarla.

CX-14 queda **cerrado**. No se ejecuta el refactor condicional que este ADR dejó abierto en el
punto 4 (calcular `costDriftPct` fila por fila en `salud-institucional`) porque el umbral no
cambió — la comparación SQL `costo_actualizado > monto_viable` sigue siendo exactamente
equivalente a `costDriftPct > 0`.

## Actualización 2026-09-07 (2) — corregido el hallazgo de `infobras`, no solo documentado

El hallazgo de la sección anterior ("la fuente de `infobras` está degenerada") se verificó de
forma exhaustiva y se corrigió, no solo se dejó anotado: se descargó y recorrió el **export
nacional completo** de INFOBRAS (191,180 filas, sin filtrar departamento) — `costo_actualizado`
trae `"0"` en el **100% de las filas, sin una sola excepción**, confirmando que no es un
artefacto del corte local de La Libertad ni de una fecha de ingesta específica.

`apps/infobras/api/src/ingest/normalize.ts` (`parseCostoActualizado`) ahora trata un valor
parseado de exactamente `0` como `null` — con evidencia de 191,180/191,180, un "0" real sería
estadísticamente indistinguible de "no reportado". Migración
`004_costo_actualizado_zero_as_null.sql` corrigió las filas ya persistidas (verificado: 10,134
filas locales pasaron de `costo_actualizado = 0` a `NULL`). Detalle completo en
`docs/data-contracts/infobras-obras-publicas.md`.

Efecto en `costDriftPct`/`esSobrecosto` para `infobras`: antes devolvían `-100%`/`false`
sistemáticamente (un resultado que parecía decir "sin sobrecosto" pero en realidad reflejaba
ausencia de dato); ahora devuelven `null`/`false` con `costoActualizado: null` explícito. La
señal de Cost Drift queda documentada como no disponible en la práctica para `infobras` con la
fuente actual, sin afectar `radar-inversiones`/Invierte.pe (que sí reporta valores reales, ver
la distribución de la actualización anterior).
