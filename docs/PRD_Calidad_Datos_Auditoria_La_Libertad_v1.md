# PRD — Calidad de datos: hallazgos de la auditoría La Libertad

**Estado:** Propuesto; pendiente de owner y fecha comprometida
**Fecha:** 2026-09-07
**Ámbito:** `apps/radar-ejecucion/api`, `apps/infraestructura-mtc/api`, `apps/residuos-solidos/api`, `apps/salud-institucional/api`, `apps/infobras/api`, `apps/instituciones-educativas/api`, `docs/data-contracts`
**Horizonte:** tres sprints; sin fecha comprometida ni owner asignado
**Origen:** auditoría exhaustiva de 22 fuentes de datos para el departamento de La Libertad (2026-09-06/07), hecha consultando cada API en vivo (no vía MCP) y paginando datasets completos para verificar cada suma, porcentaje y categoría usada en un informe territorial ad-hoc. La auditoría no tocó código — solo consumió los endpoints existentes y comparó sus respuestas contra lo que el informe afirmaba. Este PRD convierte esos hallazgos en trabajo de ingeniería verificable sobre los conectores y APIs reales.

## 1. Decisión de producto

La auditoría encontró que varios conectores tienen fallas que **no son visibles en un uso normal** (una consulta simple "funciona"), pero producen cifras incorrectas o sesgadas cuando alguien pagina, agrega o filtra de una forma que el autor original no anticipó. Ejemplos confirmados con evidencia HTTP real:

1. **Un LIMIT fijo sin paginación real** en `radar-ejecucion` (`/api/execution`) devuelve 1,000 de 2,594 filas reales para La Libertad, sesgado sistemáticamente contra los gobiernos locales de menor gasto — cualquier consumidor que confíe en ese endpoint sin saberlo obtiene un universo incompleto y sesgado, no solo "una muestra".
2. **Datasets panel multi-año sumados sin filtro por defecto** en `residuos-solidos` (SIGERSOL, 6 años) e `infraestructura-mtc` (aeródromos/terminales/peajes, 4 cortes) — una consulta sin filtro de año/corte mezcla períodos y puede inflar una cifra ~5-6x (confirmado en residuos) o mezclar activos ya dados de baja con vigentes (confirmado en terminales portuarios).
3. **Un cruce que alimenta el score institucional compuesto devuelve vacío en la base viva** (`GET /api/crossref/ejecucion` de infobras) pese a que la documentación interna del proyecto lo describe como funcional con decenas de coincidencias — bloqueando 3 de 5 componentes del score para el 100% de las entidades del país, no solo de La Libertad.
4. **Parámetros que la API acepta pero ignora silenciosamente** (`groupBy` en `/api/public-works/resumen` de infobras) — no hay error, no hay advertencia, el consumidor cree que filtró y no filtró nada.
5. **Campos que existen en la base de datos pero el endpoint no expone** (`area_censo` en instituciones-educativas) — el dato podría estar disponible y no lo está, sin que el esquema de respuesta lo indique.

Este PRD no autoriza nuevas fuentes de datos ni cambia el modelo canónico de ninguna app — corrige comportamiento incorrecto o engañoso de conectores/APIs que ya existen, y cierra las brechas de exposición de datos que ya se ingieren pero no se sirven.

## 2. Problema y oportunidad

Cada uno de los 5 patrones de arriba comparte una causa raíz común: **el endpoint nunca fue probado bajo el patrón de consumo que un análisis territorial real necesita** (paginar el universo completo, filtrar por el corte más reciente, agregar por categoría, o confiar en que un parámetro documentado realmente filtra). Corregirlos:

- Evita que cualquier futuro análisis (interno o de un consumidor de la API/MCP) repita los mismos 6 errores que este informe encontró y tuvo que reconciliar manualmente.
- Recupera cobertura real que ya existe en la base de datos pero está oculta u oscurecida (33.9% del PIM departamental que hoy queda "sin provincia identificable" por una heurística de texto pobre, cuando existe una forma de atribuirlo con precisión).
- Reduce el trabajo manual de reconciliación: hoy, verificar que una cifra de INFOBRAS o de ejecución de gasto es correcta exige descargar miles de filas y agregar con un script ad-hoc cada vez — debería ser un endpoint.

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Corregir los 5 bugs/gaps de comportamiento confirmados con evidencia HTTP, exponer las categorías de agregación que ya existen en los datos crudos pero no en las respuestas de la API, y dejar un mecanismo (documentación de contrato + chequeo) que evite que el mismo tipo de error (LIMIT oculto, panel sin filtro, parámetro ignorado) se repita en otro conector sin que nadie lo note.

### No objetivos

- No agregar fuentes de datos nuevas (autoridades subnacionales electas, capas adicionales de CEPLAN Geo) — esas quedan como evaluación (DQ-12, DQ-13), no como implementación obligatoria de este PRD.
- No rediseñar el modelo canónico de ninguna app más allá de lo necesario para exponer un campo o una categoría que ya existe.
- No cambiar las conclusiones que cualquier página o reporte ya publicado presenta sobre una entidad — solo corrige la fuente de datos subyacente.
- No decidir unilateralmente si vale la pena invertir en CEPLAN Geo o en una fuente de autoridades subnacionales — este PRD exige que esa decisión quede en una evaluación documentada (ADR o equivalente), no implícita.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Paginación real en ejecución de gasto | `GET /api/execution` de `radar-ejecucion` soporta `limit`/`offset`/`hasMore` reales; una consulta sin filtro para La Libertad recupera las 2,594 filas confirmadas, no 1,000. |
| Atribución territorial sin heurística ad-hoc | `radar-ejecucion` expone provincia (derivada de un crosswalk distrito→provincia servidor-side) para el gasto con sede en La Libertad, bajando el "sin provincia identificable" de 33.9% (calculado manualmente en esta auditoría) a lo que el crosswalk real permita, de forma reproducible sin script externo. |
| Filtro de corte por defecto | `infraestructura-mtc` y `residuos-solidos` devuelven, por defecto (sin parámetro adicional), solo el corte/año más reciente; el comportamiento multi-corte queda disponible solo si se pide explícitamente. |
| Crossref de score restaurado o su ausencia documentada | `GET /api/crossref/ejecucion` de infobras deja de devolver vacío para todo el país, **o** existe un ADR que documenta por qué se acepta el score parcial (máximo 2/5 componentes) de forma indefinida. |
| Parámetros sin efecto fantasma | Ningún endpoint de este alcance acepta un parámetro de query documentado (`groupBy` u otro) sin que tenga efecto real o sin devolver un error 400 explícito. |
| Categorías ya ingeridas, expuestas | Los campos/categorías confirmados como existentes pero no expuestos (`area_censo` en instituciones-educativas; agregaciones por sector/nivel/naturaleza/causal en INFOBRAS; por función/genérica en radar-ejecucion) están disponibles vía API sin requerir descargar el dataset completo y agregar client-side. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Cualquier análisis territorial futuro (interno o vía MCP/API pública) | Confiar en que una consulta simple a un endpoint de este alcance no está silenciosamente truncada, desactualizada por mezclar cortes, o ignorando un filtro pedido. | Los 5 bugs confirmados quedan corregidos o, si se decide no corregir alguno, la decisión y el riesgo aceptado quedan documentados explícitamente. |
| Equipo de datos / mantenedor de conectores | Agregar una categoría (sector, causal, función) sin tener que paginar y sumar client-side cada vez que alguien lo necesita. | Endpoints de agregación disponibles para las categorías confirmadas en esta auditoría. |
| Score institucional compuesto | Que sus 5 componentes reflejen disponibilidad real de dato, no un cruce roto en la base viva que nadie notó. | Causa raíz de `obrasNoParalizadas` vacío investigada y resuelta o formalmente aceptada como limitación documentada. |
| Futuro auditor de datos (repetir este ejercicio en otro departamento) | No repetir el mismo trabajo manual de reconciliación que tomó 4 rondas de auditoría en esta sesión. | `docs/data-contracts` documenta explícitamente qué fuentes son panel multi-año y requieren filtro, y qué endpoints tienen límites de paginación conocidos. |

## 5. Alcance funcional: trece issues

Ver detalle completo de cada issue (historia, contexto verificado, criterios de aceptación) en [`docs/TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md`](TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md). Resumen:

### Épica 1 — Bugs críticos de ingesta/API (P0)
- **DQ-01** — Paginación real en `radar-ejecucion` `/api/execution` (elimina el LIMIT 1000 fijo).
- **DQ-02** — Atribución territorial server-side en `radar-ejecucion` vía crosswalk distrito→provincia (reemplaza la heurística de texto libre).
- **DQ-03** — Filtro de corte vigente por defecto en `infraestructura-mtc`.
- **DQ-04** — Filtro de año vigente por defecto en `residuos-solidos`.
- **DQ-05** — Investigar y resolver (o documentar formalmente) el crossref infobras↔ejecución vacío que bloquea el score institucional.

### Épica 2 — Endpoints de agregación y exposición de campos existentes (P1)
- **DQ-06** — Endpoint de agregación por categoría en INFOBRAS + arreglar `groupBy` ignorado en `/resumen`.
- **DQ-07** — Exponer `area_censo` (urbano/rural) en `instituciones-educativas`.
- **DQ-08** — Endpoint de agregación funcional/por genérica de gasto en `radar-ejecucion`.

### Épica 3 — Prevención de recurrencia (P1)
- **DQ-09** — Documentar en `docs/data-contracts` qué fuentes son panel multi-año y requieren filtro explícito.
- **DQ-10** — Chequeo/smoke test genérico: el total de un endpoint de resumen debe coincidir con la suma de filas paginadas.

### Épica 4 — Decisiones de alcance pendientes (P2, evaluación no implementación obligatoria)
- **DQ-11** — ADR sobre aceptar el score institucional parcial (máx. 2/5) de forma indefinida, o priorizar DQ-05.
- **DQ-12** — Evaluar inversión en CEPLAN Geo (capas de infraestructura vacías a nivel nacional; denominador poblacional solo en Trujillo).
- **DQ-13** — Evaluar fuente adicional para autoridades subnacionales electas (alcaldes/regidores) — JNE actual solo cubre Congreso.

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora (Sprint 1)** | DQ-01, DQ-02, DQ-03, DQ-04, DQ-05 | Cierra los 5 bugs de comportamiento confirmados con evidencia HTTP; cualquier consumo futuro de estas 4 apps deja de estar silenciosamente sesgado, truncado o mezclando cortes. |
| **Siguiente (Sprint 2)** | DQ-06, DQ-07, DQ-08, DQ-09, DQ-10 | Expone las categorías ya ingeridas sin requerir reconciliación manual, y deja un mecanismo para detectar el próximo LIMIT oculto o panel sin filtrar antes de que otro análisis lo sufra. |
| **Después (Sprint 3)** | DQ-11, DQ-12, DQ-13 | Decisiones explícitas y documentadas sobre gaps de cobertura que no tienen una solución de una sola línea — no se implementan salvo que la evaluación lo justifique. |

## 7. Requisitos no funcionales

- **Trazabilidad:** todo endpoint que hoy paginaba de forma incompleta o mezclaba cortes debe, tras el fix, permitir verificar que el total reportado coincide con la suma de filas reales (mismo estándar que exigió esta auditoría manualmente).
- **Compatibilidad:** ningún fix de este PRD puede romper el contrato de respuesta de un endpoint ya consumido por `rastro-web` o por el servidor MCP sin verificarlo primero — los campos nuevos (ej. `provincia` derivada en DQ-02) son aditivos.
- **No regresión de honestidad de datos:** un dato sin match o sin atribución territorial se marca explícitamente como tal (`provincia: null` o equivalente) — nunca se rellena con un valor supuesto para "completar" la tabla.
- **Documentación como entregable:** cada ticket que cambia el comportamiento de un endpoint actualiza `docs/conectores.md` y/o `docs/data-contracts` en el mismo PR, no como tarea separada.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| DQ-01/DQ-02 cambian el volumen y la forma de `/api/execution` y rompen un consumidor que asumía max. 1,000 filas | Verificar consumidores (rastro-web, MCP) antes de mergear; el campo de provincia es aditivo, el aumento de filas es el comportamiento correcto y debe comunicarse como fix, no como breaking change silencioso. |
| DQ-03/DQ-04 cambian resultados por defecto (menos filas al filtrar por corte vigente) y rompen a un consumidor que sumaba todo el histórico a propósito | Mantener el comportamiento histórico disponible detrás de un parámetro explícito (`incluirHistorico=true` o similar), nunca eliminarlo. |
| DQ-05 concluye que el crossref requiere trabajo mayor al estimado | Separar explícitamente investigación de causa raíz (este ticket) de la implementación del fix, que puede ser un ticket de seguimiento si el esfuerzo excede M — igual que se hizo en el PRD de Confiabilidad de Conectores para el caso de `mef-connector.ts`. |
| DQ-12/DQ-13 se malinterpretan como compromiso de implementación | El PRD es explícito: son evaluaciones (P2), no implementación obligatoria — el ticket se cierra como "evaluado, diferido" si la evaluación no lo justifica, siguiendo el mismo patrón ya usado en `docs/BACKLOG_Confiabilidad_Conectores_y_Cruces_v1.md` (CX-04). |

## 9. Fuera de este PRD

- Nuevas fuentes de datos (autoridades subnacionales electas, capas adicionales de CEPLAN Geo) — solo evaluación en DQ-12/DQ-13.
- Cambios en `apps/rastro-web` — si algún fix de este PRD requiere ajuste de frontend, queda como ticket de seguimiento fuera de este backlog.
- Corrección del informe territorial ad-hoc que originó esta auditoría — ese documento ya fue corregido manualmente durante la propia sesión de auditoría; este PRD corrige la causa raíz en el código para que el próximo análisis no tenga que repetir el mismo trabajo manual.

## 10. Definition of Done

Aplicando la regla de validación adoptada para este proyecto: ningún ticket de este PRD se declara "terminado" solo porque el código "se ve bien". Se considera terminado cuando, además de los criterios de aceptación propios de cada ticket:

- Tiene PR, revisión y pruebas automatizadas asociadas (no manuales).
- El sistema/endpoint afectado levanta correctamente en local después del cambio (`npm run dev` de la app correspondiente sin errores).
- Los tests de la app afectada pasan en verde — no solo los del archivo tocado, la suite completa de esa app (mismo estándar que ya usa `docs/TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md`).
- `docs/conectores.md` y/o `docs/data-contracts` reflejan el estado real después de cada PR mergeado de este PRD, en el mismo PR.
- Si el ticket es una evaluación (DQ-11, DQ-12, DQ-13), el entregable es un documento de decisión explícito (ADR o equivalente) — no se cierra el ticket con la decisión implícita en una conversación o comentario de código.
- Ningún fix de este PRD introduce un nuevo LIMIT fijo, panel sin filtro por defecto, o parámetro sin efecto — el propio patrón de bug que este PRD corrige no se reintroduce en el mismo cambio.
