# Backlog ejecutable — Cruces sobre educación 2026 y perfil de riesgo por RUC

**Producto:** Rastro
**Regla transversal:** API/MCP únicamente; ningún dato inventado donde falta match; ausencia de dato ≠ cero.
**Estimación:** S ≤ 1 día, M 2–3 días, L 4–6 días. Las estimaciones no son compromiso de calendario.
**PRD asociado:** `docs/PRD_Cruces_Educacion_Riesgo_RUC_v1.md`

## Secuencia estratégica

| Fase | Objetivo | Tickets comprometibles | Criterio de corte |
|---|---|---|---|
| 0 | Cruce de mayor valor y diseño del perfil de riesgo, en paralelo. | EDU-01, VI-01 | EDU-01 verificado en vivo contra La Libertad; VI-01 fija contrato de respuesta antes de tocar código. |
| 1 | Perfil de riesgo funcional; cierre presupuesto↔servicio para Educación. | VI-02, EDU-02 | VI-02 reproduce los hallazgos ya verificados a mano; EDU-02 confirma `FUNCION` real con `DISTINCT`. |
| 2 | Capa de lectura y cruce de menor prioridad. | VI-03, EDU-03 | EDU-03 no se mergea sin la advertencia de causalidad como campo de la respuesta. |

## Tickets

| ID | Épica | Objetivo | Criterios de aceptación | Dependencias | Prioridad | Esfuerzo | Fase |
|---|---|---|---|---|---|---|---|
| EDU-01 | Cruce educación | `GET /api/crossref` en `violencia-escolar`: casos por UGEL × trayectoria SIAGIE agregada a UGEL vía el padrón. Incluye registrar `violencia_escolar_crossref` en `mcp-server/src/catalog.ts`. | Normaliza mayúsculas/tildes de UGEL explícitamente; expone tasa de violencia por matrícula, no solo conteo crudo; UGEL sin match en null, no 0; verificado en vivo contra La Libertad (15 UGEL); tool MCP registrada y probada con una invocación real. | Ninguna. | P0 | M | 0 |
| VI-01 | Riesgo por RUC | Diseñar contrato del endpoint `riesgo-exportador`: app dueña, forma de respuesta, decisión score vs. hechos crudos. | Documento de diseño fija los 3 puntos; reproduce exactamente los 3 cruces ya verificados a mano (exportaciones, infracciones, inhabilitaciones), sin agregar una cuarta fuente sin verificarla en vivo. | Ninguna. | P0 | S | 0 |
| VI-02 | Riesgo por RUC | Implementar el endpoint según el diseño de VI-01. | RUC sin match responde 200 con secciones vacías, no 404; reproduce los hallazgos del seed EUDR (LA FLORIDA, FONGAL TACNA, un RUC limpio) como fixtures de test. | VI-01. | P0 | M | 1 |
| EDU-02 | Cruce educación | `GET /api/crossref` en `instituciones-educativas`: SIAGIE trayectoria por UBIGEO (join real vía `entities`) × `budget_execution` (`FUNCION = EDUCACIÓN`). Incluye registrar la tool MCP correspondiente. | Valor real de `FUNCION` confirmado con `SELECT DISTINCT` documentado en el PR; join hasta `ubigeo` probado; declara cobertura territorial real de `budget_execution`; distrito sin match no aparece con ejecución cero; tool MCP registrada y probada. | Ninguna. | P1 | M | 1 |
| VI-03 | Riesgo por RUC | Registrar tool MCP y ficha en `docs/conectores.md`. | Tool sigue patrón `SIN_SCHEDULER`; ficha cita el hallazgo real (LA FLORIDA) como ejemplo verificado; `scripts/check-connectors-documented.sh` pasa sin cambios de script. | VI-02. | P1 | S | 2 |
| EDU-03 | Cruce educación | `GET /api/resumen` o `/crossref` en `violencia-escolar`: casos por DRE/departamento (contrato territorial a definir) × ejecución presupuestal educativa. Incluye registrar la tool MCP correspondiente si el ticket llega a implementarse. | Decisión DRE-solo vs. mapeo a departamento documentada; respuesta incluye campo explícito de advertencia sobre causalidad/acceso (no solo en docs); mismo criterio de `DISTINCT` que EDU-02 para `FUNCION`; tool MCP registrada y probada si se implementa. | Ninguna. | P2 | S | 2 |

## Definition of Done por ticket

- Código con prueba automática proporcional al riesgo (mínimo: caso con match, caso sin match).
- Verificación en vivo contra Postgres real antes de declarar el ticket cerrado (mismo estándar que el resto del monorepo esta sesión).
- Ficha en `docs/conectores.md` y, si aplica, actualización del "Mapa de cruces entre apps".
- Ningún territorio/RUC sin dato se presenta como si tuviera incidencia cero confirmada.
- Sin UI, sin scheduler.

## Backlog de continuidad (pre-MINEDU, sin tocar por este documento)

Registrado aquí solo para que no se pierda de vista — ninguno de estos tickets depende de lo nuevo de esta sesión, y ninguno se prioriza automáticamente por encima de EDU/VI:

| Candidato | Fuentes | Estado |
|---|---|---|
| Residuos sólidos × presupuesto SANEAMIENTO × RENAMU | `residuos-solidos`, `radar-ejecucion`, `renamu` (triple cruce) | Sin iniciar. |
| Infraestructura MTC × presupuesto + inversión privada | `infraestructura-mtc`, `radar-ejecucion`, `inversion-privada` | Sin iniciar. |
| AIRHSP × presupuesto | `airhsp` (vía `mindef`/`mimp` según corresponda), `radar-ejecucion` | Sin iniciar. |
| Bienes muebles dados de baja × presupuesto/adjudicaciones | `radar_ejecucion_patrimonio_bienes_muebles_baja`, `compras-publicas` | Sin iniciar. |
| Red vial subnacional × presupuesto TRANSPORTE | `red-vial-subnacional`, `radar-ejecucion` | Sin iniciar. |

Si se decide retomar este backlog en vez de EDU/VI, requiere su propio PRD — no se mezcla con este documento.
