# PRD — CEPLAN × ALSOL Fase 2 (5 regiones piloto) v1

**Versión:** 1.0  
**Estado:** planificado  
**Fecha:** 2026-08-26  
**Producto:** ALSOL / Follow the Sol  
**PRD anterior:** [`docs/PRD_CEPLAN_Geo_v1.md`](PRD_CEPLAN_Geo_v1.md) (Sprints 3–5, implementado)  
**Ámbito:** API/CLI/MCP, indicadores derivados, capas geo adicionales, análisis sectorial reproducible. **Sin nuevos frontends web.**

## 1. Decisión de producto

La Fase 1 de CEPLAN dejó operativas **`ceplan-estrategico`** (indicadores ObservaPerú agregados por nivel de gobierno) y **`ceplan-geo`** (territorio + infraestructura WFS). La Fase 2 **no expande a las 25 regiones**: se concentra en el **corte ALSOL ya verificado** en cinco departamentos:

| Código UBIGEO (prefijo) | Departamento | Rol en piloto |
|---|---|---|
| `13` | **LA LIBERTAD** | Referencia — ingesta, cruces y memos ya validados |
| `14` | **LAMBAYEQUE** | Réplica prioritaria |
| `20` | **PIURA** | Réplica prioritaria |
| `06` | **CAJAMARCA** | Réplica |
| `08` | **CUSCO** | Réplica |

Objetivo: convertir el ecosistema de 9 apps en un **kit de análisis regional reproducible** — mismo método, mismas restricciones de evidencia, cinco cortes territoriales comparables.

```text
Hoy:     La Libertad tiene memos + ceplan-geo + cruces; el resto tiene CLI de filtro pero sin corrida terminal verificada ni storytelling
Objetivo: puente estratégico↔territorial honesto + indicadores derivados + capas geo evaluadas + 4 memos regionales nuevos
```

## 2. Problema

| Brecha | Evidencia | Consecuencia |
|---|---|---|
| **ceplan-estrategico ↔ ceplan-geo** sin cruce | ObservaPerú no trae `entity_code` ni UBIGEO; CEPLAN estratégico es GN/GR/MP/MD nacional | No se puede afirmar alineación estratégica por distrito ni por entidad |
| **Indicadores derivados** en roadmap pero no productizados | SEG/Execution Efficiency existen como fórmula en data contract; cruce actual es solo GN/GR nacional | No hay SEG comparable entre regiones ni Plan–Budget Alignment operativo |
| **Capas geo** `cb_redhidrica` / `cb_proyectos` sin spike cerrado | CG-25 pospuesto en Sprint 5 | Incertidumbre de volumen y utilidad analítica |
| **Análisis sectorial** solo en La Libertad | 3 memos en `docs/analisis-*-la-libertad*` | No hay comparación interregional con el mismo método |

## 3. Objetivo y no objetivos

### Objetivos v1 (Fase 2)

1. **Puente territorial CEPLAN** — cruce `ceplan-estrategico` ↔ `ceplan-geo` a nivel **departamento** (no per-entidad), con marco nacional GN/GR como referencia y estadísticas geo del departamento.
2. **Indicadores derivados productizados** — SEG, Execution Efficiency y Plan–Budget Alignment (PBA) como endpoints/CLI documentados, con proxies departamentales donde la fuente no permita granularidad CEPLAN.
3. **Spike e ingesta condicional** de `cb_redhidrica` y `cb_proyectos` — decisión `AUTOMATIZABLE` / `POSPONER` / `MVP_ACOTADO` con evidencia de tamaño y paginación.
4. **Paquete de análisis regional** — plantilla y corrida reproducible para Lambayeque, Piura, Cajamarca y Cusco, alineada a los memos de La Libertad.
5. **Cobertura verificable** — cada región nueva debe pasar por el runbook territorial (`docs/RUNBOOK_Cobertura_Territorial_ALSOL.md`) antes de publicar conclusiones.

### No objetivos

- No extender ingestas/cruces a departamentos fuera de los cinco listados.
- No simular indicadores CEPLAN per-entidad ni per-distrito cuando ObservaPerú no los publica.
- No construir dashboards web nuevos (política API-only).
- No afirmar causalidad estratégica (“el plan causó el gasto”) — solo co-ocurrencia y brechas documentadas.
- No reemplazar `salud-institucional`; los indicadores CEPLAN son complementarios y con granularidad distinta.

## 4. Principios y jerarquía de evidencia

| Nivel | Evidencia | Uso permitido |
|---|---|---|
| A | UBIGEO / prefijo departamental (`13`, `14`, …) en `ceplan-geo.territories` | Agregar obras, inversiones y ejecución por departamento |
| A | Indicadores CEPLAN `CUMP02`/`CUMP03` por bucket GN/GR | SEG nacional de referencia |
| B | Proxy departamental: ejecución MEF vs avance físico INFOBRAS | SEG regional aproximado — **etiquetado `PROXY`**, no equivalente a CEPLAN |
| B | Mapeo heurístico dimensión CEPLAN → función MEF | Plan–Budget Alignment exploratorio — tabla de mapeo versionada y auditable |
| C | Capas `cb_redhidrica` / `cb_proyectos` post-spike | Contexto sectorial si el spike confirma volumen manejable |
| Prohibido | Inventar `entity_code` CEPLAN, point-in-polygon con INFOBRAS, extender cobertura sin corrida terminal | — |

Toda respuesta de cruce o indicador incluye: `matcher`, `cobertura`, `restriccion`, `dependencias`, `corte`.

## 5. Diseño del puente ceplan-estrategico ↔ ceplan-geo

### Limitación de fuente (no negociable)

ObservaPerú publica indicadores **agregados por nivel de gobierno** (`GN`/`GR`/`MP`/`MD`/`Total`), sin llave territorial ni `SEC_EJEC`. Por tanto el cruce **no puede** ser `entity_code → ubigeo` como planteaba el ADR-0005 original.

### Enfoque aprobado: **marco estratégico + contexto territorial departamental**

Nuevo endpoint (ubicación propuesta: `ceplan-estrategico/api`):

```
GET /api/crossref/territorial?departamento=LA%20LIBERTAD
```

**Respuesta conceptual:**

```json
{
  "matcher": "departamento_prefijo_ubigeo",
  "cobertura": "PARCIAL",
  "restriccion": "Indicadores CEPLAN son nacionales por nivel de gobierno; no certifican desempeño del departamento en gestión estratégica.",
  "departamento": "LA LIBERTAD",
  "ubigeoPrefijo": "13",
  "marcoEstrategicoNacional": {
    "GN": { "CUMP02": 73.7, "CUMP03": 95.1, "segNacionalPp": 21.4 },
    "GR": { "CUMP02": null, "CUMP03": null, "nota": "serie disponible en catálogo; validar año" }
  },
  "contextoTerritorial": {
    "distritos": 83,
    "infraestructura": { "aeropuerto": 7, "puerto": 1 },
    "fuente": "ceplan-geo"
  },
  "corte": { "generadoEl": "...", "anioCeplan": 2024, "anioEjecucion": 2026 }
}
```

Implementación: HTTP a `ceplan-geo` (`/api/territories` agregado por departamento o consulta SQL interna si se comparte patrón de pool) + lectura local de `strategic_indicators`.

## 6. Indicadores derivados

### 6.1 SEG (Strategic Execution Gap)

| Variante | Fórmula | Alcance |
|---|---|---|
| **SEG nacional CEPLAN** | `CUMP03% − CUMP02%` (GN o GR) | Nacional — ya calculable en crossref existente |
| **SEG departamental proxy** | `% devengado/PIM (radar-ejecucion, dept)` − `% avance físico medio (infobras, dept)` | Solo 5 regiones con corrida verificada |

Si falta PIM utilizable o avance físico, el indicador es `null` con `restriccion` explícita (no imputar cero).

### 6.2 Execution Efficiency

| Variante | Fórmula | Alcance |
|---|---|---|
| **Nacional CEPLAN** | `CUMP02 / CUMP03` | GN/GR |
| **Proxy departamental** | `avanceFisicoMedio / ejecucionPresupuestal` | 5 regiones |

### 6.3 Plan–Budget Alignment (PBA)

Mapeo versionado `ceplan_dimension → mef_funcion` (tabla en repo, ej. `SOC*` → `SALUD`, `ECO*` → `AGROPECUARIA`/`COMERCIO`, `INV*` → inversión pública).

**Salida departamental:**

```json
{
  "dimension": "Turismo y cultura",
  "gastoDevengadoDepartamento": 155789000,
  "participacionPresupuestoDept": 0.042,
  "indicadorCeplanRelacionado": "PN04",
  "restriccion": "Mapeo heurístico v1; no prueba alineación del PEI regional."
}
```

Endpoint propuesto: `GET /api/indicators/plan-budget-alignment?departamento=&anio=`

## 7. Capas geo adicionales (CG-25 cerrado)

Spike obligatorio antes de ingesta:

| Capa | Hipótesis de uso | Criterio go/no-go |
|---|---|---|
| `geoceplan:cb_redhidrica` | Contexto riego / agro costa y sierra | `< 50k features` o paginación < 30 min; geometría válida ≥ 95% |
| `geoceplan:cb_proyectos` | Cruce con inversiones por nombre aproximado | Si > 200k features sin atributo CUI → `POSPONER` |

Entregable spike: `docs/spike-ceplan-geo-capas-hidrica-proyectos-2026-08.md`

Si `AUTOMATIZABLE`: migración + `ingest:hydro` / `ingest:projects` + endpoints lectura opcionales.

## 8. Paquete de análisis sectorial (5 regiones)

### Plantilla (derivada de La Libertad)

Cada región produce **hasta 3 memos** reutilizando la misma estructura:

| Memo | Fuentes principales | Pregunta guía |
|---|---|---|
| **Brechas y competitividad** | radar-ejecucion, infobras, radar-inversiones, compras-publicas, ceplan-estrategico | ¿Quién ejecuta peor/mejor y dónde hay sobrecosto o paralización? |
| **Desarrollo económico productivo** | radar-inversiones (funciones productivas), infobras | ¿La inversión pública calza con el relato productivo del departamento? |
| **Sector focal** (turismo, agro o minería según región) | radar-ejecucion por función + infobras | ¿El presupuesto sectorial calza con la ejecución? |

### Priorización sector focal por región

| Departamento | Sector focal sugerido | Justificación |
|---|---|---|
| LA LIBERTAD | Turismo | Memo existente |
| LAMBAYEQUE | Agroexportación / riego | Costa norte, Chiclayo |
| PIURA | Agro / hidráulica | Chavimochic, costa |
| CAJAMARCA | Minería / agro sierra | Mix altoandino |
| CUSCO | Turismo / cultura | Economía regional |

### Preflight por región (obligatorio)

Antes de redactar cada memo:

```bash
# Por app con filtro departamental (ver RUNBOOK)
npm run cobertura:territorial -- --jurisdiccion <DEPARTAMENTO>
npm run cobertura:geoserver   # ceplan-geo — nacional, verificar dept en reporte
```

Completitud mínima para publicar memo: `COMPLETA_VERIFICADA` o `PARCIAL` documentado en MEF + INFOBRAS + Invierte para ese departamento.

## 9. Arquitectura de entrega

| Componente | App dueña | Tipo |
|---|---|---|
| `GET /api/crossref/territorial` | ceplan-estrategico | API |
| `GET /api/indicators/seg`, `/execution-efficiency`, `/plan-budget-alignment` | ceplan-estrategico | API |
| Spike + ingesta condicional hidráulica/proyectos | ceplan-geo | CLI + migración |
| `npm run analisis:regional -- --departamento=` | nuevo CLI en `docs/` o script en radar-ejecucion | CLI generador de borrador |
| Tools MCP nuevos | mcp-server | Solo lectura |
| Memos | `docs/analisis-{tema}-{departamento}-2026-08.md` | Documentación |

## 10. Sprints propuestos (Fase 2)

| Sprint | Objetivo | Puerta de salida |
|---|---|---|
| **6** | Spike geo CG-25 + diseño puente territorial + preflight 5 regiones | Spike documentado; contrato API territorial; matriz de cobertura por dept |
| **7** | Implementar cruce ceplan-estrategico ↔ ceplan-geo + MCP | `GET /api/crossref/territorial` verificable para 5 departamentos |
| **8** | Indicadores SEG, Efficiency, PBA | Endpoints con proxies departamentales y tests |
| **9** | Memos Lambayeque + Piura | 2×3 memos con corrida documentada |
| **10** | Memos Cajamarca + Cusco + cierre Fase 2 | 4 departamentos nuevos + checklist comparativo 5 regiones |

## 11. Métricas de éxito

| Métrica | Umbral |
|---|---|
| Cobertura MEF+INFOBRAS+Invierte | 5/5 departamentos con corrida terminal o `PARCIAL` justificado |
| Cruce territorial CEPLAN | Responde para 5 departamentos sin inventar entidad |
| SEG proxy departamental | Calculado para ≥ 3 departamentos con datos suficientes |
| Memos regionales | 4 departamentos nuevos (12 memos máx.) con misma plantilla que La Libertad |
| Tests | `npm test` verde en apps tocadas; catálogo MCP actualizado |

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| ObservaPerú sigue sin granularidad regional | Marco nacional + proxies departamentales desde MEF/INFOBRAS; nunca fingir SEG CEPLAN regional |
| Ingesta MEF por departamento distinta a La Libertad | Documentar offsets/rangos por región antes de Sprint 9 |
| Capas geo demasiado grandes | Spike con techo de tiempo; posponer sin bloquear Fase 2 |
| Comparar regiones con cortes distintos | Tabla de `corte` y `completitud` en cada memo |

## 13. Referencias

- [`docs/BACKLOG_CEPLAN_ALSOL_Fase2_5Regiones_v1.md`](BACKLOG_CEPLAN_ALSOL_Fase2_5Regiones_v1.md)
- [`docs/validacion-ceplan-geo-la-libertad-2026-08.md`](validacion-ceplan-geo-la-libertad-2026-08.md)
- [`docs/data-contracts/ceplan-strategic-planning.md`](data-contracts/ceplan-strategic-planning.md)
- [`docs/adr/0005-matriz-de-cruces-ceplan-con-ecosistema-existente.md`](adr/0005-matriz-de-cruces-ceplan-con-ecosistema-existente.md)
- [`docs/RUNBOOK_Cobertura_Territorial_ALSOL.md`](RUNBOOK_Cobertura_Territorial_ALSOL.md)
