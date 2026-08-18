# Roadmap de implementación — CEPLAN Integration

**Fecha**: 2026-08-17
**Versión**: 1.0
**Estado**: Plan detallado completado

---

## Resumen ejecutivo

Este roadmap detalla la implementación de **2 nuevas apps** para integrar CEPLAN en Follow the Sol:

1. **ceplan-estrategico** — Strategic Planning Connector (PEI/POI/Metas)
2. **ceplan-geo** — Geo Connector (GeoServer OGC)

Ambas apps siguen el patrón standalone establecido por las apps existentes (radar-ejecucion, compras-publicas, radar-inversiones, infobras) y añaden nuevas capacidades de análisis:

- **Strategic Execution Gap (SEG)**: discrepancias entre gasto y resultado físico
- **Execution Efficiency**: distinción entre entidades que ejecutan bien vs las que solo gastan
- **Plan–Budget Alignment**: conexión entre discurso estratégico y asignación real de recursos
- **Enriquecimiento territorial**: contexto geoespacial para obras e inversiones

---

## Priorización estratégica

### Impacto vs Esfuerzo

| App | Impacto | Esfuerzo | Prioridad |
|-----|---------|----------|-----------|
| ceplan-estrategico | 5 | 3-4 | 🟢 Alta |
| ceplan-geo | 4 | 2 | 🟢 Alta |

**Recomendación**: Empezar con **ceplan-estrategico** (mayor valor estratégico) y luego **ceplan-geo** (más rápido de implementar, GeoServer es estándar OGC).

---

## Fase 1: ceplan-estrategico (Sprint 1-2)

### Objetivo
Conectar gasto público con objetivos estratégicos mediante ObservaPerú (datasets descargables).

### Duración estimada
- **Sprint 1**: Scaffold + Migraciones + Connector MVP (5-7 días)
- **Sprint 2**: API endpoints + Cruce con radar-ejecucion + Indicadores derivados (5-7 días)

### Entregables

#### Sprint 1: Infraestructura e ingest
- [ ] Scaffold de la app (estructura de directorios, Docker Compose, package.json)
- [ ] Migraciones de base de datos (strategic_objectives, strategic_actions, poi_activities, physical_targets, strategic_indicators, raw_ceplan_batches)
- [ ] Reverse engineering de ObservaPerú (identificar URLs de descarga, parámetros de formulario)
- [ ] Connector ObservaPerú (descarga, parseo Excel/CSV, normalización, upsert)
- [ ] Validación con datos reales (ingesta parcial con `isPartial: true`)

#### Sprint 2: API y cruces
- [ ] API endpoints (objetivos estratégicos, indicadores)
- [ ] Cruce con radar-ejecucion (entity_code exacto)
- [ ] Implementación de indicadores derivados (SEG, Execution Efficiency)
- [ ] Documentación de data contract actualizada (si hay cambios tras implementación)
- [ ] Tests unitarios y de integración

### Hitos
- **Milestone 1**: Ingesta exitosa de datasets de ObservaPerú
- **Milestone 2**: Cruce funcional con radar-ejecucion
- **Milestone 3**: Indicadores derivados calculados correctamente

### Riesgos
- **Alto**: Volatilidad de ObservaPerú (cambios en la interfaz sin aviso)
- **Medio**: Complejidad del reverse engineering (no hay API documentada)
- **Bajo**: Integración con radar-ejecucion (pattern ya probado en otras apps)

### Mitigación
- Implementar logging detallado de requests para detectar cambios en la interfaz
- Monitoreo de errores de ingesta para reaccionar rápido a cambios
- Tests automatizados que validen el formato de los datos

---

## Fase 2: ceplan-geo (Sprint 3-4)

### Objetivo
Enriquecer obras e inversiones con contexto territorial e infraestructura mediante GeoServer CEPLAN.

### Duración estimada
- **Sprint 3**: Scaffold + Migraciones + Connector GeoServer (5-7 días)
- **Sprint 4**: API endpoints + Cruces espaciales + Frontend de mapas (5-7 días)

### Entregables

#### Sprint 3: Infraestructura e ingest
- [ ] Scaffold de la app (estructura de directorios, Docker Compose con PostGIS, package.json)
- [ ] Migraciones de base de datos (geo_layers, geo_features, territories, infrastructure, raw_geoserver_batches, extensión PostGIS)
- [ ] Discovery del GeoServer (GetCapabilities del WFS, catálogo de capas)
- [ ] Connector GeoServer (WFS GetFeature, parseo GeoJSON, normalización PostGIS, upsert)
- [ ] Validación con datos reales (ingesta de capas territoriales)

#### Sprint 4: API y cruces
- [ ] API endpoints (capas, features, territorios, infraestructura)
- [ ] Cruce espacial con infobras (point-in-polygon, buffer)
- [ ] Cruce espacial con radar-inversiones (proximity analysis)
- [ ] Frontend Next.js + Leaflet/MapLibre (visualización de mapas)
- [ ] Documentación de data contract actualizada
- [ ] Tests unitarios y de integración

### Hitos
- **Milestone 1**: Ingesta exitosa de capas del GeoServer
- **Milestone 2**: Cruce espacial funcional con infobras
- **Milestone 3**: Visualización de mapas interactiva

### Riesgos
- **Bajo**: GeoServer es estándar OGC (más estable que scraping)
- **Medio**: Tamaño de capas grandes (requiere paginación WFS)
- **Bajo**: PostGIS learning curve (pero es tecnología estándar)

### Mitigación
- Implementar paginación WFS (`startIndex`, `count`) para capas grandes
- Monitoreo de performance de queries espaciales
- Tests de carga para validar rendimiento con datasets grandes

---

## Fase 3: Cruces avanzados (Sprint 5)

### Objetivo
Implementar cruces adicionales entre apps existentes y nuevas apps CEPLAN.

### Duración estimada
- **Sprint 5**: Cruces pendientes + optimización (5-7 días)

### Entregables
- [ ] Cruce infobras ↔ radar-ejecucion (nombre de entidad, fuzzy matcher)
- [ ] Cruce ceplan-geo ↔ radar-ejecucion (ubigeo exacto)
- [ ] Cruce ceplan-estrategico ↔ ceplan-geo (entity_code → ubigeo)
- [ ] Optimización de performance (caché de cruces, índices)
- [ ] Documentación de matriz de cruces actualizada

### Hitos
- **Milestone 1**: Matriz de cruces completa (6 cruces nuevos + 3 existentes)
- **Milestone 2**: Performance aceptable (< 1s para cruces simples, < 5s para cruces espaciales)

---

## Fase 4: Frontend consolidado (Sprint 6)

### Objetivo
Dashboard consolidado que muestre el valor completo de CEPLAN + ecosistema existente.

### Duración estimada
- **Sprint 6**: Frontend + visualización (5-7 días)

### Entregables
- [ ] Dashboard de objetivos estratégicos (ceplan-estrategico)
- [ ] Dashboard de indicadores derivados (SEG, Execution Efficiency)
- [ ] Dashboard de mapas interactivos (ceplan-geo)
- [ ] Vista consolidada de cruces (gasto vs resultado vs territorio)
- [ ] Documentación de usuario actualizada

### Hitos
- **Milestone 1**: Dashboard funcional con datos reales
- **Milestone 2**: Storytelling visual del valor de CEPLAN

---

## Cronograma resumido

| Sprint | Fase | Duración | Entregable clave |
|--------|------|----------|------------------|
| 1-2 | ceplan-estrategico | 10-14 días | Cruce gasto vs objetivos estratégicos |
| 3-4 | ceplan-geo | 10-14 días | Enriquecimiento territorial de obras |
| 5 | Cruces avanzados | 5-7 días | Matriz de cruces completa |
| 6 | Frontend consolidado | 5-7 días | Dashboard de valor completo |

**Total estimado**: 30-42 días (6-8 semanas)

---

## Dependencias externas

### CEPLAN
- **GeoServer**: Estable (estándar OGC)
- **ObservaPerú**: Volátil (cambios en interfaz sin aviso)
- **Pulso SINAPLAN**: No priorizado para MVP

### Stack técnico
- **PostGIS**: Requiere instalación adicional (Docker image con PostGIS)
- **Librerías de Excel**: `xlsx` o similar para parsear archivos de ObservaPerú
- **Librerías de mapas**: Leaflet o MapLibre para frontend

---

## Métricas de éxito

### Técnicas
- [ ] Ingesta exitosa de datasets de ObservaPerú (≥ 90% de filas aceptadas)
- [ ] Ingesta exitosa de capas del GeoServer (≥ 95% de features aceptados)
- [ ] Performance de cruces (< 1s para cruces exactos, < 5s para cruces espaciales)
- [ ] Cobertura de tests (≥ 80%)

### De negocio
- [ ] Indicadores derivados calculados correctamente (SEG, Execution Efficiency)
- [ ] Cruce funcional con al menos 2 apps existentes
- [ ] Dashboard de valor completo con storytelling visual
- [ ] Documentación completa (data contracts, ADRs, roadmap)

---

## Próximos pasos

### Inmediato (antes de Sprint 1)
1. Revisar este roadmap con el equipo
2. Aprobar priorización (ceplan-estrategico primero)
3. Asignar recursos para Sprint 1
4. Configurar repositorio para ceplan-estrategico

### Sprint 1 (Kickoff)
1. Crear scaffold de ceplan-estrategico
2. Configurar Docker Compose (Postgres + Adminer)
3. Iniciar reverse engineering de ObservaPerú
4. Implementar primer MVP del connector

---

## Referencias

- Data contracts: `docs/data-contracts/ceplan-strategic-planning.md`, `docs/data-contracts/ceplan-geo.md`
- ADRs: `docs/adr/0003-ceplan-estrategico-app-standalone-y-connector-observaperu.md`, `docs/adr/0004-ceplan-geo-app-standalone-y-connector-geoserver.md`
- Matriz de cruces: `docs/adr/0005-matriz-de-cruces-ceplan-con-ecosistema-existente.md`
- Estado actual: `docs/ESTADO.md`
- Pattern apps existentes: `apps/radar-ejecucion`, `apps/compras-publicas`, `apps/radar-inversiones`, `apps/infobras`
