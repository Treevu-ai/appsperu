# Data contract — CEPLAN: Strategic Planning (PEI/POI/Metas)

- Fuente oficial: CEPLAN — Centro Nacional de Planeamiento Estratégico
- URLs clave:
  - GeoServer: https://geo.ceplan.gob.pe
  - ObservaPerú: https://observa.ceplan.gob.pe
  - Pulso SINAPLAN: https://pulso.sinaplan.gob.pe
  - Aplicativo CEPLAN V.01: https://aplicativo.ceplan.gob.pe
- Owner del conector: equipo App 05 (CEPLAN Strategic Planning)
- Confirmado en vivo el 2026-08-17 (investigación de servicios públicos programáticos).

## Estado: PARCIALMENTE CONFIRMADO

CEPLAN **no expone una API REST institucional general y documentada** tipo `api.ceplan.gob.pe/v1/...`, pero sí ofrece tres capas de datos integrables:

1. **GeoServer público** (OGC estándar — WFS/WMS/WMTS)
2. **ObservaPerú** (datasets descargables en Excel/CSV)
3. **Pulso SINAPLAN** (dashboards con acceso a datos estructurados)
4. **Aplicativo CEPLAN V.01** (formularios de consulta pública)

Este data contract cubre la capa **estratégica** (PEI/POI/Metas), no la geoespacial (ver `ceplan-geo.md`).

---

## Fuentes de datos

### 1. ObservaPerú — Datasets descargables

**Método de acceso**: Descarga directa de Excel/CSV desde la interfaz web (no API documentada).

**Ejemplos de indicadores disponibles**:
- `CUMP01`: Cumplimiento de metas institucionales a nivel de objetivos estratégicos
- `CUMP02`: Ejecución física del POI
- `CUMP03`: Ejecución presupuestal de actividades operativas e inversiones
- `PN03`: Nivel de implementación de políticas nacionales
- Indicadores fiscales, sociales y económicos

**Dimensiones disponibles** (según formularios de consulta pública):
- Nivel de gobierno
- Sector
- Pliego
- Objetivo estratégico institucional
- Acción estratégica institucional
- Unidad ejecutora
- Actividad operativa
- POI

**Formato**: Excel/CSV (requiere reverse engineering de los exports para determinar estructura exacta).

**Cautelas**:
- No hay API documentada — la ingesta requiere scraping de la interfaz de descarga o inspección de endpoints internos
- La frecuencia de actualización no está documentada
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

Basado en la estructura de datos inferida del Aplicativo CEPLAN V.01:

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
- `entity_code`: VARCHAR
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

### Con `radar-ejecucion`
- **Cruce por**: `entity_code` (SEC_EJEC)
- **Propósito**: conectar gasto con objetivos estratégicos
- **API endpoint**: `GET /api/crossref?entity_code={code}`
- **Matcher**: exacto (no fuzzy)

### Con `radar-inversiones`
- **Cruce por**: `entity_code` (SEC_EJEC)
- **Propósito**: conectar inversiones con objetivos estratégicos
- **API endpoint**: `GET /api/crossref?entity_code={code}`
- **Matcher**: exacto

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
