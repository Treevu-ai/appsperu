# ADR-0005: Matriz de cruces CEPLAN con ecosistema existente

## Contexto

Follow the Sol actualmente tiene 4 apps standalone con cruces implementados entre algunas de ellas. La incorporación de CEPLAN (2 apps nuevas: ceplan-estrategico y ceplan-geo) añade nuevas oportunidades de cruce que enriquecen el análisis de gasto público.

## Estado actual de cruces

### Cruces ya implementados

| App origen | App destino | Método de cruce | Estado |
|------------|-------------|-----------------|--------|
| radar-inversiones | radar-ejecucion | SEC_EJEC (exacto) | ✅ Implementado |
| compras-publicas | radar-ejecucion | Nombre de entidad (fuzzy) | ✅ Implementado |
| infobras | radar-inversiones | CUI (exacto) | ✅ Implementado |

### Cruces pendientes

| App origen | App destino | Método de cruce | Estado |
|------------|-------------|-----------------|--------|
| infobras | radar-ejecucion | Nombre de entidad (fuzzy) | ⏳ Pendiente |

---

## Nuevos cruces con CEPLAN

### Cruce ceplan-estrategico ↔ radar-ejecucion

**Método**: `entity_code` (SEC_EJEC) — **exacto**

**Propósito**: Conectar gasto con objetivos estratégicos

**Implementación**:
- **Endpoint**: `GET /api/crossref?entity_code={code}` en ceplan-estrategico
- **Llamada a**: `radar-ejecucion` API (`GET /api/budget-execution?entity_code={code}`)
- **Matcher**: exacto (no fuzzy)

**Datos enriquecidos**:
```json
{
  "entity": {
    "entity_code": "123456",
    "nombre": "Gobierno Regional de La Libertad"
  },
  "strategic_objectives": [
    {
      "objective_code": "OBJ001",
      "objective_name": "Reducir anemia en niños menores de 3 años",
      "perspective": "social"
    }
  ],
  "budget_execution": {
    "entity_code": "123456",
    "funcion": "Salud",
    "anio_fiscal": 2026,
    "pia": 50000000,
    "pim": 52000000,
    "devengado": 48000000
  },
  "indicators": {
    "strategic_execution_gap": 33,
    "execution_efficiency": 0.52,
    "plan_budget_alignment": {
      "Reducir anemia": 42000000,
      "Mejorar infraestructura educativa": 31000000
    }
  }
}
```

**Indicadores derivados**:
- Strategic Execution Gap (SEG)
- Execution Efficiency
- Plan–Budget Alignment

---

### Cruce ceplan-estrategico ↔ radar-inversiones

**Método**: `entity_code` (SEC_EJEC) — **exacto**

**Propósito**: Conectar inversiones con objetivos estratégicos

**Implementación**:
- **Endpoint**: `GET /api/crossref?entity_code={code}` en ceplan-estrategico
- **Llamada a**: `radar-inversiones` API (`GET /api/inversions?sec_ejec={code}`)
- **Matcher**: exacto (no fuzzy)

**Datos enriquecidos**:
```json
{
  "entity": {
    "entity_code": "123456",
    "nombre": "Gobierno Regional de La Libertad"
  },
  "strategic_objectives": [...],
  "inversions": [
    {
      "cui": "2716769",
      "nombre": "Construcción de Centro de Salud...",
      "estado": "VIABLE",
      "monto_viable": 1853953.5,
      "departamento": "La Libertad"
    }
  ],
  "indicators": {
    "inversions_by_objective": {
      "Reducir anemia": 12,
      "Mejorar infraestructura educativa": 8
    }
  }
}
```

**Indicadores derivados**:
- Inversions by Objective (número de inversiones por objetivo estratégico)
- Budget by Objective (monto de inversiones por objetivo estratégico)

---

### Cruce ceplan-geo ↔ infobras

**Método**: **espacial** (point-in-polygon, buffer, proximity)

**Propósito**: Enriquecer obras con contexto territorial e infraestructura

**Implementación**:
- **Endpoint**: `GET /api/crossref?feature_type=obras&bbox={minx,miny,maxx,maxy}` en ceplan-geo
- **Llamada a**: `infobras` API (filtrar por ubicación)
- **Matcher**: espacial (PostGIS ST_Intersects, ST_DWithin)

**Datos enriquecidos**:
```json
{
  "features": [
    {
      "obra": {
        "snip": "123456",
        "nombre": "Construcción de escuela...",
        "estado": "EJECUCION",
        "avance_fisico": 48
      },
      "territory": {
        "departamento": "La Libertad",
        "provincia": "Trujillo",
        "distrito": "Trujillo",
        "ubigeo": "130101"
      },
      "nearby_infrastructure": [
        {
          "type": "aeropuerto",
          "name": "Aeropuerto Cap. FAP Carlos Martínez de Pinillos",
          "distance_km": 12.5
        },
        {
          "type": "puerto",
          "name": "Puerto de Salaverry",
          "distance_km": 25.3
        }
      ]
    }
  ]
}
```

**Indicadores derivados**:
- Obras por territorio (departamento/provincia/distrito)
- Obras cerca de infraestructura clave (aeropuertos, puertos)
- Accesibilidad territorial (distritos con baja accesibilidad)

---

### Cruce ceplan-geo ↔ radar-inversiones

**Método**: **espacial** (proximity analysis, corridor alignment)

**Propósito**: Enrichcer inversiones con contexto territorial

**Implementación**:
- **Endpoint**: `GET /api/crossref?feature_type=inversiones&bbox={minx,miny,maxx,maxy}` en ceplan-geo
- **Llamada a**: `radar-inversiones` API (filtrar por ubicación)
- **Matcher**: espacial (PostGIS ST_DWithin, ST_Intersects)

**Datos enriquecidos**:
```json
{
  "features": [
    {
      "inversion": {
        "cui": "2716769",
        "nombre": "Carretera Trujillo - Huamachuco",
        "estado": "VIABLE",
        "monto_viable": 1853953.5
      },
      "territory": {
        "departamento": "La Libertad",
        "provincia": "Santiago de Chuco",
        "distrito": "Huamachuco"
      },
      "nearby_infrastructure": [
        {
          "type": "puerto",
          "name": "Puerto de Salaverry",
          "distance_km": 45.2
        }
      ],
      "logistic_corridor": true
    }
  ]
}
```

**Indicadores derivados**:
- Inversiones viales cerca de puertos
- Proyectos en corredores logísticos
- Inversiones por territorio

---

### Cruce ceplan-geo ↔ radar-ejecucion

**Método**: `ubigeo` — **exacto**

**Propósito**: Análisis geográfico de ejecución presupuestal

**Implementación**:
- **Endpoint**: `GET /api/crossref?feature_type=ejecucion&ubigeo={code}` en ceplan-geo
- **Llamada a**: `radar-ejecucion` API (filtrar por ubigeo)
- **Matcher**: exacto (UBIGEO)

**Datos enriquecidos**:
```json
{
  "territory": {
    "ubigeo": "130101",
    "departamento": "La Libertad",
    "provincia": "Trujillo",
    "distrito": "Trujillo"
  },
  "budget_execution": [
    {
      "entity_code": "123456",
      "entity_name": "Municipalidad Provincial de Trujillo",
      "funcion": "Transporte",
      "anio_fiscal": 2026,
      "pia": 10000000,
      "pim": 10500000,
      "devengado": 9500000
    }
  ],
  "infrastructure": [
    {
      "type": "aeropuerto",
      "name": "Aeropuerto Cap. FAP Carlos Martínez de Pinillos"
    }
  ]
}
```

**Indicadores derivados**:
- Ejecución presupuestal por territorio
- Infraestructura por territorio
- Presupuesto vs infraestructura territorial

---

### Cruce ceplan-estrategico ↔ ceplan-geo

**Método (revisado 2026-08-26, Fase 2):** `departamento` → prefijo UBIGEO + estadísticas territoriales — **no** `entity_code → ubigeo`

**Motivo de la corrección:** ObservaPerú no publica indicadores por entidad ni por departamento; solo buckets GN/GR/MP/MD nacionales. No existe llave para unir un pliego con un polígono distrital.

**Propósito:** Adjuntar marco estratégico nacional (CUMP02/CUMP03) al contexto territorial de un departamento piloto (distritos, infraestructura).

**Implementación (Sprint 7):**
- **Endpoint**: `GET /api/crossref/territorial?departamento=` en `ceplan-estrategico`
- **Llamada a**: `ceplan-geo` API (agregados por departamento)
- **Matcher**: `departamento_prefijo_ubigeo`

Ver contrato: `docs/data-contracts/ceplan-crossref-territorial-v1.md`

**Datos enriquecidos (ejemplo corregido):**
```json
{
  "matcher": "departamento_prefijo_ubigeo",
  "cobertura": "PARCIAL",
  "departamento": "LA LIBERTAD",
  "ubigeoPrefijo": "13",
  "marcoEstrategicoNacional": {
    "GN": { "CUMP02": 73.7, "CUMP03": 95.1, "segPp": 21.4 }
  },
  "contextoTerritorial": {
    "distritos": 83,
    "infraestructura": { "aeropuerto": 7, "puerto": 1 }
  }
}
```

~~**Método**: espacial + entidad (combinado)~~ — **obsoleto**; retirado en Fase 2.

**Indicadores derivados (contexto territorial):**
- Distritos e infraestructura por departamento piloto
- No implica cobertura de objetivos estratégicos por territorio

---

## Matriz completa de cruces

| App origen | App destino | Método de cruce | Estado |
|------------|-------------|-----------------|--------|
| radar-inversiones | radar-ejecucion | SEC_EJEC (exacto) | ✅ Implementado |
| compras-publicas | radar-ejecucion | Nombre de entidad (fuzzy) | ✅ Implementado |
| infobras | radar-inversiones | CUI (exacto) | ✅ Implementado |
| infobras | radar-ejecucion | Nombre de entidad (fuzzy) | ⏳ Pendiente |
| **ceplan-estrategico** | **radar-ejecucion** | **entity_code (exacto)** | 🆕 Nuevo |
| **ceplan-estrategico** | **radar-inversiones** | **entity_code (exacto)** | 🆕 Nuevo |
| **ceplan-geo** | **infobras** | **espacial (point-in-polygon)** | 🆕 Nuevo |
| **ceplan-geo** | **radar-inversiones** | **espacial (proximity)** | 🆕 Nuevo |
| **ceplan-geo** | **radar-ejecucion** | **ubigeo (exacto)** | 🆕 Nuevo |
| **ceplan-estrategico** | **ceplan-geo** | **entity_code → ubigeo** | 🆕 Nuevo |

---

## Arquitectura de cruces

### Patrón de implementación

Todos los cruces siguen el mismo patrón que las apps existentes:

1. **API endpoint** en la app origen (`GET /api/crossref`)
2. **Llamada HTTP** a la app destino
3. **Matcher** (exacto, fuzzy, o espacial)
4. **Enriquecimiento** de datos
5. **Cálculo de indicadores derivados**
6. **Respuesta JSON** consolidada

### Dependencias entre apps

```
┌─────────────────────────────────────────────────────────────────┐
│                     Ecosistema Follow the Sol                   │
└─────────────────────────────────────────────────────────────────┘

    MEF                    OECE                  CEPLAN
    │                      │                      │
    ├─ radar-ejecucion     ├─ compras-publicas   ├─ ceplan-estrategico
    │  (4000)              │  (4001)              │  (4004)
    │                      │                      │
    └─ radar-inversiones                          └─ ceplan-geo
       (4002)                                     (4005)

    INFOBRAS
    │
    └─ infobras
       (4003)

Cruces existentes:
- radar-inversiones → radar-ejecucion (SEC_EJEC)
- compras-publicas → radar-ejecucion (nombre fuzzy)
- infobras → radar-inversiones (CUI)

Nuevos cruces CEPLAN:
- ceplan-estrategico → radar-ejecucion (entity_code)
- ceplan-estrategico → radar-inversiones (entity_code)
- ceplan-geo → infobras (espacial)
- ceplan-geo → radar-inversiones (espacial)
- ceplan-geo → radar-ejecucion (ubigeo)
- ceplan-estrategico → ceplan-geo (entity_code → ubigeo)
```

---

## Prioridad de implementación

### Fase 1: Cruces estratégicos (ceplan-estrategico)
1. **ceplan-estrategico ↔ radar-ejecucion** (prioridad alta)
   - Conecta gasto con objetivos estratégicos
   - Permite calcular SEG y Execution Efficiency
   - Es el cruce más valioso según el análisis de CEPLAN

2. **ceplan-estrategico ↔ radar-inversiones** (prioridad alta)
   - Conecta inversiones con objetivos estratégicos
   - Permite analizar si las inversiones alinean con objetivos

### Fase 2: Cruces geoespaciales (ceplan-geo)
3. **ceplan-geo ↔ infobras** (prioridad media)
   - Enriquece obras con contexto territorial
   - Útil para análisis de accesibilidad y cobertura

4. **ceplan-geo ↔ radar-inversiones** (prioridad media)
   - Enriquece inversiones con contexto territorial
   - Útil para análisis de corredores logísticos

5. **ceplan-geo ↔ radar-ejecucion** (prioridad baja)
   - Análisis geográfico de ejecución presupuestal
   - Menos urgente que los anteriores

### Fase 3: Cruce integrador
6. **ceplan-estrategico ↔ ceplan-geo** (prioridad baja)
   - Conecta objetivos estratégicos con contexto territorial
   - Útil para análisis geográfico de prioridades estratégicas

---

## Consideraciones técnicas

### Performance de cruces espaciales
- Los cruces espaciales (ceplan-geo) son más costosos que los cruces exactos
- Requieren índices GIST en PostGIS para queries rápidas
- Considerar caché de resultados para queries frecuentes

### Consistencia de datos
- Las apps pueden tener diferentes frecuencias de actualización
- Implementar timestamps de última actualización en cada API
- Documentar la "freshness" de cada cruce en la respuesta

### Fallbacks
- Si una app destino está caída, el cruce debe fallar gracefully
- Retornar datos parciales (solo de la app origen) con un warning
- Implementar retries con backoff exponencial

---

## Referencias

- ADR-0001: Modelo canónico
- ADR-0002: Infobras app standalone y cruce por CUI
- ADR-0003: CEPLAN Estratégico app standalone
- ADR-0004: CEPLAN Geo app standalone
- Data contracts: `docs/data-contracts/`
