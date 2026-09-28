# PRD — Warehouse analítico y capa de métricas

**Estado:** Propuesto; pendiente de owner y fecha comprometida
**Fecha:** 2026-09-27
**Ámbito:** nuevas capas `raw/` + `warehouse/` (ubicación a definir en WH-01), tablas canónicas de las ~40 apps (cada una con su Postgres 16 en `docker-compose.yml`, red `appsperu_shared`), datos de precio de `cli-market-*` (`price_snapshots_schema.py`, `cli-market-core/market_indicators`), consumidores: one-papers, `mcp-server/`, dashboard BI
**Horizonte:** tres a cuatro sprints cortos; sin fecha comprometida ni owner asignado
**Origen:** revisión de portafolio de infraestructura de datos (2026-09-27). Evidencia en el repo: los one-papers sectoriales se arman con "SQL directo contra la base" (nota en `docs/conectores.md`, ficha `radar-ejecucion`), el endpoint `/api/sectores/:sectorId/ficha` ya cruza 4 apps en una llamada, `cli-market-core` declara 46 indicadores definidos en código sin catálogo compartido, y el CSV nacional del MEF (4.5–10 GB) se procesa por rangos HTTP de 25 MB descartando lo demás.

## 1. Decisión de producto

Los datos ya están capturados en silos: ~40 Postgres de apps, bases en la nube y el ecosistema cli-market. Lo que falta es la capa donde esas tablas se convierten en **modelos reproducibles y métricas gobernadas**: una zona cruda versionada (Parquet), un almacén analítico con marts dimensionales y tests, y un catálogo de métricas definido una sola vez y servido a quienes lo necesiten — humanos (BI), agentes (MCP) y productos (API).

Este PRD crea esa capa **sin tocar las APIs productivas**: las apps siguen siendo la fuente de verdad operativa; el warehouse es un derivado reproducible y verificable. Incluye el producto puente que une el portafolio: un índice de precios de contratación pública vs. precios de góndola.

## 2. Problema y oportunidad

1. **Silos sin modelo analítico.** Cada app tiene su Postgres propio (40 `docker-compose.yml`, todas con puertos en loopback). Los cruces existen solo en endpoints puntuales (`ficha` sectorial, crossrefs); no hay modelo dimensional, ni histórico reconstruible, ni forma estándar de hacer "la misma pregunta" sobre presupuesto, contrataciones y obras.
2. **Métricas no gobernadas.** `cli-market-core` calcula 46 indicadores dentro de su código y los one-papers del lado público se arman con SQL ad hoc no repetible. No existe un catálogo donde una métrica tenga fórmula, grain y fuente definidos una vez — cada consumidor la re-inventa.
3. **Raw zone inexistente: el histórico se descarta.** El conector del MEF baja prefijos de 25 MB de archivos de 4.5–10 GB por HTTP Range y conserva solo lo agregado; no se puede recomputar ni auditar "qué contenía la fuente el día X". Lo mismo aplica a paneles multi-corte (DQ-09).
4. **El producto puente no existe.** Nadie cruza precios de góndola (82 retailers) con precios de contratación pública (`awards`, `minor_contracts`) para responder la pregunta de mayor valor para Estado y negocio: ¿el Estado paga cerca del mercado o por encima?

**Oportunidad:** cada one-paper, tablero o indicador futuro deja de ser una sesión de SQL y pasa a ser una fila de un modelo con tests. El índice precios↔contratación es el entregable de mayor impacto reputacional del portafolio.

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Construir una zona cruda versionada y un almacén analítico reproducible (dbt) con marts para ejecución presupuestaria, contrataciones, obras, inversiones y precios; más un catálogo de ≥10 métricas con definición única; culminando en el índice de precios de contratación vs. góndola con metodología publicada y cobertura declarada.

### No objetivos

- No reemplazar las APIs Express ni el MCP actual: son la capa de lectura operativa; el warehouse es la capa analítica.
- No migrar las ~40 apps a una sola base de datos.
- No ingerir fuentes nuevas ni tocar conectores.
- No exponer ninguna base al internet (regla heredada de ADR-0016): la extracción corre en la red local o con credenciales existentes.
- No ser el "BI oficial del Estado" ni emitir cifras oficiales: todo mart declara su fuente y su cobertura.
- No resolver tiempo real (eso es el PRD de Detección de Cambios y Alertas, serie EV-).

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Marts publicados | ≥10 marts dimensionales con tests de dbt en verde y ejecución reproducible desde la zona cruda. |
| SQL ad hoc eliminado | ≥3 consultas que hoy requieren SQL manual contra las apps (one-papers, fichas) se responden desde marts con la misma cifra verificada. |
| Métricas gobernadas | Catálogo con ≥10 métricas (fórmula, grain, fuente, responsable) e informe de paridad con los 46 indicadores de `cli-market-core`: cuáles son reproducibles desde el warehouse y cuáles no. |
| Producto puente | Índice precios de contratación vs. góndola publicado con metodología, rango de fechas y % de contratos con match declarado (sin inflar cobertura). |
| Reconciliación | Los marts de ejecución cuadran con `GET /api/execution` de `radar-ejecucion` para el mismo corte (diferencia = 0 o explicada). |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Analista/consultor interno | Responder preguntas de negocio (ejecución por sector, dispersión de precios) sin escribir SQL contra apps individuales. | Marts y métricas del catálogo, consultables desde BI o API. |
| Equipo comercial (one-papers, GORE, DGDE) | Reproducir una cifra de un one-paper semanas después. | Cifra derivada de un mart versionado con su manifiesto de extracción, no de SQL ad hoc. |
| GORE/Contraloría (usuario del Estado) | Ver presupuesto, obras y contrataciones cruzados en un mismo modelo. | Marts dimensionales consistentes + fichas derivadas del mismo modelo. |
| Cliente de cli-market / equipo de datos | Saber qué significa cada uno de los 46 indicadores y si es reproducible. | Catálogo de métricas con fórmula y grano; informe de paridad con `market_indicators`. |
| Decisor de producto | Tener una respuesta pública a "¿el Estado paga cerca del mercado?". | Índice precios de contratación vs. góndola con metodología y cobertura declarada. |

## 5. Alcance funcional: siete issues

### WH-01 · ADR de arquitectura del warehouse

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ninguna

**Criterios de aceptación**

- ADR que decide y justifica: ubicación (repo dedicado `rastro-warehouse` vs. carpeta `warehouse/` del monorepo), motor (Parquet + DuckDB como default local; criterio explícito de cuándo migrar a Postgres/ClickHouse), fuente de verdad (las apps siguen siéndolo; el warehouse es derivado reproducible), modo de extracción (solo lectura, en la red local, sin exponer DBs — coherente con ADR-0016) y dónde corre dbt.
- Declara qué tablas entran en la fase 1 (las del mapa de cruces + precios), no "todo".

### WH-02 · Zona cruda versionada: Parquet + manifiesto de extracción

**Prioridad:** P0 · **Esfuerzo:** L · **Dependencias:** WH-01

**Criterios de aceptación**

- Script idempotente que exporta a Parquet las tablas prioritarias (`budget_execution`, `awards`, `minor_contracts`, obras INFOBRAS, proyectos Invierte, `price_snapshots` de cli-market) con manifiesto por extracción: tabla, filas, rango temporal, hash y timestamp.
- Re-ejecutar no duplica datos; el manifiesto permite responder "¿qué contenía la fuente en la corrida X?".
- No se re-descargan los archivos multi-GB del MEF: se exporta lo que las apps ya ingeraron (el rango 25 MB ya no limita el análisis histórico local).
- Retención y consumo de disco documentados en el README del warehouse.

### WH-03 · Modelo dimensional reproducible con dbt

**Prioridad:** P0 · **Esfuerzo:** L · **Dependencias:** WH-02

**Criterios de aceptación**

- Proyecto dbt con staging (tipos, limpieza, SCD2 de precios y contratos) y marts: ejecución presupuestaria, contrataciones, obras, inversiones, precios de góndola, proveedores.
- Dimensiones compartidas: tiempo, territorio (ubigeo), entidad, proveedor.
- Tests básicos en verde: unicidad, not-null, integridad referencial y relaciones entre marts.
- `dbt build` completo reproducible desde la zona cruda, en una máquina limpia, con el proceso documentado.

### WH-04 · Cuadre contra las fuentes y guardia de calidad

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** WH-03

**Criterios de aceptación**

- Tests de reconciliación: totales del mart de ejecución (PIA/PIM/devengado por entidad) == respuesta de `GET /api/execution` de `radar-ejecucion` para el mismo corte, o la diferencia queda explicada en el test.
- Regla anti `paneles-multi-corte` (DQ-09) implementada como test del modelo.
- Política explícita: test rojo = mart no publicado (nunca publicar un mart que no cuadra).
- ≥1 bug histórico convertido en test que lo atrapa.

### WH-05 · Catálogo de métricas como código

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** WH-03

**Criterios de aceptación**

- ≥10 métricas con fórmula, grain, dimensión y fuente (ej. % de ejecución, avance de obras, dispersión de precios cross-retailer, cobertura territorial, spread de precios).
- Informe de paridad con los 46 indicadores de `cli-market-core/market_indicators`: reproducible desde el warehouse / requiere datos fuera del alcance / no comparable — sin inflar la coincidencia.
- API o endpoint que devuelve cada métrica junto con su definición (la respuesta trae la fórmula, no solo el número).

### WH-06 · Índice de precios de contratación pública vs. góndola

**Prioridad:** P1 · **Esfuerzo:** L · **Dependencias:** WH-03

**Criterios de aceptación**

- Mart que une contratos (`awards` + `minor_contracts`) con productos golden de cli-market vía normalización de ítems (unidad/marca), reusando `packages/entity-matcher` y la normalización de `cli-market-index` donde aplique.
- Salida: sobreprecio estimado por categoría/región con advertencias; **% de contratos con match declarado explícitamente — cobertura parcial nunca se presenta como completa** (misma regla de honestidad que "un RUC no encontrado no se marca irregular").
- Metodología publicada junto al índice (supuestos, límites, fecha de corte).
- Alcance declarado (ej. La Libertad o nacional) y ≥200 contratos en el piloto, o el alcance se reduce públicamente.

### WH-07 · Consumo: dashboard BI + capa MCP de solo lectura

**Prioridad:** P2 · **Esfuerzo:** M · **Dependencias:** WH-05

**Criterios de aceptación**

- Metabase (o equivalente self-hosted) sobre el warehouse con ≥3 dashboards anclados a preguntas que hoy son SQL ad hoc (one-papers, ficha sectorial).
- Endpoint/tool MCP de solo lectura sobre marts, sin credenciales de escritura hacia las apps.
- Cada dashboard indica su mart y fecha de extracción (misma honestidad de frescura del PRD OR-).

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora** | WH-01, WH-02 | Decisión de arquitectura trazable y zona cruda versionada: por primera vez se puede responder qué contenía la fuente en una corrida dada. |
| **Siguiente** | WH-03, WH-04 | Marts reproducibles con tests de cuadre: los one-papers dejan de depender de SQL ad hoc. |
| **Después** | WH-05, WH-06 | Métricas gobernadas y el producto puente precios↔contratación con cobertura declarada. |
| **Final** | WH-07 | Consumo self-serve (BI + MCP) sin credenciales de escritura. |

## 7. Requisitos no funcionales

- **Reproducibilidad:** todo mart se reconstruye desde la zona cruda con un comando; si no es reproducible, no es un mart, es un volcado.
- **Honestidad de cobertura:** cada mart y cada métrica declara fuente, corte y cobertura; parcial nunca se presenta como completo (regla ya establecida en el repo para RUC y cobertura territorial).
- **Solo lectura:** ninguna tarea del warehouse escribe en las bases de las apps; las apps siguen siendo la fuente de verdad operativa.
- **Volumen y retención:** extracción en Parquet con manifiesto y retención declarada; nada de cargar archivos de 10 GB en memoria (lección del HTTP Range de 25 MB en `mef-connector.ts`).
- **Seguridad de red:** sin bases expuestas al internet; si se requiere ejecución programada del warehouse, aplica lo decidido en ADR-0016 y en OR-01 del PRD de Orquestación.
- **Documentación como entregable:** cada ticket actualiza el README del warehouse (y `docs/conectores.md` si toca flujos de ingesta) en el mismo PR.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Deriva entre apps y marts (una app cambia de esquema y el mart miente) | Tests de cuadre (WH-04) + manifiestos con hash; el mart no publica si no cuadra. |
| El warehouse se construye y nadie lo usa | WH-05/WH-07 se anclan a consumidores concretos ya identificados (one-papers, ficha sectorial, catálogo de indicadores); sin consumidor confirmado no avanza la fase. |
| WH-06 produce un índice con matching flojo y conclusiones erróneas | Gate de cobertura (≥200 contratos o alcance reducido públicamente), metodología publicada y % de match en la salida; nunca estimar sobre unos pocos matches. |
| Scope creep: "copiar todas las tablas de las 40 apps" | Fase 1 acotada en WH-01 a las tablas del mapa de cruces + precios; ampliar requiere ticket nuevo. |
| Mantenimiento de N extractores a medida | Extractor genérico parametrizado por tabla + manifiesto, no uno por app. |

## 9. Fuera de este PRD

- Migrar las apps a una sola base de datos o reemplazar sus APIs productivas.
- Tiempo real / detección de cambios entre corridas → PRD Detección de Cambios y Alertas (serie EV-).
- Capa de orquestación y frescura → PRD Orquestación y Frescura de Ingesta (serie OR-); la ejecución programada del warehouse quedará sujeta a su ADR-01.
- Nuevas fuentes de datos ni scraping adicional.
- Decisión de comercialización del índice precios↔contratación (comercio, no infraestructura).

## 10. Definition of Done

- Cada ticket tiene PR, revisión y pruebas automatizadas asociadas.
- `dbt build` completo corre en una máquina limpia siguiendo el README, con tests en verde.
- Todo mart publicado declara su manifiesto de extracción y su cobertura.
- Los marts priorizados cuadran con sus fuentes para el mismo corte (WH-04 en verde).
- El índice publica su metodología y su % de match real; ninguna salida sugiere cobertura completa sin serlo.



