# ADR-0003: CEPLAN Estratégico — App standalone y connector ObservaPerú

> **Actualización 2026-08-17 (Sprint 1, reverse engineering en vivo)**: el modelo per-entidad
> descrito en este ADR (cruce por `entity_code` exacto con `radar-ejecucion`) **no es
> alcanzable** con los datos públicos de ObservaPerú (`observaperu.ceplan.gob.pe`, URL
> corregida — la documentada aquí originalmente no resolvía). El único dataset descargable
> real trae los indicadores agregados por `nivelGobierno` (`GN`/`GR`/`MP`/`MD`/`Total`), no
> por pliego individual. La fuente que sí tendría ese detalle (Aplicativo CEPLAN V.01) está
> caída. Decisión: ingestar el agregado tal cual y cruzar con `radar-ejecucion` a nivel de
> gobierno (solo `GN`/`GR`, ver `docs/data-contracts/ceplan-strategic-planning.md`). Las
> tablas `strategic_objectives`/`strategic_actions`/`poi_activities`/`physical_targets` se
> mantienen en las migraciones pero no se pueblan en este sprint. El resto de este documento
> (arquitectura general, connector, endpoints) sigue vigente salvo por esa granularidad.

## Contexto

CEPLAN ofrece tres capas de datos integrables (GeoServer, ObservaPerú, Pulso SINAPLAN/Aplicativo CEPLAN V.01), pero no expone una API REST institucional documentada. Para integrar la capa estratégica (PEI/POI/Metas) en Follow the Sol, necesitamos construir una app standalone siguiendo el patrón establecido por las apps existentes (radar-ejecucion, compras-publicas, radar-inversiones, infobras).

## Decisión

### Arquitectura general

**Nombre**: `ceplan-estrategico`

**Stack** (igual que apps existentes):
- **API**: Express + TypeScript + Postgres (Docker Compose)
- **Web**: Next.js
- **Puertos**:
  - API: 4004
  - Web: 3004
  - Postgres: 5436

**Estructura de directorios**:
```
apps/ceplan-estrategico/
├── api/
│   ├── src/
│   │   ├── db/
│   │   │   ├── pool.ts
│   │   │   ├── migrate.ts
│   │   │   └── migrations/
│   │   │       ├── 001_create_strategic_objectives.sql
│   │   │       ├── 002_create_strategic_actions.sql
│   │   │       ├── 003_create_poi_activities.sql
│   │   │       ├── 004_create_physical_targets.sql
│   │   │       ├── 005_create_strategic_indicators.sql
│   │   │       ├── 006_create_raw_ceplan_batches.sql
│   │   │       └── 007_create_crossref_table.sql
│   │   ├── ingest/
│   │   │   ├── observa-connector.ts
│   │   │   ├── normalize.ts
│   │   │   └── field-mapping.ts
│   │   ├── crossref/
│   │   │   └── match.ts
│   │   ├── routes/
│   │   │   ├── index.ts
│   │   │   ├── objectives.ts
│   │   │   ├── indicators.ts
│   │   │   └── crossref.ts
│   │   └── index.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── docker-compose.yml
│   └── .env.example
└── web/
    ├── src/
    │   ├── app/
    │   ├── components/
    │   └── lib/
    ├── package.json
    ├── tsconfig.json
    └── .env.example
```

---

## Connector ObservaPerú (MVP)

### Estrategia de ingesta

Dado que no hay API documentada, el connector ObservaPerú usará **reverse engineering de la interfaz de descarga**:

1. **Discovery**: Navegar programáticamente la interfaz de ObservaPerú para identificar:
   - URLs de descarga de datasets
   - Parámetros de formulario (filtros por entidad, año, indicador)
   - Formato de respuesta (Excel/CSV)

2. **Download**: Implementar descarga de datasets usando:
   - `fetch` con headers apropiados (User-Agent, cookies si es necesario)
   - Manejo de rate limiting (backoff exponencial)
   - Validación de checksums

3. **Parse**:
   - Excel: usar `xlsx` o similar para parsear archivos .xlsx
   - CSV: usar `csv-parse` (igual que apps existentes)

4. **Normalize**:
   - Mapeo de columnas (field-mapping.ts)
   - Normalización de datos (normalize.ts)
   - Manejo de valores nulos y anomalías

5. **Upsert**:
   - Guardar en tablas canónicas (strategic_objectives, strategic_actions, etc.)
   - Guardar lote crudo en raw_ceplan_batches (lake de evidencia)

### Scripts de ingest

**package.json scripts**:
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "migrate": "tsx src/db/migrate.ts",
    "ingest:observa": "tsx src/ingest/observa-connector.ts",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Variables de entorno

**.env.example**:
```env
# Database
DATABASE_URL=postgresql://ceplan:ceplan@localhost:5436/ceplan_estrategico

# ObservaPerú
OBSERVA_BASE_URL=https://observa.ceplan.gob.pe
OBSERVA_DOWNLOAD_TIMEOUT=30000
OBSERVA_RATE_LIMIT_DELAY=1000

# Crossref
RADAR_EJECUCION_API_URL=http://localhost:4000
RADAR_INVERSIONES_API_URL=http://localhost:4002
```

---

## API Endpoints

### Objetivos estratégicos
```
GET /api/objectives?entity_code={code}
GET /api/objectives/:id
```

### Indicadores
```
GET /api/indicators?entity_code={code}&indicator_code={code}
GET /api/indicators/:id
```

### Cruce con radar-ejecucion
```
GET /api/crossref?entity_code={code}
```
Respuesta:
```json
{
  "entity": {
    "entity_code": "123456",
    "nombre": "Gobierno Regional de La Libertad"
  },
  "strategic_objectives": [...],
  "budget_execution": {
    "entity_code": "123456",
    "funcion": "...",
    "anio_fiscal": 2026,
    "pia": ...,
    "pim": ...,
    "devengado": ...
  },
  "indicators": {
    "strategic_execution_gap": 33,
    "execution_efficiency": 0.52
  }
}
```

---

## Cruce con radar-ejecucion

### Implementación

**crossref/match.ts**:
```typescript
export async function matchWithRadarEjecucion(entityCode: string) {
  // Llamada a radar-ejecucion API
  const radarResponse = await fetch(
    `${process.env.RADAR_EJECUCION_API_URL}/api/budget-execution?entity_code=${entityCode}`
  );
  const budgetData = await radarResponse.json();

  // Consulta local de objetivos e indicadores
  const objectives = await pool.query(
    "SELECT * FROM strategic_objectives WHERE entity_code = $1",
    [entityCode]
  );
  const indicators = await pool.query(
    "SELECT * FROM strategic_indicators WHERE entity_code = $1",
    [entityCode]
  );

  // Cálculo de indicadores derivados
  const seg = calculateStrategicExecutionGap(budgetData, indicators.rows);
  const efficiency = calculateExecutionEfficiency(budgetData, indicators.rows);

  return {
    entity: { entity_code: entityCode, nombre: budgetData[0]?.entity_name },
    strategic_objectives: objectives.rows,
    budget_execution: budgetData,
    indicators: {
      strategic_execution_gap: seg,
      execution_efficiency: efficiency
    }
  };
}
```

### Ruta crossref

**routes/crossref.ts**:
```typescript
import express from "express";
import { matchWithRadarEjecucion } from "../crossref/match.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const { entity_code } = req.query;
  if (!entity_code) {
    return res.status(400).json({ error: "entity_code is required" });
  }

  try {
    const result = await matchWithRadarEjecucion(entity_code as string);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Crossref failed" });
  }
});

export default router;
```

---

## Indicadores derivados

### Strategic Execution Gap (SEG)
```typescript
function calculateStrategicExecutionGap(
  budgetData: any[],
  indicators: any[]
): number {
  const budgetExecution = budgetData[0]?.devengado / budgetData[0]?.pim * 100 || 0;
  const physicalTarget = indicators.find(i => i.indicator_code === 'CUMP02')?.value || 0;

  return budgetExecution - physicalTarget;
}
```

### Execution Efficiency
```typescript
function calculateExecutionEfficiency(
  budgetData: any[],
  indicators: any[]
): number {
  const budgetExecution = budgetData[0]?.devengado / budgetData[0]?.pim * 100 || 0;
  const physicalTarget = indicators.find(i => i.indicator_code === 'CUMP02')?.value || 0;

  return budgetExecution > 0 ? physicalTarget / budgetExecution : 0;
}
```

---

## Alternativas consideradas

### Alternativa 1: App standalone vs integración en radar-ejecucion
**Decisión**: App standalone
**Razón**:
- Sigue el patrón establecido por las apps existentes
- Separa responsabilidades (ejecución presupuestal vs planificación estratégica)
- Permite escalar independientemente (distintos volúmenes de datos, frecuencias de actualización)
- Facilita testing y mantenimiento

### Alternativa 2: API REST vs scraping para ObservaPerú
**Decisión**: Scraping de interfaz de descarga (reverse engineering)
**Razón**:
- No hay API REST documentada
- La interfaz de descarga es más estable que endpoints internos no documentados
- Permite obtener datasets completos en Excel/CSV
- Menor riesgo de cambios rotos que endpoints de dashboards interactivos

### Alternativa 3: Ingesta completa vs parcial
**Decisión**: Ingesta parcial con `isPartial: true` (igual que apps existentes)
**Razón**:
- Datasets de ObservaPerú pueden ser grandes
- Permite validar el pipeline end-to-end con datos reales
- Pattern consistente con radar-ejecucion y compras-publicas
- Para producción: migrar a streaming real (igual que el TODO en mef-connector.ts)

---

## Consecuencias

### Positivas
- Pattern consistente con apps existentes (facilita onboarding y mantenimiento)
- Separación clara de responsabilidades (ejecución vs planificación)
- Cruce con radar-ejecucion permite construir indicadores derivados potentes (SEG, Execution Efficiency)
- Arquitectura escalable (fácil agregar nuevas fuentes de CEPLAN en el futuro)

### Negativas
- Requiere reverse engineering de ObservaPerú (no hay API documentada)
- Alta volatilidad de la fuente (cambios en la interfaz pueden romper el conector)
- Necesita mantener sincronización con apps existentes (versiones de dependencias, patrones de código)

---

## Fases de implementación

### Fase 1: Scaffold de la app
- Crear estructura de directorios
- Configurar Docker Compose (Postgres + Adminer)
- Configurar package.json y scripts
- Configurar TypeScript y ESLint

### Fase 2: Migraciones de base de datos
- Crear tablas canónicas (strategic_objectives, strategic_actions, etc.)
- Crear tabla de raw batches (lake de evidencia)
- Crear tabla de crossref (opcional, puede ser solo API endpoint)

### Fase 3: Connector ObservaPerú (MVP)
- Reverse engineering de la interfaz de descarga
- Implementar descarga de datasets
- Implementar parseo (Excel/CSV)
- Implementar normalización y upsert

### Fase 4: API endpoints
- Endpoints de objetivos estratégicos
- Endpoints de indicadores
- Endpoint de crossref con radar-ejecucion

### Fase 5: Indicadores derivados
- Implementar cálculo de SEG
- Implementar cálculo de Execution Efficiency
- Implementar Plan–Budget Alignment (opcional, fase posterior)

### Fase 6: Frontend Next.js
- Dashboard de objetivos estratégicos
- Dashboard de indicadores
- Vista de crossref (gasto vs resultado)

### Fase 7: Testing y validación
- Tests unitarios de connector
- Tests de API endpoints
- Validación con datos reales

---

## Referencias

- Data contract: `docs/data-contracts/ceplan-strategic-planning.md`
- Pattern apps existentes: `apps/radar-ejecucion`, `apps/compras-publicas`
- ADR-0001: Modelo canónico
- ADR-0002: Infobras app standalone y cruce por CUI
