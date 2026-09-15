# PRD — Propuesta de valor de bajo esfuerzo y alto impacto para Rastro

**Estado:** Propuesto; pendiente de owner y fecha comprometida
**Fecha:** 2026-09-12
**Ámbito:** `apps/radar-ejecucion/api/src/routes/sectors.ts`, `apps/infobras/api/src/routes/public-works.ts`, `apps/proveedores-sancionados/api/src/routes/crossref.ts`, nueva tabla en `apps/proveedores-sancionados/api/src/db/migrations`, `docs/conectores.md`
**Horizonte:** un sprint; sin fecha comprometida ni owner asignado
**Origen:** sesión de producto del 2026-09-12 — construcción de un one-pager de inteligencia para el sector Producción (artifact `Radar Produce`, publicado en esa sesión) seguida de una ronda de ideación sobre qué mejoras de bajo esfuerzo refuerzan la propuesta de valor de Rastro sin abrir un nuevo frente de ingesta.

## 1. Decisión de producto

El one-pager de Producción del 2026-09-12 se armó a mano: tres consultas SQL directas contra tres bases (`compras_publicas`, `proveedores_sancionados`, `infobras`) filtradas manualmente por `sector_entidad = 'PRODUCCIÓN'`. Al revisar el código para escribirlas se confirmó algo importante: **la mayor parte de esa capacidad ya existe como endpoint reusable** — `GET /sectors/:sectorId/ficha` en `radar-ejecucion` ya arma presupuesto + inversiones + obras + contrataciones por sector, y `public-works.ts`/`crossref.ts` ya filtran por departamento. Lo que falta no es infraestructura nueva: son tres brechas puntuales que impiden reusar ese trabajo para (a) cualquier sector sin acotar a un departamento, (b) un ranking nacional de obras paralizadas, y (c) una alerta de proveedor sancionado con contrato nuevo en vez de una foto estática.

Este PRD cierra esas tres brechas. Ninguna requiere un conector nuevo, una app nueva, ni una fuente de datos que Rastro no tenga ya ingerida.

## 2. Problema y oportunidad

1. **`GET /sectors/:sectorId/ficha` no tiene modo nacional.** `BaseQuery` (`sectors.ts:13-16`) exige `departamento` (default `LA LIBERTAD`) y `budgetByRegistry` siempre filtra por ese departamento — no existe forma de pedir "todas las entidades de este sector a nivel nacional" en una sola llamada. Repetir el one-pager de Producción para otro sector hoy exige escribir SQL nuevo a mano, como se hizo el 2026-09-12.
2. **`GET /public-works` (`apps/infobras/api/src/routes/public-works.ts:24-29`) no filtra por sector ni por umbral de días parado, y no ordena por `dias_paralizado`.** El hallazgo "obras paralizadas +180 días" del one-pager se armó con una consulta SQL directa a la base porque el endpoint no soporta `sectorEntidad`, `diasParalizadoMin` ni `orderBy`. Un ranking nacional (no solo por sector) sufre la misma limitación.
3. **El cruce contrataciones×sanciones (`crossref.ts` en `proveedores-sancionados`) es una foto, no una vigilancia.** `wantedDepartamento` (línea 42) procesa un solo departamento por llamada y no persiste qué pares proveedor-contrato ya se habían visto sancionados en una corrida anterior. Hoy, para saber si *apareció un caso nuevo* desde la última vez, hay que volver a correr todo y comparar a mano — exactamente el trabajo que impide que esto sea una alerta real en vez de un reporte bajo demanda.

Cerrar estas tres brechas convierte un ejercicio manual de una tarde (el one-pager de Producción) en tres capacidades reusables: ficha sectorial nacional bajo demanda, ranking nacional de obras paralizadas, y detección de "nuevo caso" en el cruce de sancionados — la pieza que más distingue a Rastro de un reporte estático.

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Que las tres piezas de datos que armaron el one-pager de Producción (ficha sectorial, ranking de obras paralizadas, cruce de sancionados) se puedan pedir para cualquier sector o a nivel nacional mediante un endpoint existente extendido, sin escribir SQL ad-hoc; y que el cruce de sancionados distinga explícitamente un caso ya conocido de uno nuevo desde la última corrida.

### No objetivos

- No se construye ningún canal de envío de notificaciones (correo, Slack, webhook) — no existe hoy infraestructura de notificación en el repo (`grep` de `nodemailer`/`sendgrid`/`webhook`/`slack` en `apps/*/api/src` no encontró nada) y añadirla es una decisión de producto aparte, fuera de este alcance. Este PRD deja el hallazgo persistido y consultable vía API; el canal de entrega queda como ticket de seguimiento (ver §9).
- No se automatiza la ejecución periódica (cron/scheduler) de ninguna de las tres consultas — mismo criterio ya establecido para otros PRD de este backlog (`PRD_Confiabilidad_Conectores_y_Cruces_v1.md`, CX-04).
- No se construye ninguna interfaz de usuario ni cambio en `apps/rastro-web` — alcance backend/API únicamente.
- No se ingiere ningún dato nuevo ni se crea ningún conector — las tres mejoras operan exclusivamente sobre datos ya presentes en `compras_publicas`, `proveedores_sancionados`, `infobras` y `radar_ejecucion`.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Ficha sectorial nacional | `GET /sectors/:sectorId/ficha?ambito=NACIONAL` devuelve la misma forma de respuesta que hoy, agregando todas las entidades del sector sin importar departamento, verificado reproduciendo el mismo total que dio el one-pager de Producción (PIM S/ 208.1M, devengado S/ 128.2M). |
| Ranking de obras paralizadas | `GET /public-works?sectorEntidad=PRODUCCIÓN&diasParalizadoMin=180&orderBy=diasParalizado_desc` devuelve exactamente las 4 obras ya identificadas manualmente, en el mismo orden. |
| Detección de caso nuevo en sancionados | Correr el cruce dos veces sobre el mismo estado de datos no marca ningún caso como "nuevo" la segunda vez; introducir un caso sintético (contrato o sanción nueva) sí lo marca. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Persona armando un one-pager para otro sector/ministerio | Repetir el ejercicio de Producción sin escribir SQL a mano cada vez. | Ficha sectorial nacional + ranking de obras paralizadas disponibles como parámetros de endpoints existentes. |
| Analista de riesgo de proveedores | Saber si apareció un caso nuevo de proveedor sancionado con contrato vigente desde la última revisión, sin releer los 244 casos ya conocidos. | Endpoint que distingue "ya visto" de "nuevo desde la última corrida". |
| Futuro mantenedor | Entender por qué el one-pager de Producción no usó los endpoints existentes la primera vez. | Este PRD documenta la brecha exacta y la cierra sin duplicar lógica ya construida. |

## 5. Alcance funcional: seis issues

### PV-01 — Ámbito nacional en la ficha sectorial

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ninguna

`budgetByRegistry` (`sectors.ts:34-61`) recibe `departamento` como parámetro obligatorio y lo usa tanto para filtrar `META_DEPARTAMENTO` como `budget_coverage_snapshots`. Agregar un modo `ambito=NACIONAL` que omita el filtro de `meta_departamento`/`territories.departamento` y agregue sobre todas las entidades del sector a nivel país, preservando la distinción `META_DEPARTAMENTO` vs `SEDE_EJECUTORA` que ya impide sumar responsabilidades distintas (ver `advertenciaGasto` existente en la línea 195).

**Criterios de aceptación**

- `GET /sectors/:sectorId/ficha?ambito=NACIONAL&anio=2026` sin parámetro `departamento` agrega todas las entidades verificadas del sector en `sector_entity_registry`, sin duplicar registros de `budget_coverage_snapshots` por departamento.
- El total de PIM/devengado para `sectorId=PRODUCCION` reproduce los mismos S/ 208.1M / S/ 128.2M ya verificados manualmente el 2026-09-12 para el Ministerio de la Producción (nota: la ficha agrega por sector completo, no solo el pliego 1086 — documentar la diferencia si los adscritos tienen presupuesto propio en `entities`).
- El comportamiento por departamento (`ambito` ausente o `REGIONAL`) no cambia — este es un modo adicional, no un reemplazo.
- Test de regresión que compara la respuesta actual (modo departamental) antes y después del cambio.

### PV-02 — Documentar la ficha sectorial como ruta recomendada para one-pagers

**Prioridad:** P1 · **Esfuerzo:** XS · **Dependencias:** PV-01

Agregar a `docs/conectores.md` (o a un nuevo `docs/GUIA_ONE_PAGERS_SECTORIALES.md`) una nota explícita: para armar un one-pager de un sector, usar `GET /sectors/:sectorId/ficha?ambito=NACIONAL` en vez de escribir SQL ad-hoc contra las bases — con un ejemplo real usando `sectorId=PRODUCCION` y el resultado ya verificado el 2026-09-12. Objetivo: que la próxima persona que arme un one-pager no repita el mismo camino manual.

**Criterios de aceptación**

- El documento existe y referencia el PR de PV-01.
- Incluye el ejemplo de respuesta real para `PRODUCCION`, con fecha de verificación.

### PV-03 — Filtro de sector, umbral de días y orden en `GET /public-works`

**Prioridad:** P0 · **Esfuerzo:** S · **Dependencias:** ninguna

`PublicWorksQuerySchema` (`public-works.ts:24-29`) no acepta `sectorEntidad`, `diasParalizadoMin` ni `orderBy` — la ruta siempre ordena por `pw.nombre_obra ASC` (línea 171). Agregar los tres parámetros: `sectorEntidad` (filtro exacto contra `sector_entidad`), `diasParalizadoMin` (filtro `dias_paralizado >= N`, solo aplicable junto con `existeParalizacion=true`), y `orderBy` (enum acotado, ej. `diasParalizado_desc`, `montoViable_desc`, default el orden actual por nombre).

**Criterios de aceptación**

- `GET /public-works?sectorEntidad=PRODUCCIÓN&conParalizacion=true&diasParalizadoMin=180&orderBy=diasParalizado_desc` devuelve exactamente las 4 obras ya identificadas el 2026-09-12 (Gran Mercado de Belén, desembarcadero de Paita, mercado Vivanco, cerco CITEforestal), en ese orden.
- Sin los parámetros nuevos, el comportamiento actual no cambia (test de regresión).
- `diasParalizadoMin` sin `conParalizacion=true` devuelve error de validación explícito, no un filtro silenciosamente ignorado.

### PV-04 — Ranking nacional de obras paralizadas (sin filtro de sector)

**Prioridad:** P1 · **Esfuerzo:** XS · **Dependencias:** PV-03

Con PV-03 ya construido, exponer el caso de uso "ranking nacional, cualquier sector" es simplemente omitir `sectorEntidad` en la misma ruta — no requiere código adicional más allá de confirmar que el filtro es opcional y que el `LIMIT` por defecto de la ruta no trunca resultados de forma silenciosa a nivel nacional (hoy `GET /public-works` no pagina).

**Criterios de aceptación**

- `GET /public-works?conParalizacion=true&diasParalizadoMin=180&orderBy=diasParalizado_desc` (sin `sectorEntidad`) devuelve el ranking nacional completo.
- Si el volumen nacional de obras paralizadas +180 días excede un umbral razonable para una sola respuesta (a definir en el PR, ej. 500 filas), se agrega paginación (`limit`/`offset`) — evaluar el volumen real antes de decidir si es necesario en este ticket o se difiere.

### PV-05 — Persistir "primera vez visto" en el cruce de sancionados

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ninguna

`crossref.ts` en `proveedores-sancionados` calcula `tieneInhabilitacionVigente` en cada llamada pero no persiste nada — no hay forma de saber si un caso ya se había visto en una corrida anterior. Agregar una tabla `sanciones_contratos_vistos` (migración nueva en `apps/proveedores-sancionados/api/src/db/migrations`, siguiendo el patrón de `002_dni_persona_natural.sql`) con clave `(ruc, ocid_o_contracting_id)` y `primera_vez_visto`. Cada corrida del cruce hace upsert; el resultado de cada fila expone `esNuevoDesdeUltimaCorrida: boolean`.

**Criterios de aceptación**

- Migración nueva, revertible, con índice único sobre `(ruc, referencia_contrato)`.
- Correr el cruce dos veces seguidas sobre el mismo estado de datos: la segunda corrida no marca ningún caso como nuevo.
- Insertar una sanción vigente nueva (o un contrato nuevo con RUC ya sancionado) y volver a correr el cruce: ese caso específico se marca `esNuevoDesdeUltimaCorrida: true`, y solo ese.
- El campo `soloInhabilitados` existente sigue funcionando sin cambios de forma en la respuesta actual — `esNuevoDesdeUltimaCorrida` es un campo adicional, no un reemplazo.

### PV-06 — Endpoint de "hallazgos nuevos" nacional

**Prioridad:** P1 · **Esfuerzo:** S · **Dependencias:** PV-05

Hoy `crossref.ts` procesa un solo `departamento` por llamada (default `LA LIBERTAD`). Agregar un modo que recorra todos los departamentos (o acepte `departamento=TODOS`) y devuelva únicamente los casos con `esNuevoDesdeUltimaCorrida: true` — la lista que efectivamente importa vigilar, en vez de repetir los 244 casos ya conocidos en cada consulta.

**Criterios de aceptación**

- `GET /crossref?departamento=TODOS&soloNuevos=true` devuelve solo los casos nuevos desde la última corrida registrada, a nivel nacional.
- Documentado en `docs/conectores.md` como el punto de entrada recomendado para vigilancia, dejando explícito que el envío de notificaciones (correo/Slack) no está construido — es un ticket de seguimiento separado (ver §9).

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora** | PV-01, PV-03, PV-05 | Las tres piezas de datos del one-pager de Producción quedan disponibles vía API para cualquier sector, sin SQL ad-hoc. |
| **Siguiente** | PV-02, PV-04, PV-06 | Ranking nacional sin filtro de sector, endpoint de vigilancia de casos nuevos, y guía documentada para no repetir el camino manual. |

## 7. Requisitos no funcionales

- **No duplicar lógica existente:** las tres mejoras extienden endpoints ya construidos (`sectors.ts`, `public-works.ts`, `crossref.ts`) — ningún ticket de este PRD crea una app, tabla de dominio o conector nuevo salvo la tabla de estado de PV-05, que es de seguimiento operativo, no de datos de fuente.
- **Regresión explícita:** todo cambio de query existente (PV-01, PV-03) debe demostrar, con test, que el comportamiento sin los parámetros nuevos no cambia.
- **Honestidad de alcance:** PV-06 debe declarar explícitamente que no envía notificaciones — solo expone el hallazgo vía API — para no dar la impresión de una alerta activa que no existe todavía.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El modo `ambito=NACIONAL` de PV-01 agrega presupuesto de entidades con reglas territoriales distintas (`META_DEPARTAMENTO` vs `SEDE_EJECUTORA`) de forma incorrecta | Reusar la misma distinción que ya existe en `mapBudget`/`advertenciaGasto` — no sumar ambas reglas en un solo total sin etiquetarlas por separado. |
| El volumen nacional de PV-04 (ranking sin filtro de sector) resulta más grande de lo esperado y la respuesta se vuelve pesada sin paginar | El criterio de aceptación de PV-04 evalúa el volumen real antes de decidir si la paginación es parte de este ticket o se difiere a uno de seguimiento. |
| PV-05/PV-06 crean expectativa de "alerta en tiempo real" cuando no hay canal de notificación ni scheduler | Documentación explícita en `docs/conectores.md` (ver PV-06) de que esto es un endpoint de consulta, no una alerta activa. |

## 9. Fuera de este PRD

- Canal de envío de notificaciones (correo, Slack, webhook) para los hallazgos nuevos de PV-06 — decisión de producto e infraestructura aparte, sin infraestructura previa en el repo.
- Automatización periódica (cron/scheduler) de cualquiera de las tres consultas extendidas — sigue el criterio ya establecido en CX-04 de `PRD_Confiabilidad_Conectores_y_Cruces_v1.md`.
- Generar automáticamente el HTML del one-pager (como el artifact `Radar Produce` del 2026-09-12) a partir de la respuesta de estos endpoints — quedaría como ticket de plantilla/generador si se decide perseguir, fuera de este alcance backend.
- Paginación completa de `GET /public-works` más allá de lo mínimo que requiera PV-04 — si el volumen nacional lo justifica, es un ticket de seguimiento propio.

## 10. Definition of Done

- Cada issue tiene PR, revisión y pruebas automatizadas asociadas.
- `docs/conectores.md` refleja los nuevos parámetros y el nuevo endpoint de vigilancia después de cada PR mergeado de este PRD.
- PV-01 y PV-03 se verifican reproduciendo exactamente las cifras ya validadas manualmente en el one-pager de Producción del 2026-09-12 (S/ 208.1M PIM / S/ 128.2M devengado; 4 obras paralizadas +180 días).
- PV-05 se verifica con el experimento de dos corridas descrito en sus criterios de aceptación, no solo con un test unitario aislado.
- Ningún ticket de este PRD introduce un conector, una app o una fuente de datos nueva.
