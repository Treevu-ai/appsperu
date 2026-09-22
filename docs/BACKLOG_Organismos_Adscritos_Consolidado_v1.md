# Backlog ejecutable — Organismos adscritos de entidades ya conectadas (consolidado)

**Producto:** Rastro
**Regla transversal:** ninguna entidad de Épica B se ingiere sin verificación en vivo propia; PII se verifica columna por columna antes de decidir ingesta. El nombre de una columna no es evidencia de su contenido — se descarga el CSV real y se leen filas (hallazgo de ADS-11/SERVIR 2026-09-22: "NUMERO_DOCUMENTO" parecía un DNI real hasta que se abrió el archivo y resultó enmascarado con asteriscos en el 100% de las filas).
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
| ADS-01 | **CERRADO** (desbloqueo) | ~~Confirmar URL real del servicio geoespacial de GEOSERFOR (SERFOR)~~ — confirmado 2026-09-22: es ArcGIS Server, no GeoServer; REST real en `geo.serfor.gob.pe/geoservicios/rest/services/Servicios_OGC/<servicio>/MapServer` (5 servicios, incluye `Modalidad_Acceso` con la capa `Concesiones_Forestales`, 1,793 features). ADS-02 puede empezar directo. | URL real verificada con `curl` ✅. | Ninguna. | P0 | S | 0 |
| ADS-03 | **Épica C** (descartado) | ~~Conector SUNARP — Registro de Personas Jurídicas~~ — verificado en vivo 2026-09-22: las 6 categorías de dataset SUNARP en `datosabiertos.gob.pe` son XLSX de estadísticas agregadas por año/departamento, sin RUC ni representantes legales a nivel de fila. No hay conector que construir. Resuelve también ADS-17. | Verificación en vivo documentada ✅ (descarga y apertura real de un XLSX, confirmando 0 filas con datos de empresa/persona). | Ninguna. | P0 | M | 0 |
| ADS-05 | **CERRADO** | ~~Conector INDECI — Emergencias Históricas~~ — construido 2026-09-22: CSV real de 142,139 filas a nivel de evento individual (2003-2025), 0 rechazadas. Hallazgos reales: codificación Latin-1, dos formatos de fecha documentados por la fuente, y el "código único" SINPAD no lo es (7 duplicados). Ver `docs/data-contracts/indeci-emergencias-historicas.md` y `apps/emergencias-indeci/api`. | Verificación en vivo de granularidad (evento individual, no agregado) ✅; columnas reales confirmadas (49, documentadas) ✅; ingesta real ejecutada contra Postgres ✅. | Ninguna. | P1 | S | 0 |
| ADS-02 | **CERRADO** | ~~Conector SERFOR — catastro forestal / GEOSERFOR~~ — construido 2026-09-22: 10 capas de 2 servicios ArcGIS (`Modalidad_Acceso` + `Ordenamiento_Forestal`), 5,391 filas, 0 rechazadas. Ver `docs/data-contracts/serfor-catastro-forestal.md` y `apps/catastro-forestal/api`. | Mismo estándar que GEO-01/GEO-02 ✅; ingesta real verificada contra Postgres ✅; API y tools MCP registradas y probadas en vivo ✅. | ADS-01 (desbloqueado). | P0 | M | 1 |
| ADS-04 | **CERRADO** | ~~Conector SENACE — cartera de proyectos (API REST ya confirmada)~~ — construido 2026-09-21: la API documentada en `/Api/Help` está gateada por `auth_key` (no poseemos token) y además tiene un hallazgo de seguridad real (ver `docs/seguridad/senace-reporte-vulnerabilidad-2026-09-21.md`); el conector usa en su lugar el portal público sin auth `/home/CatalogoDatos/` (`JsonCarteraProyecto?q=<estado>`), verificado 1,870/1,870 filas, 0 rechazadas. Ver `docs/data-contracts/senace-cartera-proyectos.md` y `apps/senace-cartera-proyectos/api`. | Ingesta real ejecutada contra Postgres con conteos verificados ✅; API y tools MCP registradas y probadas en vivo ✅. | Ninguna. | P1 | M | 1 |
| ADS-06 | Triage | Priorizar 3-5 datasets de ONPE de 375 disponibles. | Lista corta con URL real y razón de priorización. | Ninguna. | P1 | S | 2 |
| ADS-07 | Triage | Verificar formato real de datos SMV (Hechos de Importancia, accionistas >4%). | Formato confirmado (CSV/JSON/solo visor); evalúa valor para perfil de riesgo por RUC. | Ninguna. | P1 | S | 2 |
| ADS-08 | Triage | Verificar contenido real del portal OSITRAN. | Datasets reales documentados, formato confirmado. | Ninguna. | P2 | S | 2 |
| ADS-09 | Triage | Verificar contenido real del grupo SUNAFIL. | Datasets reales documentados; evalúa relevancia para perfil de riesgo por RUC si hay sanciones laborales por empleador. | Ninguna. | P2 | S | 2 |
| ADS-10 | Triage + PII | Verificar riesgo de PII en "Puestos de trabajo" (MTPE) antes de decidir ingesta. | Verificación explícita de columna con posible identificador de persona; descarte automático si hay PII. | Ninguna. | P2 | S | 2 |
| ADS-11 | **Épica C** (descartado, las 9) | ~~Verificar SUNEDU, RENIEC, ANA, SENASA, SUTRAN, INS, INABIF, CENEPRED, SERVIR (9 entidades)~~ — verificado en vivo 2026-09-22, las 9 sin hallazgo: 0/9 tienen datos publicados con identificador (RUC/DNI/nombre de entidad) a nivel de fila. Ver tabla de descarte abajo para el detalle por entidad. | Tabla de conclusión por las 9, cada una con hallazgo real o "sin hallazgo" + razón ✅ (ver abajo). | Ninguna. | P2 | M | 2 |
| ADS-15 | **CERRADO** (contrato) | ~~Confirmar contrato de `api.congreso.gob.pe/spley-portal-service/proyecto-ley`~~ — confirmado 2026-09-21: `curl` puro sin sesión de navegador, `perParId` único campo requerido, catálogo real de periodos (`2021`, `2026`) y filtros descubiertos. Ver `docs/data-contracts/congreso-spley-portal-service.md`. **Alcance recortado formalmente a `proyecto-ley` únicamente** — votaciones/asistencia/comisiones se retiraron de este ticket y pasan a ADS-20. | Consulta real con `200` y datos, body exacto documentado ✅; contrato de `FiltroProyecLeyDto` documentado ✅. | Ninguna. | P1 | S | 1 |
| ADS-20 | Triage | Investigar si existen rutas equivalentes a `spley-portal-service` para votaciones, asistencia y comisiones bajo `api.congreso.gob.pe` (alcance retirado de ADS-15, no investigado todavía). Intentos ya descartados sin éxito: `wb2server.congreso.gob.pe/votaciones-portal/`, `/asistencia-portal/`, `/comisiones-portal/` (todos `404`); servicios `api.congreso.gob.pe/votacion-portal-service`, `/asistencia-portal-service`, `/comision-portal-service`, `/pleno-portal-service` (todos `404`); homepage de `congreso.gob.pe` sin enlaces visibles al patrón. | Verificación en vivo de una ruta real distinta a las ya descartadas, o conclusión explícita de que no existe un servicio público equivalente (reclasificar a Épica C con la evidencia de los intentos, mismo criterio que ADS-01/SERFOR). | Ninguna. | P2 | S | 2 |
| ADS-16 | Triage | Evaluar `gestionpublicaperu.com.pe` (agregador privado, no oficial) como validación cruzada de `budget_execution`. | Rate limit y estabilidad confirmados; conclusión documentada (se usa o no) sin crear dependencia operativa de un tercero no oficial. | Ninguna. | P2 | S | 2 |
| ADS-17 | **Épica C** (resuelto por ADS-03) | ~~Verificar Portal de Estadística SUNARP~~ — la premisa "distinto de ADS-03" era incorrecta: ADS-03 ya confirmó que es el mismo tipo de contenido (agregados XLSX). Sin acción adicional. | Ninguna (cerrado por la evidencia de ADS-03). | Ninguna. | P2 | S | 2 |
| ADS-18 | Triage | Verificar GeoServer WFS de red vial del MTC (geometría real). | Capacidades/capas del servicio WFS confirmadas en vivo; evalúa valor agregado frente a `infraestructura-mtc`/`red-vial-subnacional` tabular. | Ninguna. | P2 | M | 2 |
| ADS-19 | Triage | Verificar Provías Nacional (carreteras nacionales, separado de Provías Descentralizado). | Confirma si hay dataset/API real recurrente, no solo un PDF puntual; reclasifica a Épica C si no la hay. | Ninguna. | P2 | S | 2 |

## Definition of Done por ticket

- Verificación en vivo propia documentada en el PR (evidencia real, no snippet de búsqueda).
- Todo ticket de Épica B (ADS-06 a ADS-11, ADS-16 a ADS-20) termina en una conclusión explícita por entidad/fuente — Épica A (pasa a ticket de ingesta) o Épica C (se descarta con razón documentada). Ninguno queda indefinido. (ADS-15 ya cerró como Épica A, con alcance recortado a `proyecto-ley` — ver arriba.)
- Ningún dataset con riesgo de PII no evaluado se ingiere.
- Cualquier ticket que llegue a ingesta real registra su tool en `mcp-server/src/catalog.ts` y la verifica con al menos una invocación funcional real, además de la ficha en `docs/conectores.md` y el data contract en `docs/data-contracts/`.
- Sin UI, sin scheduler.

## Registrado y sin acción (Épica C — no reinvestigar sin señal nueva)

| Entidad | Razón de descarte |
|---|---|
| SBS | Grupo propio en `datosabiertos.gob.pe` verificado en vivo con 0 datasets. Su "Reporte de Deudas" individual requiere login con DNI — PII, descartado por diseño, no solo por fricción. |
| Palacio de Gobierno / Casa Oficial del Gobierno | Oficinas de protocolo/prensa, no entidades estadísticas. Sin dataset ni API encontrado. |
| SUNARP (todas las 6 categorías en `datosabiertos.gob.pe`) | Verificado en vivo 2026-09-22 (ADS-03/ADS-17): son XLSX de estadísticas agregadas por año/departamento (inmatriculaciones, transferencias, rondas campesinas, etc.), sin RUC ni nombres a nivel de fila. No hay registro de personas jurídicas ni representantes legales consultable — la hipótesis original del PRD era incorrecta. |
| SERVIR — RNSSC (Registro Nacional de Sanciones contra Servidores Civiles) | Verificado en vivo 2026-09-22 (ADS-11): CSV real descargado de `datosabiertos.gob.pe/dataset/registro-nacional-de-sanciones-contra-servidores-civiles` (3 recursos, ~7,950 filas). `NUMERO_DOCUMENTO` y `NOMBRE_SANCIONADO` vienen enmascarados con asteriscos en prácticamente el 100% de las filas (2 de 7,950 sin asteriscos, y esas 2 son filas vacías) — sin DNI ni nombre real, imposible de cruzar por persona. `NOMBRE_ENTIDAD` es literalmente "AUTORIDAD NACIONAL DEL SERVICIO CIVIL" en las 7,947 filas con datos — no identifica la entidad empleadora del sancionado. Solo queda usable como estadística agregada (categoría/causa/artículo penal), no como cruce. |
| SUTRAN — Fiscalización de gabinete a entidades de Servicios Complementarios (conductores/vehículos) | Verificado en vivo 2026-09-22 (ADS-11): CSV real descargado (`DATOS ABIERTOS - ENERO A NOVIEMBRE 2021 - SGFSC_C.csv`, 565 filas). Columnas: número de expediente, tipo de entidad, resultado (CONFORME/NO CONFORME), fechas — sin RUC ni nombre de la entidad fiscalizada, imposible saber a quién corresponde cada resultado. Además el único recurso disponible está congelado en 2021, sin actualizaciones desde entonces. |
| SUNEDU | Grupo verificado en vivo 2026-09-22: único dataset es "Carnés universitarios" — sin relación con sanciones, licencias ni contrataciones. |
| RENIEC | Grupo verificado en vivo 2026-09-22: 10 datasets, todos estadística agregada (trámites de DNI, consultas atendidas, población electoral) — ningún registro individual, esperable tratándose del registro civil. |
| ANA (Autoridad Nacional del Agua) | Grupo verificado en vivo 2026-09-22: un solo dataset publicado ("puntos críticos", hidrológico) — sin relación con licencias de uso de agua por RUC/DNI ni con sanciones. |
| SENASA | Grupo verificado en vivo 2026-09-22: datasets de ejecución presupuestal e importación/exportación agraria — estadística agregada, sin registro de sanciones por RUC. |
| INABIF | Grupo verificado en vivo 2026-09-22: datasets de servicios de bienestar familiar (acogimiento residencial, orfandad, cuidado diurno) — sin relación con el dominio de Rastro. |
| INS (Instituto Nacional de Salud) | Grupo verificado en vivo 2026-09-22: datasets de nutrición, COVID-19, plantas medicinales — sin relación con el dominio de Rastro. |
| CENEPRED | Verificado en vivo 2026-09-22: sin grupo ni datasets publicados en `datosabiertos.gob.pe`. |

**Corrección (2026-09-21, misma sesión)**: el Congreso (`spley-portal-service`) se había registrado aquí como descartado por un supuesto DNS roto — **era un falso negativo**. El endpoint real responde con errores de validación de un backend Spring vivo cuando se le pasa el path y los parámetros correctos (confirmado con `curl` y con un proyecto de terceros real en GitHub que scrapea la misma ruta). Movido a ADS-15 en la tabla de tickets arriba.

## Nota de remisión

Este documento consolida y reemplaza las secciones "Pendiente de integración" de:
- `docs/BACKLOG_Deuda_Publica_MEF_v1.md`
- `docs/BACKLOG_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md`

Ambos quedan con su contenido original intacto (no se borra nada), más una nota señalando este documento como la fuente viva de seguimiento para esos hallazgos.
