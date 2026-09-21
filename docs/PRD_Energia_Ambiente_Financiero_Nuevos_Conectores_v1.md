# PRD — Nuevos conectores: Energía/Minería, Ambiente y Sistema Financiero Público

**Estado:** Propuesto — investigación de fuentes completa (verificación en vivo parcial), ningún conector iniciado.
**Fecha:** 2026-09-21
**Ámbito:** apps nuevas por definir (ver §5), `mcp-server/src/catalog.ts`, `docs/conectores.md`, `docs/data-contracts/`
**Horizonte:** sin fecha comprometida — este PRD es un inventario priorizado, no un sprint.
**Origen:** investigación explícita de endpoints de MINEM, MINAM y sus organismos adscritos (2026-09-21), más una revisión de BCRP y Banco de la Nación pedida en la misma sesión.

## 1. Decisión de producto

Rastro no tiene hoy **ningún** dato de MINEM ni de sus adscritos (OSINERGMIN, INGEMMET). De MINAM solo tiene `residuos-solidos` (generación) e `infracciones-ambientales` (OEFA) — dos de 37+ datasets reales del ministerio y sus adscritos. De BCRP tiene comercio exterior y síntesis regional La Libertad, pero la API que ya usa (`estadisticas.bcrp.gob.pe/estadisticas/series/api`) cubre miles de series adicionales sin costo de integración nuevo. Banco de la Nación no tiene ningún dato en el catálogo pese a tener 10 datasets reales y descargables.

Este PRD no propone construir los ~100 datasets encontrados — propone los que tienen (a) fuente confirmada y accesible sin fricción, (b) valor real distinto a lo que ya existe, y (c) para las dos fuentes geoespaciales (INGEMMET, SERNANP), **verificación en vivo real** de que el endpoint responde sin autenticación, no solo una referencia de búsqueda.

## 2. Problema y oportunidad

1. **Cero visibilidad del sector energético/minero.** Ningún dato de precios de combustibles, catastro minero, accidentes mineros, ni infraestructura eléctrica existe en Rastro — un sector con peso económico real en varias regiones del país (incluida La Libertad, foco del proyecto) está completamente ausente.
2. **MINAM está sub-explotado.** Ya se probó que sus datasets son reales y descargables (2 de 37 ya ingeridos exitosamente) — quedan sin tocar exactamente los datasets más relevantes para deforestación (uso de suelo, pérdida de bosque amazónico), que es además un interés declarado de este mismo usuario (carpeta `eudrperu` de trabajo en curso).
3. **Banco de la Nación es la única presencia bancaria formal en gran parte del país rural** y no hay ninguna señal de inclusión financiera en el catálogo — ni agencias, ni cajeros, ni agentes.
4. **La API de BCRP ya integrada cubre mucho más de lo que se está usando** — expandir el conjunto de series no requiere resolver ningún problema técnico nuevo, solo decidir qué series importan.

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Priorizar y ejecutar, en el orden que fija §6, los conectores nuevos con mejor relación valor/fricción de las fuentes investigadas, empezando por las dos con hallazgo geoespacial ya verificado en vivo (INGEMMET, SERNANP) y el dataset de deforestación de MINAM que conecta directamente con el trabajo EUDR en curso del usuario.

### No objetivos

- No se construyen los ~100 datasets inventariados — este PRD prioriza un subconjunto, el resto queda registrado en el backlog de continuidad (§9 del backlog asociado) para revisitar más adelante.
- No se construye ningún conector para SENAMHI ni IIAP en esta primera pasada — SENAMHI tiene solo 1 dataset de descarga directa confirmado (el resto requiere solicitud formal); IIAP no tiene ningún dataset/API confirmado tras la investigación (ver `docs/BACKLOG_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md`, sección de fuentes descartadas).
- No se construye scraping del app "Facilito" de OSINERGMIN (stock de grifos en tiempo real) — el dataset diario ya público en `datosabiertos.gob.pe` cubre el caso de uso de precios; el stock en tiempo real es un caso de uso distinto (más frágil, no investigado en vivo) que queda fuera.
- No se construyen vistas nuevas en `rastro.fyi`/`rastro-web`.
- No se implementa scheduler — todos los conectores nuevos son manuales, igual que el resto del catálogo.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Catastro minero (INGEMMET) | Un endpoint consulta `SERV_CATASTRO_MINERO/MapServer` en vivo y devuelve concesiones mineras reales por departamento/coordenada, con `estado` (titulado/en trámite/extinguido) tal cual la fuente. |
| Deforestación (MINAM) | El dataset "Bosque/No Bosque - Pérdida de Bosque Húmedo Amazónico a nivel distrital" se ingiere y es consultable por UBIGEO, con serie temporal si la fuente la trae. |
| Precios de combustibles (OSINERGMIN) | El dataset diario de precios se ingiere y es consultable, con fecha de corte real declarada (no asumida "hoy"). |
| Banco de la Nación | Agencias/cajeros/agentes son consultables por ubigeo/departamento, con conteo verificado contra el CSV fuente. |
| Áreas naturales protegidas (SERNANP) | Un endpoint consulta el MapServer real en vivo y devuelve polígonos de ANP/Zona Reservada/Área de Conservación por overlay de coordenada o por nombre. |
| Documentación viva | Cada conector nuevo tiene ficha en `docs/conectores.md` y data contract en `docs/data-contracts/`, con la misma disciplina de "verificado en vivo" que el resto del monorepo — nada se documenta solo por snippet de búsqueda. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Analista de riesgo / due diligence ambiental (EUDR y similares) | "¿Hay concesiones mineras o pérdida de bosque cerca de esta cooperativa/zona?" | Cruce futuro (fuera de este PRD) entre catastro minero/deforestación y ubicación de proveedores — este PRD entrega los dos conectores base. |
| Ciudadano / periodista | "¿Cuánto cuesta el combustible en mi región hoy? ¿Dónde está la agencia del Banco de la Nación más cercana?" | Endpoints de consulta directa, sin necesidad de scraping propio. |
| Gestor público regional | "¿Qué tan expuesta está mi región a actividad minera formal/informal?" | Catastro minero consultable por departamento/distrito. |
| Agente de IA (MCP) | Responder preguntas de energía, minería, ambiente y presencia financiera formal sin salir del catálogo Rastro. | Tools MCP nuevas por cada conector, con cobertura y frecuencia declaradas honestamente. |

## 5. Alcance funcional

### Épica A — Geoespacial verificado en vivo (mayor confianza técnica)

#### GEO-01 — App/tabla nueva: catastro minero (INGEMMET)

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ninguna

**Fuente verificada en vivo 2026-09-21**: `https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CATASTRO_MINERO/MapServer` — ArcGIS REST MapServer real, responde JSON sin autenticación (confirmado con `curl` directo, sin headers especiales). Actualización diaria según la propia descripción del servicio. Capas: `Catastro Minero` (derechos mineros, polígonos, `estado`: Titulado/En trámite/Extinguido/Otros) y `Catastro Minero - DGM (MINEM)`.

Nueva app (`apps/catastro-minero/api` o el nombre que se decida, verificar que no colisiona con ninguna app existente antes de crear el directorio). Conector consulta el endpoint `/query` estándar de ArcGIS REST (`outFields=*&f=json`, paginado con `resultOffset`/`resultRecordCount` si el volumen lo exige) y hace upsert por el identificador único de concesión que traiga la fuente (verificar el nombre real del campo antes de fijar la clave — no asumir `codigo` o similar sin confirmarlo contra una respuesta real).

**Criterios de aceptación**

- El PR incluye la respuesta real de `?f=json` contra el `MapServer` (metadata de capas) y de una consulta `/query` de muestra (unas pocas filas reales), no solo la URL.
- La clave de upsert se confirma contra los campos reales de la fuente, documentada en el data contract.
- `estado` se guarda tal cual la fuente, sin normalizar a un enum binario sin haber visto todos los valores reales.
- Test: parseo de una respuesta de ejemplo real (fixture), manejo de features sin geometría o con geometría nula.
- `docs/data-contracts/ingemmet-catastro-minero.md` documenta el endpoint, el esquema real de campos, y la clave de upsert confirmada.

#### GEO-02 — App/tabla nueva: áreas naturales protegidas (SERNANP)

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** ninguna

**Fuente verificada en vivo 2026-09-21**: `https://geoservicios.sernanp.gob.pe/arcgis/rest/services/sernanp_visor/servicio_descarga/MapServer` — ArcGIS REST MapServer real, sin auth, confirmado con `curl` directo. Capas: `ANP Nacional Definitiva`, `Zona Reservada`, `Area Conservacion Regional`, `Area Conservacion Privada`, `Sitios Prioritarios Nivel Nacional` — todas polígonos.

Mismo patrón que GEO-01: conector vía `/query` de ArcGIS REST, upsert por el identificador real de cada ANP/zona (nombre oficial + categoría, a confirmar contra una respuesta real — SERNANP no necesariamente trae un código único estable como INGEMMET).

**Criterios de aceptación**

- Mismos criterios que GEO-01, adaptados: respuesta real de `?f=json` y de una consulta `/query` de muestra incluida en el PR.
- Si la fuente no trae un identificador único estable, el data contract documenta explícitamente esa limitación y la clave elegida (ej. nombre + categoría, con el riesgo de colisión que eso implica) en vez de inventar una clave sintética sin advertirlo.
- Test: parseo de una respuesta real de ejemplo por cada una de las 5 capas.
- `docs/data-contracts/sernanp-areas-protegidas.md` documenta las 5 capas, sus campos reales, y la decisión sobre clave de upsert.

### Épica B — MINEM y OSINERGMIN

#### ENE-01 — Precios de combustibles (OSINERGMIN)

**Prioridad:** P1 · **Esfuerzo:** S · **Dependencias:** ninguna

Dataset "Lista de Precios de Combustibles, diaria" en `datosabiertos.gob.pe` (grupo OSINERGMIN). Verificar en vivo el recurso real (formato, delimitador, encoding, patrón de nombre de archivo — el título indica "reconstruida a partir de los precios actualizados diariamente", verificar si el archivo se reemplaza o se versiona por fecha) antes de fijar el conector, mismo criterio del resto del catálogo (resolver el recurso más reciente vía `package_show`, no hardcodear una URL).

**Criterios de aceptación**

- El PR documenta la verificación en vivo del recurso real (formato, columnas, fecha de corte real del archivo descargado).
- El conector resuelve el recurso más reciente dinámicamente, no por URL fija.
- `docs/data-contracts/osinergmin-precios-combustibles.md` documenta columnas reales y frecuencia real observada.

#### ENE-02 — Registro de Hidrocarburos Líquidos: grifos y estaciones de servicio (OSINERGMIN)

**Prioridad:** P2 · **Esfuerzo:** M · **Dependencias:** ninguna

Dataset "Registro de Hidrocarburos Líquidos" (más reciente disponible, sin sufijo de mes — verificar en vivo si sigue publicándose sin fecha o si cambió a versión mensual). Trae el padrón nacional de grifos/estaciones habilitadas. Valor: cruce futuro contra ubicación de comercio/transporte, o simplemente cobertura de infraestructura de combustible por distrito.

**Criterios de aceptación**

- Verificación en vivo de si el dataset "sin fecha" sigue activo o si hay que resolver el mes más reciente entre los ~48 datasets de OSINERGMIN — documentar el hallazgo real en el PR, no asumir.
- `docs/data-contracts/osinergmin-hidrocarburos-liquidos.md` documenta la decisión sobre qué recurso exacto se ingiere y por qué.

#### ENE-03 — Accidentes Mortales en Mina (MINEM)

**Prioridad:** P2 · **Esfuerzo:** S · **Dependencias:** ninguna

Dataset de accidentes mortales mineros, formato Excel según la investigación inicial — verificar en vivo formato real, columnas, y si incluye RUC/nombre de la empresa operadora (relevante para cruzar contra `identidad-fiscal`/`proveedores-sancionados` más adelante, fuera de alcance de este ticket).

**Criterios de aceptación**

- Verificación en vivo del formato real (el hallazgo inicial de búsqueda decía Excel, confirmar antes de escribir el parser).
- `docs/data-contracts/minem-accidentes-mortales.md` documenta columnas reales, incluyendo si trae identidad de la empresa operadora.

### Épica C — MINAM (deforestación, prioridad para el trabajo EUDR en curso)

#### AMB-01 — Bosque/No Bosque y Pérdida de Bosque Húmedo Amazónico a nivel distrital (MINAM)

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ninguna

Dataset oficial de monitoreo de cobertura forestal amazónica por distrito. Verificar en vivo: formato real, si es serie temporal o corte único, si distingue pérdida natural de antropogénica (la descripción de búsqueda lo sugiere), y granularidad exacta (distrital vs. otra).

**Por qué P0 pese a ser nuevo**: conecta directamente con el trabajo EUDR en curso del usuario (carpeta `eudrperu`) — es el dato oficial peruano de deforestación que ese análisis necesita, y hoy no existe en Rastro ni en el script ad-hoc.

**Criterios de aceptación**

- Verificación en vivo completa antes de escribir el conector (formato, columnas, granularidad real, serie temporal o no).
- `docs/data-contracts/minam-bosque-no-bosque.md` documenta todo lo anterior con hallazgos reales, no supuestos de la búsqueda inicial.
- Se evalúa explícitamente (documentado, aunque sea para descartarlo) un cruce futuro con `identidad-fiscal`/`ruc_exportaciones_fob` por UBIGEO de la cooperativa — no se implementa el cruce en este ticket, pero se deja registrada la evaluación.

#### AMB-02 — Uso y cambio de uso de la tierra a nivel distrital (MINAM)

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** ninguna

Complementario a AMB-01. Verificar en vivo si se solapa significativamente con AMB-01 o si aporta señal distinta (cambio de uso de suelo no siempre implica pérdida de bosque, y viceversa) antes de decidir si se ingiere como conector separado o se evalúa fusionar con AMB-01.

**Criterios de aceptación**

- El PR documenta explícitamente la comparación campo por campo contra AMB-01 (mismo criterio que PS-02 del PRD de Servicios de Salud/Programas Sociales para JUNTOS vs. INFOMIDIS) antes de decidir si se ingiere por separado.

#### AMB-03 — Disposición final y Valorización de residuos sólidos (MINAM)

**Prioridad:** P2 · **Esfuerzo:** S · **Dependencias:** app `residuos-solidos` existente

Extiende el conector ya existente de `residuos-solidos` (que hoy solo cubre "generación") con los datasets de "disposición final adecuada" y "valorización" por distrito — mismo dominio, misma app, tablas nuevas.

**Criterios de aceptación**

- No se crea una app nueva — se agrega a `apps/residuos-solidos/api` siguiendo su estructura existente.
- `docs/conectores.md` actualiza la ficha existente de `residuos-connector.ts` o agrega una ficha hermana, sin duplicar la sección de la app.

### Épica D — Sistema financiero público

#### FIN-01 — Banco de la Nación: agencias, cajeros, agentes

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** ninguna

App nueva (`apps/banco-nacion/api` o nombre equivalente, verificar colisión de nombres). Tres tablas: agencias/oficinas especiales, cajeros automáticos, agentes BN — todas con ubigeo. Conectores independientes pero en la misma app (mismo dominio, misma fuente institucional), siguiendo el patrón de `mindef` (`offset-connector.ts`, `training-abroad-connector.ts`, `peace-missions-connector.ts` en una sola app).

**Criterios de aceptación**

- Verificación en vivo de los 3 datasets (formato, columnas, si "Banco de la Nación 2026" reemplaza o complementa el dataset sin año).
- `GET /api/presencia?ubigeo=` (o similar) permite consultar cobertura financiera formal por distrito — caso de uso de inclusión financiera.
- `docs/data-contracts/banco-nacion-presencia.md` documenta los 3 datasets y su relación entre sí.

#### FIN-02 — Expandir series BCRP ya integradas

**Prioridad:** P2 · **Esfuerzo:** S · **Dependencias:** conector `bcrp-comercio-exterior` existente

No es un conector nuevo — es agregar códigos de serie al `NATIONAL_TRADE_SERIES` (o la constante equivalente) de `bcrp-comercio-exterior`, o crear una segunda constante para series no relacionadas a comercio exterior (tipo de cambio, inflación, PBI, tasas de interés) reutilizando el mismo cliente de `estadisticas.bcrp.gob.pe/estadisticas/series/api`.

**Decisión a tomar, no asumir**: si las series macro (tipo de cambio, inflación, PBI) viven en `bcrp-comercio-exterior` (renombrando el alcance de la app si ya no es solo "comercio exterior") o en una app nueva `bcrp-macro`. Documentar la decisión con su razón.

**Criterios de aceptación**

- Los códigos de serie nuevos se confirman en vivo contra la API real (no se asumen del snippet de búsqueda) — mínimo tipo de cambio (`PN01246PM`), inflación, PBI.
- La decisión de dónde viven las series nuevas queda documentada con su razón (ver arriba).
- `docs/data-contracts/bcrp-comercio-exterior.md` (o uno nuevo) se actualiza con las series agregadas.

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora** | GEO-01, AMB-01 | Los dos hallazgos verificados en vivo con mayor valor — catastro minero y deforestación amazónica (este último, directamente útil para el trabajo EUDR en curso). |
| **Siguiente** | GEO-02, ENE-01, FIN-01 | Áreas protegidas, precios de combustibles, presencia del Banco de la Nación — tres fuentes de fricción baja y valor real. |
| **Después** | ENE-02, ENE-03, AMB-02, AMB-03, FIN-02 | Ampliación y complementos — ninguno bloquea capacidad nueva, todos suman cobertura a lo ya construido en fases anteriores. |

## 7. Requisitos no funcionales

- **Verificación en vivo antes de escribir el conector, siempre** — este PRD nace de una investigación de búsqueda (WebSearch/WebFetch), no de `curl` directo, salvo GEO-01 y GEO-02 (ya verificados). Todos los demás tickets exigen su propia verificación en vivo como parte del trabajo, no como paso previo ya hecho.
- **Resolución dinámica de recurso** para cualquier fuente en `datosabiertos.gob.pe` — mismo criterio que el resto del catálogo, nunca hardcodear el nombre de archivo del corte.
- **User-Agent de navegador** para cualquier request a `datosabiertos.gob.pe` (CloudWAF bloquea el user-agent por defecto, confirmado repetidamente en este monorepo).
- **Clave de upsert confirmada contra datos reales**, no inventada — especialmente crítico en GEO-01/GEO-02, donde el identificador único de la fuente geoespacial no se conoce hasta ver una respuesta real.
- **Sin scheduler.**

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Los endpoints ArcGIS REST de INGEMMET/SERNANP cambian de URL o empiezan a exigir auth sin aviso | Son servicios gubernamentales de infraestructura pública (GEOIDEP los referencia como estándar) — riesgo bajo pero real; si ocurre, se documenta como incidente de fuente, no se reintenta indefinidamente. |
| El volumen de features del catastro minero nacional es demasiado grande para una sola consulta `/query` | Usar paginación real de ArcGIS REST (`resultOffset`/`resultRecordCount`) desde el primer ticket, no asumir que cabe en una sola respuesta. |
| Los datasets "sin fecha" de OSINERGMIN (ej. "Registro de Gas Natural" sin sufijo de mes) dejan de actualizarse sin aviso, a diferencia de los versionados mensualmente | ENE-01/ENE-02 verifican en vivo la fecha de corte real del archivo descargado y la documentan — no se asume "más reciente" solo porque el nombre no tiene fecha. |
| AMB-01 y AMB-02 resultan ser el mismo dato con nombres distintos | AMB-02 exige la comparación campo por campo documentada antes de decidir si se ingiere por separado. |

## 9. Fuera de este PRD

- SENAMHI (fricción alta, mayoría de datos tras solicitud formal) — descartado en esta pasada, ver backlog de continuidad.
- IIAP (sin API/dataset confirmado) — descartado, ver backlog de continuidad.
- Scraping de "Facilito" (stock de grifos en tiempo real) — el dataset diario público cubre el caso de uso de precios.
- Cualquier cruce entre estas fuentes nuevas y las ya existentes (ej. catastro minero × cooperativas EUDR) — se evalúa como PRD de cruces separado, una vez los conectores base existan.
- Cambios en `apps/rastro-web` o `rastro.fyi`.
- Scheduler/automatización.

## 10. Definition of Done

- GEO-01 y AMB-01 (los dos P0) mergeados con PR, revisión, pruebas automatizadas, y verificación en vivo documentada en el PR.
- Cada conector nuevo tiene ficha en `docs/conectores.md` y data contract en `docs/data-contracts/`.
- Ningún conector se declara "completo" basado solo en la investigación de búsqueda de este PRD — cada ticket repite su propia verificación en vivo como parte del trabajo.
- `scripts/check-connectors-documented.sh` pasa sin cambios de script tras cada merge.
- No existe ningún conector nuevo con clave de upsert inventada sin confirmar contra una respuesta real de la fuente.
