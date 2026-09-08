# ADR-0022: Operación continua de `crossref:build` (infobras, compras-publicas) — DQ-11

- Estado: Decidido — chequeo de salud implementado, automatización diferida.
- Fecha: 2026-09-08.
- Ámbito: `entity_crosswalk` de `apps/infobras/api` y `apps/compras-publicas/api`, poblada por
  el script `npm run crossref:build` de cada app.
- Origen: [`docs/TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md#DQ-11`](../TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md)
  (redefinido tras el cierre de DQ-05, ver ese mismo documento).

## Contexto

DQ-05 (2026-09-07) encontró que `entity_crosswalk` de ambas apps llevaba meses vacía porque
`npm run crossref:build` nunca se había corrido en este entorno — nadie lo notó hasta una
auditoría manual, y mientras estuvo vacía, el score institucional completo (nacional, no solo
La Libertad) quedó topado en un máximo de 2 de 5 componentes sin que ningún endpoint lo
señalara. Correr el script arregló el síntoma (infobras: 75 confirmadas + 17 candidatas de 130;
compras-publicas: 56 confirmadas + 15 candidatas de 130), pero no la causa raíz: `entity_crosswalk`
puede volver a quedar desactualizada (nuevas obras/adjudicaciones que nunca entran al crosswalk
porque nadie vuelve a correr el script) sin que nada lo detecte, igual que la primera vez.

Este ADR decide qué hacer al respecto: automatizar el job, agregar solo un chequeo de salud, o
ambos.

## Qué ya existe (no es trabajo nuevo de este ADR)

`GET /api/crossref/salud` ya se implementó en ambas apps como parte de SI-07 (2026-09-07, ver
`docs/conectores.md`, fichas de `infobras` y `compras-publicas`) — reporta
`{filas, confirmadas, candidatas, ultimaConstruccion, estado}`, con `estado: "VACIO"` explícito
si `entity_crosswalk` tiene 0 filas. Esto ya satisface el criterio de aceptación (b)/(c) de
DQ-11 ("chequeo de salud... alertar si `entity_crosswalk` tiene 0 filas o no se ha recalculado
en N días") en su parte de detección — falta la decisión sobre automatizar la re-construcción
en sí, que es lo que resuelve este documento.

## Pregunta: ¿automatizar `crossref:build`?

Mismo bloqueador estructural que ADR-0016 (automatización de `mef-connector`/`oece-connector`,
2026-09-02): cada Postgres de este monorepo escucha únicamente en `127.0.0.1:5432` — no son
alcanzables desde ningún runner que no esté en la misma red que la máquina de desarrollo. Un
`schedule:` de GitHub Actions en runners cloud no tiene ruta de red hacia ninguna de las dos
bases de datos (`infobras`, `compras-publicas`) que `crossref:build` necesita leer y escribir.
Las únicas opciones reales (cron local, self-hosted runner, migrar a DB alcanzable desde
internet) tienen exactamente el mismo costo/riesgo ya evaluado en ADR-0016 §"Pregunta 2" — no
hay nada específico de `crossref:build` que cambie ese análisis.

## Decisión

**No se automatiza `crossref:build` en esta iteración** — mismo razonamiento de ADR-0016:
automatizar sin resolver primero la disponibilidad de las bases de datos daría una falsa
sensación de "esto corre solo" que seguiría fallando en silencio si la máquina está apagada,
reproduciendo el mismo problema de honestidad de datos que DQ-05 encontró.

**El chequeo de salud (`GET /api/crossref/salud`, ya implementado vía SI-07) se mantiene como
la mitigación real para este ciclo.** A diferencia de una automatización fallida-en-silencio,
un endpoint de salud consultable es honesto sobre su propio estado: quien lo revise sabe con
certeza si el crosswalk está vacío o desactualizado, en vez de asumir que "correr solo" implica
que está al día.

### Qué falta para que el chequeo de salud sea efectivo en la práctica

El endpoint ya existe, pero no sirve si nadie lo consulta. Recomendación operativa (no
bloqueante, no requiere código nuevo): revisar `GET /api/crossref/salud` de ambas apps como
parte del checklist de cualquier despliegue de datos nuevo o construcción de un artefacto que
dependa del score institucional — mismo criterio que ya quedó documentado en la ficha de
`infobras` en `docs/conectores.md` ("revisar este endpoint tras cada seed/despliegue de datos
nuevo").

## Recomendación para una futura iteración

Si se decide automatizar más adelante, aplica el mismo orden de prioridad que ADR-0016 §Recomendación:
primero resolver la disponibilidad de las bases de datos (hosting alcanzable desde internet)
como decisión de infraestructura independiente, y recién después un `schedule:` de GitHub
Actions para `crossref:build` de ambas apps.

## Referencias

- Ticket: [`docs/TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md#DQ-11`](../TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md)
- Hallazgo original y fix del síntoma: DQ-05, mismo documento
- Chequeo de salud ya implementado: SI-07, [`docs/TICKETS_Score_Institucional_Granular_v1.md`](../TICKETS_Score_Institucional_Granular_v1.md)
- Mismo bloqueador de infraestructura, precedente completo: [ADR-0016](0016-automatizacion-conectores-nucleo-evaluacion.md)
