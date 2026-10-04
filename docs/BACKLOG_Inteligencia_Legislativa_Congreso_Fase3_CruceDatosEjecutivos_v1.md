# Backlog ejecutable — Inteligencia Legislativa Fase 3: Cruce con Datos Ejecutivos

**Producto:** Rastro
**Regla transversal:** API/MCP únicamente; sin IA en esta fase (solo keyword-based); ausencia de dato ≠ cero.
**Estimación:** S ≤ 1 día, M 2–3 días, L 4–6 días. Las estimaciones no son compromiso de calendario.
**PRD asociado:** `docs/PRD_Inteligencia_Legislativa_Congreso_Fase3_CruceDatosEjecutivos_v1.md`

## Secuencia estratégica

| Fase | Objetivo | Tickets comprometibles | Criterio de corte |
|---|---|---|---|
| 1 | Cruce INFOBRAS + SEACE (P0) | LEG-04, LEG-05 | Verificación en vivo, tests pasan |
| 2 | Cruce Radar (P1) | LEG-06, LEG-07 | Verificación en vivo, tests pasan |
| 3 | Registro MCP + docs | LEG-08 | Tools registradas, tests pasan, docs actualizados |

## Tickets

| ID | Épica | Objetivo | Criterios de aceptación | Dependencias | Prioridad | Esfuerzo | Fase |
|---|---|---|---|---|---|---|---|
| LEG-04 | Cruce INFOBRAS | Cruce proyectos de ley con obras públicas (INFOBRAS) por keyword. | `GET /api/cruces/proyectos-infobras` con filtro departamento/palabra_clave responde; `GET /api/cruces/proyectos-infobras/:proyecto_id` retorna obras matcheadas; score de match incluido (0.0-1.0); paginación obligatoria; tests: match exacto, match parcial, sin match. | LEG-02, INFOBRAS. | P0 | M | 1 |
| LEG-05 | Cruce SEACE | Cruce proyectos de ley con contrataciones (SEACE) por keyword. | `GET /api/cruces/proyectos-seace` con filtro departamento/palabra_clave responde; `GET /api/cruces/proyectos-seace/:proyecto_id` retorna contratos matcheados; score de match incluido; paginación obligatoria; tests: match exacto, match parcial, sin match. | LEG-02, compras-publicas. | P0 | M | 1 |
| LEG-06 | Cruce Inversiones | Cruce proyectos de ley con inversiones (radar-inversiones) por entidad/CUI. | `GET /api/cruces/proyectos-inversiones` con filtro departamento responde; match por CUI prioridad sobre match por nombre; score de match incluido; paginación obligatoria; tests: match CUI exacto, match nombre parcial, sin match. | LEG-02, radar-inversiones. | P1 | M | 2 |
| LEG-07 | Cruce Ejecución | Cruce proyectos de ley con ejecución (radar-ejecucion) via crosswalk. | `GET /api/cruces/proyectos-ejecucion` con filtro departamento responde; usa crosswalk entity_crosswalk existente; confidencia (confirmada/candidata) incluida; paginación obligatoria; tests: match confirmada, match candidata, sin match. | LEG-02, radar-ejecucion, crosswalk existente. | P1 | M | 2 |
| LEG-08 | MCP + docs | Registrar 4 tools MCP, actualizar ficha y data contract. | Tools registradas en mcp-server/src/catalog.ts; scripts/check-connectors-documented.sh pasa; mcp-server/src/__tests__/routes-vs-catalog.test.ts pasa; cada tool probada con invocación MCP real; ficha en docs/conectores.md actualizada; data contract en docs/data-contracts/. | LEG-04, LEG-05, LEG-06, LEG-07. | P0 | S | 3 |

## Definition of Done por ticket

Cada ticket cierra solo con lo que le corresponde a él — los criterios de la tabla de arriba son la fuente de verdad por ticket. Lo siguiente es el estándar del **PR completo** una vez los 5 tickets están mergeados:

- Verificación en vivo propia documentada en el PR de cada ticket (evidencia real)
- Código con prueba automática proporcional al riesgo en cada ticket
- Ficha en `docs/conectores.md` y data contract en `docs/data-contracts/` — entregable de LEG-08
- Tools MCP registradas en `mcp-server/src/catalog.ts` y probadas con invocación real — entregable de LEG-08
- Sin IA, sin scheduler, sin UI en los 5 tickets

## Visión futura (no comprometida, no crear tickets sin PRD propio)

Registrado aquí solo para que no se pierda de vista — ninguno de estos ítems se prioriza automáticamente ni se implementa sin su propio PRD posterior:

| Candidato | Descripción | Estado |
|---|---|---|
| Búsqueda semántica (embeddings) | Búsqueda por similitud sobre título/sumilla en vez de ILIKE keyword. | Visión, sin iniciar — requiere Fase 2 (IA) primero. |
| Clasificación temática + resumen IA (Ollama local) | Enriquecimiento de cada proyecto de ley con clasificación por sector y resumen ejecutivo. | Visión, sin iniciar — requiere Fase 2 (IA) primero. |
| Dashboard de alertas legislativas | Capa de lectura sobre cruces de Fase 3. | Visión, sin iniciar — requiere Fase 3 completa primero. |
| UI en rastro-web/rastro.fyi | Interfaz visual para explorar cruces y alertas. | Visión, sin iniciar — requiere Fase 3 completa primero. |
| Scheduler automático de cruces | Programar ejecución automática de cruces (hoy es manual). | Visión, sin iniciar — requiere Fase 3 completa primero. |
| Transcripción de sesiones pleno/comisiones | Dato distinto al de proyectos de ley, fuente no verificada. | Sin investigar en vivo todavía. |
| Votaciones, asistencia, comisiones | Datos adicionales del Congreso, requiere investigación de endpoint. | Sin investigar en vivo todavía. |

Si se decide retomar cualquiera de estos, requiere su propio PRD — no se mezcla con este documento.
