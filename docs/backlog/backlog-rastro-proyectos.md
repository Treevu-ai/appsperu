# Backlog de Proyectos — RASTRO
**Fecha:** 2026-09-26 · **Autor:** Ricardo

---

## ÉPICA 1 · Radar de Captura Contractual
**Proyecto:** PRD-001 · **Prioridad:** 1/4 · **Esfuerzo estimado:** 3-4 semanas

---

### Historia 1.1 — Diagnóstico de fraîcheur
**Como** investigador de transparencia **quiero** saber cuándo fue la última ingesta de proveedores sancionados **para** evaluar si los datos están frescos antes de usar el dashboard.
**Criterios de aceptación:**
- `GET /api/meta/freshness` en `proveedores-sancionados` devuelve `{ultimaIngesta, diasSinActualizar, fuente}`
- La respuesta se genera en < 200ms
- Test: devuelve null cuando nunca se ha ingestado
**Tickets técnicos:**
- `[RCC-01]` Agregar tabla `ingestion_log` con timestamps por fuente en `proveedores-sancionados`
- `[RCC-02]` Crear endpoint `GET /api/meta/freshness` con lógica de última ingesta

---

### Historia 1.2 — Tool MCP para proveedores-sancionados
**Como** agente LLM **quiero** poder consultar proveedores sancionados desde el catálogo MCP **para** cruzar con otras fuentes sin conocer los detalles de la API.
**Criterios de aceptación:**
- Al menos 5 tools de `proveedores-sancionados` registradas en `mcp-server/src/catalog.ts`
- Cada tool tiene descripción, parámetros y返回值 documentados
- Tests del catálogo verifican que las tools responden sin error
**Tickets técnicos:**
- `[RCC-03]` Registrar tools en `catalog.ts`: `sanciones_por_ruc`, `proveedores_inhabilitados`, `crossref_nacional`, `sancionado_recurrente`, `velocidad_sancion`
- `[RCC-04]` Tests de smoke para cada tool en el catálogo

---

### Historia 1.3 — Endpoint consolidado `/api/radar`
**Como** periodista de investigación **quiero** una sola llamada que me devuelva el ranking de captura contractual **para** consultar en segundos sin entender la arquitectura subyacente.
**Criterios de aceptación:**
- `GET /api/radar` devuelve resumen + top5 proveedores + top5 entidades + alertas + signals
- Tiempo de respuesta < 3 segundos con datos fríos
- Test: devuelve schema válido con todos los campos documentados
**Tickets técnicos:**
- `[RCC-05]` Diseñar schema del endpoint `/api/radar` (ver PRD-001 sección 3)
- `[RCC-06]` Crear pool multi-BD (proveedores-sancionados + compras-publicas) en la nueva app
- `[RCC-07]` Implementar lógica de JOIN en SQL
- `[RCC-08]` Endpoint `/api/radar` con datos de prueba (fixtures)
- `[RCC-09]` Tests de integración del endpoint

---

### Historia 1.4 — Scheduler de ingesta diaria
**Como** operador del sistema **quiero** que los datos se actualicen solos **para** no depender de alguien que ejecute manualmente.
**Criterios de aceptación:**
- El connector de `proveedores-sancionados` corre diariamente via cron
- La frecuencia de ejecución queda registrada en `ingestion_log`
- Si la ingesta falla, se registra error y se reintenta al día siguiente
**Tickets técnicos:**
- `[RCC-10]` Configurar cron en `package.json` scripts o scheduler externo
- `[RCC-11]` Logging de ejecución y errores
- `[RCC-12]` Alerta si la ingesta no corre en 48h

---

### Historia 1.5 — Alertas de nuevos contratos de sancionadores
**Como** controlador **quiero** una alerta cuando un proveedor sancionado firma un contrato nuevo **para** actuar antes de que se ejecute el pago.
**Criterios de aceptación:**
- El flag `esNuevoDesdeUltimaCorrida` funciona sin race condition
- Se puede consultar la lista de nuevos contratos desde `/api/radar?alertas=true`
- Test: dos llamadas consecutivas no consumen el flag dos veces
**Tickets técnicos:**
- `[RCC-13]` Corregir race condition PV-05 (ver CX-01 en crossref.test.ts)
- `[RCC-14]` Endpoint `/api/radar/alertas` con lista de nuevos contratos
- `[RCC-15]` Test de race condition con dos llamadas consecutivas

---

### Historia 1.6 — Dashboard Streamlit sobre `/api/radar`
**Como** usuario no-técnico **quiero** ver el radar en una página web **para** explorar sin saber SQL.
**Criterios de aceptación:**
- Dashboard Streamlit en puerto 8501
- Tabla con ranking de proveedores sancionados × montos
- Filtros por departamento, rango de monto, estado de sanción
- Indicador de frescura de datos visible
**Tickets técnicos:**
- `[RCC-16]` Scaffold Streamlit app
- `[RCC-17]` Tabla interactiva con AG Grid o similar
- `[RCC-18]` Filtros de consulta
- `[RCC-19]` Indicador de frescura

---

## ÉPICA 2 · Termómetro SIDPOL
**Proyecto:** PRD-002 · **Prioridad:** 2/4 · **Esfuerzo estimado:** 3-4 semanas

---

### Historia 2.1 — Fuente de población INEI
**Como** data engineer **quiero** una tabla de población por ubigeo/año **para** calcular tasas por 100k habitantes.
**Criterios de aceptación:**
- Tabla `poblacion_inei` con覆盖率 ≥ 80% de ubigeos
- Datos de al menos el último censo disponible (INEI 2017)
- Test: la query `SELECT poblacion FROM poblacion_inei WHERE ubigeo=X AND anio=2023` devuelve valor > 0
**Tickets técnicos:**
- `[SID-01]` Investigar fuente de población INEI: `ceplan-geo` tool `ceplan_geo_denominadores_tasas` o descarga directa
- `[SID-02]` Crear tabla `poblacion_inei` con schema (ubigeo, anio, poblacion)
- `[SID-03]` Ingest de datos de población
- `[SID-04]` Test de cobertura (≥80% ubigeos con datos)

---

### Historia 2.2 — Endpoint `/api/denuncias/termometro`
**Como** analista de seguridad **quiero** saber si una región está en ALERTA **para** detectar violencia antes de que escale.
**Criterios de aceptación:**
- `GET /api/denuncias/termometro?departamento=LA LIBERTAD&modalidad=EXTORSION` devuelve z_score, nivel, percentil
- Corte: z > 2 → ALERTA, z > 3 → CRÍTICO
- Test: mes de spike real devuelve ALERTA o CRÍTICO
**Tickets técnicos:**
- `[SID-05]` Diseñar schema del endpoint (ver PRD-002 sección 3)
- `[SID-06]` Implementar SQL con window functions (AVG, STDDEV, z_score)
- `[SID-07]` JOIN con tabla de población para tasa por 100k
- `[SID-08]` Tests del endpoint con datos fixture
- `[SID-09]` Excluir meses de diciembre y julio (picos estacionales conocidos) — primera versión

---

### Historia 2.3 — Tests del endpoint `/api/denuncias`
**Como** developer **quiero** cobertura de tests del router de denuncias **para** refactorizar sin miedo a romper.
**Criterios de aceptación:**
- Tests para: consulta por departamento, por año, por modalidad, por ubigeo, respuesta vacía
- Tests para: filtro combinado (departamento + año + modalidad)
- Coverage ≥ 80% del archivo `routes/denuncias.ts`
**Tickets técnicos:**
- `[SID-10]` Crear `routes/denuncias.test.ts` con Vitest + Supertest
- `[SID-11]` Tests de casos: por departamento, año, modalidad, ubigeo
- `[SID-12]` Tests de casos límite: departamento inexistente, año fuera de rango
- `[SID-13]` Medir coverage y asegurar ≥ 80%

---

### Historia 2.4 — Scheduler de ingesta SIDPOL
**Como** operador **quiero** que SIDPOL se actualice automáticamente **para** tener datos siempre frescos.
**Criterios de aceptación:**
- La ingesta corre diariamente cuando el CSV se actualiza en datosabiertos.gob.pe
- Se detecta automáticamente el nuevo archivo (checksum)
**Tickets técnicos:**
- `[SID-14]` Investigar si el CSV de SIDPOL tiene versión/fecha en el nombre
- `[SID-15]` Implementar detección de nuevo archivo por checksum
- `[SID-16]` Scheduler diario

---

## ÉPICA 3 · Mapa de Gota a Gota
**Proyecto:** PRD-003 · **Prioridad:** 3/4 · **Esfuerzo estimado:** 4-6 semanas

---

### Historia 3.0 — Verificación SIDPOL (bloqueante)
**Criterios de aceptación:**
- Query `SELECT DISTINCT modalidad FROM police_reports WHERE lower(modalidad) LIKE '%gota%'` devuelve filas
- Si no devuelve: documentar decisión de replantear estrategia y pausar épica
**Ticket:** `[GOT-00]` Ejecutar y documentar resultado — ✅ ejecutado 2026-09-26, no devuelve filas (confirmado
de nuevo en vivo 2026-10-02). **Reinterpretado 2026-10-02**, no pausado: "Extorsión" (19,527 casos reales,
confirmado en vivo) es la modalidad SIDPOL más cercana al mecanismo de cobro gota a gota — se usa como proxy
geográfico en vez de pausar la épica. Decisión del usuario, ver PRD-003 sección 2.1.

---

### Historia 3.1 — Conector SBS (Playwright) — ❌ DESCARTADO 2026-10-02
**Como** data engineer **quiero** extraer el registro de casas de préstamo de la SBS **para** tener una base de comparación con las fachadas.
**Criterios de aceptación:**
- El conector extrae RUC, razón social, dirección, departamento de todas las casas registradas
- Se ejecuta en < 30 minutos para el universo completo
- Test: el conector devuelve filas consistentes en dos ejecuciones
**Tickets técnicos:**
- `[GOT-01]` ❌ Investigar estructura del HTML del portal SBS con Playwright — todo `sbs.gob.pe` está detrás de
  Incapsula (WAF anti-bot), confirmado en vivo con curl y navegador automatizado. Sin API/dataset abierto
  alternativo (verificado contra datosabiertos.gob.pe). Ver PRD-003 sección 2.1.
- `[GOT-02]` a `[GOT-05]` ❌ No ejecutados — construir un scraper para evadir el WAF queda fuera de lo que este
  proyecto puede hacer.

---

### Historia 3.2 — Modelo de datos integrado — ✅ adaptado sin SBS, 2026-10-02
**Como** arquitecto de datos **quiero** un modelo que cruce SIDPOL × SBS × Padrón RUC **para** generar un mapa completo.
**Criterios de aceptación (adaptados, sin SBS):**
- Tabla `financieras_informales_candidatas` en `identidad-fiscal` (no `casas_gota_gota`/`seguridad-ciudadana`
  del diseño original — el RUC es el ancla, no hay lado SBS que anclar en seguridad-ciudadana)
- Candidatas por coincidencia de nombre en `contribuyentes` (no CIIU — el padrón reducido nacional no lo trae)
- Cruce geográfico con extorsión SIDPOL por departamento (no por distrito/ubigeo exacto — la fuente de
  población/extorsión del Termómetro SIDPOL está a nivel departamental)
**Tickets técnicos:**
- `[GOT-06]` ✅ Schema de `financieras_informales_candidatas` (migración 011, `identidad-fiscal`)
- `[GOT-07]` ✅ Tabla creada en BD `identidad-fiscal` (no `seguridad-ciudadana`, ver arriba)
- `[GOT-08]` ❌ Cruce SBS × Padrón RUC — no aplica, SBS descartado
- `[GOT-09]` ✅ Cruce extorsión SIDPOL × candidatas por departamento (`materialize-financieras-informales.ts`
  + `GET /api/financieras-informales/resumen-geo`)
- `[GOT-10]` ❌ Score de riesgo combinado — deliberadamente NO implementado: sin el numerador de SBS
  (`casas_registradas`), un ratio inventado implicaría una relación causal no verificada entre candidatas y
  extorsión. Se exponen como dos señales independientes (`candidatas`/`candidatasActivas` y
  `tasaExtorsion100k`).

---

### Historia 3.3 — API de consulta — ✅ adaptada, 2026-10-02
**Como** periodista **quiero** consultar casas por distrito y ver su score de riesgo **para** identificar zonas críticas.
**Criterios de aceptación (adaptados):**
- `GET /api/financieras-informales?departamento=LIMA` devuelve lista paginada (no `minScore`, no hay score)
- `GET /api/financieras-informales/resumen-geo` devuelve agregados por departamento (no por distrito)
**Tickets técnicos:**
- `[GOT-11]` ✅ Endpoints implementados (`apps/identidad-fiscal/api/src/routes/financieras-informales.ts`)
- `[GOT-12]` ✅ Tests de la API (`financieras-informales-route.test.ts`, incluye el caso de normalización
  LIMA METROPOLITANA + REGION LIMA → LIMA, hallazgo real encontrado al verificar en vivo)
- `[GOT-13]` ✅ Tools en `catalog.ts` (`identidad_fiscal_financieras_informales`/`_resumen_geo`)

---

## ÉPICA 4 · Índice de Vulnerabilidad Portuaria
**Proyecto:** PRD-004 · **Prioridad:** 4/4 · **Esfuerzo estimado:** 2-3 semanas (v1)

---

### Historia 4.1 — Ingest del XLSX histórico de cargas
**Como** data engineer **quiero** cargar los datos deCARGA 2010-2017 en la BD **para** tener el primer dataset de volúmenes portuarios.
**Criterios de aceptación:**
- Tabla `cargas_portuarias_historico` creada con los datos del XLSX
- Documentación de columnas y estructura del XLSX disponible
**Tickets técnicos:**
- `[VUL-01]` Descargar XLSX de `datosabiertos.gob.pe`
- `[VUL-02]` Inspeccionar columnas y sheet del XLSX
- `[VUL-03]` Crear tabla `cargas_portuarias_historico`
- `[VUL-04]` Script de carga del XLSX
- `[VUL-05]` Documentar estructura y limitaciones del dataset

---

### Historia 4.2 — Índice v1 (inventario MTC)
**Como** analista de seguridad **quiero** rankear terminales por vulnerabilidad **para** priorizar supervisón.
**Criterios de aceptación:**
- `GET /api/terminales/vulnerabilidad` devuelve ranking con score 0-100
- Score compuesto: estado_conservacion (25%) + es_concesionado (20%) + tipo_alcance (15%) + ambito (10%) + geolocalizacion (10%)
**Tickets técnicos:**
- `[VUL-06]` Diseñar fórmula del índice (ver PRD-004 sección 3)
- `[VUL-07]` Crear tabla `indice_vulnerabilidad_portuaria`
- `[VUL-08]` Calcular scores sobre los 507 terminales
- `[VUL-09]` Endpoint `/api/terminales/vulnerabilidad`
- `[VUL-10]` Tests del endpoint

---

### Historia 4.3 — Índice v2 (con XLSX histórico)
**Como** analista **quiero** incluir el volumen histórico de carga en el índice **para** reflejar exposición real.
**Criterios de aceptación:**
- El score se actualiza incluyendo `volumen_historico_TM` con peso 20%
- La variación de volumen 3 años se incluye con peso 10%
**Tickets técnicos:**
- `[VUL-11]` JOIN del XLSX de cargas con el inventario MTC por nombre de terminal
- `[VUL-12]` Actualizar fórmula del índice
- `[VUL-13]` Tests de la nueva fórmula

---

### Historia 4.4 — Solicitud Ley 27806 a la APN
**Como** operador **quiero** los datos de volúmenes 2018-2025 de la APN **para** tener datos frescos.
**Criterios de aceptación:**
- Solicitud enviada formalmente
- Respuesta recibida y evaluada
- Si se reciben datos: ingest del nuevo dataset
**Tickets técnicos:**
- `[VUL-14]` Redactar solicitud formal a la APN pidiendo anuarios portuarios 2018-2025
- `[VUL-15]` Enviar por la Plataforma de Transparencia
- `[VUL-16]` Hacer seguimiento a los 10 días hábiles
- `[VUL-17]` Si se reciben: ingest y actualización del índice a v3

---

## Resumen de Tickets

| Ticket | Épica | Prioridad | Esfuerzo |
|---|---|---|---|
| RCC-01 a RCC-19 | Épica 1 | Alta | ~4 sem |
| SID-01 a SID-16 | Épica 2 | Alta | ~3-4 sem |
| GOT-00 a GOT-13 | Épica 3 | Media | ~4-6 sem |
| VUL-01 a VUL-17 | Épica 4 | Baja | ~2-3 sem (v1) |
