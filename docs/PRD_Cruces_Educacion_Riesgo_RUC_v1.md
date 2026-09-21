# PRD — Cruces sobre educación 2026 y perfil de riesgo por RUC

**Estado:** Propuesto — ningún ticket iniciado.
**Fecha:** 2026-09-21
**Ámbito:** `apps/violencia-escolar/api`, `apps/instituciones-educativas/api`, `apps/proveedores-sancionados/api`, `apps/identidad-fiscal/api`, `mcp-server/src/catalog.ts`, `docs/conectores.md`, `docs/data-contracts/`
**Horizonte:** cuatro tickets de cruce, ninguno depende de ingesta nueva — todos consumen datos ya verificados en vivo esta misma sesión.
**Origen:** investigación de endpoints MINEDU (2026-09-21, ver `docs/data-contracts/minedu-siagie-trayectoria.md` y `docs/data-contracts/minedu-siseve-casos.md`) y análisis ad-hoc de riesgo EUDR sobre 597 RUC de cooperativas cafetaleras/cacaoteras (mismo día, `identidad-fiscal` × `infracciones-ambientales` × `proveedores-sancionados`).

## 1. Decisión de producto

Esta sesión construyó dos fuentes nuevas de MINEDU (`instituciones_educativas_trayectoria` sobre SIAGIE, `violencia_escolar_casos`/`_resumen` sobre SíseVe) y validó a mano, contra un seed de 597 RUC, que cruzar `identidad_fiscal.ruc_exportaciones_fob` × `infracciones_ambientales` × `proveedores_sancionados.inhabilitaciones{,_judiciales}` produce señal real y accionable (3 RUC con sanción ambiental, 1 con inhabilitación, 64 con exportaciones — de los cuales 2 tienen ambas cosas a la vez).

Ninguna de las dos fuentes MINEDU tiene todavía un cruce real en el catálogo — nacieron sin `GET /api/crossref`. El análisis EUDR tampoco quedó productizado — vive como script ad-hoc (`cruces_eudr.py`) fuera del monorepo, en `C:\Users\acuba\eudrperu\ficharucsunat\`, solo reutilizable manualmente.

Este PRD cierra ambos círculos: da a `violencia-escolar` y `instituciones-educativas` los cruces que su propia documentación ya anticipa como candidato natural, y convierte el análisis de riesgo por RUC en un endpoint real de Rastro, reutilizable para cualquier RUC del catálogo (no solo el seed cafetalero).

## 2. Problema y oportunidad

1. **SIAGIE trayectoria y violencia escolar existen aisladas una de otra**, pese a compartir UGEL como unidad territorial y haber nacido en la misma sesión — no hay forma hoy de preguntar "¿las UGEL con más violencia reportada tienen también más atraso/deserción escolar?".
2. **Ninguna de las dos se cruza contra ejecución presupuestal educativa** (`radar-ejecucion`, `FUNCION = EDUCACIÓN`) — el patrón que ya usan `servicios-salud`/`programas-sociales` contra `radar-inversiones` nunca se aplicó a Educación.
3. **El perfil de riesgo por RUC (exportaciones × sanción ambiental × inhabilitación) es una capacidad real y probada, pero no es un producto** — vive en un script Python fuera del repo, solo corre contra un seed fijo de 597 RUC, sin API, sin registro MCP, sin tests.

Resolver esto entrega la primera vista cruzada de "violencia ↔ trayectoria educativa" del catálogo, cierra el círculo presupuesto↔servicio para Educación (igual que ya existe para Salud/Social), y convierte un análisis manual de una tarde en una capacidad permanente de Rastro.

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Cuatro cruces nuevos, cada uno con su propio endpoint `GET /api/crossref*`, registrados en el catálogo MCP y documentados con el mismo rigor (verificación en vivo, hallazgos de calidad de datos declarados) que el resto del monorepo.

### No objetivos

- No se construye ningún conector de ingesta nuevo — este PRD es 100% capa de cruce sobre datos ya ingeridos.
- No se migra `cruces_eudr.py` tal cual a TypeScript — VI-02 diseña el endpoint desde cero siguiendo el patrón de `proveedores_sancionados_doble_inhabilitacion`, no traduce el script.
- No se resuelve la ambigüedad "menos violencia reportada = menos violencia real, o menos acceso a reportar" con datos nuevos — EDU-02 debe declarar la ambigüedad en la respuesta, no intentar resolverla con una fuente que Rastro no tiene.
- No se construyen vistas nuevas en `rastro.fyi`/`rastro-web` — backend + MCP + documentación únicamente.
- No se implementa scheduler — cada cruce corre on-demand vía el propio endpoint (no es ingesta, no aplica "manual" vs. "automático" de la misma forma).

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Cruce violencia × trayectoria | `GET /api/crossref` en `violencia-escolar` responde por UGEL con ambos indicadores, verificado en vivo contra La Libertad (15 UGEL). |
| Cruce SIAGIE × presupuesto | `GET /api/crossref` en `instituciones-educativas` sigue el mismo contrato de respuesta que `servicios_salud_crossref`/`programas_sociales_crossref` (declara cobertura territorial real de `investments`, no asume nacional). |
| Cruce violencia × presupuesto | Responde por departamento, con la ambigüedad de "menor reporte ≠ menor violencia" declarada explícitamente en la respuesta (campo `nota` o equivalente), no solo en la documentación. |
| Perfil de riesgo por RUC | `GET /api/crossref/riesgo-exportador?ruc=` en `identidad-fiscal` (o el pool cruzado que corresponda) reproduce exactamente los 3+1+64 hallazgos ya verificados a mano para el seed EUDR, para cualquier RUC individual pasado por parámetro. |
| Documentación viva | Los 4 cruces tienen ficha en `docs/conectores.md` (sección "Cruces" de la app correspondiente) y aparecen en el "Mapa de cruces entre apps". `scripts/check-connectors-documented.sh` sigue pasando sin cambios de script. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Periodista / investigador educativo | "¿Las UGEL con más violencia reportada tienen peor trayectoria escolar?" | `GET /api/crossref` de `violencia-escolar` responde por UGEL con casos de violencia por matrícula y atraso/retiro SIAGIE del mismo territorio. |
| Gestor público (MINEDU/DRE) | "¿La ejecución presupuestal en educación se traduce en menos deserción?" | `GET /api/crossref` de `instituciones-educativas` responde por UBIGEO. |
| Analista de riesgo / due diligence (ej. EUDR) | "¿Este RUC tiene sanciones ambientales, inhabilitaciones, o actividad exportadora?" | `GET /api/crossref/riesgo-exportador?ruc=` responde con las 3 señales en un solo request, para cualquier RUC. |
| Agente de IA (MCP) | Comparar violencia, trayectoria y presupuesto educativo por territorio; evaluar riesgo de un proveedor/exportador por RUC. | 4 tools MCP nuevas, mismo patrón `SIN_SCHEDULER` y descripciones honestas sobre cobertura parcial. |

## 5. Alcance funcional

### Épica A — Cruces sobre educación (MINEDU)

#### EDU-01 — Crossref `violencia-escolar` × `instituciones_educativas_trayectoria`, por UGEL

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ninguna (ambas fuentes ya ingeridas)

`GET /api/crossref` en `violencia-escolar`: agrega `violencia_escolar_casos` del snapshot más reciente (`MAX(id)` de `raw_siseve_batches`, mismo criterio que `GET /api/casos`) por UGEL (conteo total y por `tipo_violencia`), y lo cruza contra `siagie_trayectoria` agregado a UGEL — vía pool cruzado a la base de `instituciones-educativas` (`INSTITUCIONES_EDUCATIVAS_DATABASE_URL`, mismo patrón `servicios-salud/db/inversiones-pool.ts`), uniendo `siagie_trayectoria.cod_mod`→`instituciones_educativas.cod_mod` para obtener `ugel`, luego agregando por ese `ugel`.

**Gotcha real, confirmado en vivo 2026-09-21**: los nombres de UGEL difieren en mayúsculas/tildes entre ambas fuentes (`"UGEL CHEPÉN"` en el padrón vs. `"UGEL Chepén"` en SíseVe) — normalizar con `UPPER(unaccent(...))` o equivalente antes de unir, **no** asumir coincidencia exacta case-sensitive. Verificar en vivo que la normalización no genera colisiones falsas (dos UGEL distintas que normalizan igual) antes de dar el join por bueno.

**Criterios de aceptación**

- El join usa el `ugel` del padrón (`instituciones_educativas.ugel`), no un crosswalk nuevo ni matcher difuso más allá de la normalización de mayúsculas/tildes.
- La respuesta expone, por UGEL: total de casos de violencia (y desglose por tipo), matrícula total SIAGIE, tasa de atraso/retiro agregada, y una tasa de violencia normalizada por matrícula (no solo el conteo crudo, que favorecería a las UGEL más grandes).
- UGEL presentes en una fuente pero no en la otra aparecen con el campo faltante en `null`, nunca en `0` — mismo principio de honestidad de datos que `identidad-fiscal/crossref.ts`.
- Tests: UGEL con match en ambas fuentes, UGEL solo en violencia, UGEL solo en trayectoria, normalización de tildes/mayúsculas verificada con un caso real (`"UGEL Chepén"`/`"UGEL CHEPÉN"`).
- Verificado en vivo contra La Libertad (15 UGEL) antes de mergear.

#### EDU-02 — Crossref `instituciones-educativas` (SIAGIE trayectoria) × `radar-ejecucion`

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** ninguna

`GET /api/crossref` en `instituciones-educativas`: agrega `siagie_trayectoria` por UBIGEO (vía el padrón, `cod_mod`→`ubigeo`) y lo cruza contra `budget_execution` de `radar-ejecucion` (pool cruzado, `EJECUCION_DATABASE_URL`) filtrado por el valor real de `FUNCION = 'EDUCACIÓN'` — **confirmar el valor exacto con una consulta `DISTINCT` documentada en el PR antes de fijarlo en código**, mismo criterio ya exigido en `PRD_Servicios_Salud_Programas_Sociales_v1.md` para `actividad-agraria`/`seguridad-ciudadana`.

**Criterios de aceptación**

- Consulta `SELECT DISTINCT funcion FROM budget_execution` (o equivalente) documentada en el PR, confirmando el valor usado para filtrar.
- La respuesta declara el alcance territorial real de `budget_execution` en el momento de la consulta (no un valor fijo en código).
- Ningún distrito sin match en `budget_execution` se presenta como si tuviera ejecución cero — se distingue "sin dato ingerido" de "ejecución cero real".
- Tests equivalentes a SS-02/PS-03 de `PRD_Servicios_Salud_Programas_Sociales_v1.md` (distrito con ambos datos, con solo uno, con ninguno).

#### EDU-03 — Crossref `violencia-escolar` × `radar-ejecucion`, por departamento

**Prioridad:** P2 · **Esfuerzo:** S · **Dependencias:** ninguna

`GET /api/resumen` extendido (o un nuevo `GET /api/crossref`) en `violencia-escolar`: agrega casos por DRE/departamento y lo cruza contra ejecución presupuestal educativa departamental de `radar-ejecucion`.

**Advertencia que debe quedar explícita en la respuesta, no solo en la documentación**: una correlación entre baja ejecución presupuestal y bajo reporte de violencia puede reflejar menor acceso al sistema de reporte SíseVe, no menos violencia real (mismo principio ya aplicado al hallazgo de Lima Metropolitana concentrando el mayor volumen de casos — reflejaba densidad poblacional y acceso, no necesariamente más violencia per cápita). La respuesta debe incluir un campo de advertencia textual sobre esta ambigüedad, no dejarlo implícito.

**Criterios de aceptación**

- La respuesta incluye explícitamente la advertencia de causalidad/acceso descrita arriba (no solo en `docs/conectores.md`).
- Mismo criterio de verificación en vivo del valor de `FUNCION` que EDU-02.
- Tests: departamento con alta ejecución y alta violencia, alta ejecución y baja violencia, y los cruces inversos — sin asumir una dirección de causalidad en ningún assert.

### Épica B — Perfil de riesgo por RUC (productizar EUDR ad-hoc)

#### VI-01 — Diseño del endpoint `riesgo-exportador`

**Prioridad:** P0 · **Esfuerzo:** S (diseño) · **Dependencias:** ninguna

Decidir en qué app vive el endpoint (candidato natural: `identidad-fiscal`, que ya es el hub de identidad por RUC — `identidad_fiscal_crossref_proveedores`/`_entidades` ya cruzan RUC contra otras apps) y el contrato exacto de respuesta: qué campos trae de `ruc_exportaciones_fob` (identidad-fiscal), `infracciones_ambientales` (infracciones-ambientales) e `inhabilitaciones`/`inhabilitaciones_judiciales` (proveedores-sancionados), y cómo se resume en un único indicador o si se deja desagregado por fuente sin agregar en un score.

**Decisión explícita a tomar y documentar, no asumir**: si se agrega un score/semáforo de riesgo, o si el endpoint solo expone los hechos crudos de las 3 fuentes y deja la interpretación al consumidor — dado el patrón de honestidad de datos del proyecto, la opción por defecto debería ser exponer los hechos, no inventar una ponderación de riesgo sin metodología validada.

**Criterios de aceptación**

- Documento corto de diseño (puede ser la sección 5 de este PRD ampliada, o un ADR) que fija: app dueña del endpoint, forma de la respuesta, y la decisión sobre score vs. hechos crudos.
- El diseño reproduce exactamente los 3 cruces ya verificados a mano (exportaciones FOB, infracciones ambientales, inhabilitaciones administrativas + judiciales) — no agrega una cuarta fuente sin verificarla en vivo primero.

#### VI-02 — Implementación del endpoint

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** VI-01

`GET /api/crossref/riesgo-exportador?ruc=` (o la ruta que fije VI-01): recibe un RUC, consulta en paralelo (`Promise.all`, mismo patrón que otros crossref del catálogo) `ruc_exportaciones_fob` (pool propio de `identidad-fiscal`), `infracciones_ambientales` (pool cruzado, `INFRACCIONES_AMBIENTALES_DATABASE_URL`) e `inhabilitaciones`/`inhabilitaciones_judiciales` (pool cruzado, `PROVEEDORES_SANCIONADOS_DATABASE_URL`), y devuelve las 3 secciones en una sola respuesta.

**Criterios de aceptación**

- Un RUC sin match en ninguna de las 3 fuentes responde `200` con las 3 secciones vacías (`[]`), no `404` — la ausencia de sanción/exportación es información válida, no un error.
- Reproduce exactamente los resultados ya verificados a mano para al menos 3 RUC del seed EUDR (20140181405 con infracción + exportación, 20119208026 con inhabilitación, un RUC limpio con solo exportación) — usados como fixtures de test.
- Tests: RUC con las 3 señales, RUC con ninguna, RUC con solo una.
- No se valida el formato de RUC más allá de lo que ya validan los otros endpoints de `identidad-fiscal` (11 dígitos) — reutilizar el schema Zod existente si hay uno, no duplicar la regex.

#### VI-03 — Registro MCP y documentación

**Prioridad:** P1 · **Esfuerzo:** S · **Dependencias:** VI-02

Registrar `identidad_fiscal_riesgo_exportador` (o el nombre que corresponda a la app elegida en VI-01) en `mcp-server/src/catalog.ts`. Ficha en `docs/conectores.md` (sección "Cruces" de la app dueña) citando el hallazgo real del seed EUDR como ejemplo verificado (LA FLORIDA con infracción ambiental Y exportaciones).

**Criterios de aceptación**

- Tool MCP sigue el patrón `SIN_SCHEDULER` + descripción honesta sobre qué 3 fuentes cruza y con qué granularidad (RUC exacto, no razón social).
- `scripts/check-connectors-documented.sh` pasa sin cambios de script.

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora** | EDU-01, VI-01 | El cruce de mayor valor (violencia × trayectoria) y el diseño del perfil de riesgo, en paralelo — no dependen entre sí. |
| **Siguiente** | VI-02, EDU-02 | Perfil de riesgo funcional; cierre del círculo presupuesto↔servicio para Educación. |
| **Después** | VI-03, EDU-03 | Capa de lectura para agentes de IA; cruce de menor prioridad (violencia × presupuesto, con la advertencia de causalidad ya resuelta en diseño). |

## 7. Requisitos no funcionales

- **Normalización explícita, no asumida**: cualquier join por texto (nombres de UGEL) debe normalizar mayúsculas/tildes explícitamente en el SQL, con un comentario que documente el hallazgo real (`"UGEL Chepén"` vs. `"UGEL CHEPÉN"`), no confiar en que las fuentes ya vienen consistentes.
- **Ausencia de dato ≠ cero**: en los 4 cruces, un territorio o RUC sin match en una fuente se representa con `null` o arrays vacíos, nunca con `0` que podría leerse como "confirmado sin incidencia".
- **Ambigüedad declarada en la respuesta, no solo en la documentación**: EDU-03 en particular debe incluir la advertencia de causalidad/acceso como campo de la respuesta JSON, siguiendo el precedente ya sentado por `coberturaInversion`/`nota` en otros crossref del catálogo.
- **Verificación en vivo obligatoria antes de fijar valores de filtro**: `FUNCION = 'EDUCACIÓN'` (EDU-02, EDU-03) se confirma con `SELECT DISTINCT` real, documentado en el PR, no se asume por analogía con `'AGROPECUARIA'`/`'ORDEN PUBLICO Y SEGURIDAD'`.
- **Sin scheduler** — igual que el resto del catálogo.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| La normalización de UGEL (EDU-01) genera colisiones falsas entre UGEL homónimas de distintos departamentos | Normalizar y unir siempre dentro del mismo departamento/DRE, no solo por nombre de UGEL — verificar en vivo que no hay dos UGEL con el mismo nombre normalizado en el mismo departamento antes de dar el cruce por bueno. |
| El valor real de `FUNCION` en `budget_execution` para Educación está fragmentado en más de una categoría | EDU-02/EDU-03 exigen la consulta `DISTINCT` documentada — si hay más de un valor relevante, el cruce cubre todos, no solo el primero. |
| VI-02 se convierte en un endpoint "genérico de riesgo" mal definido si VI-01 no fija un contrato claro | VI-01 es un ticket de diseño explícito, con criterio de aceptación propio, antes de tocar código. |
| El score de riesgo (si VI-01 decide incluirlo) se usa para tomar decisiones reales sin metodología validada | Por defecto, exponer hechos crudos de las 3 fuentes sin agregarlos en un score — ver decisión explícita de VI-01. |

## 9. Fuera de este PRD

- Cualquier ingesta nueva (este PRD es 100% capa de cruce).
- Migración literal de `cruces_eudr.py` — VI-02 diseña el endpoint desde cero.
- Resolver la ambigüedad de causalidad de EDU-03 con una fuente de datos nueva.
- Cambios en `apps/rastro-web` o `rastro.fyi`.
- Scheduler/automatización.
- El backlog pre-MINEDU (residuos sólidos × SANEAMIENTO × RENAMU, infraestructura MTC, AIRHSP, bienes muebles dados de baja, red vial subnacional × TRANSPORTE) — sigue vivo, sin tocar por este PRD, ver `docs/BACKLOG_Cruces_Educacion_Riesgo_RUC_v1.md` para su registro de continuidad.

## 10. Definition of Done

- EDU-01 y VI-02 (los dos P0 reales) mergeados con PR, revisión, y pruebas automatizadas.
- Los 4 cruces aparecen en `docs/conectores.md` (sección "Cruces" de su app) y en el "Mapa de cruces entre apps".
- Ningún territorio o RUC sin match aparece como si tuviera cero incidencia confirmada.
- EDU-03 (si se implementa) incluye la advertencia de causalidad/acceso como campo de la respuesta, no solo en prosa.
- VI-01 deja registrada la decisión sobre score vs. hechos crudos antes de que VI-02 empiece.
