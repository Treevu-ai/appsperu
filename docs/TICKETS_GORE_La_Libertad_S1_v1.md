# Tickets — GORE La Libertad · Sprint 1 (aterrizaje)

**Producto:** Rastro / Follow the Sol  
**Sprint:** S1 · **13–27 sep 2026**  
**Plan:** [`docs/TICKETS_GORE_La_Libertad_S1_v1.md`](TICKETS_GORE_La_Libertad_S1_v1.md) (este documento) · canvas Q4 en `.cursor/projects/.../plan-producto-rastro-90d.canvas.tsx`  
**PRDs ancla:** [`PRD_Rastro_Capa_Lectura_No_Tecnicos_v1.md`](PRD_Rastro_Capa_Lectura_No_Tecnicos_v1.md) · [`PRD_Seguimiento_Sectores_y_GORE_La_Libertad_v1.md`](PRD_Seguimiento_Sectores_y_GORE_La_Libertad_v1.md) · [`ABOUT_RASTRO.md`](ABOUT_RASTRO.md) §12.1  
**Serie de tickets:** **GORE-** (GORE La Libertad — cierre de tableros web)  
**Regla transversal:** API-only por debajo; vacío de evidencia, no conclusión; cada número con `WithMetadata`; sin backend nuevo salvo extensión mínima de campos ya ingeridos en `worksForCuis`.  
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días  

---

## Estado al inicio de S1 (auditoría 2026-09-13)

| Área | Hecho | Brecha |
|---|---|---|
| Rutas GORE | `/gore/la-libertad/{ficha,comparativo,benchmark}` navegables | Ficha muestra solo PIA/PIM/devengado agregados |
| API `GET /api/sectores/:id/ficha` | Devuelve `entidades`, `inversiones`, `obras`, `contrataciones`, `limitation` | UI no consume ese shape |
| `SectorFichaResponse` (`api-client.ts`) | Tipado simplificado para fixtures E2E | **No coincide** con la respuesta real del backend |
| Señales INFOBRAS | Cost Drift + gap en `/distrito/:ubigeo` | **Ausentes** en ficha GORE; `worksForCuis` no trae `dias_paralizado`, montos ni señales derivadas |
| Frescura | `DataFreshnessBar` global (MEF / snapshot) | GORE no declara frescura de INFOBRAS/compras al mostrar cruces |
| E2E | `e2e/ficha-sector.spec.ts` (5 sectores) | Sin specs de comparativo ni benchmark |
| Docs institucionales | `ABOUT_RASTRO.md` (rev. 2026-09-03) | Dice 14 apps / 83 tools; repo en 27 / ~146 |

**Dependencia de datos ya resuelta:** `sector_entity_registry` poblado (`npm run sectors:seed`, PV-01, 2026-09-12). Un 404 en ficha sigue siendo, casi siempre, sector ausente del seed — no un bug de UI.

---

## Definition of Done — Sprint 1

Al cierre del 27 sep, **todas** estas condiciones deben cumplirse:

1. `/gore/la-libertad/ficha` muestra presupuesto **y** bloques de inversión / obras / contrataciones con estados de vínculo explícitos.
2. Obras vinculadas por CUI muestran paralización y, cuando hay datos, gap físico-financiero y Cost Drift (o declaración de vacío).
3. Layout GORE muestra frescura de las fuentes que alimentan la ficha (MEF + INFOBRAS como mínimo).
4. `ABOUT_RASTRO.md` refleja el estado real del repo (apps, tools MCP, roadmap GORE).
5. CI de `rastro-web`: E2E verde en ficha + comparativo + benchmark (fixtures, sin depender de APIs live).
6. `docs/ESTADO.md` registra el cierre de S1 con evidencia (PRs, capturas o smoke).

---

## ÉPICA 1 — Ficha sectorial completa (GORE-01)

### GORE-01a · Alinear contrato TypeScript con `GET /sectors/:sectorId/ficha` ✅ Implementado (2026-09-13)

- **Historia:** Como mantenedor de `rastro-web`, quiero que el cliente HTTP refleje la respuesta real del backend, para dejar de mapear un shape inventado que oculta `obras` e `inversiones`.
- **Contexto verificado:** `apps/radar-ejecucion/api/src/routes/sectors.ts:215-224` devuelve `{ sector, anio, departamento, entidades[], inversiones{}, obras{}, contrataciones{}, advertenciaGasto, limitation }`. `apps/rastro-web/src/lib/api-client.ts:170-180` declara un `SectorFichaResponse` plano (`sectorId`, `pia`, `pim`…) que **no existe** en la API.
- **Criterios de aceptación:**
  - Nuevo tipo `SectorFichaResponse` alineado al JSON real (incluye `entidades`, `inversiones.estado`, `obras.estado`, `contrataciones.estado`, textos `limitation` / `advertenciaGasto`).
  - Helper `aggregateSectorBudget(entidades)` suma PIA/PIM/devengado **sin** mezclar reglas `META_DEPARTAMENTO` y `SEDE_EJECUTORA` en un solo total sin etiqueta — reutilizar copy existente de reglas territoriales.
  - `getRadarEjecucionSectorFicha` sigue pasando `departamento=LA LIBERTAD` (modo regional GORE; no usar `ambito=NACIONAL` en esta vista).
  - Tests unitarios del helper de agregación (mínimo: una entidad GN + una GR no se suman como si fueran duplicados).
- **Archivos:** `apps/rastro-web/src/lib/api-client.ts`, nuevo `apps/rastro-web/src/lib/sector-ficha.ts` (o equivalente), tests en `src/lib/__tests__/`.
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** S

### GORE-01b · Renderizar inversión, obras y contrataciones en `/gore/la-libertad/ficha` ✅ Implementado (2026-09-13)

- **Historia:** Como especialista del GORE, quiero ver en la ficha no solo el presupuesto sino qué CUI, obras y contratos están **vinculados oficialmente**, y dónde hay vacío.
- **Criterios de aceptación:**
  - Sección **Inversiones (CUI):** tabla o lista con `cui`, actividad, `entityCode`, badge `inversiones.estado` (`VINCULO_OFICIAL` / `SIN_VINCULO_OFICIAL`). Si `resultados` vacío, texto literal del `limitation` de la API — no celda vacía silenciosa.
  - Sección **Obras (INFOBRAS vía CUI):** lista con nombre, CUI, avance físico/financiero, badge paralización (`existeParalizacion`). Si `obras.estado` es `SIN_CUI_CON_VINCULO_OFICIAL` o `INFOBRAS_NO_CONFIGURADO`, callout explícito.
  - Sección **Contrataciones:** primeras N filas (ej. 10) con objeto, monto, entidad compradora; estado `IDENTIDAD_MEF_COMPRAS_VERIFICADA` vs vacíos documentados.
  - Bloque **Advertencia** con `advertenciaGasto` y `limitation` textuales.
  - Todos los montos vía `<NumberWithMetadata>`; `npm run lint:meta` en verde.
  - Actualizar `e2e/fixtures/sectores.json` al shape real (o fixture dedicado `ficha-completa.json`) y ajustar `e2e/ficha-sector.spec.ts`.
- **Archivos:** `apps/rastro-web/src/routes/gore/LaLibertadFicha.tsx`, fixtures E2E, posible componente `SectorFichaSections.tsx`.
- **Dependencias:** GORE-01a.
- **Prioridad:** P0 · **Esfuerzo:** M

### GORE-01c · Señales INFOBRAS en ficha (paralización, días, Cost Drift, gap) ✅ Implementado (2026-09-13)

- **Historia:** Como gestor del GORE, quiero ver en la ficha las mismas señales de riesgo de obra que ya existen en la vista de distrito, sin abrir otra ruta.
- **Contexto:** `worksForCuis` (`sectors.ts:110-124`) no selecciona `dias_paralizado`, `monto_viable`, `costo_actualizado`. Cost Drift y gap se calculan en `infobras` (`withSignals` en `public-works.ts:49-82`) pero no llegan al cruce sectorial.
- **Opción acordada (mínimo diff):** extender el SELECT de `worksForCuis` con `dias_paralizado`, `monto_viable`, `costo_actualizado`, `fecha_paralizacion`; calcular `costDriftPct` y `gapFisicoFinanciero` reutilizando `apps/infobras/api/src/signals/signals.ts` **importado desde radar-ejecucion** solo si no crea dependencia circular — alternativa aceptable: duplicar las dos funciones puras (5 líneas) en `sectors.ts` con comentario de paridad.
- **Criterios de aceptación:**
  - Cada obra en ficha muestra: `diasParalizado` (si paralizada), `costDriftPct`, `gapFisicoFinanciero` cuando inputs no son null; si falta input, `"—"` + tooltip de vacío (no inferir 0).
  - Resumen arriba de la tabla de obras: conteo de obras paralizadas y conteo con gap | físico − financiero | > umbral (mismo umbral que `/distrito`, documentado en PR).
  - Test backend en `sectors.test.ts`: mock de `infobrasPool` devuelve fila con paralización y señales calculadas.
  - Test E2E: fixture con 1 obra paralizada + gap; texto visible en HTML.
- **Archivos:** `apps/radar-ejecucion/api/src/routes/sectors.ts`, `apps/rastro-web/src/routes/gore/LaLibertadFicha.tsx`, tests.
- **Dependencias:** GORE-01b.
- **Prioridad:** P0 · **Esfuerzo:** M

---

## ÉPICA 2 — Frescura visible en el lector GORE (GORE-02)

### GORE-02 · Barra de frescura multi-fuente en `LaLibertadLayout` ✅ Implementado (2026-09-13)

- **Historia:** Como visitante del GORE, quiero saber si los cruces presupuesto–obra–compra usan datos recientes, no solo la última corrida MEF del header global.
- **Contexto:** `DataFreshnessBar` (`Layout.tsx:141`) consulta solo `radar_ejecucion_meta_sources`. La ficha GORE también depende de INFOBRAS (vía pool externo) y potencialmente compras.
- **Criterios de aceptación:**
  - Componente `GoreFreshnessStrip` en `LaLibertadLayout.tsx` bajo el subtítulo, **debajo** del header global (no duplicar MEF si es redundante — mostrar INFOBRAS + compras como mínimo).
  - En producción (snapshot): leer `snapshot.json` / metadata embebida si existe corte por app; si no, texto `"Snapshot semanal · corte: {fecha}"` coherente con `DataFreshnessBar`.
  - En modo live (`VITE_PUBLIC_APIS_LIVE=true`): paralelo a `getInfobrasMetaSources` + `getComprasPublicasMetaSources` (añadir funciones en `api-client.ts` si faltan).
  - Colores ámbar/rojo con la misma regla >7d / >30d que `DataFreshnessBar`.
  - Clic abre modal con lotes (mismo patrón que AL3-03).
- **Archivos:** `LaLibertadLayout.tsx`, `GoreFreshnessStrip.tsx`, `api-client.ts`.
- **Dependencias:** ninguna (paralelo a GORE-01).
- **Prioridad:** P1 · **Esfuerzo:** S

---

## ÉPICA 3 — Documentación institucional (GORE-03)

### GORE-03 · Actualizar `ABOUT_RASTRO.md` al estado sep 2026 ✅ Implementado (2026-09-13)

- **Historia:** Como aliado o financiador, quiero un documento institucional que no contradiga el README ni el catálogo MCP.
- **Criterios de aceptación:**
  - §1 y §3: **27 apps backend**, capa web, **~146 tools MCP** (meta-tools aparte).
  - §4 catálogo: distinguir **14 dashboards en rastro.fyi** vs **13 dominios solo API/MCP** (tabla resumen, no listar las 27 enteras si es demasiado — enlace a README).
  - §7 rutas web: listar rutas actuales de `App.tsx` incluyendo `/auditoria/entidades-infobras`, `/catalogo`, `/buscar`.
  - §12.1 roadmap Q4: marcar S1 GORE como en curso; mover ítems ya hechos (PV backend) a "completado".
  - §8 MCP: corregir "83 tools" → número verificado desde `mcp-server/src/catalog.ts` o `mcp-tools-catalog.json` generado.
  - Fecha de revisión: **2026-09-13** (o fecha del merge).
  - Verificación: grep en el doc no encuentra "83 tools" ni "14 apps" como total del monorepo sin calificador.
- **Archivos:** `docs/ABOUT_RASTRO.md` (solo docs; opcional párrafo en `README.md` si hay drift restante).
- **Dependencias:** ninguna.
- **Prioridad:** P1 · **Esfuerzo:** XS

---

## ÉPICA 4 — E2E y smoke GORE (GORE-04)

### GORE-04a · E2E comparativo de sectores ✅ Implementado (2026-09-13)

- **Historia:** Como CI, quiero que una regresión en `/gore/la-libertad/comparativo` rompa el build antes del deploy.
- **Criterios de aceptación:**
  - Fixture `e2e/fixtures/comparativo.json` con 2 sectores, `limitation` textual.
  - Spec `e2e/comparativo-sectores.spec.ts`: intercept `**/radar-ejecucion/api/sectores/comparativo**`, verificar PIM/devengado y badge de cobertura por fila.
  - Incluido en `rastro-web-ci.yml` (ya corre `npm run e2e` — solo agregar archivo).
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** XS

### GORE-04b · E2E benchmark de entidad ✅ Implementado (2026-09-13)

- **Criterios de aceptación:**
  - Fixtures `benchmark-ok.json` y `benchmark-insuficiente.json`.
  - Spec `e2e/benchmark-entidad.spec.ts`: percentil visible en caso ok; mensaje/`datos_insuficientes` en caso 422 o status del API.
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** XS

### GORE-04c · Smoke manual GORE (checklist) ✅ Implementado (2026-09-13)

- **Entregable:** sección nueva en `docs/validacion-smoke-rastro-web-v1.md` o checklist en este ticket:
  - [ ] 5 sectores en ficha (fixture o live)
  - [ ] Comparativo 2 sectores
  - [ ] Benchmark entidad 831
  - [ ] Frescura visible en layout GORE
  - [ ] Captura PNG archivada en `docs/smoke-rastro-web/` (opcional si ya existe manifest)
- **Prioridad:** P1 · **Esfuerzo:** XS · **Owner:** QA manual post-merge GORE-01c

---

## Secuencia recomendada (2 semanas)

```text
Semana 1 (13–20 sep)
  GORE-01a ──► GORE-01b ──► GORE-01c (backend + UI señales)
  GORE-02 (paralelo desde día 2)
  GORE-04a + GORE-04b (paralelo, fixtures al nuevo shape)

Semana 2 (21–27 sep)
  Cierre GORE-01c + GORE-02
  GORE-03
  GORE-04c smoke
  ESTADO.md + demo grabable GORE (5 consultas sin terminal)
```

| Día | Entregable visible |
|---|---|
| Lun 15 | PR GORE-01a (tipos + helper) |
| Mié 17 | PR GORE-01b (secciones ficha) |
| Vie 19 | PR GORE-01c (señales INFOBRAS) |
| Lun 22 | PR GORE-02 + GORE-04a/b |
| Jue 25 | PR GORE-03 |
| Vie 27 | S1 cerrado en ESTADO.md |

---

## Fuera de alcance S1 (explícito)

- Rutas web PV (`/sector/:id`, `/obras-paralizadas`) → **S2**
- Automatización de ingestas → **S4**
- CX-01 minor_contracts → **S3**
- `ambito=NACIONAL` en UI GORE (La Libertad es regional por diseño del PRD Capa Lectura)
- Paginación del ranking nacional de paralizadas (PV-04 diferido)

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Snapshot semanal sin campos nuevos de ficha | Regenerar snapshot en el PR de GORE-01b o documentar que prod muestra vacío hasta próximo cron miércoles |
| Extender `worksForCuis` acopla radar-ejecucion a lógica infobras | Funciones puras duplicadas con test de paridad, no import de app completa |
| Fixtures E2E desincronizados del API | Un solo fixture `ficha-completa.json` como fuente de verdad |
| GORE-01c excede 1 semana | Entregar GORE-01b como MMP; 01c al día 1 de S2 con prioridad P0 mantenida |

---

## Referencias de código

| Recurso | Ruta |
|---|---|
| API ficha sectorial | `apps/radar-ejecucion/api/src/routes/sectors.ts` |
| UI ficha | `apps/rastro-web/src/routes/gore/LaLibertadFicha.tsx` |
| Señales INFOBRAS | `apps/infobras/api/src/signals/signals.ts` |
| Patrón distrito (obras + señales) | `apps/rastro-web/src/routes/Distrito.tsx` |
| E2E ficha existente | `apps/rastro-web/e2e/ficha-sector.spec.ts` |
| Roadmap GORE pendiente | `docs/ABOUT_RASTRO.md` §12.1 |
