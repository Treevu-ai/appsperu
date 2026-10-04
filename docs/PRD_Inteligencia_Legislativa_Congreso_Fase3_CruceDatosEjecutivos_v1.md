# PRD — Inteligencia Legislativa Fase 3: Cruce con Datos Ejecutivos

**Estado:** BORRADOR - Pendiente revisión y aprobación
**Fecha:** 2026-10-04
**Ámbito:** `apps/legislativo-congreso/api` extenso, cruces con INFOBRAS, SEACE, radar-ejecucion, radar-inversiones
**Dependencias:** LEG-01/02/03 (Fase 1 completada), INFOBRAS, compras-publicas (SEACE), radar-ejecucion, radar-inversiones
**Horizonte:** Fase 3 — Cruce automático proyecto de ley × datos ejecutivos

## 1. Decisión de alcance

Este PRD implementa el **cruce automático entre proyectos de ley del Congreso y datos ejecutivos** (INFOBRAS, SEACE, radar-inversiones, radar-ejecucion) para detectar proyectos que pueden modificar las reglas bajo las que operan obras, contrataciones y presupuestos ya ejecutados.

**Cruces ya existentes en Rastro:**
- ✅ INFOBRAS ↔ radar-inversiones (por CUI) - implementado en `infobras/api`
- ✅ INFOBRAS ↔ radar-ejecucion (por nombre de entidad) - implementado en `infobras/api`
- ✅ SEACE (legacy + public minor contracts) - implementado en `compras-publicas/api`

**Lo que falta:**
- ❌ Proyectos de ley ↔ INFOBRAS (cruce por tema/palabras clave)
- ❌ Proyectos de ley ↔ SEACE (cruce por tema/palabras clave)
- ❌ Proyectos de ley ↔ radar-inversiones (cruce por entidad/CUI)
- ❌ Proyectos de ley ↔ radar-ejecucion (cruce por entidad/nombre)

**Decisión:** Implementar cruces keyword-based (no semántico IA) en esta fase. La búsqueda semántica con embeddings queda para Fase 2 (que depende de este PRD completarse primero).

## 2. Problema y oportunidad

### Problema
Hoy Rastro tiene:
- Proyectos de ley del Congreso (14,868 proyectos ingeridos)
- Obras públicas de INFOBRAS (10,141 obras en La Libertad)
- Contrataciones públicas SEACE
- Ejecución presupuestal radar-inversiones/radar-ejecucion

Pero **no hay conexión** entre "qué se está legislando" y "qué se está ejecutando". Un gestor público en La Libertad no puede responder preguntas como:
- "¿Hay proyectos de ley activos que afecten las obras que mi entidad tiene en ejecución?"
- "¿Qué proyectos de ley mencionan contrataciones que podrían cambiar las reglas de SEACE?"
- "¿Hay proyectos que modifican el presupuesto asignado a mis inversiones vía radar?"

### Oportunidad
Rastro ya tiene todas las fuentes de datos necesarias. El cruce keyword-based es técnicamente viable sin IA:
- `titulo` + `proponente` de proyectos de ley
- `nombre_proyecto` + `entidad` de INFOBRAS
- `objeto_contrato` + `entidad` de SEACE
- `nombre` + `entity_code` de radar-inversiones/radar-ejecucion

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo
Implementar cruces automáticos entre proyectos de ley y datos ejecutivos (INFOBRAS, SEACE, radar-inversiones, radar-ejecucion) usando matching keyword-based (ILIKE/similitud de texto), exponiendo los resultados por API REST y tool MCP.

### No objetivos
- No se usa búsqueda semántica con embeddings (Fase 2)
- No se usa clasificación temática con IA (Fase 2)
- No se construye dashboard de alertas (Fase 4)
- No se implementa UI en rastro-web/rastro.fyi (Fase 4)
- No se usa Ollama u otro modelo de IA local

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Cruce proyecto × INFOBRAS funcional | `GET /api/cruces/proyectos-infobras` con filtro por departamento responde proyectos que matchean obras por palabra clave |
| Cruce proyecto × SEACE funcional | `GET /api/cruces/proyectos-seace` con filtro por departamento responde proyectos que matchean contratos por palabra clave |
| Cruce proyecto × radar-inversiones funcional | `GET /api/cruces/proyectos-inversiones` con filtro por departamento responde proyectos que matchean inversiones por entidad/CUI |
| Cruce proyecto × radar-ejecucion funcional | `GET /api/cruces/proyectos-ejecucion` con filtro por departamento responde proyectos que matchean entidades por nombre |
| Tools MCP registradas | 4 tools nuevas registradas en `mcp-server/src/catalog.ts` y probadas |
| Tests | Cada cruce tiene test con match y sin match |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Gestor público (La Libertad) | "¿Qué proyectos de ley activos afectan mis obras en ejecución?" | Cruce proyecto × INFOBRAS, filtrado por departamento y entidad |
| Gestor de contrataciones | "¿Hay proyectos que cambien reglas de SEACE?" | Cruce proyecto × SEACE, filtrado por tipo de contrato |
| Gestor presupuestal | "¿Qué proyectos modifican mi presupuesto asignado?" | Cruce proyecto × radar-inversiones/radar-ejecucion, filtrado por entidad |
| Periodista | "Encuentra proyectos legislativos sobre tema X que afecten ejecución real" | Búsqueda cruzada keyword sobre todas las fuentes |
| Agente de IA (MCP) | Responder preguntas complejas que cruzan legislación con ejecución | Tools MCP que combinan datos de múltiples apps |

## 5. Alcance funcional

### Épica A — Cruce Proyecto × INFOBRAS

#### LEG-04 — Cruce proyectos de ley con obras públicas (INFOBRAS)

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** LEG-02, INFOBRAS

**Estrategia de matching:**
1. Extraer palabras clave del `titulo` del proyecto de ley (tokenización simple, stopwords comunes)
2. Buscar en INFOBRAS: `nombre_proyecto` ILIKE '%palabra_clave%' AND `departamento` = filtro
3. Para cada match, retornar: proyecto, obra, entidad, estado de obra, paralización, avance físico/financiero
4. Score de match: número de palabras clave coincidentes / total palabras clave del proyecto

**Criterios de aceptación**
- `GET /api/cruces/proyectos-infobras?departamento=LA LIBERTAD&palabra_clave=...` responde lista de cruces
- `GET /api/cruces/proyectos-infobras/:proyecto_id` retorna todas las obras que matchean ese proyecto
- Sin match responde lista vacía, no error
- Score de match incluido en respuesta (0.0 a 1.0)
- Paginación obligatoria (mismo patrón que resto del catálogo)
- Tests: match con palabra clave exacta, match parcial, sin match, score correcto

#### LEG-05 — Cruce proyectos de ley con contrataciones (SEACE)

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** LEG-02, compras-publicas

**Estrategia de matching:**
1. Extraer palabras clave del `titulo` del proyecto
2. Buscar en SEACE: `objeto_contrato` ILIKE '%palabra_clave%' AND `departamento` = filtro
3. Para cada match, retornar: proyecto, contrato, entidad, monto, estado, tipo de contrato
4. Score de match igual que LEG-04

**Criterios de aceptación**
- `GET /api/cruces/proyectos-seace?departamento=LA LIBERTAD&palabra_clave=...` responde lista de cruces
- `GET /api/cruces/proyectos-seace/:proyecto_id` retorna todos los contratos que matchean
- Sin match responde lista vacía
- Score de match incluido
- Paginación obligatoria
- Tests: match exacto, match parcial, sin match

### Épica B — Cruce Proyecto × Radar (Presupuesto)

#### LEG-06 — Cruce proyectos de ley con inversiones (radar-inversiones)

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** LEG-02, radar-inversiones

**Estrategia de matching:**
1. Cruce por nombre de entidad: `autores`/`proponente` del proyecto vs `nombre` de inversión
2. Cruce por CUI (si el proyecto menciona CUI explícitamente en título): `titulo` contiene CUI pattern → match exacto en `investments.cui`
3. Prioridad: match por CUI > match por nombre de entidad
4. Score: 1.0 para CUI exacto, 0.7-0.9 para nombre de entidad (según similitud string)

**Criterios de aceptación**
- `GET /api/cruces/proyectos-inversiones?departamento=LA LIBERTAD` responde lista de cruces
- `GET /api/cruces/proyectos-inversiones/:proyecto_id` retorna inversiones matcheadas
- Match por CUI优先 (prioridad) sobre match por nombre
- Score de match incluido
- Paginación obligatoria
- Tests: match CUI exacto, match nombre parcial, sin match

#### LEG-07 — Cruce proyectos de ley con ejecución presupuestal (radar-ejecucion)

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** LEG-02, radar-ejecucion

**Estrategia de matching:**
1. Usar crosswalk `entity_crosswalk` ya existente (INFOBRAS ↔ radar-ejecucion)
2. Cruce proyectos → INFOBRAS (por nombre de entidad) → radar-ejecución (via crosswalk)
3. Retornar: proyecto, obra, entidad ejecución, devengado, cobertura temporal
4. Score: heredado del match proyecto → INFOBRAS

**Criterios de aceptación**
- `GET /api/cruces/proyectos-ejecucion?departamento=LA LIBERTAD` responde lista de cruces
- `GET /api/cruces/proyectos-ejecucion/:proyecto_id` retorna ejecución matcheada
- Usa crosswalk existente (no recrear matching de entidad)
- Confidencia del crosswalk incluida (confirmada/candidata)
- Paginación obligatoria
- Tests: match confirmada, match candidata, sin match

### Épica C — Registro MCP y Documentación

#### LEG-08 — Registro MCP de cruces

**Prioridad:** P0 · **Esfuerzo:** S · **Dependencias:** LEG-04, LEG-05, LEG-06, LEG-07

**Criterios de aceptación**
- 4 tools MCP registradas en `mcp-server/src/catalog.ts`:
  - `legislativo_cruce_proyectos_infobras`
  - `legislativo_cruce_proyectos_seace`
  - `legislativo_cruce_proyectos_inversiones`
  - `legislativo_cruce_proyectos_ejecucion`
- `scripts/check-connectors-documented.sh` pasa
- `mcp-server/src/__tests__/routes-vs-catalog.test.ts` pasa
- Cada tool probada con invocación MCP real documentada en PR
- Ficha actualizada en `docs/conectores.md`
- Data contract en `docs/data-contracts/legislativo-cruce-datos-ejecutivos.md`

## 6. Priorización y secuencia

| Fase | Objetivo | Tickets comprometibles | Criterio de corte |
|---|---|---|---|
| 1 | Cruce INFOBRAS + SEACE (P0) | LEG-04, LEG-05 | Verificación en vivo, tests pasan |
| 2 | Cruce Radar (P1) | LEG-06, LEG-07 | Verificación en vivo, tests pasan |
| 3 | Registro MCP + docs | LEG-08 | Tools registradas, tests pasan, docs actualizados |

## 7. Requisitos no funcionales

- **Sin IA**: Solo matching keyword-based (ILIKE, similitud de string), no embeddings, no Ollama
- **Cross-app queries**: Usa `crossAppPool` existente (patrón ya usado en infobras crossref)
- **Performance**: Cruces no deben bloquear más de 5 segundos para queries típicas
- **Paginación obligatoria**: Sin límite implícito no documentado
- **Score de match**: Siempre incluido en respuesta (0.0 a 1.0)
- **Ausencia de dato ≠ cero**: Cruces sin match responde lista vacía, no error

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Matching keyword-only genera muchos falsos positivos | Score de match + permitir umbral configurable en query |
| Cross-app queries fallan si alguna app no está disponible | Validar disponibilidad con `crossAppPool`, retornar error claro si no disponible |
| Volume de cruces es alto (14,868 proyectos × 10,000+ obras) | Paginación obligatoria, índices en DB donde sea necesario |
| Crosswalk entity_crosswalk está vacío (hallazgo real SI-07) | Documentar en response si crosswalk está vacío, no fallar silenciosamente |

## 9. Fuera de este PRD

- Búsqueda semántica con embeddings (Fase 2)
- Clasificación temática con IA (Fase 2)
- Resúmenes ejecutivos con IA (Fase 2)
- Dashboard de alertas legislativas (Fase 4)
- UI en rastro-web/rastro.fyi (Fase 4)
- Scheduler automático de cruces (Fase 4)
- Transcripción de sesiones pleno/comisiones (Fase 5)
- Votaciones, asistencia, comisiones (Fase 5)

## 10. Definition of Done

- LEG-04, LEG-05, LEG-06, LEG-07, LEG-08 mergeados con PR, revisión y pruebas automatizadas
- Cada cruce tiene verificación en vivo documentada en su PR
- Tools MCP registradas y probadas con invocación real
- Ficha en `docs/conectores.md` y data contract en `docs/data-contracts/`
- Ningún cruce sin match se presenta como error
- Despliegue: no aplica desplegar a producción en este PRD salvo que se indique explícitamente después del merge

## 11. Anexo: Estrategia de Matching Keyword-Based

### Tokenización simple
```typescript
function extractKeywords(text: string): string[] {
  const stopwords = new Set(['el', 'la', 'de', 'en', 'por', 'para', 'con', 'sin', 'a', 'que', 'y', 'o']);
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.has(word))
    .filter(word => !/^\d+$/.test(word)); // Eliminar números puros
}
```

### Score de match
```typescript
function calculateMatchScore(proyectoKeywords: string[], targetText: string): number {
  const targetLower = targetText.toLowerCase();
  const matches = proyectoKeywords.filter(kw => targetLower.includes(kw));
  return proyectoKeywords.length > 0 ? matches.length / proyectoKeywords.length : 0;
}
```

### Similitud de string (para nombres de entidad)
```typescript
function stringSimilarity(a: string, b: string): number {
  // Implementación simple de similitud de Jaccard o Levenshtein
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}
```

### CUI pattern matching
```typescript
const CUI_PATTERN = /\b\d{6,8}\b/; // CUI típicamente 6-8 dígitos

function extractCUI(text: string): string | null {
  const match = text.match(CUI_PATTERN);
  return match ? match[0] : null;
}
```
