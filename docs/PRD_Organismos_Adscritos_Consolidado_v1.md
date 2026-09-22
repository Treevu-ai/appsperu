# PRD — Organismos adscritos de entidades ya conectadas (consolidado)

**Estado:** Propuesto — investigación completa por búsqueda + verificación en vivo parcial (documentada por ticket, ver §5).
**Fecha:** 2026-09-21
**Ámbito:** apps nuevas por definir (ver §5), `mcp-server/src/catalog.ts`, `docs/conectores.md`, `docs/data-contracts/`
**Horizonte:** sin fecha comprometida — inventario priorizado de una investigación de una sola sesión, cada ticket exige su propia verificación en vivo antes de proceder.
**Origen:** consolida cuatro rondas de investigación de la misma sesión (2026-09-21): adscritos de entidades ya conectadas (MIDAGRI, sistema electoral, MTC, MTPE, MINEDU, MINSA, MIMP), SUNAT/SUNARP/SMV/SBS/MINTRA, y Congreso/PCM/Presidencia. Reemplaza y consolida las secciones "Pendiente de integración" de `docs/BACKLOG_Deuda_Publica_MEF_v1.md` y `docs/BACKLOG_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md` — esos dos backlogs quedan con una nota de remisión a este documento, no se eliminan.

## 1. Decisión de producto

Esta sesión ya construyó dos PRD de conectores nuevos (`PRD_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md`, `PRD_Deuda_Publica_MEF_v1.md`) a partir de investigar ministerios completos. En paralelo, el usuario pidió una pasada distinta: para **cada entidad que Rastro ya tiene conectada**, identificar qué **organismos adscritos** le faltan. Eso encontró ~18 entidades candidatas nuevas, de calidad muy despareja — desde una API REST documentada y verificada en vivo (SENACE) hasta un hallazgo negativo honesto (SBS).

Este PRD no trata las 18 entidades como iguales. Las agrupa en tres franjas según cuánta evidencia real respalda cada una (§5: Épica A = verificado en vivo con éxito; Épica B = dataset real confirmado por búsqueda, sin `curl` propio todavía; Épica C = sin verificar o descartado, registrado para no perder el hallazgo) — y exige que cualquier ticket de Épica B se mueva a "verificado" antes de comprometer esfuerzo de ingesta, mismo principio que el resto de PRDs de esta sesión.

## 2. Problema y oportunidad

1. **El catálogo de Rastro está organizado por ministerio matriz, no por el árbol completo del Estado.** Cada app nueva investiga su fuente, pero nadie había preguntado sistemáticamente "¿qué le falta a MIDAGRI/MTC/MTPE/MINEDU/MINSA/MIMP además de lo que ya tiene?" hasta esta sesión.
2. **Dos hallazgos tienen valor desproporcionado frente al resto**: SUNARP (representantes legales y transferencias de propiedad — la pieza que falta para saber quién controla realmente una empresa) y SERFOR/GEOSERFOR (catastro forestal — la fuente que el propio trabajo EUDR del usuario necesita, y que este PRD todavía no deja lista para construir por falta de una URL de servicio confirmada).
3. **Un hallazgo es negativo y vale la pena dejarlo escrito** para no reinvestigarlo: SBS (0 datasets reales). Un cuarto hallazgo, el backend del portal de Proyectos de Ley del Congreso, se creyó inicialmente un DNS roto sin solución — **corregido dentro de esta misma sesión** (ver ADS-15): el endpoint real sí responde cuando se le pasa el path y los parámetros correctos, confirmado con un backend Spring vivo devolviendo errores de validación reales.

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Cerrar la brecha entre "evidencia encontrada por búsqueda" y "evidencia verificada en vivo" para cada una de las ~18 entidades, y construir los conectores de mayor valor confirmado (Épica A) sin esperar a completar la verificación de las demás.

### No objetivos

- No se construyen las 18 entidades en este PRD — solo las que superan verificación en vivo real (Épica A) se comprometen a ingesta; el resto queda como investigación pendiente con su propio ticket de verificación (Épica B) o registrado como descartado (Épica C).
- ADS-15 confirma el contrato de `spley-portal-service`, pero **no construye el conector de ingesta del Congreso en este PRD** — eso queda como ticket separado, una vez el contrato esté confirmado.
- No se investiga el riesgo de PII de "Puestos de trabajo registrados en el sector formal asalariado privado" (MTPE) más allá de lo que exige ADS-10 — si el ticket de verificación encuentra un identificador de persona, el dataset se descarta sin excepción, mismo criterio que ya aplica el proyecto a Pensión 65/RENIEC.
- No se cruzan estas fuentes nuevas contra las existentes en este PRD — cada conector nace solo, los cruces son un PRD posterior una vez existan al menos dos piezas para cruzar.
- No se implementa scheduler.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Épica A ingerida | SUNARP (personas jurídicas, como mínimo) y SENACE tienen conector funcional, verificado en vivo, con ficha y data contract. |
| SERFOR desbloqueado | ADS-01 encuentra y confirma la URL real del servicio geoespacial de GEOSERFOR (el intento inicial a `/geoserver/wfs` dio 404) — sin esto, SERFOR quedaría indefinidamente en Épica B pese a ser el hallazgo más relevante para EUDR. |
| Épica B resuelta o descartada | Cada entidad de Épica B tiene, al cierre de este PRD, una conclusión explícita: pasó a Épica A (se construye) o se reclasificó como Épica C (se descarta con razón documentada) — ninguna queda "pendiente" sin fecha de revisión. |
| Documentación honesta | `docs/BACKLOG_Deuda_Publica_MEF_v1.md` y `docs/BACKLOG_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md` tienen la nota de remisión a este documento (§1) sin perder su contenido original. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Analista de riesgo / due diligence | "¿Quién controla realmente esta empresa? ¿Hay concesión forestal o transferencia de propiedad reciente?" | SUNARP (personas jurídicas + propiedad inmueble) consultable por RUC/partida. |
| Analista EUDR (trabajo en curso del usuario) | "¿Hay concesión forestal o bosque de producción permanente en esta zona?" | GEOSERFOR consultable por coordenada/ubigeo, una vez ADS-01 confirme la URL real. |
| Periodista / analista electoral | "¿Cuáles fueron los resultados reales de la última elección, mesa por mesa?" | ONPE (375 datasets) explorado y priorizado. |
| Ciudadano / analista de riesgo climático | "¿Qué emergencias/desastres ha habido en mi región, históricamente?" | INDECI (emergencias históricas) consultable por ubigeo/fecha. |
| Agente de IA (MCP) | Responder preguntas sobre propiedad empresarial, bosques, elecciones y emergencias sin salir del catálogo. | Tools MCP nuevas por cada conector de Épica A, cobertura declarada honestamente. |

## 5. Alcance funcional

### Épica A — Fuente real confirmada, esfuerzo de ingesta justificado (verificación de esquema sigue siendo parte de cada ticket)

**Corrección de etiqueta (Copilot, PR #180)**: "Épica A" no significa que el schema ya esté confirmado — significa que la *existencia* de la fuente (el endpoint/dataset responde, sin depender de más investigación de descubrimiento) ya está verificada, y por eso el esfuerzo de ingesta está justificado. ADS-01 sigue siendo un ticket de descubrimiento (todavía no hay URL confirmada). ADS-03 y ADS-05 sí tienen fuente confirmada, pero **su verificación en vivo de formato/columnas/granularidad exacta sigue siendo un criterio de aceptación obligatorio de cada ticket**, no un paso ya completado — ningún ticket de esta épica fija un schema antes de esa verificación.

#### ADS-01 — SERFOR / GEOSERFOR: confirmar URL real del servicio geoespacial

**Prioridad:** P0 · **Esfuerzo:** S (investigación) · **Dependencias:** ninguna

`geo.serfor.gob.pe/geoserfor` responde (HTTP 200 confirmado), pero el intento de `/geoserver/wfs` estándar dio 404 — el portal no sigue la convención GeoServer por defecto, o el path real es distinto. Inspeccionar el portal (con `claude-in-chrome` si `curl` no basta, mismo criterio que `riesgo-fiscal-isds`) para encontrar la URL real del servicio WFS/REST detrás del visor, siguiendo el mismo método que ya funcionó para encontrar `api.congreso.gob.pe/spley-portal-service` esta sesión (inspeccionar las llamadas de red del frontend, o el bundle JS si es una SPA).

**Por qué P0 pese a ser solo investigación**: es el bloqueante real para el hallazgo de mayor relevancia EUDR de todo este PRD — sin la URL confirmada, SERFOR no puede pasar a un ticket de ingesta real.

**Criterios de aceptación**

- URL real del servicio confirmada con `curl` (respuesta JSON/XML real, no HTML de portal), o conclusión explícita de que no existe un servicio público directo (en cuyo caso se documenta y SERFOR se reclasifica a Épica C).
- Si se confirma, ADS-02 (ingesta) puede empezar sin más investigación previa.

#### ADS-02 — Conector SERFOR: catastro forestal / GEOSERFOR

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ADS-01

Ingerir concesiones forestales, bosques de producción permanente y/o zonificación forestal, según lo que ADS-01 confirme disponible. Nota: "Catastro Forestal (Nivel Nacional)" ya está también en `datosabiertos.gob.pe` directamente — evaluar si esa vía (descarga de archivo) es más simple que el servicio geoespacial antes de comprometerse a ArcGIS/WFS, si ambas exponen sustancialmente lo mismo.

**Criterios de aceptación**

- Mismo estándar que GEO-01/GEO-02 de `PRD_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md`: respuesta real de la fuente incluida en el PR, clave de upsert confirmada contra campos reales.
- `docs/data-contracts/serfor-catastro-forestal.md` documenta la vía elegida (geoespacial vs. archivo de `datosabiertos.gob.pe`) y por qué.

#### ADS-03 — Conector SUNARP: Registro de Personas Jurídicas

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ninguna

De las 8 categorías de dataset de SUNARP en `datosabiertos.gob.pe`, esta es la de mayor valor inmediato: constitución de empresas y representantes legales/poderes — la pieza que falta para saber quién controla una empresa más allá de su RUC. Verificar en vivo el recurso real (formato, columnas, si incluye persona jurídica + representante en la misma fila o en tablas separadas) antes de fijar el schema.

**Hallazgo real de PII (Copilot, PR #180) — este ticket no queda limitado a "solo empresas" por defecto**: "Registro de Personas Jurídicas" **incluye representantes legales y apoderados**, que son personas naturales potencialmente identificables (nombre, y posiblemente documento de identidad, según lo que confirme la verificación en vivo). La regla general de PII de este PRD (§7) solo cubre expansiones futuras a datasets de "Personas Naturales" — **no cubre automáticamente los representantes que ya vienen dentro de este dataset de personas jurídicas**. Antes de ingerir cualquier columna de representante, este ticket exige una evaluación explícita: qué campos de persona natural trae realmente la fuente, y si se ingieren con el mismo criterio de minimización/enmascarado que ya usa el catálogo para conformación societaria (`perfilprov-conformacion-connector.ts`, OSCE) — nombre completo puede quedar, documento de identidad se enmascara o se excluye, mismo patrón que el resto del proyecto.

**Criterios de aceptación**

- Verificación en vivo del recurso real documentada en el PR (no solo la descripción de búsqueda).
- Schema distingue explícitamente "empresa" de "representante/apoderado" si la fuente los separa — no se colapsan en una sola entidad sin confirmar que es seguro hacerlo.
- Evaluación de PII de los campos de representante/apoderado documentada explícitamente (qué campos trae la fuente, qué se ingiere y qué se enmascara/excluye) — no se asume "es solo un registro de empresas" sin haber revisado esto.
- `docs/data-contracts/sunarp-personas-juridicas.md` documenta columnas reales, cobertura (nacional vs. parcial), y la decisión de tratamiento de PII de representantes.

#### ADS-04 — Conector SENACE (CERRADO — construido 2026-09-21)

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** ninguna

**Corrección post-verificación**: la API documentada en `/Api/Help` (HTTP 200 confirmado en la
investigación inicial) resultó estar gateada por un `auth_key` que no poseemos (`curl` con token
de prueba → `400 "Token Invalido."`), y además tiene un hallazgo de seguridad real (validación de
`auth_key` inconsistente entre datastreams — ver `docs/seguridad/senace-reporte-vulnerabilidad-2026-09-21.md`).
El conector construido usa en su lugar el portal público sin autenticación
`/home/CatalogoDatos/` (endpoint `JsonCarteraProyecto?q=<estado>`), verificado en vivo con
`curl` plano. SENACE es adscrito a MINAM (certificación ambiental de inversiones) — cartera de
proyectos aprobados/desaprobados/en evaluación, relevante para rastrear el estado de
certificación ambiental de proyectos mineros/energéticos grandes (conecta con
`PRD_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md`). Ver
`docs/data-contracts/senace-cartera-proyectos.md` y `apps/senace-cartera-proyectos/api`.

**Criterios de aceptación**

- ✅ `docs/data-contracts/senace-cartera-proyectos.md` documenta ambos sistemas de la fuente
  (la API gateada de `/Api/` con sus 7 datastreams y el hallazgo de seguridad, y el portal
  público `JsonCarteraProyecto` realmente usado) — no solo el endpoint elegido.
- ✅ Ingesta real ejecutada contra Postgres (1,870/1,870 filas, 0 rechazadas) y API/tools MCP
  verificadas en vivo.

#### ADS-05 — Conector INDECI: emergencias históricas

**Prioridad:** P1 · **Esfuerzo:** S · **Dependencias:** ninguna

Dataset "Emergencias Históricas Registradas por INDECI" en `datosabiertos.gob.pe` — histórico nacional desde 2003 (inundaciones, huaicos, sismos, heladas, etc.), fuente derivada de SINPAD.

**Criterios de aceptación**

- Verificación en vivo de formato/columnas/granularidad (¿por evento individual, o agregado por período/ubigeo?) antes de fijar el schema.
- `docs/data-contracts/indeci-emergencias-historicas.md` documenta columnas reales y si distingue tipo de fenómeno de forma estructurada (no solo texto libre).

### Épica B — Dataset real confirmado por búsqueda, requiere verificación en vivo propia antes de ingerir

#### ADS-06 — Verificar y priorizar ONPE

**Prioridad:** P1 · **Esfuerzo:** S (investigación) · **Dependencias:** ninguna

Grupo propio en `datosabiertos.gob.pe` con **375 datasets**, incluyendo resultados electorales 2025 — volumen mucho mayor que cualquier otra fuente de este PRD. Distinto de JNE (que Rastro ya cubre parcialmente con `autoridades-electas`/`candidatos-erm`): ONPE procesa y publica resultados de votación, JNE es el ente jurisdiccional/registral. Dado el volumen, este ticket es de **triage**, no de ingesta directa — identificar los 3-5 datasets de mayor valor (ej. resultados por mesa de sufragio más reciente) antes de comprometer un ticket de ingesta real.

**Criterios de aceptación**

- Lista corta (3-5) de datasets ONPE priorizados, con su URL real y una razón de por qué esos y no otros de los 375.
- Si alguno se confirma como candidato fuerte, se abre como ticket de ingesta separado (fuera de este PRD, o como adenda).

#### ADS-07 — Verificar SMV en profundidad

**Prioridad:** P1 · **Esfuerzo:** S · **Dependencias:** ninguna

Portal propio verificado en vivo (`mvnet.smv.gob.pe/SMV.OpenData.Web/`, HTTP 200) — falta confirmar el formato real de "Hechos de Importancia" y listas de accionistas >4% (¿CSV descargable, API JSON, o solo visor HTML?).

**Criterios de aceptación**

- Formato real confirmado con `curl`/inspección del portal, documentado.
- Si el dato de accionistas >4% es real y descargable, se evalúa explícitamente su valor para el perfil de riesgo por RUC de `PRD_Cruces_Educacion_Riesgo_RUC_v1.md` (sin implementar el cruce aquí).

#### ADS-08 — Verificar OSITRAN

**Prioridad:** P2 · **Esfuerzo:** S · **Dependencias:** ninguna

Portal propio verificado en vivo (`serviciosdigitales.ositran.gob.pe:8443/PortalDatosOsitran/`, HTTP 200) — sin confirmar contenido específico (regulación de infraestructura de transporte: puertos, aeropuertos, carreteras concesionadas — complementaría `infraestructura-mtc`).

**Criterios de aceptación**

- Contenido real del portal documentado (qué datasets expone, formato).

#### ADS-09 — Verificar SUNAFIL

**Prioridad:** P2 · **Esfuerzo:** S · **Dependencias:** ninguna

Presencia confirmada en grupo propio de `datosabiertos.gob.pe`, contenido específico sin verificar. Adscrito a MTPE — fiscalización laboral, posible señal de cumplimiento normativo de empleadores (relevante para el perfil de riesgo por RUC).

**Criterios de aceptación**

- Contenido real del grupo documentado; si hay datos de sanciones/infracciones laborales por RUC de empleador, se evalúa su relevancia para `PRD_Cruces_Educacion_Riesgo_RUC_v1.md`.

#### ADS-10 — Verificar y evaluar riesgo de PII: Puestos de trabajo (MTPE)

**Prioridad:** P2 · **Esfuerzo:** S · **Dependencias:** ninguna

"Puestos de trabajo registrados en el sector formal asalariado privado" — más granular que lo que ya ingiere `actividad-empresarial` (tipo de contrato, ocupación, salario, empleador, sector). **Antes de cualquier decisión de ingesta**: confirmar si trae identificador de persona (nombre, DNI) en alguna columna — si lo trae, se descarta sin excepción, mismo criterio que Pensión 65/RENIEC en `PRD_Servicios_Salud_Programas_Sociales_v1.md`.

**Criterios de aceptación**

- Verificación explícita de PII documentada, con la columna exacta revisada (no una suposición).
- Si no hay PII, se evalúa como candidato de ingesta real (ticket separado). Si hay PII, se cierra aquí con la razón documentada.

#### ADS-11 — Verificar SUNEDU, RENIEC, ANA, SENASA, SUTRAN, INS, INABIF, CENEPRED, SERVIR

**Prioridad:** P2 · **Esfuerzo:** M (una investigación por entidad, agrupadas en un solo ticket de triage) · **Dependencias:** ninguna

Nueve entidades con hallazgo débil o inexistente (ver tabla de origen en §9). Un solo ticket de triage: para cada una, confirmar con búsqueda + `curl` si existe un dataset/API real, y clasificar como Épica A (pasa a ticket de ingesta) o Épica C (se descarta con razón). No se profundiza en ninguna hasta que este triage la separe de las demás.

**Criterios de aceptación**

- Tabla de conclusión por las 9 entidades, cada una con: hallazgo real o "sin hallazgo" + razón, URL si existe.
- Ninguna de las 9 queda en este PRD como "pendiente" indefinido después de este ticket — o se promueve a un PRD de ingesta, o se documenta como descartada.

#### ADS-15 — Congreso de la República: confirmar contrato de `spley-portal-service`

**Estado: CERRADO, alcance recortado formalmente a proyectos de ley — 2026-09-21.** Ver `docs/data-contracts/congreso-spley-portal-service.md` para el contrato completo con evidencia. Resumen: `POST /spley-portal-service/proyecto-ley/lista-con-filtro` es `(a) automatizable vía curl/fetch directo`, sin cookies ni sesión de navegador — verificado con `curl` puro devolviendo `HTTP 200` real (14,864 proyectos para `perParId=2021`, 4 para `perParId=2026`). `FiltroProyecLeyDto` solo exige `perParId` (entero); confirmado con `HTTP 400` real al omitirlo. Catálogo de periodos válidos descubierto en `GET /periodo-parlamentario`: **solo existen `perParId` 2021 y 2026** — los periodos históricos que el repo de terceros asume (2016/2011/2006) no están en este servicio y devuelven `200` con lista vacía (no error, "sin resultados"). Catálogo completo de filtros (`comisionId`, `estadoId`, `grupParId`, `tipoFirmanteId`, `perLegId`) descubierto en `GET /periodo-parlamentario/{perParId}/filtros`. LEG-01 (`docs/PRD_Inteligencia_Legislativa_Congreso_v1.md`) puede proceder.

**Recorte de alcance explícito (hallazgo real de Copilot, corregido aquí)**: el tercer criterio original de ADS-15 (votaciones/asistencia/comisiones bajo el mismo host) **no se investigó en esta pasada** — probé rutas conocidas (`wb2server.congreso.gob.pe/votaciones-portal/`, `/asistencia-portal/`, `/comisiones-portal/`, servicios `api.congreso.gob.pe/votacion-portal-service`, etc., todas `404`) y la homepage de `congreso.gob.pe` sin encontrar el patrón. No cierro ADS-15 fingiendo que ese criterio se cumplió: **se retira formalmente de ADS-15** (que queda acotado a `proyecto-ley` únicamente, con los 2 criterios restantes ahora reales) **y se registra como ticket nuevo, ADS-20**, en `docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`.

**Prioridad:** P1 · **Esfuerzo:** S · **Dependencias:** ninguna

**Corrección de un hallazgo anterior (2026-09-21, misma sesión)**: el intento inicial de `curl` contra la raíz `api.congreso.gob.pe/spley-portal-service` (sin path, sin body) devolvía un 302 a un hostname interno con DNS roto (`svr-appserver4.congreso.net`, resolviendo a IPs de WP Engine) — eso se documentó como "bloqueado". **Verificado en vivo después**: el endpoint real sí funciona cuando se invoca con su path y body completos — `POST /spley-portal-service/proyecto-ley/lista-con-filtro` responde con errores de validación reales de un backend Spring vivo (`400` por campo `perParId` faltante, `500` al enviar un valor de prueba), no con el 302 roto. Confirmado además por un proyecto de terceros (`unimauro/congreso-abierto-peru`, repo real en GitHub) cuyo scraper apunta exactamente a esta misma ruta.

Este ticket determina el contrato real completo (todos los campos que `FiltroProyecLeyDto` exige, valores válidos de `perParId` por período parlamentario) para poder construir un conector real — no es una API pública documentada, así que el contrato hay que inferirlo de las respuestas de error y, si hace falta, del bundle JS del frontend (`wb2server.congreso.gob.pe/spley-portal/`, mismo método ya usado para encontrar la URL del backend).

**Criterios de aceptación**

- [x] Una consulta real que devuelva `200` con datos de proyectos de ley, documentada en el PR con el body exacto usado.
- [x] Contrato completo de `FiltroProyecLeyDto` documentado (campos requeridos y opcionales, valores válidos conocidos de `perParId`).
- ~~Se evalúa si existen rutas equivalentes para votaciones/asistencia/comisiones bajo el mismo host~~ — **retirado de este ticket, ver ADS-20** (`docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`).

#### ADS-16 — Evaluar `gestionpublicaperu.com.pe` como fuente de validación cruzada de MEF

**Prioridad:** P2 · **Esfuerzo:** S · **Dependencias:** ninguna

**No es una entidad del Estado — es un agregador privado**, distinto de todo lo demás en este PRD. Se deja registrado aparte porque **verificado en vivo 2026-09-21**: `https://app.gestionpublicaperu.com.pe/api/insights/schema` responde `HTTP 200`, sin auth, con una tabla `mef_historico` real de **32,364,402 filas, 137 columnas, 2013-2026** — el histórico crudo de SIAF (incluye `PLIEGO`, `SECTOR`, `UNIDAD_EJECUTORA`, departamento/provincia/distrito ejecutora). Se usó en esta misma sesión para resolver una discrepancia real entre el `entity_code` interno de `radar-ejecucion` (477 para Congreso) y el pliego SIAF oficial (028) — confirmando que son dos esquemas de codificación distintos.

**Decisión a evaluar, no asumir**: esto podría servir como (a) fuente de validación cruzada de los números que `radar-ejecucion` ya ingiere directamente de MEF (comparar `devengado`/`PIM` por pliego/año), o (b) fuente alternativa más simple para ampliar cobertura histórica sin repetir el `HTTP Range` + parseo manual que usa `mef-connector.ts`. Al ser un tercero (no la fuente primaria oficial), cualquier uso debe quedar documentado como tal — no reemplaza la fuente oficial, la complementa.

**Criterios de aceptación**

- Se confirma en vivo el rate limit real (30 req/min según lo observado) y estabilidad del servicio antes de depender de él para cualquier validación recurrente.
- Se documenta explícitamente que es una fuente de terceros (no oficial) en cualquier ficha que la mencione — mismo criterio de transparencia que el resto del catálogo aplica a fuentes no primarias.
- Se evalúa (y se documenta la conclusión, aunque sea "no se usa") si vale la pena como validación cruzada puntual de `budget_execution`, sin comprometerse a una dependencia operativa de un tercero no oficial.

#### ADS-17 — Portal de Estadística SUNARP (agregados por año, distinto de ADS-03)

**Prioridad:** P2 · **Esfuerzo:** S · **Dependencias:** ninguna

`sunarp.gob.pe/estadisticas/` — XLSX por año con inmatriculaciones, transferencias, hipotecas, declaratoria de fábrica, independización. **Distinto de ADS-03** (que es el dataset de personas jurídicas a nivel de registro individual, en `datosabiertos.gob.pe`): esto es agregado nacional/regional por tipo de trámite, sin verificar en vivo todavía.

**Criterios de aceptación**

- Verificación en vivo del formato real (XLSX confirmado, columnas exactas, granularidad — ¿nacional, por oficina registral, por departamento?).
- Se evalúa si complementa o duplica sustancialmente ADS-03 antes de decidir ingesta separada, mismo criterio que AMB-02 de `PRD_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md` para datasets potencialmente solapados.

#### ADS-18 — MTC: GeoServer WFS de red vial (geometría real)

**Prioridad:** P2 · **Esfuerzo:** M · **Dependencias:** ninguna

`portal.mtc.gob.pe/estadisticas/descarga.html` — servicio WFS (estándar OGC) con shapefiles de carreteras nacionales, departamentales y vecinales. Complementaría `infraestructura-mtc`/`red-vial-subnacional` (que hoy no tienen geometría real, solo atributos tabulares) con los trazados reales de las vías — relevante para cruces geoespaciales futuros (ej. contra catastro minero de ADS-02, si una vía cruza una concesión).

**Criterios de aceptación**

- Verificación en vivo del servicio WFS real (capacidades, capas disponibles, formato de descarga) — mismo estándar que GEO-01/GEO-02 de `PRD_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md`.
- Se evalúa si el valor agregado (geometría real) justifica el esfuerzo de un conector geoespacial nuevo frente a lo que ya cubren `infraestructura-mtc`/`red-vial-subnacional` en forma tabular.

#### ADS-19 — Provías Nacional (carreteras nacionales, separado de Provías Descentralizado)

**Prioridad:** P2 · **Esfuerzo:** S (investigación) · **Dependencias:** ninguna

`proviasnacional.gob.pe` — inversión y mantenimiento de la red vial **nacional**, distinta de Provías Descentralizado (que ya cubre `red-vial-subnacional`, redes viales subnacionales). Sin verificar en vivo si expone datos estructurados descargables o solo información institucional.

**Criterios de aceptación**

- Verificación en vivo de si existe un dataset/API real (no solo el PDF de inversión referenciado en `mef.gob.pe/contenidos/inv_privada/app/IMIAPP_MTC_2025.pdf`, que es un documento puntual, no una fuente recurrente).
- Si no hay fuente estructurada real, se reclasifica a Épica C con la evidencia del intento, mismo criterio que el resto de tickets de triage de este PRD.

### Épica C — Descartado o bloqueado, registrado para no reinvestigar

#### ADS-12 — SBS: sin acción (0 datasets confirmados)

Grupo propio en `datosabiertos.gob.pe` **verificado en vivo con 0 resultados** ("No datasets were found"). Su portal de "Estadísticas" propio parece ser boletines PDF/Excel agregados, no una API. El "Reporte de Deudas" individual **requiere login con DNI — dato personal protegido, descartado por diseño**, no solo por fricción. No se reinvestiga sin una señal nueva concreta (ej. SBS anuncia un portal de datos abiertos nuevo).

#### ADS-14 — Palacio de Gobierno / "Casa Oficial del Gobierno": sin hallazgo

Investigado explícitamente a pedido del usuario — son oficinas de protocolo/prensa de la Presidencia, no entidades estadísticas. Ningún dataset ni API encontrado. No se reinvestiga sin una razón concreta nueva.

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora** | ADS-01, ADS-03, ADS-05 | Desbloquea SERFOR (mayor relevancia EUDR); SUNARP e INDECI tienen fuente ya confirmada, pero ADS-03/ADS-05 aún exigen su propia verificación en vivo del recurso, formato y granularidad antes de fijar el schema — "fuente confirmada" no significa "listo para ingestar sin más investigación". |
| **Siguiente** | ADS-02, ADS-04, ADS-15 | SERFOR construido (una vez ADS-01 lo desbloquee); SENACE construido (API ya confirmada); contrato real de la API del Congreso confirmado. |
| **Triage en paralelo, no bloqueante** | ADS-06 a ADS-11, ADS-16 a ADS-19 | Cada una resuelve su propia entidad/fuente a Épica A o C — no bloquean las fases anteriores. |
| **Sin acción** | ADS-12, ADS-14 | Documentadas, no se reinvestigan sin señal nueva. |

## 7. Requisitos no funcionales

- **Ninguna entidad de Épica B se ingiere sin pasar primero por su ticket de verificación en vivo propio** — la investigación de esta sesión fue por búsqueda, no reemplaza la verificación que el resto del catálogo exige.
- **PII se verifica explícitamente, columna por columna, antes de cualquier decisión de ingesta** — especialmente ADS-10 (MTPE puestos de trabajo) y cualquier hallazgo futuro de SUNARP (personas naturales trae poderes/sucesiones, con riesgo de nombres — ADS-03 se limita a personas jurídicas a propósito, no se expande a personas naturales sin una evaluación de PII separada).
- **Hallazgos negativos se documentan igual de rigurosamente que los positivos** (ADS-12, ADS-14) — evita reinvestigar lo mismo en una sesión futura. Igual de importante: **un hallazgo negativo se corrige en cuanto aparece evidencia nueva** (ver ADS-15) — no queda "descartado" por inercia documental una vez se demuestra falso.
- **Sin scheduler.**

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| ADS-01 no logra encontrar una URL de servicio real para GEOSERFOR | Se reclasifica SERFOR a Épica C con la evidencia del intento — no se fuerza scraping del visor web como alternativa sin evaluar el esfuerzo real que eso tomaría. |
| SUNARP personas jurídicas resulta tener cobertura parcial o desactualizada (dataset de descarga puntual, no un registro vivo) | ADS-03 declara la fecha de corte real y la cobertura real en el data contract — no se asume "registro completo y actualizado" sin verificarlo. |
| El triage de ADS-11 (9 entidades) subestima el esfuerzo y termina siendo superficial | Esfuerzo declarado como M explícitamente por ser 9 investigaciones, no una — si el triage real toma más de una sesión, se reporta parcial en vez de forzar una conclusión débil sobre las que falten. |
| El contrato real de `spley-portal-service` (ADS-15) resulta más complejo de inferir de lo esperado (más campos ocultos, autenticación por sesión no evidente en los errores 400/500 vistos) | Si tras un esfuerzo razonable no se logra un `200` real, se reclasifica a Épica C con la evidencia exacta de los intentos — no se fuerza scraping de HTML como alternativa sin evaluarlo aparte. |

## 9. Fuera de este PRD

- Cualquier cruce entre estas fuentes nuevas y las existentes — PRD de cruces posterior.
- SENAMHI, IIAP, Facilito (OSINERGMIN) — ya descartados en `docs/BACKLOG_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md`, no se repiten aquí.
- Cambios en `apps/rastro-web` o `rastro.fyi`.
- Scheduler/automatización.

## 10. Definition of Done

- ADS-01, ADS-03 y ADS-05 (los tres desbloqueantes/listos de Épica A) resueltos — ADS-01 con conclusión explícita, ADS-03 y ADS-05 mergeados con PR, revisión y pruebas.
- ADS-02 y ADS-04 mergeados si ADS-01 desbloquea SERFOR (ADS-02 queda condicional, no se fuerza si ADS-01 concluye que no hay servicio público).
- Cada conector de Épica A tiene su tool correspondiente registrada en `mcp-server/src/catalog.ts` y verificada con al menos una invocación funcional real — ningún ticket de ingesta de este PRD se declara "completo" sin su tool MCP funcionando, mismo estándar que el resto del catálogo. El mismo requisito aplica a cualquier ticket de ingesta real que surja de `docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`.
- Las 9 entidades de ADS-11 tienen conclusión explícita (Épica A o C), ninguna queda indefinida.
- `docs/BACKLOG_Deuda_Publica_MEF_v1.md` y `docs/BACKLOG_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md` actualizados con la nota de remisión a este documento.
- Ningún dataset con riesgo de PII no evaluado se ingiere — ADS-10 y cualquier expansión futura de SUNARP a personas naturales quedan bloqueados sin esa evaluación explícita.
