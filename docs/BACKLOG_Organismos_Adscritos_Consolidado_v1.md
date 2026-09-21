# Backlog ejecutable — Organismos adscritos de entidades ya conectadas (consolidado)

**Producto:** Rastro
**Regla transversal:** ninguna entidad de Épica B se ingiere sin verificación en vivo propia; PII se verifica columna por columna antes de decidir ingesta.
**Estimación:** S ≤ 1 día, M 2–3 días, L 4–6 días. Las estimaciones no son compromiso de calendario.
**PRD asociado:** `docs/PRD_Organismos_Adscritos_Consolidado_v1.md`

## Secuencia estratégica

| Fase | Objetivo | Tickets comprometibles | Criterio de corte |
|---|---|---|---|
| 0 | Desbloquear SERFOR (investigación); verificar en vivo y luego construir SUNARP e INDECI (fuente ya confirmada, schema por verificar). | ADS-01, ADS-03, ADS-05 | ADS-01 concluye con URL real o reclasifica SERFOR a Épica C; ADS-03/ADS-05 no fijan schema antes de su propia verificación en vivo. |
| 1 | Construir SERFOR (si desbloqueado), SENACE, y confirmar contrato de la API del Congreso. | ADS-02, ADS-04, ADS-15 | Ambos con verificación en vivo documentada en el PR. |
| 2 (paralelo, no bloqueante) | Triage de Épica B — resolver cada entidad/fuente a Épica A o C. | ADS-06 a ADS-11, ADS-16 a ADS-19 | Ninguna entidad queda sin conclusión explícita. |

## Tickets

| ID | Épica | Objetivo | Criterios de aceptación | Dependencias | Prioridad | Esfuerzo | Fase |
|---|---|---|---|---|---|---|---|
| ADS-01 | Desbloqueo | Confirmar URL real del servicio geoespacial de GEOSERFOR (SERFOR). | URL real verificada con `curl`, o conclusión explícita de que no hay servicio público directo. | Ninguna. | P0 | S | 0 |
| ADS-03 | Ingesta | Conector SUNARP — Registro de Personas Jurídicas. | Verificación en vivo del recurso real; schema distingue empresa de representante si la fuente lo permite. | Ninguna. | P0 | M | 0 |
| ADS-05 | Ingesta | Conector INDECI — Emergencias Históricas. | Verificación en vivo de granularidad (evento individual vs. agregado); columnas reales confirmadas. | Ninguna. | P1 | S | 0 |
| ADS-02 | Ingesta | Conector SERFOR — catastro forestal / GEOSERFOR. | Mismo estándar que GEO-01/GEO-02; evalúa vía geoespacial vs. archivo de `datosabiertos.gob.pe`. | ADS-01 (si desbloquea). | P0 | M | 1 |
| ADS-04 | Ingesta | Conector SENACE — cartera de proyectos (API REST ya confirmada). | Respuesta real de `/Api/Help` y de una consulta de ejemplo incluida en el PR. | Ninguna. | P1 | M | 1 |
| ADS-06 | Triage | Priorizar 3-5 datasets de ONPE de 375 disponibles. | Lista corta con URL real y razón de priorización. | Ninguna. | P1 | S | 2 |
| ADS-07 | Triage | Verificar formato real de datos SMV (Hechos de Importancia, accionistas >4%). | Formato confirmado (CSV/JSON/solo visor); evalúa valor para perfil de riesgo por RUC. | Ninguna. | P1 | S | 2 |
| ADS-08 | Triage | Verificar contenido real del portal OSITRAN. | Datasets reales documentados, formato confirmado. | Ninguna. | P2 | S | 2 |
| ADS-09 | Triage | Verificar contenido real del grupo SUNAFIL. | Datasets reales documentados; evalúa relevancia para perfil de riesgo por RUC si hay sanciones laborales por empleador. | Ninguna. | P2 | S | 2 |
| ADS-10 | Triage + PII | Verificar riesgo de PII en "Puestos de trabajo" (MTPE) antes de decidir ingesta. | Verificación explícita de columna con posible identificador de persona; descarte automático si hay PII. | Ninguna. | P2 | S | 2 |
| ADS-11 | Triage | Verificar SUNEDU, RENIEC, ANA, SENASA, SUTRAN, INS, INABIF, CENEPRED, SERVIR (9 entidades). | Tabla de conclusión por las 9, cada una con hallazgo real o "sin hallazgo" + razón. | Ninguna. | P2 | M | 2 |
| ADS-15 | Ingesta (contrato) | Confirmar contrato completo de `api.congreso.gob.pe/spley-portal-service` (proyectos de ley, y evaluar votaciones/asistencia/comisiones bajo el mismo host). | Una consulta real con `200` y datos, body exacto documentado en el PR; contrato de `FiltroProyecLeyDto` documentado (campos y valores válidos de `perParId`). Si tras un esfuerzo razonable no se logra un `200` real, el ticket se reclasifica a Épica C documentando la evidencia de los intentos (mismo criterio que ADS-01/SERFOR). | Ninguna. | P1 | S | 1 |
| ADS-16 | Triage | Evaluar `gestionpublicaperu.com.pe` (agregador privado, no oficial) como validación cruzada de `budget_execution`. | Rate limit y estabilidad confirmados; conclusión documentada (se usa o no) sin crear dependencia operativa de un tercero no oficial. | Ninguna. | P2 | S | 2 |
| ADS-17 | Triage | Verificar Portal de Estadística SUNARP (agregados por año, distinto de ADS-03). | Formato/columnas/granularidad reales confirmados; evalúa solapamiento con ADS-03 antes de decidir ingesta separada. | Ninguna. | P2 | S | 2 |
| ADS-18 | Triage | Verificar GeoServer WFS de red vial del MTC (geometría real). | Capacidades/capas del servicio WFS confirmadas en vivo; evalúa valor agregado frente a `infraestructura-mtc`/`red-vial-subnacional` tabular. | Ninguna. | P2 | M | 2 |
| ADS-19 | Triage | Verificar Provías Nacional (carreteras nacionales, separado de Provías Descentralizado). | Confirma si hay dataset/API real recurrente, no solo un PDF puntual; reclasifica a Épica C si no la hay. | Ninguna. | P2 | S | 2 |

## Definition of Done por ticket

- Verificación en vivo propia documentada en el PR (evidencia real, no snippet de búsqueda).
- Todo ticket de Épica B (ADS-06 a ADS-11, ADS-15 a ADS-19) termina en una conclusión explícita por entidad/fuente — Épica A (pasa a ticket de ingesta) o Épica C (se descarta con razón documentada). Ninguno queda indefinido.
- Ningún dataset con riesgo de PII no evaluado se ingiere.
- Cualquier ticket que llegue a ingesta real registra su tool en `mcp-server/src/catalog.ts` y la verifica con al menos una invocación funcional real, además de la ficha en `docs/conectores.md` y el data contract en `docs/data-contracts/`.
- Sin UI, sin scheduler.

## Registrado y sin acción (Épica C — no reinvestigar sin señal nueva)

| Entidad | Razón de descarte |
|---|---|
| SBS | Grupo propio en `datosabiertos.gob.pe` verificado en vivo con 0 datasets. Su "Reporte de Deudas" individual requiere login con DNI — PII, descartado por diseño, no solo por fricción. |
| Palacio de Gobierno / Casa Oficial del Gobierno | Oficinas de protocolo/prensa, no entidades estadísticas. Sin dataset ni API encontrado. |

**Corrección (2026-09-21, misma sesión)**: el Congreso (`spley-portal-service`) se había registrado aquí como descartado por un supuesto DNS roto — **era un falso negativo**. El endpoint real responde con errores de validación de un backend Spring vivo cuando se le pasa el path y los parámetros correctos (confirmado con `curl` y con un proyecto de terceros real en GitHub que scrapea la misma ruta). Movido a ADS-15 en la tabla de tickets arriba.

## Nota de remisión

Este documento consolida y reemplaza las secciones "Pendiente de integración" de:
- `docs/BACKLOG_Deuda_Publica_MEF_v1.md`
- `docs/BACKLOG_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md`

Ambos quedan con su contenido original intacto (no se borra nada), más una nota señalando este documento como la fuente viva de seguimiento para esos hallazgos.
