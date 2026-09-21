# Backlog ejecutable — Nuevos conectores: Energía/Minería, Ambiente y Sistema Financiero Público

**Producto:** Rastro
**Regla transversal:** verificación en vivo obligatoria antes de escribir cualquier conector; clave de upsert confirmada contra datos reales, nunca inventada.
**Estimación:** S ≤ 1 día, M 2–3 días, L 4–6 días. Las estimaciones no son compromiso de calendario.
**PRD asociado:** `docs/PRD_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md`
**Nota de remisión (2026-09-21):** la sección "Pendiente de integración" de este documento fue consolidada en `docs/PRD_Organismos_Adscritos_Consolidado_v1.md` / `docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`, que es la fuente viva de seguimiento para esos hallazgos. El contenido original queda abajo sin cambios, como registro histórico.

## Secuencia estratégica

| Fase | Objetivo | Tickets comprometibles | Criterio de corte |
|---|---|---|---|
| 0 | El hallazgo ya verificado en vivo de mayor valor, más el de mayor prioridad de negocio (EUDR) pendiente de su propia verificación. | GEO-01, AMB-01 | GEO-01 reproduce una consulta `/query` real en el PR; AMB-01 (no verificado en vivo todavía) confirma formato/granularidad real antes de escribir el parser. |
| 1 | Fricción baja, valor real. | GEO-02, ENE-01, FIN-01 | Cada uno con verificación en vivo propia documentada. |
| 2 | Ampliación y complementos. | ENE-02, ENE-03, AMB-02, AMB-03, FIN-02 | Ninguno bloquea capacidad nueva de fases anteriores. |

## Tickets

| ID | Épica | Objetivo | Criterios de aceptación | Dependencias | Prioridad | Esfuerzo | Fase |
|---|---|---|---|---|---|---|---|
| GEO-01 | **IMPLEMENTADO** (Geoespacial) | App/conector de catastro minero (INGEMMET, ArcGIS REST). Verificado en vivo 2026-09-21: 66,823/66,823 derechos mineros ingeridos a nivel nacional, 0 rechazados (4,787 en La Libertad). Paginación por rango de `OBJECTID` (el servicio no soporta `resultRecordCount`/`resultOffset`). | Respuesta real de `?f=json` y de `/query` incluida en el PR ✅; clave de upsert (`CODIGOU`) confirmada contra campos reales y verificada única sobre las 66,823 filas ✅; `estado` expuesto tal cual la fuente, sin normalizar a enum ✅. | Ninguna. | P0 | M | 0 |
| AMB-01 | Ambiente | Ingerir Bosque/No Bosque - Pérdida de Bosque Húmedo Amazónico a nivel distrital (MINAM). | Formato/columnas/granularidad confirmados en vivo antes del parser; evaluación documentada de cruce futuro con `identidad-fiscal` por UBIGEO (sin implementarlo). | Ninguna. | P0 | M | 0 |
| GEO-02 | Geoespacial | App/conector de áreas naturales protegidas (SERNANP, ArcGIS REST). | Respuesta real de `?f=json` y `/query` de las 5 capas en el PR; si no hay ID único estable, la limitación queda documentada explícitamente. | Ninguna. | P1 | M | 1 |
| ENE-01 | Energía | Ingerir precios de combustibles diarios (OSINERGMIN). | Verificación en vivo de formato/columnas/fecha de corte real; resuelve el recurso más reciente dinámicamente. | Ninguna. | P1 | S | 1 |
| FIN-01 | Financiero | App de presencia del Banco de la Nación (agencias, cajeros, agentes). | Verificación en vivo de los 3 datasets; endpoint de consulta por ubigeo. | Ninguna. | P1 | M | 1 |
| ENE-02 | Energía | Ingerir Registro de Hidrocarburos Líquidos (grifos/estaciones habilitadas, OSINERGMIN). | Verificación en vivo de si el dataset "sin fecha" sigue activo o hace falta resolver el mes más reciente entre los ~48 datasets. | Ninguna. | P2 | M | 2 |
| ENE-03 | Energía | Ingerir Accidentes Mortales en Mina (MINEM). | Formato real confirmado (Excel según hallazgo inicial, verificar); documentar si trae identidad de la empresa operadora. | Ninguna. | P2 | S | 2 |
| AMB-02 | Ambiente | Evaluar/ingerir Uso y cambio de uso de la tierra a nivel distrital (MINAM). | Comparación campo por campo contra AMB-01 documentada antes de decidir si se ingiere por separado. | AMB-01. | P1 | M | 2 |
| AMB-03 | Ambiente | Extender `residuos-solidos` con Disposición Final y Valorización. | No crea app nueva; se agrega a `apps/residuos-solidos/api` existente. | App `residuos-solidos`. | P2 | S | 2 |
| FIN-02 | Financiero | Expandir series BCRP ya integradas (tipo de cambio, inflación, PBI, tasas). | Códigos de serie confirmados en vivo contra la API real; decisión documentada sobre dónde viven (misma app vs. app nueva). | Conector `bcrp-comercio-exterior`. | P2 | S | 2 |

## Definition of Done por ticket

- Verificación en vivo propia (no heredada de la investigación de búsqueda de este PRD) documentada en el PR de cada ticket.
- Clave de upsert confirmada contra una respuesta real de la fuente, nunca inventada.
- Ficha en `docs/conectores.md` y data contract en `docs/data-contracts/`.
- `scripts/check-connectors-documented.sh` pasa sin cambios de script.
- Sin UI, sin scheduler.

## Fuentes investigadas y descartadas (no repetir sin nueva evidencia)

| Fuente | Motivo de descarte |
|---|---|
| SENAMHI | Solo 1 dataset de descarga directa confirmado (estaciones automáticas de intercambio internacional); el resto de su data (histórico completo, pronósticos) requiere formulario de "Solicitud de Servicio" — fricción alta, no es descarga directa como el resto del catálogo. |
| IIAP | Investigado sin hallazgo de API o dataset estructurado — solo revista científica (Folia Amazónica) y portal institucional genérico. |
| App "Facilito" de OSINERGMIN (stock de grifos en tiempo real) | El dataset diario ya público en `datosabiertos.gob.pe` (ENE-01) cubre el caso de uso de precios; el stock en tiempo real es un caso de uso distinto, más frágil (requiere probablemente ingeniería inversa de la app), no investigado en vivo. |

## Pendiente de integración (hallazgos de la misma sesión, fuera de este backlog)

Ver `docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md` (el backlog consolidado vigente, no la sección histórica de `BACKLOG_Deuda_Publica_MEF_v1.md`) — ahí quedan registrados SERFOR/GEOSERFOR, ONPE, SENACE (con API REST real confirmada, sube su prioridad frente a lo estimado en este documento), OSITRAN, SUNAFIL, SUNEDU, RENIEC, el Congreso de la República (API confirmada funcional, ADS-15), y los pendientes de verificar (ANA, SENASA, SUTRAN, INS, INABIF).
