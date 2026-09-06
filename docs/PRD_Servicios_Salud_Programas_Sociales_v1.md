# PRD — Servicios Públicos de Salud y Programas Sociales (RENIPRESS + INFOMIDIS)

**Estado:** En ejecución — SS-01, SS-02, PS-01, PS-03, PN-01 y PN-02 implementados y verificados
contra fuentes reales y Postgres real el 2026-09-05 (ver `docs/conectores.md`). Pendientes: PS-02
(evaluación JUNTOS bimestral) y cualquier trabajo de frontend/rastro-web, fuera de este PRD.
**Fecha:** 2026-09-05
**Ámbito:** dos apps nuevas (`servicios-salud`, `programas-sociales`), `mcp-server/src/catalog.ts`, `docs/conectores.md`, `docs/data-contracts/`
**Horizonte:** dos sprints cortos; sin fecha comprometida ni owner asignado
**Origen:** [`docs/adr/0018-research-spike-pnda-educacion-salud-social.md`](adr/0018-research-spike-pnda-educacion-salud-social.md) y su addendum de verificación en vivo (2026-09-05). Reemplaza el alcance de Salud y Social de `docs/PRD_EXPANSION_PNDA.md` y `docs/BACKLOG_EXPANSION_PNDA.md`, que permanecen como borrador descartado para esas dos secciones.

## 1. Decisión de producto

El spike de ADR-0018 verificó en vivo (no por snippets de búsqueda) que **Salud** y **Desarrollo Social** tienen fuente descargable, con URL resoluble y columnas confirmadas hoy mismo. Educación no la tiene todavía (la fuente que el PRD original asumía está caída, y la fuente real que sí existe — ESCALE — no se pudo terminar de verificar por falta de acceso a navegador) — queda fuera de este PRD, ver ADR-0018 addendum.

Este PRD construye el cierre parcial del círculo **Presupuesto → Obra → Servicio** para Salud y Social: cruza inversión pública (`investments.ubigeo`, ya ingerida por `radar-inversiones`) contra el estado real de establecimientos de salud (RENIPRESS) y cobertura de programas sociales (INFOMIDIS), ambos a nivel de distrito (UBIGEO), que es el mismo nivel de agregación que ya usan `actividad-agraria` y `seguridad-ciudadana` contra `budget_execution`.

**Decisión explícita que revierte el backlog original**: no se construye un `PndaConnector` genérico en `packages/`. Con dos datasets confirmados (uno por app), un conector genérico sería abstracción prematura sin un tercer caso que la justifique — cada conector resuelve el recurso más reciente de su propio dataset con `package_show`, siguiendo el mismo patrón por-fuente que ya usan los 21 conectores existentes del monorepo (ver `docs/conectores.md`). Si un tercer dataset de PNDA entra al alcance más adelante, ahí sí se evalúa extraer el helper "resolver último recurso por `package_show`" a un paquete compartido — no antes.

## 2. Problema y oportunidad

1. **No hay forma de saber si un puesto de salud "financiado" está operativo.** `radar-inversiones` sabe cuánto se invirtió y dónde (`investments.ubigeo`), pero nada en el monorepo cruza eso contra si el establecimiento de salud de ese distrito está activo, según el propio registro de SUSALUD.
2. **La misma brecha existe para programas sociales.** No hay visibilidad de si una zona con alta inversión en servicios básicos tiene, a la vez, buena cobertura de programas MIDIS (JUNTOS, QALI WARMA, PENSIÓN 65, CUNAMÁS, FONCODES, PAIS/Tambos).
3. **El PRD original tenía dos supuestos que no sobrevivieron a la verificación en vivo** y que este PRD corrige explícitamente:
   - Asumía `minsa-ipress` como fuente de IPRESS — ese recurso es de 2017 y está desactualizado; la fuente viva es otro dataset (`registro-nacional-de-entidades-prestadoras-de-servicios-de-salud-renipress`, CSV mensual hasta agosto 2026).
   - Asumía que Pensión 65 forzaba una decisión de producto sobre manejo de PII (por publicarse a nivel de usuario individual) — MIDIS ya publica un dataset agregado por distrito (INFOMIDIS) que incluye un conteo de usuarios de Pensión 65 sin exponer registros individuales, así que esa decisión ya no es necesaria: se usa el agregado oficial, punto.

Resolver esto entrega la primera vista de "inversión vs. servicio real" del proyecto para dos sectores con fuente confirmada, sin comprometer alcance sobre Educación hasta que esa fuente se verifique aparte.

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Ingerir RENIPRESS (Salud) e INFOMIDIS (Social) a nivel nacional, exponerlos por distrito, y cruzarlos contra `investments` de `radar-inversiones` por UBIGEO exacto — sin matcher difuso, sin tabla de crosswalk nueva, reutilizando la clave que ya existe en ambos lados.

### No objetivos

- No incluye Educación (fuente sin verificar completamente — ver ADR-0018 addendum; queda como spike de seguimiento con navegador).
- No construye un conector CKAN genérico (`PndaConnector`) — ver decisión de producto §1.
- No cruza a nivel de "local escolar/IPRESS específico → CUI específico" (lo que el PRD original llamaba "Score de Brecha de Servicio" a nivel de obra). El cruce de este PRD es agregado por distrito (UBIGEO), igual que el patrón ya usado por `actividad-agraria`/`seguridad-ciudadana` contra `budget_execution` — vincular una obra puntual a un establecimiento puntual es un problema de matching geoespacial/nominal distinto y más costoso, fuera de alcance.
- No agrega JUNTOS (XLSX bimestral) como ingesta separada mientras INFOMIDIS ya traiga "JUNTOS - Hogares afiliados/abonados" agregado — ver PS-03 (evaluación, no ingesta obligatoria).
- No construye vistas nuevas en `rastro.fyi`/`rastro-web` — este PRD es backend + MCP + documentación, igual que `PRD_Confiabilidad_Conectores_y_Cruces_v1.md`. Fichas de sector quedan como PRD de seguimiento si se decide después de tener el cruce funcionando.
- No implementa scheduler/cron — cada conector es manual (`npm run ingest:...`), igual que los 21 existentes.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Cobertura de ingesta Salud | `GET /api/ipress` de `servicios-salud` devuelve establecimientos de los 24 departamentos, con `estado` distinguible (ACTIVO vs. otros valores reales del CSV, sin asumir que solo existen esos dos). |
| Cobertura de ingesta Social | `GET /api/cobertura` de `programas-sociales` devuelve ~1,892 distritos (el conteo real confirmado en el spike para el corte de agosto 2024; verificar que se mantiene por corte) con al menos los campos de JUNTOS y Pensión 65. |
| Cruce por UBIGEO funcional | `GET /api/crossref` de ambas apps junta su tabla contra `investments` (vía pool de Postgres directo a la base de `radar-inversiones`, mismo patrón que ya usa `salud-institucional/db/inversiones-pool.ts` con `INVERSIONES_DATABASE_URL`) por `ubigeo` exacto, sin matcher difuso. |
| Documentación viva | `docs/conectores.md` (fichas nuevas) y `docs/data-contracts/` (dos contratos nuevos) reflejan columnas reales confirmadas en este spike, no solo snippets de búsqueda. `scripts/check-connectors-documented.sh` (CX-06) pasa sin cambios. |
| Sin abstracción prematura | No existe un paquete `PndaConnector` en `packages/` al cierre de este PRD — cada conector vive en su app. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Ciudadano / periodista | "¿Hay puestos de salud activos en mi distrito, y coincide con lo que se invirtió ahí?" | `GET /api/crossref` de `servicios-salud` responde por UBIGEO con # IPRESS activos vs. monto invertido en salud en ese distrito. |
| Gestor público | "¿Qué distritos reciben inversión pero tienen baja cobertura de programas sociales?" | `GET /api/crossref` de `programas-sociales` responde por UBIGEO con cobertura MIDIS vs. inversión. |
| Agente de IA (MCP) | Comparar inversión en salud/social de un distrito contra el estado real del servicio. | Tools MCP nuevas siguiendo la convención de `mcp-server/src/catalog.ts` (`SIN_SCHEDULER`, descripciones honestas sobre cobertura parcial). |

## 5. Alcance funcional

### Épica A — Ingesta

#### SS-01 — App `servicios-salud`: schema + conector RENIPRESS

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ninguna

Crear la app (`apps/servicios-salud/api`, mismo esqueleto que `actividad-agraria`: `db/migrations`, `ingest`, `routes`, `lib`). Tabla `ipress` con `cod_ipress` como clave (`UPSERT` por esa columna), columnas confirmadas en vivo: `institucion`, `nombre`, `clasificacion`, `tipo_establecimiento`, `departamento`, `provincia`, `distrito`, `ubigeo`, `direccion`, `categoria`, `estado`, `norte`/`este` (decimal, pese al nombre no son coordenadas UTM), `fecha_ingesta`. Conector `renipress-connector.ts`: resuelve el recurso más reciente vía `package_show` del dataset `registro-nacional-de-entidades-prestadoras-de-servicios-de-salud-renipress` (no hardcodear `RENIPRESS_31-08-2026.csv` — el nombre del archivo cambia cada mes), descarga con `fetchWithTimeout` de `@appsperu/http-client` **con un header `User-Agent` de navegador explícito** (confirmado en el spike: el WAF de `datosabiertos.gob.pe` devuelve HTTP 418 sin ese header), parsea CSV delimitado por `;`, encoding UTF-8 con BOM. Lote crudo en `raw_renipress_batches`.

**Naming explícito**: la app **no se llama `salud`** ni nada que colisione con `apps/salud-institucional`, que ya existe y es un dominio completamente distinto (score de salud institucional/financiera de una entidad pública, no servicios de salud MINSA). Confirmar que `servicios-salud` no colisiona con ningún nombre de app existente antes de crear el directorio.

**Criterios de aceptación**

- El conector resuelve la URL del recurso más reciente en tiempo de ejecución (vía `package_show`), no por URL fija.
- Descarga exitosa confirmada contra el recurso real (el spike ya confirmó 36,004 filas/26,901 `ESTADO=ACTIVO` para agosto 2026; el ticket debe reproducir un conteo similar, no necesariamente idéntico).
- `estado` se guarda tal cual viene en el CSV (no normalizado a un enum binario ACTIVO/INACTIVO sin haber visto todos los valores reales distintos).
- Tests: parseo de una fila real de ejemplo, manejo de BOM, rechazo/registro de filas sin `ubigeo`.
- `docs/data-contracts/renipress-susalud.md` documenta columnas exactas, delimitador, encoding, y el hallazgo de que `minsa-ipress` (el dataset que asumía el PRD original) está descontinuado.

#### PS-01 — App `programas-sociales`: schema + conector INFOMIDIS

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ninguna

Misma estructura de app. Tabla `cobertura_social` con clave `(ubigeo, fecha_corte)`, columnas confirmadas: `ubigeo`, `fecha_corte`, y una columna por programa (`cunamas_cuidado_diurno`, `cunamas_acompanamiento_familias`, `juntos_hogares_afiliados`, `juntos_hogares_abonados`, `foncodes_usuarios_estimados`, `pension65_usuarios`, `qaliwarma_ninos_atendidos`, `qaliwarma_iiee`, `contigo_usuarios`, `pais_tambos`, `pais_atenciones`, `pais_beneficiarios`). Conector `infomidis-connector.ts`: resuelve el recurso más reciente vía `package_show` del dataset `cobertura-de-los-programas-sociales-adscritos-al-midis-ministerio-de-desarrollo-e-inclusión`, descarga con el mismo header de `User-Agent`, parsea CSV `;`, **encoding Latin-1 confirmado** (no UTF-8 — el header trae `Acompa�amiento`/`Ni�os` en UTF-8, se lee correctamente como Latin-1).

**Gotcha confirmado en el spike, crítico para el parser**: los valores numéricos usan `,` como separador de miles dentro de un archivo delimitado por `;` (ej. `"1,804"`, `"5,234"`) — un `parseFloat`/`Number()` ingenuo sobre `"1,804"` da `1`, no `1804`. El parser debe quitar comas de miles antes de convertir a número. Campos vacíos son NULL real (programa sin dato ese mes/distrito), no cero — no rellenar con 0 por defecto (mismo principio de honestidad de datos que ya aplica `identidad-fiscal`).

**Criterios de aceptación**

- El conteo de distritos ingeridos por corte se acerca a 1,892 (el confirmado en el spike para agosto 2024) — un conteo muy menor indica un problema de parseo, no una filtración legítima.
- Un campo vacío en el CSV se guarda como `NULL`, nunca como `0`.
- Un valor con coma de miles se guarda como el número completo (`"1,804"` → `1804`), verificado con un test unitario sobre una fila real de ejemplo.
- `docs/data-contracts/infomidis-cobertura-social.md` documenta columnas, encoding, el gotcha de comas de miles, y por qué Pensión 65 no requiere la decisión de PII que preveía el ADR original (dato ya agregado por MIDIS).

#### PS-02 — Evaluar si conviene ingerir JUNTOS bimestral (XLSX) por separado

**Prioridad:** P2 · **Esfuerzo:** S (evaluación) · **Dependencias:** PS-01

INFOMIDIS ya trae `JUNTOS - Hogares afiliados/abonados` agregado mensualmente. El dataset `resumen-de-hogares-afiliados-y-abonados-por-ubigeo-*-programa-juntos` (bimestral, XLSX, existe 2023→2026) tiene columnas adicionales (miembros objetivo, montos transferidos) que INFOMIDIS no trae. Evaluar si esas columnas extra justifican un segundo conector (con la complejidad añadida de parsear XLSX, no CSV) o si el detalle mensual de INFOMIDIS es suficiente para el caso de uso del PRD.

**Criterios de aceptación**

- Documento corto de evaluación (puede ser una sección de `docs/data-contracts/infomidis-cobertura-social.md`) que compara ambas fuentes campo por campo.
- Si se decide no ingerir JUNTOS por separado, el ticket se cierra como "evaluado, diferido" con la razón documentada.

### Épica B — Cruces (crossref)

#### SS-02 — Crossref `servicios-salud` vs. `investments`

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** SS-01

`GET /api/crossref` en `servicios-salud`: agrega `ipress` por `ubigeo` (conteo total y conteo con `estado = 'ACTIVO'`), cruza contra `investments` de `radar-inversiones` (pool de Postgres directo, `INVERSIONES_DATABASE_URL`, mismo patrón que `salud-institucional/db/inversiones-pool.ts` — no HTTP entre microservicios; esa alternativa la usa el repo puntualmente para el par `ceplan-geo`/`ceplan-estrategico`, no es el patrón por defecto) filtrando por un valor de `funcion`/`sector` relacionado a salud. **No asumir el valor exacto de esa columna sin verificarlo en vivo primero** (mismo patrón exacto que ya usan `actividad-agraria`/`seguridad-ciudadana` con `FUNCION = 'AGROPECUARIA'`/`'ORDEN PUBLICO Y SEGURIDAD'` — confirmado por consulta real, no supuesto). El join es por `ubigeo` exacto; no se construye matcher difuso ni tabla de crosswalk nueva, porque ambos lados ya comparten la misma columna.

**Advertencia de cobertura que debe quedar explícita en la respuesta y en la ficha de `docs/conectores.md`**: `investments` se ingiere hoy con `DEFAULT_TERRITORIAL_SCOPE = ["LA LIBERTAD"]` (confirmado en `apps/radar-inversiones/api/src/ingest/invierte-connector.ts`) — el conector soporta otros departamentos vía el parámetro `departamentos`, pero salvo que alguien ya haya corrido una ingesta adicional, la base real solo tiene La Libertad. Como `ipress`/`cobertura_social` sí se ingieren a nivel nacional (los archivos son pequeños, no hay motivo para acotarlos), el cruce mostrará "sin inversión" en casi todo el país — eso no significa que no exista inversión ahí, significa que Rastro no la ha ingerido todavía. La respuesta de `/api/crossref` debe declarar esto (ej. un campo `coberturaInversion: "LA_LIBERTAD_UNICAMENTE"` o equivalente), no dejar que se lea como cobertura nacional real.

**Criterios de aceptación**

- Consulta previa (`SELECT DISTINCT funcion FROM investments` o equivalente) documentada en el PR que confirma el valor real usado para filtrar salud.
- La respuesta distingue explícitamente distritos con inversión pero sin IPRESS activos (la señal de "punto ciego" que motiva todo este PRD) de distritos sin inversión registrada.
- Ningún distrito sin match se presenta como si tuviera cobertura — mismo principio de honestidad de datos de `identidad-fiscal/crossref.ts`.
- La respuesta declara explícitamente el alcance territorial real de `investments` en el momento de la consulta (no un valor fijo en código — consultar `SELECT DISTINCT departamento FROM investments`, por si ya se amplió más allá de La Libertad).
- Tests: distrito con inversión y sin IPRESS, distrito con IPRESS y sin inversión, distrito con ambos, distrito con ninguno.

#### PS-03 — Crossref `programas-sociales` vs. `investments`

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** PS-01

Mismo patrón que SS-02, pero agregando `cobertura_social` por `ubigeo` (último `fecha_corte` disponible) contra `investments` filtrado por la función de gasto relacionada a protección/desarrollo social (a confirmar en vivo, mismo criterio que SS-02).

**Criterios de aceptación**

- Mismo criterio de verificación en vivo del valor de `funcion` antes de fijarlo en código.
- Mismo criterio de no fabricar cobertura donde no hay match.
- Misma advertencia de cobertura territorial real de `investments` que SS-02.
- Tests equivalentes a SS-02.

### Épica C — Capa de lectura (MCP + documentación)

#### PN-01 — Exponer tools MCP para ambas apps

**Prioridad:** P1 · **Esfuerzo:** S · **Dependencias:** SS-02, PS-03

Agregar a `mcp-server/src/catalog.ts`: `servicios_salud_ipress`, `servicios_salud_crossref`, `programas_sociales_cobertura`, `programas_sociales_crossref` — siguiendo la convención existente (`SIN_SCHEDULER` en la descripción, `querySchema` con Zod, cobertura territorial declarada explícitamente si es parcial).

**Criterios de aceptación**

- Las 4 tools siguen exactamente el patrón de `ToolSpec` ya usado por `radar_ejecucion_*`.
- Las descripciones declaran honestamente que la ingesta es manual y de qué corte es el último dato (mismo principio que ya aplica el resto del catálogo).

#### PN-02 — Documentación viva

**Prioridad:** P0 (no se considera terminado el PRD sin esto) · **Esfuerzo:** S · **Dependencias:** SS-01, PS-01

Fichas nuevas en `docs/conectores.md` para `renipress-connector.ts` e `infomidis-connector.ts`, con el mismo formato que las fichas existentes (Descripción/Qué hace/Cómo lo hace/Frecuencia/Fuente/Cruces). Dos data contracts nuevos en `docs/data-contracts/` (ver SS-01, SS-02). Actualizar `docs/BACKLOG_EXPANSION_PNDA.md` y `docs/PRD_EXPANSION_PNDA.md` con una nota al inicio indicando que su alcance de Salud y Social fue reemplazado por este PRD (no borrarlos — quedan como registro histórico de la propuesta original).

**Criterios de aceptación**

- `scripts/check-connectors-documented.sh` pasa sin cambios de script — solo agregando las fichas.
- Los dos PRD/backlog originales tienen la nota de reemplazo, sin eliminar su contenido.

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora** | SS-01, PS-01 | Ambos datasets ingeridos y consultables de forma independiente. |
| **Siguiente** | SS-02, PS-03 | El cruce que justifica todo el PRD: inversión vs. servicio real, por distrito. |
| **Después** | PN-01, PN-02, PS-02 | Capa de lectura para agentes de IA, documentación al día, y decisión sobre JUNTOS bimestral. |

## 7. Requisitos no funcionales

- **User-Agent obligatorio**: cualquier request a `datosabiertos.gob.pe` desde estos conectores debe usar un header `User-Agent` de navegador — confirmado en el spike que el WAF del portal bloquea el user-agent por defecto de `curl`/Node con HTTP 418.
- **Resolución dinámica de recurso**: ningún conector hardcodea el nombre de archivo del mes/año — siempre resuelve el recurso más reciente vía `package_show` en tiempo de ejecución, porque ambos datasets renombran el archivo cada corte (`RENIPRESS_{dd-mm-aaaa}.csv`, nombres inconsistentes en INFOMIDIS como `OCTUBRE_2024.csv` vs `202409_INFOMIDIS.csv`).
- **Sin normalización prematura de `estado`**: `ipress.estado` guarda el valor real del CSV; no se colapsa a un booleano hasta ver todos los valores distintos que trae la fuente completa.
- **NULL honesto**: un campo vacío en INFOMIDIS es `NULL`, nunca `0` — un distrito sin dato de un programa no es lo mismo que un distrito con cobertura cero.
- **Documentación como entregable**: igual que el PRD de referencia (`PRD_Confiabilidad_Conectores_y_Cruces_v1.md`), cada ticket de ingesta incluye su ficha en `docs/conectores.md` y su data contract como criterio de aceptación, no como tarea separada.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El WAF de `datosabiertos.gob.pe` cambia de comportamiento o bloquea el User-Agent usado | Usar el mismo User-Agent que ya funciona en `tools/ckan-indexer/ckan_indexer.py` (`Rastro-CKAN-Indexer/1.0`) o uno de navegador real; si ambos fallan, escalar como incidente de fuente, no reintentar indefinidamente. |
| El valor real de `funcion`/`sector` en `investments` para salud/social no es tan limpio como `'AGROPECUARIA'` (podría estar fragmentado en varias categorías) | SS-02/PS-03 exigen la consulta `DISTINCT` documentada en el PR antes de fijar el filtro — si hay más de un valor relevante, el cruce debe cubrir todos, no solo el primero que aparezca. |
| INFOMIDIS cambia su esquema de columnas entre cortes (agrega/quita programas) | El conector debe tolerar columnas nuevas sin fallar (ignorar las no mapeadas) y loguear si una columna esperada desaparece, en vez de fallar silenciosamente. |
| Confusión de nombre entre `servicios-salud` (este PRD) y `salud-institucional` (ya existente, dominio distinto) | Ninguna ficha, tool MCP o mención en documentación debe usar "salud" a secas sin el prefijo completo del nombre de la app. |
| El cruce se lee como "cobertura nacional de inversión" cuando `investments` hoy solo tiene La Libertad | SS-02/PS-03 exigen declarar el alcance territorial real de `investments` en la propia respuesta del endpoint, consultado en vivo, no en un texto estático que puede quedar desactualizado si `radar-inversiones` amplía su ingesta. |

## 9. Fuera de este PRD

- Educación (MINEDU/ESCALE) — spike de seguimiento, no incluido aquí (ver ADR-0018 addendum).
- Cruce a nivel de obra/local específico (solo agregado por distrito).
- Cualquier cambio en `apps/rastro-web` o `rastro.fyi`.
- Ingesta de Pensión 65 a nivel individual (nunca — se usa el agregado de INFOMIDIS).
- Un conector CKAN genérico en `packages/`.
- Scheduler/automatización de estos conectores.

## 10. Definition of Done

- SS-01, SS-02, PS-01, PS-03 y PN-02 mergeados con PR, revisión y pruebas automatizadas.
- `docs/conectores.md` y los dos data contracts nuevos reflejan el estado real después de cada PR.
- `docs/PRD_EXPANSION_PNDA.md` y `docs/BACKLOG_EXPANSION_PNDA.md` tienen la nota de reemplazo de alcance.
- Ningún distrito sin match aparece como si tuviera cobertura o inversión — verificado explícitamente en los tests de SS-02/PS-03.
- Ninguna respuesta de `/api/crossref` implica cobertura nacional de `investments` sin declarar su alcance territorial real.
- No existe un paquete `PndaConnector` en `packages/` al cierre.
