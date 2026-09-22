# Backlog ejecutable — Preparación de inversión vs. brechas de infraestructura crítica (Fenómeno El Niño)

**Producto:** Rastro / Follow the Sol
**Origen:** sesión 2026-09-21 — pregunta directa sobre si Rastro puede cruzar "dónde ha pegado el
Niño antes" con "qué se invirtió/ejecutó ahí en prevención". Respuesta en ese momento: no, es un
gap documentado explícitamente como "candidato de Fase 2, no comprometido" en
[`docs/data-contracts/indeci-emergencias-historicas.md`](data-contracts/indeci-emergencias-historicas.md).
**Regla transversal:** API/CLI/MCP. Sin web nueva. Sin inferir causalidad — el cruce muestra
coincidencia territorial y temporal, nunca "esta obra hubiera evitado este daño".

## Qué ya existe (no hay que reconstruirlo)

- **INDECI/SINPAD** (`emergencias-indeci`): 142,139 emergencias 2003-2025, con `departamento`/
  `provincia`/`distrito` en texto real y `peligro`/`tipo_peligro` — filtrable por eventos
  relacionados a El Niño (inundación, huaico, lluvias intensas, desborde de río, etc.).
- **INFOBRAS ↔ radar-inversiones ya cruzados por CUI** (`GET /api/crossref` en `infobras`,
  `apps/infobras/api/src/routes/crossref.ts`): obras públicas + su inversión Invierte.pe
  correspondiente (monto viable, costo actualizado, estado, paralización), por departamento.
  Este cruce **no hay que construirlo, ya corre**.
- `investments.funcion` (Invierte.pe, vía `radar-inversiones`) es texto libre — candidato para
  filtrar inversiones de prevención/gestión de riesgo, pero **los valores reales no están
  verificados en este backlog** (ver PRV-01).

## Qué falta (el gap real)

Un tercer lado del cruce, territorial (no por CUI — INDECI no tiene CUI): ¿las obras/inversiones
que YA se cruzan en `infobras` caen en distritos con historial real de emergencias tipo El Niño?
Y, en sentido inverso: ¿qué distritos con historial fuerte de daños NO tienen ninguna obra de
prevención en curso o ejecutada?

---

## Tickets

| ID | Objetivo | Criterios de aceptación | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| PRV-01 | Spike de valores reales | Enumerar en vivo (contra Postgres real, no muestra) los valores distintos de `investments.funcion` y de `indeci_emergencias.peligro`/`tipo_peligro`; decidir la lista de valores que cuentan como "relacionado a El Niño" (ej. inundación, huaico, lluvias intensas, desborde) y de `funcion` que cuentan como prevención/GRD; documentar en `docs/spike-preparacion-riesgo-nino-2026-09.md` con conteos reales. Si `funcion` no tiene ningún valor utilizable para GRD, el ticket lo documenta como hallazgo negativo y PRV-02 se acota a solo el cruce territorial sin filtro de función. | — | P0 | S | ✅ Hecho — `funcion` es hallazgo negativo real (ningún valor de GRD en 28 valores nacionales); filtro por `nombre` (keywords) sí funciona |
| PRV-02 | Endpoint `GET /api/crossref/preparacion-riesgo` en `emergencias-indeci` | Recibe `departamento` (default LA LIBERTAD — único departamento con datos completos de las 3 fuentes en el snapshot local; Lambayeque/Piura requieren `ingest:invierte` para esos deptos primero, fuera de alcance); agrega emergencias INDECI filtradas por los `peligro` de PRV-01, por distrito; se cambió de HTTP (crossref de `infobras`) a lectura directa de las dos bases externas (`inversionesPool`/`infobrasPool`, mismo patrón que `infracciones-ambientales`) porque el endpoint HTTP existente de `infobras` no expone `distrito`, necesario para el anclaje territorial. Responde por distrito: historial de emergencias + proyectos de prevención asociados con su estado de ejecución en INFOBRAS, o `sinProyectosPrevencion: true`. Metadata `matcher`, `exhaustivo: false`, `restriccion` explícita. 6 tests (config ausente, con/sin emergencias × con/sin proyecto, fallo en vivo de radar-inversiones, filtro `peligros` custom). | PRV-01 | P0 | M | ✅ Hecho — verificado en vivo contra LA LIBERTAD real |
| PRV-03 | Tool MCP + docs | Registrar tool en `mcp-server/src/catalog.ts`; actualizar `docs/conectores.md` y `docs/ESTADO.md`; `npm test` verde en `emergencias-indeci` y `mcp-server`. | PRV-02 | P1 | S | ✅ Hecho |

**Puerta de salida:** `GET /api/crossref/preparacion-riesgo?departamento=LA%20LIBERTAD` responde con
al menos un distrito con historial de emergencias y su estado de obras/inversiones de prevención
(presente o explícitamente ausente); ningún resultado afirma causalidad. **Cumplida** — verificado en
vivo 2026-09-21: 9 de los 10 distritos con más emergencias de La Libertad no tienen ningún proyecto
de prevención en el pipeline de Invierte.pe; el proyecto de defensa ribereña del río Chicama (CUI
2133624) está paralizado con 64.83% de avance físico real.

## Hallazgo real adicional (no buscado)

El distrito `- TODOS -` aparece como valor de `distrito` en `investments` para inversiones
multi-distrito (ej. CUI 2133624, que cubre varios distritos del río Chicama) — no calza con ningún
distrito real de INDECI, así que ese proyecto nunca se asocia a un distrito específico en la
respuesta aunque sí aparece en el listado general. Documentado, no corregido (dato de origen, no
bug del conector).

## Fuera de alcance (explícito)

| Ítem | Motivo |
|---|---|
| Modelo predictivo de riesgo futuro | Fuera del criterio "solo datos verificables" del catálogo |
| Cruce con `ceplan-geo` red hídrica completa | Capa pospuesta (`cb_redhidricax`, ver spike CG-25) |
| Regiones fuera de las 3 costeras / Fase 2 | Decisión de alcance pendiente, ver PRV-02 |
| Estimación de costo de daño evitable | Requeriría supuestos no verificables, no se hace |
