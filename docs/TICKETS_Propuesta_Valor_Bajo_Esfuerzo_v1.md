# Tickets — Propuesta de Valor de Bajo Esfuerzo v1

**Producto:** AppsPerú / Rastro (backend/API)
**PRD:** [`docs/PRD_Propuesta_Valor_Bajo_Esfuerzo_v1.md`](PRD_Propuesta_Valor_Bajo_Esfuerzo_v1.md)
**Serie de tickets:** **PV-** (Propuesta de Valor — nueva serie, no colisiona con AE-/CG-/CT-/CX-/DQ-/GOV-/IF-/IR-/OE-/PN-/PS-/RF-/RUC-/SC-/SGR-/SI-/SS- ya usadas en otros backlogs)
**Regla transversal:** ningún ticket de esta serie crea un conector, una app o una fuente de datos nueva; todo cambio a un endpoint existente preserva su comportamiento actual sin los parámetros nuevos (test de regresión obligatorio); `docs/conectores.md` se actualiza en el mismo PR que introduce o extiende un endpoint.
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

**Origen:** sesión de producto 2026-09-12 — al construir un one-pager de inteligencia para el sector Producción (artifact `Radar Produce`) con tres consultas SQL escritas a mano, se confirmó leyendo el código que dos de las tres piezas (ficha sectorial, obras paralizadas) ya tienen endpoint reusable con brechas puntuales, y que la tercera (cruce de sancionados) solo necesita persistir estado para pasar de "reporte" a "vigilancia".

---

## ÉPICA 1 — Ficha sectorial sin repetir SQL a mano

### PV-01 · Ámbito nacional en `GET /sectors/:sectorId/ficha`

- **Historia:** Como persona armando un one-pager de un sector distinto a Producción, quiero pedir la ficha sectorial a nivel nacional en una sola llamada, para no escribir SQL ad-hoc contra tres bases como se hizo el 2026-09-12.
- **Contexto verificado en código:** `apps/radar-ejecucion/api/src/routes/sectors.ts:13-16` define `BaseQuery` con `departamento` obligatorio (default `"LA LIBERTAD"`), y `budgetByRegistry` (líneas 34-61) siempre filtra `META_DEPARTAMENTO`/`territories.departamento` contra ese único valor. No existe hoy ninguna forma de pedir "todas las entidades del sector, cualquier departamento" en una llamada — el one-pager de Producción sumó `pia`/`pim`/`devengado` con una consulta directa a `budget_execution WHERE entity_code='1086'` fuera de este endpoint.
- **Criterios de aceptación:**
  - Nuevo parámetro `ambito` (`REGIONAL` default actual, `NACIONAL` nuevo) en el schema de `sectors.ts`.
  - En modo `NACIONAL`, `budgetByRegistry` agrega todas las entidades verificadas de `sector_entity_registry` para el sector pedido sin filtrar por departamento, preservando la distinción `META_DEPARTAMENTO`/`SEDE_EJECUTORA` ya presente en `mapBudget`/`advertenciaGasto` (no se suman ambas reglas como un solo total).
  - `GET /sectors/PRODUCCION/ficha?ambito=NACIONAL&anio=2026` reproduce, para las entidades del pliego 1086 (Ministerio de la Producción), los mismos S/ 208.1M PIM / S/ 128.2M devengado ya verificados manualmente el 2026-09-12 (documentar si el total del sector completo —incluyendo FONDEPES, ITP, IMARPE, SANIPES— difiere, ya que esos son pliegos con presupuesto propio).
  - El comportamiento sin `ambito` (o `ambito=REGIONAL`) no cambia — test de regresión que compara la respuesta actual antes/después del cambio para `LA LIBERTAD`.
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** M

### PV-02 · Documentar la ficha sectorial como ruta recomendada

- **Historia:** Como futura persona armando un one-pager, quiero saber que existe un endpoint para esto antes de escribir SQL a mano otra vez.
- **Contexto verificado:** hoy `docs/conectores.md` no menciona `GET /sectors/:sectorId/ficha` como ruta recomendada para este caso de uso, y nada en el repo hubiera evitado el camino manual tomado el 2026-09-12 sin leer el código fuente de `sectors.ts` línea por línea.
- **Criterios de aceptación:**
  - `docs/conectores.md` (o `docs/GUIA_ONE_PAGERS_SECTORIALES.md` si se prefiere un documento nuevo) documenta el endpoint, sus parámetros (`ambito`, `anio`, `departamento`), y un ejemplo real con `sectorId=PRODUCCION` y la respuesta verificada el día del PR de PV-01.
  - Referencia cruzada al PR de PV-01.
- **Dependencias:** PV-01.
- **Prioridad:** P1 · **Esfuerzo:** XS

---

## ÉPICA 2 — Ranking de obras paralizadas sin SQL ad-hoc

### PV-03 · Filtro de sector, umbral de días y orden en `GET /public-works`

- **Historia:** Como persona buscando "obras paralizadas +N meses" de un sector, quiero pedirlo directamente al endpoint, para no repetir la consulta SQL directa contra `infobras` que se usó el 2026-09-12.
- **Contexto verificado en código:** `apps/infobras/api/src/routes/public-works.ts:24-29` (`PublicWorksQuerySchema`) solo acepta `departamento`, `estado`, `conParalizacion`, `distritoSospechoso`. La ruta `GET /` (líneas 139-177) siempre ordena `ORDER BY pw.nombre_obra ASC` (línea 171) y no filtra por `sector_entidad` ni por `dias_paralizado`. El hallazgo de las 4 obras de Producción paralizadas +180 días se obtuvo con `SELECT ... WHERE sector_entidad = 'PRODUCCIÓN' AND existe_paralizacion = true AND dias_paralizado > 180` directo contra Postgres, fuera de la API.
- **Criterios de aceptación:**
  - Nuevos parámetros opcionales: `sectorEntidad` (igualdad exacta contra `pw.sector_entidad`), `diasParalizadoMin` (equivalente a `pw.dias_paralizado >= N`), `orderBy` (enum acotado: `nombre_asc` [default actual], `diasParalizado_desc`, `montoViable_desc`).
  - `diasParalizadoMin` sin `conParalizacion=true` devuelve `400` con mensaje explícito (evita el filtro silenciosamente ignorado sobre obras sin paralización, donde `dias_paralizado` puede ser `NULL` o no significativo).
  - `GET /public-works?sectorEntidad=PRODUCCIÓN&conParalizacion=true&diasParalizadoMin=180&orderBy=diasParalizado_desc` devuelve exactamente las 4 obras ya identificadas (Gran Mercado de Belén/Loreto 1,941 días, desembarcadero de Paita/FONDEPES 358 días, mercado Vivanco/Ayacucho 275 días, cerco CITEforestal/ITP 253 días), en ese orden.
  - Sin los parámetros nuevos, la respuesta y el orden no cambian — test de regresión.
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** S

### PV-04 · Ranking nacional de obras paralizadas (todos los sectores)

- **Historia:** Como analista buscando "las obras más atrasadas del país" sin acotar a un sector, quiero el mismo ranking sin el filtro de sector.
- **Contexto verificado en código:** con PV-03 implementado, `sectorEntidad` es un filtro opcional — omitirlo ya agrega a nivel nacional. El riesgo real es de volumen: `GET /public-works` no pagina hoy (`public-works.ts:166-176` no tiene `LIMIT`/`OFFSET`), y un ranking nacional sin filtro podría devolver una lista mucho más grande que la de un solo sector.
- **Criterios de aceptación:**
  - `GET /public-works?conParalizacion=true&diasParalizadoMin=180&orderBy=diasParalizado_desc` (sin `sectorEntidad`) devuelve el ranking nacional completo, ordenado.
  - Medir el volumen real devuelto por esta consulta contra los datos ingeridos hoy (25 departamentos). Si excede ~500 filas, agregar `limit`/`offset` en este mismo ticket; si no, dejar constancia de la cifra medida y diferir la paginación.
- **Dependencias:** PV-03.
- **Prioridad:** P1 · **Esfuerzo:** XS

---

## ÉPICA 3 — De reporte estático a vigilancia de casos nuevos

### PV-05 · Persistir "primera vez visto" en el cruce de sancionados

- **Historia:** Como analista de riesgo de proveedores, quiero que el sistema recuerde qué casos ya vi, para no releer los 244 casos ya conocidos cada vez que quiero saber si apareció algo nuevo.
- **Contexto verificado en código:** `apps/proveedores-sancionados/api/src/routes/crossref.ts` calcula `tieneInhabilitacionVigente` (línea 137) y arma `resultados` (líneas 133-174) en cada llamada, sin persistir nada — cada corrida es una foto independiente. No hay tabla que registre qué combinación proveedor-contrato ya se había visto en una corrida anterior. El 2026-09-12 se verificó, corriendo la consulta directamente contra la base, que existen 244 empresas (RUC) con contrato vigente e inhabilitación o multa vigente a nivel nacional — hoy no hay forma de saber cuáles de esas 244 son nuevas desde la última vez que alguien miró.
- **Criterios de aceptación:**
  - Migración nueva en `apps/proveedores-sancionados/api/src/db/migrations` (siguiente número tras `002_dni_persona_natural.sql`) que crea `sanciones_contratos_vistos` con, como mínimo: `ruc`, `referencia_contrato` (ocid o contracting_id), `primera_vez_visto` (timestamp), índice único sobre `(ruc, referencia_contrato)`.
  - Cada corrida de `GET /crossref` hace upsert: si el par `(ruc, referencia_contrato)` no existía, lo inserta y marca la fila de respuesta con `esNuevoDesdeUltimaCorrida: true`; si ya existía, `esNuevoDesdeUltimaCorrida: false`.
  - Correr el cruce dos veces seguidas sobre el mismo estado de datos: la segunda corrida no marca ningún caso como `true`.
  - Insertar un caso sintético (una fila nueva en `inhabilitaciones` con un RUC que ya tiene contrato, o un contrato nuevo con un RUC ya inhabilitado) y volver a correr: solo ese caso se marca `true`.
  - El campo `soloInhabilitados` y el resto de la forma de respuesta actual no cambian — `esNuevoDesdeUltimaCorrida` es aditivo.
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** M

### PV-06 · Endpoint nacional de "hallazgos nuevos"

- **Historia:** Como analista de riesgo, quiero un endpoint que me muestre solo los casos nuevos desde la última vez que se corrió el cruce, a nivel nacional, sin tener que pedir departamento por departamento ni repasar los 244 casos ya conocidos.
- **Contexto verificado en código:** `crossref.ts` línea 42 procesa un único `wantedDepartamento` por llamada (default `LA LIBERTAD`) — no existe un modo que recorra los 25 departamentos en una sola respuesta, ni un filtro que devuelva solo los casos marcados como nuevos (depende de PV-05).
- **Criterios de aceptación:**
  - Nuevo valor `departamento=TODOS` (o parámetro equivalente) que recorre todos los departamentos con datos ingeridos y agrega los resultados.
  - Nuevo parámetro `soloNuevos=true` que, combinado con PV-05, filtra la respuesta a solo los casos con `esNuevoDesdeUltimaCorrida: true`.
  - `docs/conectores.md` documenta este modo como el punto de entrada recomendado para vigilancia, con una nota explícita: **no envía notificaciones** (correo/Slack/webhook) — es un endpoint de consulta; el canal de entrega queda fuera de este PRD (ver §9 del PRD).
- **Dependencias:** PV-05.
- **Prioridad:** P1 · **Esfuerzo:** S
