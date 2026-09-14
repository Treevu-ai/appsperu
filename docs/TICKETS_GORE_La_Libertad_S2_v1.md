# Tickets — GORE La Libertad · Sprint 2 (rutas web PV)

**Producto:** Rastro / Follow the Sol
**Sprint:** S2 · **28 sep – 11 oct 2026** (2 semanas)
**Plan:** [`docs/TICKETS_GORE_La_Libertad_S2_v1.md`](TICKETS_GORE_La_Libertad_S2_v1.md) (este documento)
**PRDs ancla:** [`PRD_Propuesta_Valor_Bajo_Esfuerzo_v1.md`](PRD_Propuesta_Valor_Bajo_Esfuerzo_v1.md) (backend PV-01..06, ya implementado) · [`PRD_Seguimiento_Sectores_y_GORE_La_Libertad_v1.md`](PRD_Seguimiento_Sectores_y_GORE_La_Libertad_v1.md) · [`TICKETS_GORE_La_Libertad_S1_v1.md`](TICKETS_GORE_La_Libertad_S1_v1.md) §"Fuera de alcance S1"
**Serie de tickets:** **GORE-** (continúa la numeración de S1, prefijo S2 en el título)
**Regla transversal:** API-only por debajo (sin backend nuevo — S2 es 100% consumo del backend PV ya implementado y probado en vivo); vacío de evidencia, no conclusión; cada número con `NumberWithMetadata`; sin backend nuevo.
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días

---

## Por qué S2 existe (contexto verificado 2026-09-13)

El PRD de Propuesta de Valor de Bajo Esfuerzo (PV-01 a PV-06) quedó **implementado y verificado en vivo contra la API real** durante la semana del 12–13 sep, pero **ningún endpoint nuevo tiene ruta web**. Hoy solo se consultan por API directa o por MCP:

| Backend PV ya implementado | Capacidad | Consumo actual |
|---|---|---|
| `GET /sectors/:sectorId/ficha?ambito=NACIONAL` (PV-01, radar-ejecucion) | Presupuesto de un sector a nivel nacional, sin acotar a departamento | Solo API/MCP |
| `GET /public-works?sectorEntidad=X&diasParalizadoMin=N&orderBy=...` (PV-03/04, infobras) | Ranking de obras paralizadas, nacional o por sector | Solo API/MCP — **1,319 obras** a nivel nacional +180 días (cifra verificada 2026-09-12) |
| `GET /crossref?departamento=TODOS&soloNuevos=true` (PV-05/06, proveedores-sancionados) | Sancionados con inhabilitación vigente, nacional, solo casos nuevos desde la última corrida | Solo API/MCP — 346 adjudicaciones nacionales verificadas |

`apps/rastro-web/src/lib/api-client.ts` confirma la brecha: `getRadarEjecucionSectorFicha` no acepta `ambito`; `getInfobrasPublicWorks` no acepta `sectorEntidad`/`diasParalizadoMin`/`orderBy`; no existe ninguna función cliente para `GET /crossref` de `proveedores-sancionados`. `App.tsx` no tiene rutas `/sector/:id` ni `/obras-paralizadas`.

**S2 es estrictamente capa de consumo**: alinear tipos del cliente HTTP, agregar 2 rutas nuevas y extender fixtures E2E. Ningún endpoint backend nuevo.

---

## Estado al inicio de S2 (auditoría 2026-09-13)

| Área | Hecho (S1) | Brecha (para S2) |
|---|---|---|
| Ficha GORE La Libertad | `/gore/la-libertad/ficha` con inversión/obras/contrataciones + señales INFOBRAS | Modo `ambito=NACIONAL` no expuesto en ninguna ruta web (deliberadamente fuera de alcance en GORE, que es regional por diseño) |
| Ranking de obras paralizadas | Endpoint `GET /public-works` con filtros PV-03/04 | Sin ruta web — hoy solo verificable con curl/MCP |
| Sancionados nuevos | Endpoint `GET /crossref?soloNuevos=true` con estado persistido | Sin ruta web ni componente de "casos nuevos desde la última corrida" |
| `api-client.ts` | Funciones para ficha regional, `public-works` básico (departamento/estado/conParalizacion), `crossref/ejecucion` | Sin parámetros PV en las funciones existentes; sin función para `proveedores-sancionados` crossref |

---

## Definition of Done — Sprint 2

Al cierre del 11 oct, **todas** estas condiciones deben cumplirse:

1. `/sector/:id` (ámbito nacional, sin filtro de departamento) muestra presupuesto agregado de un sector con `cobertura.estado = "NO_VERIFICADA"` declarado explícitamente en la UI (no inventar un badge de cobertura que el backend no da).
2. `/obras-paralizadas` muestra el ranking nacional de obras paralizadas +180 días con los mismos filtros/orden que expone la API (`sectorEntidad`, `diasParalizadoMin`, `orderBy`), con paginación en el cliente si el volumen (~1,319 filas) lo amerita — sin pedirle paginación al backend (PV-04 la difiere explícitamente).
3. Un bloque de "sancionados nuevos" (nacional, `soloNuevos=true`) es visible desde `/obras-paralizadas` o una ruta hermana — a decidir en GORE-06 según cuál pantalla tenga más sentido de producto.
4. `api-client.ts` expone los 3 parámetros PV en las 3 funciones correspondientes, con tipos alineados a la respuesta real (no inventados).
5. CI de `rastro-web`: E2E verde en las 2 rutas nuevas (fixtures, sin depender de APIs live).
6. `docs/ESTADO.md` registra el cierre de S2 con evidencia (PRs, capturas o smoke).

---

## ÉPICA 1 — Ámbito nacional en la ficha sectorial (GORE-05)

### GORE-05a · Parámetro `ambito` en `api-client.ts` y tipos de cobertura

- **Historia:** Como mantenedor de `rastro-web`, quiero que el cliente HTTP pueda pedir la ficha de un sector sin acotar a La Libertad, para poder construir una vista nacional sin tocar el backend.
- **Contexto verificado:** `apps/radar-ejecucion/api/src/routes/sectors.ts` acepta `?ambito=NACIONAL` en `BaseQuery` (comparte función con `/comparativo` y `/movimiento-presupuestal`); en modo nacional, `cobertura.estado` queda explícitamente `"NO_VERIFICADA"` porque los snapshots de cobertura territorial son por departamento. `getRadarEjecucionSectorFicha` (`api-client.ts:262-270`) hoy solo pasa `anio`/`departamento`.
- **Criterios de aceptación:**
  - `getRadarEjecucionSectorFicha` acepta `ambito?: "NACIONAL" | "REGIONAL"` y lo pasa como query param.
  - `SectorFichaResponse` (o el tipo que GORE-01a dejó alineado) declara `cobertura.estado` incluyendo el valor `"NO_VERIFICADA"` — no solo los estados regionales previos.
  - Test unitario: llamar sin `ambito` sigue comportándose igual que hoy (regresión cero para `/gore/la-libertad/ficha`).
- **Archivos:** `apps/rastro-web/src/lib/api-client.ts`, tipos en `src/lib/sector-ficha.ts` (o donde GORE-01a los dejó).
- **Dependencias:** ninguna (S1 ya dejó el tipo base alineado).
- **Prioridad:** P0 · **Esfuerzo:** XS

### GORE-05b · Ruta `/sector/:id` (ficha nacional, sin selector de departamento)

- **Historia:** Como analista o periodista, quiero ver el presupuesto de un sector completo del país (ej. Producción, Salud) sin tener que elegir un departamento, para responder "¿cuánto se ejecutó en este sector a nivel nacional?".
- **Criterios de aceptación:**
  - Nueva ruta `sector/:sectorId` en `App.tsx`, componente `Sector.tsx` (fuera de `gore/`, ya que no es específico de La Libertad).
  - Llama `getRadarEjecucionSectorFicha({ sectorId, ambito: "NACIONAL" })` — **sin** `departamento`.
  - Renderiza los mismos bloques que `LaLibertadFicha.tsx` (inversión/obras/contrataciones) reutilizando `SectorFichaSections.tsx` de S1 si el shape lo permite; si el nacional trae volumen mucho mayor (ej. `entidades[]` con cientos de filas), agregar paginación de cliente simple (mismo patrón ya usado en `radar_inversiones_investments_desactivadas`: `limit`/`offset`, no un corte silencioso).
  - Bloque de cobertura muestra literalmente `"Cobertura territorial: NO_VERIFICADA (agregado nacional, sin corte por departamento)"` — no un badge verde/rojo que el backend no respalda.
  - 404 con mensaje explícito si el `sectorId` no está en `sector_entity_registry` (mismo comportamiento documentado en S1 para el modo regional).
- **Archivos:** `apps/rastro-web/src/App.tsx`, nuevo `apps/rastro-web/src/routes/Sector.tsx`, posible reuso de `SectorFichaSections.tsx`.
- **Dependencias:** GORE-05a.
- **Prioridad:** P0 · **Esfuerzo:** M

---

## ÉPICA 2 — Ranking nacional de obras paralizadas (GORE-06)

### GORE-06a · Parámetros PV-03/04 en `getInfobrasPublicWorks`

- **Historia:** Como mantenedor de `rastro-web`, quiero que el cliente HTTP soporte los filtros de paralización y orden que ya expone la API, para no reimplementar filtrado en el cliente.
- **Contexto verificado:** `apps/infobras/api/src/routes/public-works.ts` acepta `sectorEntidad`, `diasParalizadoMin` (requiere `conParalizacion=true`, responde 400 si no) y `orderBy` (`nombre_asc` default, `diasParalizado_desc`, `montoViable_desc`). `getInfobrasPublicWorks` (`api-client.ts:411`) hoy solo pasa `departamento`/`estado`/`conParalizacion`.
- **Criterios de aceptación:**
  - Firma extendida: `{ departamento?, estado?, conParalizacion?, sectorEntidad?, diasParalizadoMin?, orderBy? }`.
  - Si el caller pasa `diasParalizadoMin` sin `conParalizacion: true`, el cliente lo previene en tiempo de desarrollo (tipo o validación local) en vez de dejar que el backend responda 400 en producción — documentar la regla igual que la API.
  - Test unitario de construcción de query string con los 3 params nuevos combinados.
- **Archivos:** `apps/rastro-web/src/lib/api-client.ts`.
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** XS

### GORE-06b · Ruta `/obras-paralizadas` (ranking nacional, sin filtro de sector por defecto)

- **Historia:** Como periodista o veedor ciudadano, quiero ver el ranking nacional de obras paralizadas ordenado por días de paralización, para identificar los casos más graves sin tener que pedir el dato por API.
- **Contexto verificado:** sin `sectorEntidad`, el mismo endpoint es el ranking nacional — cero código de backend adicional (así se implementó PV-04). Cifra de referencia (2026-09-12): 1,319 obras +180 días a nivel nacional, por encima del umbral de ~500 filas que el ticket original usaba para decidir si paginar.
- **Criterios de aceptación:**
  - Nueva ruta `obras-paralizadas` en `App.tsx`, componente `ObrasParalizadas.tsx`.
  - Filtros visibles: `sectorEntidad` (select, opcional), `diasParalizadoMin` (input numérico, fuerza `conParalizacion=true` en la llamada), `orderBy` (default `diasParalizado_desc` en esta vista — a diferencia del default de la API que es `nombre_asc`, porque el caso de uso aquí es "los más graves primero").
  - Tabla con nombre de obra, entidad/sector, días paralizado, monto viable, `costDriftPct` cuando exista (mismo patrón `NumberWithMetadata` que `Distrito.tsx`).
  - Paginación de cliente (el volumen ~1,319 filas no es viable sin ella) — **no** pedir paginación al backend; documentar en el PR que esto es deliberado (PV-04 la difirió explícitamente, backend sin cambios).
  - Sin resultados con los filtros elegidos → mensaje literal, no tabla vacía silenciosa.
- **Archivos:** `apps/rastro-web/src/App.tsx`, nuevo `apps/rastro-web/src/routes/ObrasParalizadas.tsx`.
- **Dependencias:** GORE-06a.
- **Prioridad:** P0 · **Esfuerzo:** M

### GORE-06c · Bloque "sancionados nuevos" (PV-05/06) en la misma vista

- **Historia:** Como analista, quiero ver qué proveedores con inhabilitación vigente son nuevos desde la última corrida, sin correr un script aparte.
- **Contexto verificado:** `GET /crossref?departamento=TODOS&soloInhabilitados=true&soloNuevos=true` (proveedores-sancionados) devuelve, a nivel nacional, solo los casos marcados `esNuevoDesdeUltimaCorrida`. No hay función cliente hoy para este endpoint.
- **Criterios de aceptación:**
  - Nueva función `getProveedoresSancionadosCrossref` en `api-client.ts` (`departamento`, `soloInhabilitados`, `soloNuevos`).
  - Bloque en `ObrasParalizadas.tsx` (o pestaña/sección separada si el layout se satura — decisión de implementación, no de producto) con la lista de sancionados nuevos, RUC enmascarado igual que en el resto de la app.
  - Texto explícito de qué significa "nuevo": *"detectado por primera vez en esta corrida — no implica que la sanción sea reciente"* (evitar que se lea como "sancionado ayer").
  - Este bloque **no** envía notificaciones (correo/Slack) — es solo lectura, tal como documentó PV-06. No agregar infraestructura de notificación en este ticket.
- **Archivos:** `apps/rastro-web/src/lib/api-client.ts`, `apps/rastro-web/src/routes/ObrasParalizadas.tsx` (o ruta hermana a decidir).
- **Dependencias:** GORE-06b (comparte pantalla, no bloqueante si se decide separar).
- **Prioridad:** P1 · **Esfuerzo:** S

---

## ÉPICA 3 — E2E de las rutas nuevas (GORE-07)

### GORE-07a · E2E ficha nacional de sector

- **Criterios de aceptación:**
  - Fixture `e2e/fixtures/sector-nacional.json` con `cobertura.estado: "NO_VERIFICADA"`.
  - Spec `e2e/sector-nacional.spec.ts`: intercept `**/radar-ejecucion/api/sectores/*/ficha**` con `ambito=NACIONAL`, verifica que el texto de cobertura no verificada es visible.
- **Dependencias:** GORE-05b.
- **Prioridad:** P0 · **Esfuerzo:** XS

### GORE-07b · E2E ranking de obras paralizadas + sancionados nuevos

- **Criterios de aceptación:**
  - Fixture `e2e/fixtures/obras-paralizadas.json` (≥2 obras, orden por días descendente) y `sancionados-nuevos.json`.
  - Spec `e2e/obras-paralizadas.spec.ts`: verifica orden de la tabla, filtro `sectorEntidad` cambia el request interceptado, bloque de sancionados nuevos visible.
- **Dependencias:** GORE-06b, GORE-06c.
- **Prioridad:** P0 · **Esfuerzo:** S

### GORE-07c · Smoke manual S2 (checklist)

- **Entregable:** sección nueva en `docs/validacion-smoke-rastro-web-v1.md`:
  - [ ] `/sector/PRODUCCION` — cobertura `NO_VERIFICADA` visible, cifras coinciden con las verificadas en vivo el 2026-09-12 (`pim: 208104679`)
  - [ ] `/obras-paralizadas` sin filtros — orden y conteo coherentes con la cifra de referencia (1,319, sujeta a variación por corte más reciente)
  - [ ] `/obras-paralizadas?sectorEntidad=...` — filtro reduce el conteo
  - [ ] Bloque sancionados nuevos visible con al menos un caso o mensaje de "sin casos nuevos"
- **Prioridad:** P1 · **Esfuerzo:** XS · **Owner:** QA manual post-merge GORE-06c

---

## Secuencia recomendada (2 semanas)

```text
Semana 1 (28 sep – 4 oct)
  GORE-05a ──► GORE-05b
  GORE-06a ──► GORE-06b (paralelo a GORE-05, sin dependencia cruzada)

Semana 2 (5–11 oct)
  GORE-06c
  GORE-07a + GORE-07b
  GORE-07c smoke
  ESTADO.md — cierre S2
```

| Día | Entregable visible |
|---|---|
| Lun 29 sep | PR GORE-05a (parámetro `ambito`) |
| Mié 1 oct | PR GORE-05b (ruta `/sector/:id`) |
| Vie 3 oct | PR GORE-06a + GORE-06b (ranking obras paralizadas) |
| Lun 6 oct | PR GORE-06c (sancionados nuevos) |
| Jue 9 oct | PR GORE-07a + GORE-07b (E2E) |
| Vie 11 oct | S2 cerrado en ESTADO.md |

---

## Fuera de alcance S2 (explícito)

- Cualquier endpoint backend nuevo — S2 es 100% consumo de PV-01..06, ya implementado.
- Automatización de ingestas → sigue en **S4** (sin cambios respecto a S1).
- CX-01 minor_contracts → sigue en **S3**.
- Canal de notificación (correo/Slack/webhook) para sancionados nuevos — decisión de producto aparte, no de infraestructura de este sprint (mismo criterio que PV-06).
- Paginación real en el backend de `/public-works` — PV-04 la difirió; S2 solo pagina en cliente.
- `ambito=NACIONAL` dentro de las rutas `/gore/la-libertad/*` — esas siguen siendo estrictamente regionales por diseño del PRD Capa Lectura; el nacional vive en la ruta nueva `/sector/:id`, sin mezclar ambos modos en la misma pantalla.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Volumen de `/obras-paralizadas` (~1,319 filas) sin paginación de backend | Paginación de cliente desde el primer PR, no como afterthought |
| `SectorFichaSections.tsx` de S1 asume shape regional y no tolera `cobertura.estado = "NO_VERIFICADA"` | Verificar en GORE-05b antes de reusar; si no encaja, componente propio en vez de forzar el reuso |
| Confusión "nuevo" (recién detectado) vs. "reciente" (sanción de ayer) en GORE-06c | Texto explícito en la UI, mismo criterio que documentó PV-05/06 |
| Cifra de referencia (1,319 obras, 346 adjudicaciones) puede variar por corte más reciente al momento del QA | Smoke checklist pide "coherente con", no un número exacto fijo |

---

## Referencias de código

| Recurso | Ruta |
|---|---|
| API ficha sectorial (con `ambito`) | `apps/radar-ejecucion/api/src/routes/sectors.ts` |
| API ranking obras paralizadas | `apps/infobras/api/src/routes/public-works.ts` |
| API sancionados + `soloNuevos` | `apps/proveedores-sancionados/api/src/routes/crossref.ts` |
| Cliente HTTP (funciones a extender) | `apps/rastro-web/src/lib/api-client.ts` |
| Patrón ficha sectorial (S1) | `apps/rastro-web/src/routes/gore/LaLibertadFicha.tsx`, `SectorFichaSections.tsx` |
| Patrón obra + señales (badges, `NumberWithMetadata`) | `apps/rastro-web/src/routes/Distrito.tsx` |
| Rutas actuales | `apps/rastro-web/src/App.tsx` |
| Ticket S1 (fuente del alcance diferido) | `docs/TICKETS_GORE_La_Libertad_S1_v1.md` §"Fuera de alcance S1" |
