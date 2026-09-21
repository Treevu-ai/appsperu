# Backlog ejecutable — Organismos adscritos de entidades ya conectadas (consolidado)

**Producto:** Rastro
**Regla transversal:** ninguna entidad de Épica B se ingiere sin verificación en vivo propia; PII se verifica columna por columna antes de decidir ingesta.
**Estimación:** S ≤ 1 día, M 2–3 días, L 4–6 días. Las estimaciones no son compromiso de calendario.
**PRD asociado:** `docs/PRD_Organismos_Adscritos_Consolidado_v1.md`

## Secuencia estratégica

| Fase | Objetivo | Tickets comprometibles | Criterio de corte |
|---|---|---|---|
| 0 | Desbloquear SERFOR; construir SUNARP e INDECI (ya listos). | ADS-01, ADS-03, ADS-05 | ADS-01 concluye con URL real o reclasifica SERFOR a Épica C. |
| 1 | Construir SERFOR (si desbloqueado) y SENACE. | ADS-02, ADS-04 | Ambos con verificación en vivo documentada en el PR. |
| 2 (paralelo, no bloqueante) | Triage de Épica B — resolver cada entidad a Épica A o C. | ADS-06 a ADS-11 | Ninguna entidad queda sin conclusión explícita. |

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

## Definition of Done por ticket

- Verificación en vivo propia documentada en el PR (evidencia real, no snippet de búsqueda).
- Si el ticket es de triage (ADS-06 a ADS-11), termina en una conclusión explícita por entidad — Épica A (pasa a ticket de ingesta) o Épica C (se descarta con razón).
- Ningún dataset con riesgo de PII no evaluado se ingiere.
- Ficha en `docs/conectores.md` y data contract en `docs/data-contracts/` para cualquier ticket que llegue a ingesta real.
- Sin UI, sin scheduler.

## Registrado y sin acción (Épica C — no reinvestigar sin señal nueva)

| Entidad | Razón de descarte |
|---|---|
| SBS | Grupo propio en `datosabiertos.gob.pe` verificado en vivo con 0 datasets. Su "Reporte de Deudas" individual requiere login con DNI — PII, descartado por diseño, no solo por fricción. |
| Congreso (`spley-portal-service`) | La API real (`api.congreso.gob.pe/spley-portal-service`) redirige a un hostname interno (`svr-appserver4.congreso.net`) que hoy resuelve a IPs de WP Engine — DNS roto del lado del Congreso, verificado en vivo. Reintentar en sesión futura por si se corrige. |
| Palacio de Gobierno / Casa Oficial del Gobierno | Oficinas de protocolo/prensa, no entidades estadísticas. Sin dataset ni API encontrado. |

## Nota de remisión

Este documento consolida y reemplaza las secciones "Pendiente de integración" de:
- `docs/BACKLOG_Deuda_Publica_MEF_v1.md`
- `docs/BACKLOG_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md`

Ambos quedan con su contenido original intacto (no se borra nada), más una nota señalando este documento como la fuente viva de seguimiento para esos hallazgos.
