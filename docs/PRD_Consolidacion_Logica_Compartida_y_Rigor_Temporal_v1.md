# PRD — Consolidación de lógica compartida y rigor temporal en cruces

**Estado:** CX-07, CX-08, CX-09, CX-10, CX-11, CX-12, CX-13 cerrados (2026-09-05); CX-14 (nuevo, hallazgo de CX-10) propuesto, requiere acceso a datos en vivo
**Fecha:** 2026-09-04
**Ámbito:** `apps/*/api/src/routes/*.ts`, `apps/*/api/src/lib/`, `packages/`, `mcp-server/src/catalog.ts`, `package.json` raíz
**Horizonte:** dos sprints cortos; sin fecha comprometida ni owner asignado
**Origen:** revisión completa de las 14 apps backend, el buscador de `rastro-web` y el `mcp-server` (sesión 2026-09-04), continuación directa del diagnóstico que dio origen a [`docs/PRD_Confiabilidad_Conectores_y_Cruces_v1.md`](PRD_Confiabilidad_Conectores_y_Cruces_v1.md) (CX-01 a CX-06, cerrados)

## 1. Decisión de producto

El PRD de Confiabilidad de Conectores y Cruces (CX-01 a CX-06) cerró la brecha de cobertura de `minor_contracts`, documentó la deuda de `mef-connector.ts` en un ADR, corrigió nomenclatura, evaluó automatización y evaluó consolidar `entity_crosswalk` (resultando en `packages/entity-matcher`, ADR-0017). Esta revisión, hecha después de ese trabajo, encontró una segunda categoría de hallazgos que ese PRD no cubrió porque no son sobre *cobertura de cruce* sino sobre **lógica idéntica copiada entre apps** y **una asimetría de rigor temporal entre dos cruces que resuelven el mismo problema**. Ninguno de los hallazgos aquí es un bug activo — son riesgos de mantenimiento y una inconsistencia de honestidad de datos, exactamente el tipo de deuda que el proyecto ya ha demostrado que le importa corregir (ver ADR-0015, ADR-0016, ADR-0017).

Este PRD no autoriza nuevas fuentes de datos ni cambios de comportamiento visible para el usuario de `rastro.fyi` salvo donde el propio hallazgo lo exige (CX-10).

## 2. Problema y oportunidad

1. **Código SQL/JS crítico duplicado, no compartido.** El CTE `LATEST_BUDGET_CTE` (dedupe de reingestas de presupuesto por `fecha_corte DESC, id DESC`) está copiado carácter por carácter en al menos 5 archivos de 4 apps distintas: `radar-ejecucion/src/routes/benchmark.ts`, `salud-institucional/src/routes/score.ts`, `radar-inversiones/src/routes/crossref.ts`, `ceplan-estrategico/src/lib/indicators/plan-budget-alignment.ts` e `infobras/src/routes/crossref.ts`. La función `extractRuc()` (regex `PE-RUC-\d{11}`) está copiada en `identidad-fiscal/src/routes/crossref.ts`, `proveedores-sancionados/src/routes/crossref.ts` y `salud-institucional/src/routes/score.ts`. Un fix futuro a cualquiera de las dos solo llega a la copia que alguien recuerde tocar.
2. **Asimetría de rigor temporal entre dos cruces equivalentes.** `proveedores-sancionados/lib/temporal-status.ts` resuelve correctamente "¿este proveedor estaba sancionado *cuando ganó el contrato*?" (`vigenteEnFecha`), separado de "¿está sancionado *hoy*?". `identidad-fiscal/routes/crossref.ts` resuelve la pregunta estructuralmente idéntica para el estado tributario (ACTIVO/HABIDO) pero **solo mira el estado actual del RUC**, sin ningún equivalente temporal — un proveedor irregular en el momento del contrato pero regularizado después no se marca `irregular`, y uno regular entonces pero irregular hoy tampoco distingue el momento. Es un hueco de honestidad de datos en el sentido exacto que el PRD anterior protegió con su "no regresión de honestidad" (§7).
3. **Criterio de "sobrecosto" no unificado entre tres apps que lo usan.** `infobras/signals/signals.ts` calcula `costDriftPct` como un porcentaje continuo, sin umbral. `radar-inversiones/routes/crossref.ts` y el componente `inversionesSinSobrecosto` de `salud-institucional/score/compute.ts` usan un booleano (`costo_actualizado > monto_viable`, es decir, cualquier desvío > 0% cuenta en contra). No hay un umbral documentado de qué % de Cost Drift debería considerarse "sobrecosto" como categoría — dos apps miden lo mismo con sensibilidad distinta sin que quede declarado.
4. **La garantía "cada tool del MCP mapea 1:1 a un endpoint real" solo se verifica automáticamente para 1 de 14 apps.** `mcp-server/src/__tests__/catalog.test.ts` cuenta y nombra los 13 tools de `ceplan-geo` contra el catálogo declarado, pero no hace lo mismo para las otras 13 apps — el mecanismo de verificación ya existe, solo no está generalizado.

Resolver esto reduce el riesgo de que un fix a lógica compartida quede a medias, cierra una inconsistencia de rigor que un fiscalizador podría explotar sin saberlo ("¿por qué sanciones sí distingue la fecha del contrato y RUC no?"), y extiende una garantía de calidad que el proyecto ya se comprometió a mantener (README: *"cada tool corresponde 1:1 a un endpoint existente, sin inventar parámetros"*).

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Eliminar la duplicación de lógica identificada donde el costo de compartirla es bajo, cerrar la asimetría de rigor temporal en `identidad-fiscal`, dejar documentada (vía ADR) la decisión sobre un umbral unificado de sobrecosto, y extender la verificación automática del catálogo MCP a las 14 apps.

### No objetivos

- No tocar la lógica de negocio de ningún conector de ingesta (eso es dominio del PRD de Confiabilidad de Conectores, ya cerrado).
- No cambiar el resultado observable de `costDriftPct` en INFOBRAS — solo declarar y, si se decide, aplicar un umbral de "sobrecosto" en los consumidores que hoy usan un booleano sin criterio explícito.
- No forzar una expansión general del `workspaces` del `package.json` raíz sin que un ADR la autorice explícitamente — el alcance acotado de ADR-0017 fue una decisión deliberada, no un descuido, y este PRD debe respetarla o revertirla con la misma disciplina con la que se tomó.
- No introducir un framework de "shared kernel" grande — el paquete propuesto (CX-08) debe limitarse estrictamente a las 2-3 utilidades identificadas aquí.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Consolidación de CTE de presupuesto | `LATEST_BUDGET_CTE` tiene una sola definición fuente; los 5 archivos identificados la importan en vez de copiarla. |
| Consolidación de extractor de RUC | `extractRuc()` tiene una sola definición fuente; los 3 archivos identificados la importan. |
| Rigor temporal simétrico | `identidad-fiscal/routes/crossref.ts` distingue "regular hoy" de "regular en la fecha de la adjudicación", con el mismo patrón de `"NO_VERIFICABLE"` que `proveedores-sancionados`. |
| Umbral de sobrecosto documentado | Existe un ADR con la decisión (umbral único aplicado en las 3 apps, o justificación explícita de por qué cada app necesita su propio criterio). |
| Cobertura del test de catálogo MCP | `catalog.test.ts` verifica el conteo y los nombres de tools para las 14 apps, no solo `ceplan-geo`. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Equipo de datos | Corregir un bug en la deduplicación de presupuesto una sola vez, no en 5 lugares. | `LATEST_BUDGET_CTE` importado, no copiado. |
| Analista de riesgo de proveedores | Que "proveedor regular" en `identidad-fiscal` signifique lo mismo que en `proveedores-sancionados`: regular en el momento del contrato. | Cruce de `identidad-fiscal` con rigor temporal equivalente. |
| Fiscalizador que compara Cost Drift entre INFOBRAS e inversiones | Saber que "sobrecosto" significa lo mismo en ambas fuentes. | Umbral documentado y, si se decide, aplicado consistentemente. |
| Futuro mantenedor del `mcp-server` | Confianza de que un tool roto o desincronizado se detecta en CI para cualquier app, no solo `ceplan-geo`. | `catalog.test.ts` cubre las 14 apps. |

## 5. Alcance funcional: nueve issues (CX-14 agregado durante la ejecución de CX-10)

> **Actualización 2026-09-04**: CX-07 y CX-12 ya están cerrados (ver
> [`docs/TICKETS_Consolidacion_Logica_Compartida_y_Rigor_Temporal_v1.md`](TICKETS_Consolidacion_Logica_Compartida_y_Rigor_Temporal_v1.md)
> para el detalle de resolución). CX-07 se resolvió en
> [ADR-0019](adr/0019-alcance-workspace-utilidades-compartidas.md) y encontró, como efecto
> secundario de la investigación, un paquete (`packages/http-client`) ya comiteado y sin
> conectar — se agregó como **CX-13**, un octavo issue no previsto en la versión original de
> este PRD.

### CX-07 — ADR de alcance del workspace compartido para utilidades cross-app — ✅ CERRADO

**Prioridad:** P0 · **Esfuerzo:** S · **Dependencias:** ninguna (bloqueaba CX-08 y CX-09, ya desbloqueados)

**Resuelto en [ADR-0019](adr/0019-alcance-workspace-utilidades-compartidas.md)**: ampliar `workspaces` incrementalmente (una app entra solo cuando CX-08/CX-09 la toquen), reutilizando el mecanismo de CI de ADR-0017. Dos paquetes nuevos: `packages/shared-queries` (CX-08) y `packages/shared-identity` (CX-09). Efecto secundario de la investigación: se encontró `packages/http-client` ya comiteado, sin `package.json` y sin ningún consumidor real — abierto como CX-13 (Épica 5, no prevista en la v1 de este PRD).

`packages/entity-matcher` solo es consumible hoy por las 3 apps ya incluidas en `workspaces` del `package.json` raíz (`compras-publicas`, `infobras`, `identidad-fiscal`) — por diseño deliberado de ADR-0017. Las utilidades identificadas en CX-08 y CX-09 (`LATEST_BUDGET_CTE`, `extractRuc`, `temporal-status`) son necesarias en `radar-ejecucion`, `salud-institucional`, `radar-inversiones`, `ceplan-estrategico` y `proveedores-sancionados` — ninguna de las cuales está en el workspace. Este ticket decide, con la misma disciplina que ADR-0017, si conviene ampliar `workspaces` (y a qué apps exactamente) o si el costo de esa ampliación no se justifica frente a mantener la duplicación de forma consciente.

**Criterios de aceptación**

- Nuevo ADR (`docs/adr/0019-alcance-workspace-utilidades-compartidas.md`, verificar que 0019 siga libre al implementar — 0018 ya está tomado por el spike de `docs/adr/0018-research-spike-pnda-educacion-salud-social.md`) que documenta: qué apps necesitarían sumarse a `workspaces` para consumir las utilidades de CX-08/CX-09, el costo de esa ampliación (impacto en CI de cada app, en su propio `package-lock.json`), y la decisión tomada.
- Si la decisión es ampliar el workspace: el ADR lista exactamente las apps a agregar y actualiza la `description` del `package.json` raíz para reflejar el nuevo alcance (siguiendo el mismo patrón textual que dejó ADR-0017).
- Si la decisión es no ampliar: el ADR documenta la alternativa aceptada para CX-08/CX-09 (ej. mantener duplicación consciente con un comentario cruzado entre archivos que apunte a las copias hermanas, o publicar el paquete como dependencia de archivo local `file:../../packages/shared-utils` sin usar `workspaces`).
- La decisión no reabre el alcance de `packages/entity-matcher` (ADR-0017) — si se crea un paquete nuevo, es un paquete distinto (`packages/shared-utils` o nombre equivalente), no una extensión del existente.

### CX-08 — Extraer `LATEST_BUDGET_CTE` a un módulo compartido — ✅ CERRADO

**Prioridad:** P0 · **Esfuerzo:** M (real, mayor al estimado) · **Dependencias:** CX-07 (cerrado)

**Corrección sobre la estimación original**: no eran 5 copias, eran **11**, repartidas en 9 archivos — el grep original (patrón exacto de columnas) no capturó todas; un grep más amplio por `latest_budget` sí. Copias adicionales encontradas en `actividad-agraria/routes/crossref.ts` (×2), `seguridad-ciudadana/routes/crossref.ts` (×2), `compras-publicas/routes/crossref.ts` (×1) y `ceplan-estrategico/routes/crossref.ts` (×1, distinto del ya contado en `budget-sql.ts`).

**Resuelto**: `packages/shared-queries` con `LATEST_BUDGET_CTE` como única fuente (4 tests). 6 apps sumadas a `workspaces` (no 4 como se estimó): `radar-ejecucion`, `salud-institucional`, `radar-inversiones`, `ceplan-estrategico`, `actividad-agraria`, `seguridad-ciudadana`; `infobras` y `compras-publicas` ya estaban. Los 11 sitios importan la constante; verificado con grep que cero quedan inline. `radar-ejecucion/db/budget-coverage.ts` y `ceplan-estrategico/lib/indicators/budget-sql.ts` la re-exportan para no romper a sus propios consumidores internos (`benchmark.ts`, `tourism.ts`, `sectors.ts`, `execution.ts`, `department-proxy.ts`, `plan-budget-alignment.ts`).

**Corrección al mecanismo de CI**: el patrón de ADR-0017 (`npm run build --workspace=packages/entity-matcher`) rompe con "No workspaces found" en cualquier rama sin ese paquete (como esta, que nunca mergeó ADR-0017). Se reemplazó por un loop sobre `packages/*/` tolerante a ausencias — deliberadamente no `npm run build --workspaces` (todos), porque eso también intenta compilar las apps del workspace y una con build roto (`compras-publicas`, deuda preexistente) tumbaría el step entero.

Verificado: `tsc --noEmit` limpio y tests en verde en las 8 apps tocadas (radar-ejecucion 61/61, salud-institucional 8/8, radar-inversiones 18/18, ceplan-estrategico 24/24, infobras 82/82, actividad-agraria 7/7, seguridad-ciudadana 18/18, compras-publicas 83/83 con el mismo fallo preexistente no relacionado que en CX-13).

### CX-09 — Extraer `extractRuc()` y aplicar rigor temporal en identidad-fiscal — ✅ CERRADO

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** CX-07 (cerrado), CX-08 (cerrado)

**Resuelto**: `packages/shared-identity` con `extractRuc()`, `vigenteEnFecha` (generalizada, parámetro renombrado a `fechaReferencia`) y `consolidarEstadoTemporal` (12 tests). `proveedores-sancionados` sumado a `workspaces`. Los 3 consumidores de `extractRuc()` migrados; `proveedores-sancionados/lib/temporal-status.ts` quedó como re-export del paquete (su test existente sigue pasando intacto, sirviendo de test de regresión). `GET /api/crossref` de `identidad-fiscal` agrega `estadoTributarioEnFechaAdjudicacion: true | false | "NO_VERIFICABLE"`, aditivo.

**Confirmado en código** (migración `001_init.sql`): `contribuyentes` no tiene columna de fecha de inicio de estado — solo el snapshot del último batch (`ON CONFLICT (ruc) DO UPDATE`, sobrescribe). Por eso el campo nuevo es **siempre `"NO_VERIFICABLE"` hoy** — resultado honesto y explícitamente contemplado en el criterio de aceptación original, no un defecto de la implementación. Documentado en el código con un comentario que explica por qué y qué haría falta (una fecha real de SUNAT) para que deje de serlo.

Verificado: `tsc --noEmit` limpio y tests en verde — identidad-fiscal 9/9, proveedores-sancionados 16/16, salud-institucional 8/8.

### CX-10 — ADR de umbral unificado de "sobrecosto" — ✅ CERRADO

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** ninguna

**Corrección sobre la premisa original**: se asumían 3 implementaciones (`infobras`, `radar-inversiones`, `salud-institucional`). Verificado en código que `radar-inversiones/routes/crossref.ts` **no clasifica sobrecosto** — solo suma totales. Son 2 implementaciones reales: `costDriftPct` (continua, `infobras`) y un booleano `costo_actualizado > monto_viable` (`salud-institucional/routes/score.ts`).

**Resuelto en [ADR-0020](adr/0020-umbral-sobrecosto-unificado.md)**: no se inventó un umbral distinto de 0% — esta sesión no tiene acceso a datos en vivo para justificar un número con evidencia real (mismo criterio que ADR-0007 ante información no verificable). En su lugar: `costDriftPct` consolidada en `packages/shared-signals` (nuevo, 7 tests), con `SOBRECOSTO_UMBRAL_PCT = 0` como constante nombrada y documentada reemplazando el `0` implícito. `salud-institucional/routes/score.ts` conserva su comparación SQL agregada (no se fuerza un refactor a cálculo fila-por-fila, que cambiaría el perfil de performance sin evaluar el impacto) — queda enlazada al umbral compartido con un comentario explícito de qué actualizar si el umbral cambia. Se abrió **CX-14** para el análisis de datos que decidiría, con evidencia, si el umbral debe subir de 0%.

Verificado: `tsc --noEmit` limpio y tests en verde en `infobras` (82/82) y `salud-institucional` (8/8) tras el refactor.

### CX-14 — Analizar distribución real de `costDriftPct` y decidir umbral con evidencia (nuevo, hallazgo de CX-10)

**Prioridad:** P2 · **Esfuerzo:** S (una vez con acceso a datos) · **Dependencias:** CX-10 (cerrado)

No ejecutable en esta sesión (requiere consultar las bases de producción/staging ya ingeridas). Calcular la distribución real (percentiles, no solo promedio) de `costDriftPct` sobre obras/inversiones de La Libertad, y decidir con esa evidencia si `SOBRECOSTO_UMBRAL_PCT` debería subir de 0. Si cambia, actualizar `packages/shared-signals` y la condición SQL de `salud-institucional/routes/score.ts` en el mismo PR — el comentario dejado en CX-10 indica exactamente qué tocar. Si el umbral se mantiene en 0, cerrar documentando por qué la evidencia no lo justificó.

### CX-11 — Extender `catalog.test.ts` del mcp-server a las 14 apps — ✅ CERRADO

**Prioridad:** P1 · **Esfuerzo:** S · **Dependencias:** ninguna

**Resuelto**: `EXPECTED_TOOLS_BY_APP` (82 tools reales, 14 apps) versionada en el test; un `it()` por app más verificación de cobertura de `APP_KEYS` y de nombres duplicados en el catálogo — 17 tests en total. **Validación real, no solo "el test pasa"**: renombré temporalmente un tool en `catalog.ts` y confirmé que la suite falla exactamente en la app afectada con el nombre en conflicto en el mensaje, antes de revertir. `tsc --noEmit` limpio.

### CX-12 — Housekeeping: `.gitignore` de `.worktrees/` — ✅ CERRADO

**Prioridad:** P2 · **Esfuerzo:** XS · **Dependencias:** ninguna

La carpeta `.worktrees/` (usada por `git worktree` para desarrollo en paralelo) no estaba en `.gitignore` raíz y aparecía como untracked en cada `git status` de cualquier sesión que la usara.

**Resuelto**: entrada `.worktrees/` agregada a `.gitignore` raíz. Verificado con `git check-ignore -v` y confirmado que `git status` ya no la lista.

### CX-13 — Conectar `packages/http-client` (hallazgo de CX-07, no previsto en la v1 de este PRD) — ✅ CERRADO

**Prioridad:** P2 · **Esfuerzo:** S · **Dependencias:** CX-07 (cerrado)

`packages/http-client/src/index.ts` existía, comiteado, sin `package.json`, sin `workspaces`, sin ningún consumidor real. **Corrección sobre el análisis original**: la duplicación byte-idéntica real no era con el `fetchJson` que ya traía el archivo (resto de un scaffold Next.js abandonado, sin consumidores) sino con `apps/ceplan-geo/api/src/lib/fetch-with-timeout.ts` y `apps/compras-publicas/api/src/lib/fetch-with-timeout.ts` — dos copias idénticas de `fetchWithTimeout`.

**Resuelto**: `packages/http-client` recibió `package.json`/`tsconfig.json`/`vitest.config.ts` y una función `fetchWithTimeout` nueva (el primitivo realmente duplicado), con 5 tests. `compras-publicas` (ya en `workspaces`) migró sus 5 archivos consumidores y eliminó su copia local; `package.json` de esa app agrega `"@appsperu/http-client": "*"`; `ci.yml` compila el paquete nuevo junto a `entity-matcher`. Suite completa de `compras-publicas` verificada: 83/83 tests en verde (1 suite falla por una deuda preexistente no relacionada — rename de CX-03 que esta rama no tiene todavía).

`ceplan-geo` queda **fuera de este ticket**: tiene la misma copia duplicada, pero no está en `workspaces` hoy, y no tiene matrix en `.github/workflows/ci.yml` — sumarla habría significado abrir el mismo trabajo de CX-08/CX-09 (quitar lockfile, extender CI) dentro de un ticket que se pensó como "conectar un paquete ya empezado". Queda documentada como duplicación conocida para cuando `ceplan-geo` entre al workspace por otro ticket (mismo criterio incremental de ADR-0019).

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Hecho** | CX-07, CX-08, CX-09, CX-10, CX-11, CX-12, CX-13 | Decidido dónde vive la lógica compartida (ADR-0019); `LATEST_BUDGET_CTE` consolidada (11 copias → 1, 6 apps sumadas al workspace); `extractRuc()`/`temporal-status` consolidados (`proveedores-sancionados` sumado al workspace); `costDriftPct`/umbral de sobrecosto consolidados en `packages/shared-signals` (ADR-0020); `catalog.test.ts` del MCP extendido de 1 a 14 apps; housekeeping de `.worktrees/`; `packages/http-client` conectado (`compras-publicas`). |
| **Pendiente (bloqueado)** | CX-14 | Análisis de distribución real de `costDriftPct` — requiere acceso a datos en vivo, no ejecutable en esta sesión. |

## 7. Requisitos no funcionales

- **No regresión de honestidad de datos:** el campo temporal nuevo de CX-09 debe usar `"NO_VERIFICABLE"` explícito cuando falte la fecha necesaria, nunca inferir `false` por ausencia de dato (mismo principio ya protegido en el PRD anterior).
- **Compatibilidad:** todo campo nuevo es aditivo; ningún consumidor existente (`rastro-web`, `mcp-server`) puede romperse por estos cambios.
- **Disciplina de alcance del workspace:** cualquier ampliación de `workspaces` pasa primero por el ADR de CX-07 — no se agrega una app al workspace como efecto colateral de otro ticket.
- **Documentación como entregable:** cada ticket que produce un ADR lo mergea antes de cerrarse; cada cambio de comportamiento observable se refleja en `docs/conectores.md` o `docs/data-contracts/` según corresponda.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| CX-08/CX-09 dependen de una decisión de CX-07 que tarde en tomarse | CX-07 es Esfuerzo S — priorizarlo primero explícitamente para no bloquear el resto del sprint. |
| Mover `LATEST_BUDGET_CTE` introduce una diferencia sutil de comportamiento en alguna de las 5 apps | Comparar output antes/después con los tests existentes de cada app antes de mergear; no asumir que un refactor "solo mueve código" sin verificar. |
| CX-09 no puede completarse porque el padrón RUC no tiene fecha de vigencia por estado | Aceptable: el criterio de aceptación explícitamente permite `"NO_VERIFICABLE"` como resultado válido y esperado si el dato de origen no la tiene — este ticket no exige inventar una fecha que SUNAT no publica. |
| CX-10 concluye que unificar el umbral no es correcto (los tres casos de uso son legítimamente distintos) | Aceptable — el criterio de aceptación cubre ambos desenlaces; el objetivo es la decisión documentada, no forzar unificación. |

## 9. Fuera de este PRD

- Cualquier cambio a la lógica de negocio de los conectores de ingesta (dominio del PRD de Confiabilidad de Conectores).
- Ampliar `packages/entity-matcher` más allá de su alcance de ADR-0017.
- Cambios en `apps/rastro-web` salvo que CX-09 exponga un campo que el frontend deba consumir (evaluar como ticket de seguimiento si aplica, no incluido aquí).
- Automatizar el chequeo de CX-11 contra las rutas Express reales en vez de una lista de referencia versionada (sería un chequeo más robusto pero de mayor esfuerzo — evaluable como ticket de seguimiento).

## 10. Definition of Done

- Cada issue tiene PR, revisión y pruebas automatizadas asociadas.
- Los ADR de CX-07 y CX-10 están mergeados antes de cerrar sus tickets dependientes (CX-08, CX-09 para CX-07).
- `docs/conectores.md` y/o `docs/data-contracts/` reflejan cualquier cambio de comportamiento observable.
- Ningún cambio de este PRD convierte "sin dato" en un valor que parezca una conclusión verificada.
