# Data contract — CEPLAN: Strategic Planning (PEI/POI/Metas)

> Ficha técnica del conector: [`docs/conectores.md#ceplan-estrategico`](../conectores.md#ceplan-estrategico)

- Fuente oficial: CEPLAN — Centro Nacional de Planeamiento Estratégico
- URLs clave:
  - GeoServer: https://geo.ceplan.gob.pe
  - ObservaPerú: https://observaperu.ceplan.gob.pe (corregido 2026-08-17 — la URL
    `observa.ceplan.gob.pe` documentada originalmente no resuelve)
  - Pulso SINAPLAN: https://pulso.sinaplan.gob.pe
  - Aplicativo CEPLAN V.01: https://aplicativo.ceplan.gob.pe — **caído/no resuelve**,
    confirmado en vivo el 2026-08-17
- Owner del conector: equipo App 05 (CEPLAN Strategic Planning)
- Confirmado en vivo el 2026-08-17 (investigación de servicios públicos programáticos).

## Estado: PARCIALMENTE CONFIRMADO — granularidad solo agregada, no per-entidad

**Hallazgo clave (2026-08-17, reverse engineering en vivo)**: el único dataset público
realmente descargable de ObservaPerú (`/explorar-datos` → pestaña "Datos Abiertos" →
`indicadores_gestion_estrategica_estado_2024.xlsx`) trae los indicadores **agregados por
nivel de gobierno** (`GN`/`GR`/`MP`/`MD`/`Total`, vía una columna `Filtros` con JSON tipo
`{"nivelGobierno":"GN"}`), **no por entidad/pliego individual**. El modelo canónico
per-entidad descrito más abajo (`strategic_objectives.entity_code`,
`poi_activities.entity_code` cruzando 1:1 con `radar-ejecucion.entities.entity_code`) **no
es alcanzable con esta fuente** — solo sería posible vía el Aplicativo CEPLAN V.01, que
está caído. Ver ADR-0003 para la decisión revisada: se ingiere el agregado y el cruce con
`radar-ejecucion` se hace a nivel de gobierno (GN/GR únicamente — `radar-ejecucion` no
distingue MP de MD).

CEPLAN **no expone una API REST institucional general y documentada** tipo `api.ceplan.gob.pe/v1/...`, pero sí ofrece tres capas de datos integrables:

1. **GeoServer público** (OGC estándar — WFS/WMS/WMTS)
2. **ObservaPerú** (datasets descargables en Excel/CSV)
3. **Pulso SINAPLAN** (dashboards con acceso a datos estructurados)
4. **Aplicativo CEPLAN V.01** (formularios de consulta pública)

Este data contract cubre la capa **estratégica** (PEI/POI/Metas), no la geoespacial (ver `ceplan-geo.md`).

---

## Fuentes de datos

### 1. ObservaPerú — Datasets descargables

**Método de acceso**: Botón de descarga directa en `/explorar-datos` → pestaña "Datos
Abiertos" (no requiere formulario ni sesión — confirmado en vivo).

**Dataset relevante**: `indicadores_gestion_estrategica_estado_2024.xlsx` (el otro
dataset de esa pestaña, `indicadores_panorama_pais_2024.xlsx`, es macroeconómico —
PBI/inflación/desempleo — sin relación con presupuesto/planificación institucional).

**Estructura confirmada** (2 hojas):
- `Indicadores` (catálogo, 36 filas): `Código`, `Indicador`, `Pilar`, `Dimensión`,
  `Subdimensión`, `Tipo`, `Unidad`, `Frecuencia`, `Sentido deseable`,
  `Institución fuente`, `Documento fuente`.
- `Observaciones` (series temporales, 130 filas): `Código`, `Indicador`, `Dimensión`,
  `Subdimensión`, `Serie ID`, `Serie`, `Filtros` (JSON, ej. `{"nivelGobierno":"GN"}`),
  `Periodo`, `Valor`, `Unidad`, `Nota`.

**Indicadores confirmados**: `CUMP01`-`CUMP04` (cumplimiento OEI, ejecución física POI,
ejecución presupuestal, presupuesto no ejecutado), `PN01`-`PN07` (políticas nacionales),
`PLAN01`-`PLAN03` (cobertura PEI/POI/PDC), `INV01`-`INV02` (inversiones sectoriales),
más `SOC*`/`AMB*`/`ECO*`/`INST*`/`ALRT01` (resultados de desarrollo, sin relación directa
con ejecución presupuestal por entidad).

**Granularidad real**: todas las observaciones de `CUMP*`/`PLAN*` vienen agregadas por
`nivelGobierno` (`GN`, `GR`, `MP`, `MD`, `Total`) — no hay fila por pliego/entidad
individual. Ver nota de "Estado" arriba.

**Cautelas**:
- No hay API documentada, pero el botón de descarga sí es un enlace directo estable (no
  requiere reverse engineering de formularios)
- La frecuencia de actualización no está documentada (el dataset trae su propio
  "ACTUALIZADO: 30 may. 2025" en la UI)
- Puede haber cambios en la estructura de los datasets sin aviso previo

---

### 2. Pulso SINAPLAN — Dashboards estructurados

**Método de acceso**: Visualización web + posibles endpoints internos (no documentados).

**Datos expuestos**:
- Avance de metas físicas del POI
- Ejecución presupuestal
- Indicadores estratégicos
- Cumplimiento de metas
- Alertas de desempeño

**Fuente subyacente**: Aplicativo CEPLAN V.01 (según la propia plataforma).

**Cautelas**:
- Interfaz orientada a visualización, no a extracción programática
- Puede requerir inspección de tráfico de red para identificar endpoints internos
- No documentado — alta probabilidad de cambios sin aviso

---

### 3. Aplicativo CEPLAN V.01 — Consulta pública

**Método de acceso**: Formularios web POST (posible reverse engineering).

**Dimensiones de consulta**:
- Nivel de gobierno
- Sector
- Pliego
- Objetivo estratégico institucional
- Acción estratégica institucional
- Unidad ejecutora
- Actividad operativa
- POI

**Estructura de datos inferida**:
```
Entidad
  ↓
PEI (Plan Estratégico Institucional)
  ↓
Objetivo estratégico
  ↓
Acción estratégica
  ↓
POI (Plan Operativo Institucional)
  ↓
Actividad operativa
  ↓
Meta física
  ↓
Presupuesto
  ↓
Ejecución
```

**Cautelas**:
- No hay API documentada
- Requiere inspección técnica de los formularios POST y endpoints de respuesta
- Alta volatilidad — cambios en la interfaz pueden romper el conector

---

## Entidades del modelo canónico

Basado en la estructura de datos inferida del Aplicativo CEPLAN V.01. **`strategic_objectives`,
`strategic_actions`, `poi_activities` y `physical_targets` quedan sin poblar en el Sprint 1**:
requieren datos por pliego individual que solo existirían en el Aplicativo CEPLAN V.01, hoy
caído (ver "Estado" arriba). Las tablas se conservan en las migraciones para cuando esa fuente
vuelva a estar disponible. Solo `strategic_indicators` se ingiere en este sprint, con un campo
`nivel_gobierno` adicional (no en el diseño original) para reflejar la granularidad real de
ObservaPerú.

### `strategic_objectives`
- `id`: UUID
- `entity_code`: VARCHAR — coincide con `radar-ejecucion.entities.entity_code`
- `pei_code`: VARCHAR — código del PEI
- `objective_code`: VARCHAR — código del objetivo estratégico
- `objective_name`: TEXT
- `perspective`: VARCHAR — (ej. financiera, cliente, procesos, aprendizaje)
- `start_year`: INTEGER
- `end_year`: INTEGER
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

### `strategic_actions`
- `id`: UUID
- `objective_id`: UUID (FK → `strategic_objectives`)
- `action_code`: VARCHAR
- `action_name`: TEXT
- `responsible_unit`: VARCHAR
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

### `poi_activities`
- `id`: UUID
- `entity_code`: VARCHAR
- `poi_code`: VARCHAR
- `activity_code`: VARCHAR
- `activity_name`: TEXT
- `action_id`: UUID (FK → `strategic_actions` opcional)
- `budget_code`: VARCHAR — código de cadena presupuestal
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

### `physical_targets`
- `id`: UUID
- `activity_id`: UUID (FK → `poi_activities`)
- `target_year`: INTEGER
- `target_value`: NUMERIC
- `unit_of_measure`: VARCHAR
- `achievement_value`: NUMERIC — valor alcanzado
- `achievement_pct`: NUMERIC — porcentaje de cumplimiento
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

### `strategic_indicators`
- `id`: UUID
- `entity_code`: VARCHAR — no poblado en Sprint 1 (no hay dato per-entidad, ver arriba)
- `nivel_gobierno`: VARCHAR — agregado en Sprint 1: `GN`/`GR`/`MP`/`MD`/`TOTAL`
- `indicator_code`: VARCHAR — (ej. CUMP01, CUMP02, PN03)
- `indicator_name`: TEXT
- `value`: NUMERIC
- `target_value`: NUMERIC
- `measurement_date`: DATE
- `frequency`: VARCHAR — (mensual, trimestral, anual)
- `source`: VARCHAR — (ObservaPerú, Pulso SINAPLAN, CEPLAN V.01)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

### `raw_ceplan_batches`
- `id`: SERIAL
- `resource_id`: VARCHAR — identificador de la fuente
- `query`: TEXT — parámetros de la consulta
- `checksum`: TEXT — SHA256 del payload
- `record_count`: INTEGER
- `payload`: JSONB — datos crudos
- `ingested_at`: TIMESTAMPTZ
- `source`: VARCHAR — (ObservaPerú, Pulso SINAPLAN, CEPLAN V.01)

---

## Cruces con otras apps

### Con `radar-ejecucion` (Sprint 1, revisado)
- **Cruce por**: `nivel_gobierno`, no `entity_code` — sin dato per-entidad disponible
  (ver "Estado" arriba)
- **Buckets cruzables**: solo `GN` y `GR` — `radar-ejecucion.entities.nivel_gobierno` no
  distingue `MP` (municipalidad provincial) de `MD` (municipalidad distrital), ambos caen
  bajo "GOBIERNOS LOCALES" en esa app, así que no hay bucket equivalente exacto. `MP`,
  `MD` y `Total` se exponen en `GET /api/indicators` como indicadores informativos, sin
  intento de cruce (mismo criterio que `compras-publicas`: sin match exacto, se omite, no
  se fuerza)
- **Propósito**: conectar ejecución presupuestal agregada con indicadores de gestión
  estratégica (SEG, Execution Efficiency) al nivel de gobierno
- **API endpoint**: `GET /api/crossref` en `ceplan-estrategico/api`
- **Matcher**: exacto por bucket (`GN`↔`GOBIERNO NACIONAL`, `GR`↔`GOBIERNOS REGIONALES`)
- **Caveat confirmado en vivo (2026-08-17)**: los años de referencia de las dos fuentes no
  coinciden — CEPLAN reporta hasta 2024/2025 (retrospectivo), `radar-ejecucion` solo tiene
  ingerido el año fiscal 2026 (corriente). El endpoint compara el año más reciente
  disponible en cada fuente por separado y devuelve ambos (`anioCeplan`,
  `anioRadarEjecucion`) en vez de forzar coincidencia. Además, la muestra parcial de
  `radar-ejecucion` para 2026 tiene `pim = 0` en las 968 filas ingeridas (ver su propio
  TODO de ingesta parcial en `mef-connector.ts`) — por eso `ejecucionPresupuestalRadarEjecucion`
  y los indicadores derivados (SEG, Execution Efficiency) devuelven `null` hoy: no es un bug
  del cruce, es que la fuente aguas arriba no trae PIM utilizable en esta muestra.

### Con `ceplan-geo` (Fase 2 ALSOL, 2026-08-26)
- **Cruce por**: departamento piloto → agregados territoriales (distritos, infraestructura)
- **API**: `GET /api/crossref/territorial?departamento=` (lee ceplan-geo vía HTTP)
- **Contrato**: [`docs/data-contracts/ceplan-crossref-territorial-v1.md`](ceplan-crossref-territorial-v1.md)
- **Caveat**: indicadores CEPLAN siguen siendo nacionales GN/GR; el bloque territorial no implica desempeño estratégico regional.

### Indicadores derivados productizados (Fase 2)

| Endpoint | Variante nacional | Variante departamental |
|---|---|---|
| `GET /api/indicators/seg` | CUMP03 − CUMP02 (GN/GR) | `PROXY_DEPARTAMENTAL` (MEF − INFOBRAS) |
| `GET /api/indicators/execution-efficiency` | CUMP02 / CUMP03 | avance físico / ejecución presupuestal |
| `GET /api/indicators/plan-budget-alignment` | N/A | PBA heurístico v1 |

CLI: `npm run indicators:regional -- --departamento=`. Contrato PBA: [`ceplan-plan-budget-alignment-v1.md`](ceplan-plan-budget-alignment-v1.md).

### Con `radar-inversiones`
- Pendiente — no evaluado en Sprint 1, mismo criterio de granularidad aplicaría.

---

## Indicadores derivados a construir

### Strategic Execution Gap (SEG)
```
SEG = Budget Execution % - Physical Target Achievement %
```

Ejemplo:
- Presupuesto ejecutado: 94%
- Meta física: 61%
- SEG: +33 pp

Interpretación: el gasto avanzó más rápido que el resultado físico reportado.

---

### Plan–Budget Alignment
Mapeo de recursos a objetivos estratégicos:
```
Objetivo                           Presupuesto asignado
─────────────────────────────────────────────────────
Reducir anemia                     S/ 420M
Mejorar infraestructura educativa  S/ 310M
Seguridad ciudadana                S/ 180M
Transformación digital             S/  24M
```

Propósito: comparar discurso estratégico vs asignación real de recursos.

---

### Execution Efficiency
```
Execution Efficiency = Physical Target Achievement / Budget Execution
```

Ejemplo:
- Entidad A: Presupuesto 90%, Meta física 84% → Efficiency 0.93
- Entidad B: Presupuesto 92%, Meta física 48% → Efficiency 0.52

Propósito: distinguir entidades que ejecutan bien de las que solo gastan.

---

## Estrategia de ingesta recomendada

### Fase 1: ObservaPerú (prioridad alta)
- Objetivo: datasets descargables con estructura más estable
- Método: reverse engineering de la interfaz de descarga
- Riesgo: medio (cambios en la interfaz, pero menos probable que en APIs internas)

### Fase 2: Aplicativo CEPLAN V.01 (prioridad media)
- Objetivo: datos estructurados completos (PEI → POI → Actividad → Meta)
- Método: inspección de formularios POST y endpoints de respuesta
- Riesgo: alto (volatilidad de la interfaz)

### Fase 3: Pulso SINAPLAN (prioridad baja)
- Objetivo: complementar con indicadores de desempeño
- Método: inspección de tráfico de red / scraping
- Riesgo: muy alto (interfaz orientada a visualización, no a extracción)

---

## Cautelas generales

1. **No hay API REST oficial documentada** — todas las integraciones requieren reverse engineering
2. **Alta volatilidad** — cambios en la interfaz pueden romper el conector sin aviso
3. **Frecuencia de actualización no documentada** — no se sabe con qué periodicidad se actualizan los datos
4. **Licencia de uso no especificada** — verificar términos de uso al implementar
5. **Posibles límites de rate limiting** — no documentados, puede requerir implementación de backoff

---

## MVP recomendado

Para el MVP, recomiendo enfocarse en **ObservaPerú** (datasets descargables) porque:
- Es la fuente más estable de las tres
- Tiene indicadores directamente útiles (CUMP01, CUMP02, CUMP03, PN03)
- Requiere menos reverse engineering que el Aplicativo CEPLAN V.01
- Puede integrarse primero con `radar-ejecucion` para construir los indicadores derivados

Las otras fuentes (Aplicativo CEPLAN V.01, Pulso SINAPLAN) pueden agregarse en fases posteriores una vez validado el MVP.
