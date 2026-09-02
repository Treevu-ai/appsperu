# Tickets — Confiabilidad de Conectores y Cruces v1

**Producto:** AppsPerú (backend/ingesta)
**PRD:** [`docs/PRD_Confiabilidad_Conectores_y_Cruces_v1.md`](PRD_Confiabilidad_Conectores_y_Cruces_v1.md)
**Backlog secuenciado:** [`docs/BACKLOG_Confiabilidad_Conectores_y_Cruces_v1.md`](BACKLOG_Confiabilidad_Conectores_y_Cruces_v1.md)
**Serie de tickets:** **CX-** (Conectores/Cruces — nueva serie, no colisiona con AL2-/AL3-/CG-/CT-/IF-/SC- ya usadas en otros backlogs)
**Regla transversal:** todo campo de cruce nuevo distingue su origen; ningún endpoint existente cambia de forma incompatible sin verificar consumidores; `docs/conectores.md` se actualiza en el mismo PR.
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

> **Estado real (2026-09-02)**: los 6 tickets están cerrados. CX-01, CX-02, CX-03 y CX-06
> implementados en código con tests en verde (compras-publicas 90/90, identidad-fiscal 9/9,
> proveedores-sancionados 16/16, radar-ejecucion 68/68). CX-04 y CX-05 se evaluaron y quedaron
> deliberadamente sin implementar, con la decisión documentada en [ADR-0016](adr/0016-automatizacion-conectores-nucleo-evaluacion.md)
> y [ADR-0017](adr/0017-consolidacion-entity-crosswalk-evaluacion.md) respectivamente — ambos
> con recomendación explícita para una futura iteración, no un "pendiente" abierto sin resolución.

---

## ÉPICA 1 — Cerrar el gap de riesgo de proveedores

### CX-01 · Cruce de `minor_contracts` en identidad-fiscal y proveedores-sancionados

- **Historia:** Como analista de riesgo de proveedores, quiero ver todas las contrataciones de un proveedor —OCDS y contratos menores— cruzadas contra sanciones y estado tributario, para no perder de vista a un proveedor inhabilitado que solo tiene contratos menores.
- **Contexto verificado en código:** `apps/identidad-fiscal/api/src/routes/crossref.ts` y `apps/proveedores-sancionados/api/src/routes/crossref.ts` hoy solo consultan `comprasPool` sobre la tabla `awards` (poblada por `oece-connector.ts`/`oece-records-connector.ts`). `apps/compras-publicas/api/src/ingest/legacy-seace-orders-connector.ts` y `oece-minor-contracts-connector.ts` (ver CX-03 para su renombre) escriben en `minor_contracts` con `winning_supplier_id` en el mismo formato `seace:ruc:<11 dígitos>` — no es exactamente `PE-RUC-<11 dígitos>` como en `awards.supplier_id`, así que el extractor de RUC debe generalizarse o duplicarse con el prefijo correcto (ver criterio de aceptación específico abajo).
- **Criterios de aceptación:**
  - `GET /api/crossref` de `identidad-fiscal` agrega, junto a los resultados de `awards`, los de `minor_contracts` (join por `winning_supplier_id` extrayendo el RUC del prefijo `seace:ruc:`), con un campo `origen: "awards" | "minor_contracts"` en cada resultado.
  - `GET /api/crossref` de `proveedores-sancionados` hace lo mismo, preservando `inhabilitadoEnFechaAdjudicacion` (o el campo temporal equivalente) también para los registros de `minor_contracts`, usando la fecha de adjudicación/emisión de la orden como referencia temporal.
  - Ningún consumidor existente del contrato de respuesta se rompe: el campo `origen` es aditivo; los campos ya existentes (`ocid`, `awardId`, `supplierId`, etc.) mantienen su forma para los resultados que vienen de `awards`. Para resultados de `minor_contracts` sin `ocid` real, se documenta explícitamente cómo se rellena ese campo (ej. `null` o un identificador equivalente de `minor_contracts`, nunca un valor inventado que parezca un OCID real).
  - Pruebas nuevas: proveedor con adjudicación solo en `awards`, proveedor con contrato solo en `minor_contracts`, proveedor con ambos, proveedor sin ninguno de los dos (debe seguir devolviendo `encontradoEnPadron`/inhabilitaciones en `false`/vacío, no error).
  - `docs/conectores.md`: quitar la nota "**hoy no están incluidos**" del ticket de gap en las fichas de `legacy-seace-orders-connector.ts` y (post-CX-03) el conector SEACE renombrado, y actualizar la fila correspondiente del "Mapa de cruces entre apps".
- **Dependencias:** ninguna (puede correr antes o después de CX-03; si corre antes, referenciar el nombre de archivo actual y actualizarlo en el PR de CX-03).
- **Prioridad:** P0 · **Esfuerzo:** M

### CX-02 · ADR de decisión sobre `mef-connector.ts`

- **Historia:** Como equipo de datos, quiero que la decisión sobre el `TODO` de offsets manuales en el conector de presupuesto quede en un documento trazable, no en un comentario de código, para que cualquier persona entienda el riesgo aceptado y por qué.
- **Contexto verificado en código:** `apps/radar-ejecucion/api/src/ingest/mef-connector.ts` (913 líneas) descarga el CSV del MEF vía HTTP Range con `DEFAULT_MAX_BYTES = 25 MB`, y tiene un segundo modo (`ingestMefFullYearForDepartamento`) que usa **offsets de byte observados manualmente** para LA LIBERTAD porque PIA/PIM y DEVENGADO viven en filas separadas del CSV. El propio código señala esto como no apto para producción sin revisión. Según el Mapa de cruces de `docs/conectores.md`, `budget_execution` (la tabla que llena este conector) es consultada en vivo por: `actividad-agraria`, `seguridad-ciudadana`, `radar-ejecucion` mismo (vía `tourism.ts`), `compras-publicas`, `radar-inversiones`, `identidad-fiscal` y `ceplan-geo`/`ceplan-estrategico`.
- **Criterios de aceptación:**
  - Nuevo archivo `docs/adr/0015-mef-connector-offsets-manuales-decision.md` (0015 es el siguiente número libre en `docs/adr/` al momento de escribir este ticket; verificar que siga siéndolo al implementar) con: contexto del problema, alternativas consideradas (completar streaming real; mantener offsets con monitoreo activo; otra mitigación), decisión tomada, y consecuencias — formato consistente con los ADR ya existentes en `docs/adr/`.
  - El ADR nombra explícitamente las 7 apps/rutas consumidoras del cruce y qué le pasa a cada una si `budget_execution` queda desactualizado o parcialmente vacío sin que nadie lo note.
  - Si la decisión es "mantener offsets con monitoreo": el ADR especifica la señal concreta a vigilar (tamaño de archivo esperado vs. observado, conteo de filas por sección, o checksum de estructura) y quién/qué la revisa — no basta con "monitorear" sin mecanismo.
  - Si la decisión es "completar streaming real": el ADR incluye el diseño técnico de alto nivel; la implementación puede ser un ticket de seguimiento fuera de este backlog si el esfuerzo excede M.
  - `docs/conectores.md` (ficha de `mef-connector.ts`, fila "Cómo lo hace" o una fila nueva "Decisión de riesgo") enlaza al ADR y refleja el estado resultante.
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** M

### CX-03 · Renombrar `oece-minor-contracts-connector.ts`

- **Historia:** Como futuro mantenedor, quiero que el nombre del archivo de un conector refleje su fuente real, para no asumir por error que `oece-minor-contracts-connector.ts` usa la misma API OCDS que `oece-connector.ts`.
- **Contexto verificado en código:** `apps/compras-publicas/api/src/ingest/oece-minor-contracts-connector.ts` consulta `prod6.seace.gob.pe/v1/s8uit-services/buscadorpublico` — SEACE, no la API OCDS de OECE. El archivo `legacy-seace-orders-connector.ts` importa `classifyContractingEntity` desde este archivo (`import { classifyContractingEntity } from "./oece-minor-contracts-connector.js"`), así que el rename debe actualizar ese import. El script npm es `ingest:minor-contracts` (`tsx src/ingest/oece-minor-contracts-connector.ts`) y también `ingest:minor-contracts:full`.
- **Criterios de aceptación:**
  - Archivo renombrado a `seace-public-minor-contracts-connector.ts` (o nombre equivalente que dé cuenta de "SEACE, buscador público moderno").
  - `legacy-seace-orders-connector.ts` actualiza su import de `classifyContractingEntity` al nuevo path.
  - `package.json` de `compras-publicas/api` actualiza `ingest:minor-contracts`/`ingest:minor-contracts:full` (y `run-minor-contracts.ts` si referencia el path directamente) al nuevo nombre de archivo.
  - Suite completa de tests de `apps/compras-publicas/api` en verde después del rename (no solo el archivo tocado — el import cruzado es la parte de mayor riesgo de romper algo).
  - `docs/conectores.md`: ficha, "Mapa de cruces" y tabla "Resumen" actualizadas con el nuevo nombre de archivo.
- **Dependencias:** ninguna. Coordinar orden de merge con CX-01 si tocan el mismo archivo en paralelo (recomendado: CX-03 primero, luego CX-01 sobre el nombre ya actualizado).
- **Prioridad:** P1 · **Esfuerzo:** S

---

## ÉPICA 2 — Automatización evaluada y catálogo blindado

### CX-04 · Evaluación de automatización de conectores núcleo

- **Historia:** Como equipo de datos, quiero saber si automatizar la ingesta de los conectores de mayor tráfico de cruce vale el costo de infraestructura, antes de asumir que "automatizar" es siempre la mejora correcta.
- **Contexto verificado en código:** `docs/conectores.md` confirma que ningún conector tiene scheduler hoy (búsqueda de `cron`/`schedule`/`setInterval` en todo el repo sin resultados) — es una decisión de diseño explícita, no una omisión. `docs/arquitectura/scraping-arquitectura.md` §3.7 ya documenta que la máquina de desarrollo no tiene cron confiable y propone Cloudflare Workers Cron Triggers como ruta futura, pero solo para la capa `tools/scrapers/`, no para los conectores de `apps/*/api`.
- **Criterios de aceptación:**
  - Documento de evaluación (sección del ADR de CX-02, o archivo propio `docs/adr/0016-automatizacion-conectores-nucleo.md`, siguiente número libre después de CX-02) que responde para `mef-connector.ts`, `oece-connector.ts` y `oece-records-connector.ts`: ¿qué tan stale puede estar el dato antes de que un cruce sea engañoso (ej. un usuario ve "ejecución presupuestal" de hace 3 meses sin saberlo)?, ¿qué opciones de infraestructura existen dado que hoy no hay backend con cron persistente?, ¿cuál es el costo estimado de cada opción?
  - Si la evaluación concluye que automatizar vale la pena: al menos uno de los tres conectores corre sin intervención manual (cron local, GitHub Actions scheduled workflow, o equivalente), con su corrida registrada de forma auditable (log persistido o tabla de ejecuciones, no solo stdout).
  - Si la evaluación concluye que no vale la pena por ahora: la razón queda documentada explícitamente (costo, falta de infraestructura, prioridad) y el ticket se cierra como "evaluado, diferido" en el backlog — no queda abierto sin resolución.
  - `docs/conectores.md`: la fila "Frecuencia" de los conectores automatizados (si los hay) se actualiza de "Manual" al mecanismo real.
- **Dependencias:** CX-02 (la decisión sobre `mef-connector.ts` puede cambiar si vale la pena automatizarlo antes de que su modo de ingesta esté resuelto).
- **Prioridad:** P1 · **Esfuerzo:** M

### CX-06 · Chequeo CI de conector sin documentar

- **Historia:** Como mantenedor del catálogo de conectores, quiero que CI falle si alguien agrega un conector nuevo sin actualizar `docs/conectores.md`, para que la brecha de 6 conectores no documentados detectada en el diagnóstico de 2026-09-02 no vuelva a pasar desapercibida.
- **Contexto:** el diagnóstico de 2026-09-02 encontró 6 conectores (`actividad-agraria` ×4, `sidpol-connector.ts`, `mincetur-hospedaje-connector.ts`, `legacy-seace-orders-connector.ts`, y `oece-minor-contracts-connector.ts`) construidos y activos sin ficha en `docs/conectores.md`, además de `bcrp-comercio-exterior` documentado incorrectamente como "no implementado" pese a tener app completa con tests.
- **Criterios de aceptación:**
  - Script (ej. `scripts/check-connectors-documented.mjs` o `.sh`, en la raíz o en `tools/`) que enumera todos los `apps/*/api/src/ingest/*-connector.ts` del repo y verifica que el nombre de archivo (sin extensión) aparezca como texto en `docs/conectores.md`.
  - Step de CI (workflow de GitHub Actions a nivel repo, no por app) que ejecuta el script y falla con un mensaje que liste exactamente qué archivo(s) faltan documentar.
  - El chequeo no exige un formato específico de ficha — solo que el nombre del archivo aparezca mencionado en el documento, para no ser frágil ante refactors de redacción.
  - Nota al pie agregada en `docs/conectores.md` explicando que este chequeo existe y por qué (para que quien agregue un conector nuevo sepa que debe tocar este archivo en el mismo PR).
  - El chequeo corre en `pull_request` contra cualquier cambio bajo `apps/*/api/src/ingest/` o `docs/conectores.md`, no en cada PR del monorepo (para no ser ruidoso).
- **Dependencias:** ninguna.
- **Prioridad:** P1 · **Esfuerzo:** S

---

## ÉPICA 3 — Consolidación de matching (opcional)

### CX-05 · Evaluación de consolidación de `entity_crosswalk`

- **Historia:** Como equipo de datos, quiero saber si vale la pena extraer un servicio de matching de entidades compartido, en vez de mantener tres implementaciones paralelas del mismo problema (mef↔oece en compras-publicas, mef↔infobras en infobras, reutilización del matcher de compras-publicas en identidad-fiscal).
- **Contexto verificado en código:** `apps/compras-publicas/api/src/routes/crossref.ts` y `apps/infobras/api/src/routes/crossref.ts` mantienen cada una su propia tabla `entity_crosswalk` (mismo nombre, distinto contenido — `mef_entity_code`↔`oece_buyer_id` en una, `ejecucion_entity_code`↔`infobras_codigo_entidad` en la otra), cada una recalculable con su propio `npm run crossref:build`. `apps/identidad-fiscal/api/src/routes/crossref.ts` (`/entidades`) reutiliza el matcher de `compras-publicas` (`matchEntitiesToPadron`) sin tabla propia, acotando el padrón por prefijo de ubigeo departamental antes de correr el match (necesario por performance: 89s sin acotar, medido en vivo).
- **Criterios de aceptación:**
  - Documento de evaluación que compara el costo de mantener 2-3 implementaciones del matcher difuso vs. el costo de extraer un servicio/librería compartida, incluyendo si el resultado del matching sería idéntico entre apps o divergiría por diferencias de dominio (nombres de entidades públicas vs. nombres de contribuyentes en el padrón).
  - Si se decide consolidar: ADR que define la interfaz del servicio compartido (librería en `packages/` vs. microservicio) antes de tocar código de ninguna de las 3 apps.
  - Si se decide no consolidar: la razón queda documentada (ej. "cada app tiene contexto de dominio suficiente para justificar su propio matcher, y el costo de coordinación de un servicio compartido no compensa") y el ticket se cierra sin implementación.
- **Dependencias:** ninguna. Sin fecha comprometida — puede diferirse indefinidamente sin bloquear el resto del backlog.
- **Prioridad:** P2 · **Esfuerzo:** M
