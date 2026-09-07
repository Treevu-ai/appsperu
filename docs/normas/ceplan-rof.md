# ROF — CEPLAN (Centro Nacional de Planeamiento Estratégico)

**Fuente**: `ceplan-rof.pdf` — Decreto Supremo N° 046-2009-PCM (base de creación del ROF, Decreto
Legislativo N° 1088). Texto real extraído (47,101 caracteres). Descargado de
`ceplan.gob.pe/wp-content/uploads/2013/07/reglamentoorganizacionfunciones.pdf` (2026-09-07).
Puede existir texto integrado más reciente con modificatorias no descargadas en esta pasada — la
naturaleza de ente rector del planeamiento estratégico es estable desde su creación en 2008.

## Naturaleza jurídica (Artículo 2, texto real)

Organismo técnico especializado **adscrito a la Presidencia del Consejo de Ministros (PCM)**,
personería jurídica de derecho público, pliego presupuestario, independencia funcional según su
Ley de Creación (D. Leg. N° 1088).

## Competencia y Atribuciones (Artículo 5, texto real)

**Entidad rectora del Sistema Nacional de Planeamiento Estratégico** — los órganos del sistema
"mantienen relación técnica y funcional con él... y están obligados a dar cumplimiento a los
lineamientos y directivas que emita". Competencias: programar/dirigir/coordinar/supervisar/
evaluar la gestión del proceso de planeamiento; expedir normas reglamentarias; emitir opinión
vinculante; llevar registros e información actualizada del sistema.

## Relación con Rastro

- `ceplan-estrategico`: los indicadores de planificación estratégica (ObservaPerú) que ingiere
  esta app existen porque CEPLAN, como ente rector, tiene la función explícita de "llevar
  registros y producir información relevante de manera actualizada y oportuna" (Artículo 5.f) —
  el propio sistema que Rastro consulta es, formalmente, un instrumento que la ley obliga a
  CEPLAN a mantener actualizado.
- `ceplan-geo`: la capa geoespacial (GeoServer) es una extensión del mismo mandato de
  información territorial que CEPLAN rectorea para el Sistema Nacional de Planeamiento
  Estratégico — no una fuente distinta con su propio ROF, es la misma entidad ejerciendo su
  competencia de "mantener actualizada y sistematizada la normatividad e información del
  Sistema" en formato geoespacial.
- Al ser adscrito a la PCM (no un ministerio sectorial), CEPLAN tiene una posición transversal:
  su "opinión vinculante sobre la materia del Sistema" (Artículo 5.d) aplica a todos los
  sectores, lo que explica por qué sus indicadores de alineamiento plan-presupuesto
  (`ceplan_estrategico_indicators_plan_budget_alignment`) pueden cruzar contra cualquier
  entidad del catálogo, sin restricción sectorial.
