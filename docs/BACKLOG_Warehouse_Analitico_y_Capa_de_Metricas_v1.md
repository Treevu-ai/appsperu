# Backlog ejecutable — Warehouse Analítico y Capa de Métricas v1

**Producto:** AppsPerú + CLI Market (capa analítica transversal)
**PRD:** [`docs/PRD_Warehouse_Analitico_y_Capa_de_Metricas_v1.md`](PRD_Warehouse_Analitico_y_Capa_de_Metricas_v1.md)
**Tickets:** [`docs/TICKETS_Warehouse_Analitico_y_Capa_de_Metricas_v1.md`](TICKETS_Warehouse_Analitico_y_Capa_de_Metricas_v1.md)
**Alcance:** tablas canónicas de las apps del mapa de cruces (`budget_execution`, `awards`, `minor_contracts`, obras INFOBRAS, Invierte) + `price_snapshots` de cli-market; ubicación del warehouse a decidir en WH-01.
**Reglas transversales (del PRD §7):**
- Todo mart es reproducible desde la zona cruda con un comando; si no es reproducible, no es un mart.
- Nada se escribe en las bases de las apps (solo lectura; sin DBs expuestas, coherente con ADR-0016).
- Toda cobertura se declara: parcial nunca se presenta como completa; cada mart lleva su manifiesto de extracción.
- Test de cuadre rojo = mart no publicado.
- Los docs (README del warehouse, `docs/conectores.md` si aplica) se actualizan en el mismo PR.
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

---

## Resumen de sprints

| Sprint | Objetivo | Tickets | Puerta de salida |
|---|---|---|---|
| **1** | Decidir arquitectura y crear la zona cruda versionada | WH-01, WH-02 | ADR mergeado (ubicación, motor, reglas); extracción idempotente con manifiesto para las tablas de fase 1, re-ejecutable sin duplicados |
| **2** | Modelo dimensional con tests y cuadre contra fuentes | WH-03, WH-04 | `dbt build` reproducible desde Parquet con ≥10 marts/tests en verde; los marts de ejecución cuadran con `GET /api/execution`; regla anti multi-corte como test |
| **3** | Métricas gobernadas y el producto puente precios↔contratación | WH-05, WH-06 | ≥10 métricas con definición única + informe de paridad con los 46 indicadores; índice publicado con metodología y % de match real |
| **4** | Consumo self-serve | WH-07 | ≥3 dashboards en BI con fecha de extracción visible; MCP de solo lectura sobre marts sin credenciales de escritura |

---

## Secuencia estratégica

```text
Sprint 1: WH-01 (ADR) → WH-02 (zona cruda + manifiesto)
            ↓
Sprint 2: WH-03 (dbt: staging + marts + tests) → WH-04 (cuadre contra APIs fuente)
            ↓
Sprint 3: WH-05 (catálogo de métricas) ⟷ WH-06 (índice precios↔contratación, depende de WH-03)
            ↓
Sprint 4: WH-07 (dashboards + MCP de solo lectura, depende de WH-05)
```

Cada sprint deja una **puerta de salida verificable**: si la puerta no se cumple, no se abre el siguiente sprint. WH-05 y WH-06 pueden trabajarse en paralelo dentro del Sprint 3.

> **Relación con los otros PRDs del portafolio:** este backlog es el más independiente. Depende operativamente de OR-01 solo si se decide ejecutar extracciones programadas (entonces aplica su ADR); usa la honestidad de frescura de OR- en sus dashboards (WH-07) y no compite con EV- (que es entre-corridas, no histórico analítico).

---

## Sprint 1 — Fundamentos: arquitectura y zona cruda

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| WH-01 | ADR de arquitectura del warehouse | ADR mergeado: ubicación, motor (Parquet + DuckDB; criterio de migración), fuente de verdad, solo lectura en red local, tablas de fase 1 | — | P0 | M | ⬜ Pendiente |
| WH-02 | Zona cruda Parquet + manifiesto | Script idempotente con manifiesto (tabla, filas, rango, hash, timestamp) sobre las 6 tablas prioritarias; sin re-descargas de multi-GB; retención documentada | WH-01 | P0 | L | ⬜ Pendiente |

**Puerta de salida del Sprint 1**: el ADR está mergeado y una re-ejecución de la extracción no duplica datos; cualquier mart crudo puede reconstruirse desde su manifiesto.

---

## Sprint 2 — Modelo dimensional y guardia de calidad

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| WH-03 | Modelo dimensional dbt | Staging + marts (ejecución, contrataciones, obras, inversiones, precios, proveedores) + dimensiones tiempo/territorio/entidad/proveedor; tests básicos en verde; `dbt build` reproducible en máquina limpia | WH-02 | P0 | L | ⬜ Pendiente |
| WH-04 | Cuadre contra las fuentes y guardia de calidad | Tests de reconciliación contra `GET /api/execution`; regla anti `paneles-multi-corte` (DQ-09) como test; política test rojo = mart no publicado; ≥1 bug histórico como test | WH-03 | P1 | M | ⬜ Pendiente |

**Puerta de salida del Sprint 2**: `dbt build` corre desde Parquet con tests en verde; los marts de ejecución cuadran con la API fuente para el mismo corte; y el mart no publica cuando un test de cuadre falla (demostrado con un caso forzado).

---

## Sprint 3 — Métricas gobernadas y producto puente

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| WH-05 | Catálogo de métricas como código | ≥10 métricas con fórmula/grain/fuente; informe de paridad con los 46 indicadores de `cli-market-core`; API que devuelve métrica + definición | WH-03 | P1 | M | ⬜ Pendiente |
| WH-06 | Índice precios de contratación vs. góndola | Mart contratos↔productos golden con `entity-matcher`/normalización cli-market; % de match declarado; metodología publicada (alineada con ADR-0020); ≥200 contratos o alcance reducido públicamente | WH-03 | P1 | L | ⬜ Pendiente |

**Puerta de salida del Sprint 3**: el catálogo de métricas responde con definición embebida y el informe de paridad con los 46 indicadores está cerrado; el índice publica su primera versión con metodología, cobertura y % de match reales (no estimados).

---

## Sprint 4 — Consumo self-serve

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| WH-07 | Dashboard BI + MCP de solo lectura | Metabase con ≥3 dashboards anclados a preguntas actuales (one-papers, ficha sectorial, indicadores); cada dashboard muestra mart y fecha de extracción; endpoint/tool MCP de solo lectura sin credenciales de escritura | WH-05 | P2 | M | ⬜ Pendiente |

**Puerta de salida del Sprint 4**: un no-técnico responde una de las 3 preguntas ancla desde el tablero sin SQL, y la misma cifra coincide con la del mart (misma fecha de extracción declarada). Este sprint no tiene fecha comprometida y puede diferirse sin bloquear los anteriores, siempre que WH-05/WH-06 ya tengan consumidor confirmado.

---

## Fuera de alcance de este backlog

Ver PRD §9. En particular: migrar las apps a una sola base de datos o reemplazar sus APIs; tiempo real / detección de cambios (PRD serie EV-); capa de orquestación y frescura (PRD serie OR-, de la que depende la ejecución programada del warehouse); nuevas fuentes de datos; comercialización del índice precios↔contratación.

