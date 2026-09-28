# Tickets — Warehouse Analítico y Capa de Métricas v1

**Producto:** AppsPerú + CLI Market (capa analítica transversal)
**PRD:** [`docs/PRD_Warehouse_Analitico_y_Capa_de_Metricas_v1.md`](PRD_Warehouse_Analitico_y_Capa_de_Metricas_v1.md)
**Backlog secuenciado:** [`docs/BACKLOG_Warehouse_Analitico_y_Capa_de_Metricas_v1.md`](BACKLOG_Warehouse_Analitico_y_Capa_de_Metricas_v1.md)
**Serie de tickets:** **WH-** (Warehouse — nueva serie, no colisiona con AE-/AL2-/AL3-/CG-/CT-/CX-/DQ-/GORE-/GOV-/IF-/IR-/OE-/PN-/PS-/PV-/RF-/RUC-/SC-/SGR-/SI-/SS- ya usadas en otros backlogs)
**Regla transversal:** todo mart es reproducible desde la zona cruda; nada se escribe en las bases de las apps; toda cobertura se declara (parcial nunca se presenta como completa); el manifiesto de extracción viaja con el mart; los docs se actualizan en el mismo PR.
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

---

## ÉPICA 1 — Fundamentos: decisión de arquitectura y zona cruda

### WH-01 · ADR de arquitectura del warehouse

- **Historia:** Como responsable de datos, quiero decidir por escrito dónde vive el almacén analítico, con qué motor y bajo qué reglas de seguridad, antes de escribir la primera línea de extracción, para no heredar la ambigüedad que hoy tiene la capa de scraping (documentada en `scraping-arquitectura.md`).
- **Contexto verificado en código:** cada app tiene su Postgres 16 en `docker-compose.yml` con puerto `127.0.0.1:5432` y red compartida `appsperu_shared` (40 compose en `apps/`); ADR-0016 confirmó que ninguna DB es alcanzable desde internet; no existe hoy ninguna herramienta de transformación (búsqueda de `dbt`/`dagster`/`airflow`/`duckdb` sin resultados en los repos del ecosistema).
- **Criterios de aceptación:**
  - ADR mergeado que decide y justifica: ubicación (repo dedicado `rastro-warehouse` vs. carpeta `warehouse/` del monorepo), motor (Parquet + DuckDB local como default; criterio explícito de cuándo migrar a Postgres/ClickHouse), fuente de verdad (las apps siguen siéndolo; el warehouse es derivado reproducible) y modo de extracción (solo lectura, en red local, sin exponer DBs).
  - Declara qué tablas entran en la fase 1 (mapa de cruces + precios), no "todo", y dónde corre dbt (máquina local o runner en la red).
  - Sin código de extracción en este ticket: decisión e implementación separadas.
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** M

### WH-02 · Zona cruda versionada: Parquet + manifiesto de extracción

- **Historia:** Como auditor de datos, quiero poder responder "¿qué contenía la fuente en la corrida X?" sin re-descargar nada, para que un one-paper sea reproducible semanas después.
- **Contexto verificado en código:** `mef-connector.ts` descarga prefijos de 25 MB (`DEFAULT_MAX_BYTES`) de archivos de 4.5–10 GB por HTTP Range y solo conserva lo agregado — el contenido bruto se descarta; 56 de 62 conectores ya guardan lotes crudos con checksum en `raw_*_batches` (ej. `raw_mincetur_batches` con `ON CONFLICT (resource_id, checksum)`), pero solo dentro de su app; `cli-market-backend/price_snapshots_schema.py` ya versiona precios por corrida.
- **Criterios de aceptación:**
  - Script idempotente que exporta a Parquet con manifiesto (tabla, filas, rango temporal, hash, timestamp) las tablas prioritarias: `budget_execution`, `awards`, `minor_contracts`, obras INFOBRAS, proyectos Invierte y `price_snapshots`.
  - Re-ejecutar no duplica; el manifiesto permite reconstruir cualquier extracción anterior.
  - No se re-descargan archivos multi-GB: se exporta lo que las apps ya ingeraron.
  - Retención y consumo de disco documentados en el README del warehouse.
- **Dependencias:** WH-01.
- **Prioridad:** P0 · **Esfuerzo:** L

## ÉPICA 2 — Modelo dimensional y guardia de calidad

### WH-03 · Modelo dimensional reproducible con dbt

- **Historia:** Como analista, quiero marts dimensionales con tests, para responder preguntas de negocio sin escribir SQL ad hoc contra apps individuales y sin depender de que nadie recuerde el truco de la última sesión.
- **Contexto verificado en código:** no existe hoy ninguna capa de transformación (búsqueda de `dbt`/`airflow`/`dagster` sin resultados); el precedente de cruce más parecido es `GET /api/sectores/:sectorId/ficha` de `radar-ejecucion`, que ya junta presupuesto (`budget_execution` + `sector_entity_registry`), enlaces de proyectos, obras INFOBRAS por CUI y contrataciones en una llamada — pero vive como endpoint, no como modelo versionado.
- **Criterios de aceptación:**
  - Proyecto dbt con staging (tipos, limpieza, SCD2 de precios y contratos) y marts: ejecución presupuestaria, contrataciones, obras, inversiones, precios de góndola y proveedores.
  - Dimensiones compartidas: tiempo, territorio (ubigeo), entidad y proveedor.
  - Tests básicos en verde: unicidad, not-null, integridad referencial y relaciones entre marts.
  - `dbt build` completo reproducible desde la zona cruda en una máquina limpia, proceso documentado en el README.
- **Dependencias:** WH-02.
- **Prioridad:** P0 · **Esfuerzo:** L

### WH-04 · Cuadre contra las fuentes y guardia de calidad

- **Historia:** Como usuario del Estado, quiero que los marts cuadren con las APIs fuente para el mismo corte, para poder citar una cifra del tablero sin miedo a que la fuente diga otra cosa.
- **Contexto verificado en código:** los one-papers sectoriales se armaron con "SQL directo contra la base" (nota en `docs/conectores.md`, ficha `radar-ejecucion`) y la cifra del Ministerio de la Producción (S/ 208,104,679 PIM / S/ 128,209,085.25 devengado) se verificó manualmente contra `GET /api/sectores/PRODUCE/ficha`; `docs/data-contracts/paneles-multi-corte.md` (DQ-09) documenta el bug real de inflación por multi-corte en `infraestructura-mtc` y `residuos-solidos`; `radar-ejecucion` expone `advertenciaMultiAnio` cuando la respuesta mezcla años fiscales.
- **Criterios de aceptación:**
  - Tests de reconciliación: totales del mart de ejecución (PIA/PIM/devengado por entidad) == `GET /api/execution` para el mismo corte, o la diferencia queda explicada en el test.
  - Regla anti `paneles-multi-corte` (DQ-09) implementada como test del modelo.
  - Política explícita: test rojo = mart no publicado.
  - ≥1 bug histórico convertido en test que lo atrapa.
- **Dependencias:** WH-03.
- **Prioridad:** P1 · **Esfuerzo:** M

## ÉPICA 3 — Métricas gobernadas, producto puente y consumo

### WH-05 · Catálogo de métricas como código

- **Historia:** Como cliente o analista, quiero una definición única y consultable de cada métrica, para no depender de leer el código de `market_indicators` o de adivinar qué midió el último one-paper.
- **Contexto verificado en código:** `cli-market-core` declara "46 market indicators from shelf data" en su README, con la lógica en el módulo `market_indicators` — definiciones vivas en código, sin catálogo ni API de definiciones; del lado público las cifras se calculan con SQL ad hoc (ver WH-04).
- **Criterios de aceptación:**
  - ≥10 métricas con fórmula, grain, dimensión y fuente (ej. % de ejecución, avance de obras, dispersión de precios cross-retailer, cobertura territorial, spread).
  - Informe de paridad con los 46 indicadores de `cli-market-core/market_indicators`: reproducible desde el warehouse / requiere datos fuera de alcance / no comparable — sin inflar la coincidencia.
  - API o endpoint que devuelve la métrica junto con su definición embebida (la respuesta trae la fórmula, no solo el número).
- **Dependencias:** WH-03.
- **Prioridad:** P1 · **Esfuerzo:** M

### WH-06 · Índice de precios de contratación pública vs. góndola

- **Historia:** Como decisor (GORE, Contraloría, OECE o un retailer), quiero saber si los precios de contratación pública se parecen a los del mercado, para detectar sobreprecios con evidencia en vez de anécdotas.
- **Contexto verificado en código:** los contratos viven en `awards` y `minor_contracts` (compras-publicas, con formatos de proveedor `seace:ruc:` y `PE-RUC-` — ver CX-01); los productos de cli-market tienen identidad canónica `prod_` con normalización de unidad y marca en `cli-market-index` (66+ marcas, ml/L/kg); `packages/entity-matcher` ya consolida matching de entidades (ADR-0017); existe ADR-0020 de umbral de sobrecosto unificado que debe alinearse con la metodología de este índice.
- **Criterios de aceptación:**
  - Mart que une contratos con productos golden vía normalización de ítems (unidad/marca), reusando `entity-matcher` y la normalización de `cli-market-index` donde aplique.
  - Salida con sobreprecio estimado por categoría/región y **% de contratos con match declarado explícitamente — cobertura parcial nunca se presenta como completa** (misma regla que "un RUC no encontrado no se marca irregular").
  - Metodología publicada junto al índice (supuestos, límites, fecha de corte, alineación con ADR-0020).
  - Alcance declarado (La Libertad o nacional) y ≥200 contratos en el piloto, o el alcance se reduce públicamente.
- **Dependencias:** WH-03.
- **Prioridad:** P1 · **Esfuerzo:** L

### WH-07 · Consumo: dashboard BI + capa MCP de solo lectura

- **Historia:** Como no-técnico, quiero ver los marts en un tablero y preguntarles por MCP, sin escribir SQL ni exponer credenciales.
- **Contexto verificado en código:** no hay BI en el ecosistema; el MCP actual expone las APIs de las apps (pass-through de solo lectura, 2 meta-tools) pero no los marts; `docs/TICKETS_Rastro_Capa_Lectura_v1.md` y `rastro.fyi` ya trabajan la capa de lectura para no-técnicos — este ticket la extiende al warehouse.
- **Criterios de aceptación:**
  - Metabase (o equivalente self-hosted) sobre el warehouse con ≥3 dashboards anclados a preguntas actuales (one-papers, ficha sectorial, indicadores de precio).
  - Endpoint/tool MCP de solo lectura sobre marts, sin credenciales de escritura hacia las apps.
  - Cada dashboard indica su mart y fecha de extracción (misma honestidad de frescura del PRD OR-).
- **Dependencias:** WH-05.
- **Prioridad:** P2 · **Esfuerzo:** M


