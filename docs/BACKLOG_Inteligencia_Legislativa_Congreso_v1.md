# Backlog ejecutable — Inteligencia legislativa: Proyectos de Ley del Congreso

**Producto:** Rastro
**Regla transversal:** API/MCP únicamente; sin dependencia de código AGPL de terceros; ausencia de dato ≠ cero.
**Estimación:** S ≤ 1 día, M 2–3 días, L 4–6 días. Las estimaciones no son compromiso de calendario.
**PRD asociado:** `docs/PRD_Inteligencia_Legislativa_Congreso_v1.md`

## Secuencia estratégica

| Fase | Objetivo | Tickets comprometibles | Criterio de corte |
|---|---|---|---|
| 0 (bloqueante, fuera de este backlog) | Confirmar contrato completo del endpoint. | ADS-15 (`docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`) | Debe concluir Épica A o C antes de iniciar LEG-01. |
| 1 | Ingesta, API y registro MCP. | LEG-01, LEG-02, LEG-03 | Cada uno con verificación en vivo propia documentada en su PR. |

## Tickets

| ID | Épica | Objetivo | Criterios de aceptación | Dependencias | Prioridad | Esfuerzo | Fase |
|---|---|---|---|---|---|---|---|
| LEG-01 | Ingesta | Conector `legislativo-congreso` — ingesta de proyectos de ley por periodo parlamentario. | Usa el contrato exacto confirmado por ADS-15; clave de upsert verificada contra respuesta real; periodos sin respuesta `200` documentados explícitamente, no omitidos en silencio. | ADS-15. | P0 | M | 1 |
| LEG-02 | API | `GET /api/proyectos` (filtros: periodo, estado, autor, texto libre simple) y `GET /api/proyectos/:codigo`. | Paginación obligatoria; filtro sin match responde lista vacía; tests con y sin match. | LEG-01. | P0 | S | 1 |
| LEG-03 | MCP + docs | Registrar tool MCP, ficha en `docs/conectores.md`, data contract. | Tool sigue patrón `SIN_SCHEDULER`; `scripts/check-connectors-documented.sh` pasa sin cambios de script; invocación real documentada. | LEG-02. | P0 | S | 1 |

## Definition of Done por ticket

- Verificación en vivo propia documentada en el PR (evidencia real, no snippet de búsqueda ni cita del repo de terceros).
- Código con prueba automática proporcional al riesgo (mínimo: caso con match, caso sin match).
- Ficha en `docs/conectores.md` y data contract en `docs/data-contracts/`.
- Tool MCP registrada en `mcp-server/src/catalog.ts` y probada con una invocación real.
- Sin UI, sin scheduler, sin dependencia de código AGPL de terceros.

## Visión futura (no comprometida, no crear tickets sin PRD propio)

Registrado aquí solo para que no se pierda de vista — ninguno de estos ítems se prioriza automáticamente ni se implementa sin su propio PRD posterior:

| Candidato | Descripción | Estado |
|---|---|---|
| Clasificación temática + resumen IA (Ollama local) | Enriquecimiento de cada proyecto de ley con clasificación por sector y resumen ejecutivo. | Visión, sin iniciar. |
| Búsqueda semántica (embeddings) | Búsqueda por similitud sobre título/sumilla en vez de `ILIKE`. | Visión, sin iniciar. |
| Cruce proyecto de ley × INFOBRAS/SEACE/Radar Inversiones/presupuesto regional | Detección automática de proyectos con impacto en obras/contratos/presupuesto de La Libertad. | Visión, sin iniciar — requiere LEG-01/02/03 completos primero. |
| Transcripción de sesiones del pleno/comisiones | Dato distinto al de proyectos de ley, fuente no verificada. | Sin investigar en vivo todavía. |
| Dashboard de alertas legislativas | Capa de lectura sobre el cruce anterior. | Visión, sin iniciar. |

Si se decide retomar cualquiera de estos, requiere su propio PRD — no se mezcla con este documento.
