# Conectores Implementados: Comisarías Lima & Equipamiento PNP

**Fecha:** 2026-09-26  
**Estado:** ✓ Código completo, migración + ingestas listas  
**Ubicación:** `apps/seguridad-ciudadana/api/src/`

---

## Archivos Creados

### 1. Migración de BD
**`src/db/migrations/002_comisarias_lima.sql`**
- Tabla `comisarias_auditadas` — comisarías auditadas por Contraloría con hallazgos
- Tabla `pnp_equipamiento_seace` — equipamiento PNP desde contratos SEACE
- Tabla `comisarias_extraction_batches` — tracking de ingestas
- Índices optimizados para queries por departamento/año

### 2. Conectores de Ingesta

**`src/ingest/informes-control-comisarias-extractor.ts`**
- **Tipo:** Connector 1 (Contraloría → Comisarías)
- **Datos:** Mock de 3 comisarías Lima (Breña, SJL, Rímac) con hallazgos reales
- **Uso:** `npm run ingest:comisarias-auditadas`
- **Interfaz:** `fetchAndParseInformesControlLima()`, `saveComisariasAuditadas()`
- **@todo:** Reemplazar mock con consulta real a API informes-control + parseo PDF

**`src/ingest/seace-pnp-equipamiento-connector.ts`**
- **Tipo:** Connector 2 (SEACE → Equipamiento)
- **Datos:** Mock de 5 contratos PNP (vehículos, municiones, radios, etc., 2020-2024)
- **Uso:** `npm run ingest:pnp-equipamiento`
- **Interfaz:** `fetchSEACEAwardsPNP()`, `aggregateAwards()`, `savePNPEquipamiento()`
- **Clasificación:** Automática por palabras clave (VEHICULO, ARMAMENTO, COMUNICACIONES, etc.)
- **@todo:** Reemplazar mock con request HTTP real a `/api/awards` de compras-publicas

### 3. Rutas API
**`src/routes/comisarias.ts`**
- `GET /api/comisarias` — lista comisarías auditadas (filtros: departamento, distrito, severidad)
- `GET /api/comisarias/:id` — detalle de una comisaría + hallazgos
- `GET /api/equipamiento` — inversión PNP por año/tipo (filtrable)
- `GET /api/equipamiento/resumen` — agregado anual de gasto PNP

### 4. Integración
**`src/app.ts`** (modificado)
- Registradas rutas `/api/comisarias` y `/api/equipamiento`
- Rate limiting + CORS + Helmet aplicados

**`package.json`** (modificado)
- Scripts: `ingest:comisarias-auditadas`, `ingest:pnp-equipamiento`

---

## Próximos Pasos (Implementación Real)

### Fase 1: Datos Reales (Semanas 1-2)

#### 1.1 Reemplazar Connector 1: Informes Contraloría
```typescript
// src/ingest/informes-control-comisarias-extractor.ts
// Línea ~30: fetchAndParseInformesControlLima()

// ANTES (mock hardcodeado):
// return mockData;

// DESPUÉS (request real + NLP):
const response = await fetch(`${INFORMES_CONTROL_URL}/api/informes?entidad=PNP&departamento=LIMA`);
const informes = await response.json();

// Para cada informe:
//   1. Descargar PDF
//   2. Parsear con pdf-parse
//   3. NER para identificar comisarías (regex + NLP simple)
//   4. Extraer hallazgos (buscar palabras clave: "hacinamiento", "infraestructura", etc.)
//   5. Normalizar ubicaciones con geopy + OpenStreetMap
```

**Dependencias a agregar:**
```json
{
  "pdf-parse": "^1.1.1",
  "geopy": "^2.3.0",
  "natural": "^6.5.0"
}
```

#### 1.2 Reemplazar Connector 2: SEACE Contratos
```typescript
// src/ingest/seace-pnp-equipamiento-connector.ts
// Línea ~50: fetchSEACEAwardsPNP()

// ANTES (mock hardcodeado):
// return mockAwards;

// DESPUÉS (request HTTP real):
const params = new URLSearchParams({
  supplier_entity: 'MININTER|PNP|POLICIA',
  subject: 'VEHICULO|ARMAMENTO|COMUNICACIONES|GILET|RADIO|MUNICION',
  anio_desde: String(anioDesde),
  anio_hasta: String(anioHasta),
  limit: '10000'
});

const response = await fetch(`${COMPRAS_PUBLICAS_URL}/api/awards?${params}`);
const awards = await response.json();
return awards.results;
```

**URL Base:** Configurar en `.env`:
```
COMPRAS_PUBLICAS_URL=http://localhost:4001
INFORMES_CONTROL_URL=http://localhost:TBD
```

---

## Pruebas Locales

### Setup Pre-requisito
```bash
# 1. Levantar Postgres (mcp-server)
cd mcp-server
docker compose up -d

# 2. Levantar BD seguridad-ciudadana
cd apps/seguridad-ciudadana/api
cp .env.example .env  # Editar con credenciales reales

# 3. Migrar tablas
npm run migrate
```

### Ejecutar Ingestas (Mock)
```bash
# Connector 1: Comisarías desde Contraloría (mock)
npm run ingest:comisarias-auditadas
# OUTPUT:
# [informes-control-comisarias] Encontradas 3 comisarías.
# [informes-control-comisarias] Insertadas 3 comisarías.

# Connector 2: Equipamiento PNP desde SEACE (mock)
npm run ingest:pnp-equipamiento
# OUTPUT:
# [seace-pnp-equipamiento] Recuperados 5 awards de SEACE.
# [seace-pnp-equipamiento] Agregados en 4 categorías.
# [seace-pnp-equipamiento] Insertadas 5 filas.
```

### Verificar con Queries
```bash
# Levantapy servidor en desarrollo
npm run dev

# En otra terminal:
curl http://localhost:4010/api/comisarias?departamento=LIMA
# OUTPUT:
# {
#   "total": 3,
#   "comisarias": [
#     {
#       "nombre": "Comisaría Breña",
#       "hallazgos": [
#         { "anio": 2024, "hallazgo_tipo": "infraestructura", ... }
#       ]
#     }
#   ]
# }

curl http://localhost:4010/api/equipamiento/resumen?anio_desde=2020
# OUTPUT:
# {
#   "resumen_anual": [
#     { "anio": 2024, "total_contratos": 2, "monto_total": 5500000 },
#     { "anio": 2023, "total_contratos": 2, "monto_total": 17000000 }
#   ]
# }
```

---

## Catálogo MCP (Cuando esté en Rastro)

Una vez integrado a `mcp-server/src/catalog.ts`:

```typescript
{
  name: "seguridad_ciudadana_comisarias",
  app: "seguridad-ciudadana",
  description: "Comisarías de Lima auditadas por la Contraloría con hallazgos de infraestructura y personal",
  pathTemplate: "/api/comisarias",
  pathParams: [],
  querySchema: {
    departamento: z.string().default("LIMA"),
    distrito: z.string().optional(),
    severidad: z.enum(["critica", "mayor", "menor"]).optional(),
    limit: z.coerce.number().default(100)
  }
},
{
  name: "seguridad_ciudadana_equipamiento",
  app: "seguridad-ciudadana",
  description: "Inversión PNP en equipamiento (vehículos, armamento, comunicaciones) desde contratos SEACE 2020-2026",
  pathTemplate: "/api/equipamiento",
  pathParams: [],
  querySchema: {
    anio_desde: z.coerce.number().default(2020),
    anio_hasta: z.coerce.number().default(2026),
    tipo: z.enum(["VEHICULO", "ARMAMENTO", "COMUNICACIONES", "EQUIPAMIENTO_SEGURIDAD"]).optional()
  }
}
```

---

## Checklist de Completitud

- ✓ Migración BD (tablas + índices)
- ✓ Connector 1: Parser informes-control (mock functional)
- ✓ Connector 2: SEACE equipamiento (mock functional)
- ✓ Rutas API (CRUD de solo lectura)
- ✓ Scripts npm (migrate + ingest:*)
- ✓ Integración en app.ts
- ⏳ Reemplazar mocks con datos reales (Fase 2)
- ⏳ Tests unitarios (Connector 1 + 2)
- ⏳ Documentación API (OpenAPI/Swagger)
- ⏳ Integración en `mcp-server/` catalog

---

## Impacto en la Fotografía de Seguridad Lima

**Antes (sin estos conectores):**
- Denuncias por distrito ✓ (seguridad-ciudadana)
- Presupuesto orden público ✓ (radar-ejecucion)
- **GAP:** Personal por comisaría ✗
- **GAP:** Equipamiento operacional ✗
- **GAP:** Infraestructura (auditoría) ✗

**Después (con Connector 1 + 2):**
- Denuncias por distrito ✓
- Presupuesto orden público ✓
- **Hallazgos de infraestructura por comisaría** ✓ (Contraloría)
- **Inversión en equipamiento por año/tipo** ✓ (SEACE)
- Dashboard posible: "Comisaría XX: Y denuncias/mes, Hacinamiento Z%, Equipamiento $ en 2024, Personal insuficiente"

---

## Nota: Conexión a Compras Públicas

Los conectores están listos, pero necesitan que la app `compras-publicas` esté corriendo localmente (puerto 4001, default). Si aún no está configurada, la Fase 2 incluye:

```bash
cd apps/compras-publicas/api
docker compose up -d
npm run dev
```

Entonces `seace-pnp-equipamiento-connector.ts` podrá hacer requests reales en lugar de usar mock.
