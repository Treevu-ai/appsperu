# Fichas técnicas — Conectores de ingesta

Una ficha por conector (el módulo `src/ingest/*-connector.ts` que trae datos de una fuente
externa hacia la base de esa app). Vista ejecutiva y estandarizada: qué hace, cómo lo hace,
con qué frecuencia y de dónde saca los datos. El detalle técnico profundo (columnas exactas,
anomalías confirmadas en vivo, formatos de archivo) vive en
[`docs/data-contracts/`](data-contracts/) — cada ficha enlaza al data contract correspondiente
en vez de duplicarlo.

**Frecuencia, en todas las apps**: no existe scheduler ni cron en ningún conector — se
confirmó buscando `cron`/`schedule`/`setInterval` en todo el repo, sin resultados. Cada
conector es un script CLI (`npm run ingest:<nombre>`) que se ejecuta manualmente, bajo
demanda. La columna "Frecuencia" de cada ficha distingue esto de la frecuencia con la que
la *fuente* publica datos nuevos (que sí puede ser diaria/mensual), que es lo que determinaría
qué tan seguido *convendría* correr el conector si se automatizara.

> **Este catálogo se verifica automáticamente**: `scripts/check-connectors-documented.sh`
> (CX-06) falla si aparece un `src/ingest/*-connector.ts` nuevo sin una mención de su nombre
> de archivo en este documento. Si agregas un conector, actualiza este archivo en el mismo PR
> — el chequeo no exige un formato de ficha específico, solo que el archivo esté nombrado acá.

---

<a id="radar-ejecucion"></a>
## radar-ejecucion — Presupuesto y ejecución de gasto (MEF)

| | |
|---|---|
| **Descripción** | Trae la ejecución presupuestal (PIA/PIM/Devengado) de gobiernos nacional, regionales y locales, agregada por entidad + función + año fiscal. |
| **Qué hace** | Descarga el CSV nacional del año/granularidad pedida, filtra opcionalmente por departamento (de destino del gasto o de sede de la entidad ejecutora), agrega `SUM(PIA/PIM/DEVENGADO)` por `(SEC_EJEC, FUNCION, ANO_EJE)` y hace upsert en `budget_execution`. También deriva un catálogo territorial (`territories`) a partir de las columnas de ubigeo del propio CSV. |
| **Cómo lo hace** | Descarga HTTP directa (no hay API CKAN real, esa URL sirve el shell Angular de la SPA). Los archivos pesan 4.5–10+ GB, así que se usa **HTTP Range** para traer un prefijo acotado (`DEFAULT_MAX_BYTES` = 25 MB) en vez de cargar el archivo completo en memoria. Hay un segundo modo, `ingestMefFullYearForDepartamento`, que descarga 16 secciones fijas (2 niveles de gobierno × 8 meses) usando offsets de byte observados manualmente para LA LIBERTAD — necesario porque PIA/PIM y DEVENGADO viven en filas separadas del CSV y una sola ventana parcial nunca trae ambos. Cada lote crudo se guarda en `raw_mef_batches` antes de normalizar (lake de evidencia, nunca se sobrescribe). |
| **Decisión de riesgo (CX-02, 2026-09-02)** | Los offsets manuales no están garantizados por el MEF. En vez de completar un streaming real (esfuerzo mayor, ver [ADR-0015](adr/0015-mef-connector-offsets-manuales-decision.md)) se agregó monitoreo activo: `assertMefFileSizeWithinTolerance()` compara el tamaño real del archivo (`Range: bytes=0-0` + `Content-Range`) contra el tamaño confirmado cuando se calibraron los offsets (6,240,885,549 bytes) y **falla fuerte** si la deriva excede 2% — antes de que `ingestMefFullYearForDepartamento`/`ingestMefFullYearForMetaDepartamento` toquen una sola sección. `MEF_ALLOW_SIZE_DRIFT=true` degrada a advertencia para corridas donde el archivo cambió a propósito. |
| **Frecuencia** | Manual (`npm run ingest:mef` en `apps/radar-ejecucion/api`). La fuente (Consulta Amigable / MEF) publica datos de 2025–2026 con corte mensual/diario; años anteriores son snapshots cerrados. Cada corrida trae un snapshot completo del archivo pedido, no un delta. |
| **Fuente de datos** | Portal de Datos Abiertos del MEF — `datosabiertos.mef.gob.pe` (dataset "Presupuesto y ejecución de gasto"). Cobertura 2009–2026. |
| **Cobertura real ingerida** | Ejecución de GR/GL: parcial por diseño y acotada a La Libertad vía offsets fijos. Gobierno Nacional por `DEPARTAMENTO_META` puede consultarse por región, pero todavía se corre de forma controlada por cada departamento; no equivale a cobertura integral de los cinco territorios. |
| **Cruces (quién lo consume)** | `budget_execution` es la tabla más cruzada del monorepo. La consultan en vivo: [`actividad-agraria`](#actividad-agraria) (`GET /api/crossref`, FUNCION=AGROPECUARIA, exacto por departamento+año), [`seguridad-ciudadana`](#seguridad-ciudadana) (`GET /api/crossref`, FUNCION=ORDEN PUBLICO Y SEGURIDAD, mismo patrón), esta misma app vía `GET /api/tourism/crossref` (FUNCION=TURISMO, cruzando con `mincetur-hospedaje-connector.ts` de abajo), [`compras-publicas`](#compras-publicas) y [`radar-inversiones`](#radar-inversiones) (`SEC_EJEC` exacto), [`identidad-fiscal`](#identidad-fiscal) (`GET /api/crossref/entidades`, fuzzy por nombre) y [`ceplan-geo`](#ceplan-geo)/[`ceplan-estrategico`](#ceplan-estrategico) (vía HTTP entre microservicios). |
| **Detalle completo** | [`docs/data-contracts/mef-presupuesto-ejecucion.md`](data-contracts/mef-presupuesto-ejecucion.md) |

También en esta app: `territory-catalog.ts`, un loader genérico (no conector HTTP propio) que
hace upsert de ubigeo/departamento/provincia/distrito en `territories` a partir de registros ya
parseados — usado para poblar el catálogo maestro cuando no viene derivado del CSV del MEF.

<a id="radar-ejecucion-mincetur"></a>
### `mincetur-hospedaje-connector.ts` — Ocupabilidad hotelera (MINCETUR)

| | |
|---|---|
| **Descripción** | Trae indicadores mensuales de ocupabilidad hotelera por departamento (arribos, pernoctaciones, número de establecimientos, tasa neta de ocupación de habitaciones). |
| **Qué hace** | Descarga el CSV anual, se queda solo con la fila consolidada por departamento (`ID_CATEGORIA = "TT"` / "TODAS CONSOLIDADAS", descartando el desagregado por categoría de establecimiento) y hace upsert en `tourism_hospitality_monthly`. |
| **Cómo lo hace** | Descarga HTTP directa de un CSV por año (`Indicadores_ocupabilidad_{año}.csv`), delimitador `;`, encoding Latin-1 explícito. Lote crudo en `raw_mincetur_batches` con checksum, `ON CONFLICT` por `(resource_id, checksum)` para no duplicar la misma corrida. |
| **Frecuencia** | Manual (`npm run ingest:mincetur-hospedaje -- <año>`, por defecto el año anterior al actual). Snapshot completo del año pedido en cada corrida. |
| **Fuente de datos** | `datosabiertos.mincetur.gob.pe/DGIETA/Indicadores_ocupabilidad_{año}.csv` (MINCETUR — Dirección General de Investigación y Estudios sobre Turismo y Artesanía). |
| **Cruces** | `GET /api/tourism/crossref` (misma app) junta arribos/pernoctaciones con `budget_execution` en FUNCION=TURISMO, exacto por departamento y año fiscal, con un desglose específico para la Municipalidad Provincial de Trujillo — mismo patrón de bucket exacto que usan `actividad-agraria` y `seguridad-ciudadana` contra `mef-connector.ts`. |

---

<a id="radar-ejecucion-airhsp"></a>
### `airhsp-connector.ts` — Personal y planilla del sector público (AIRHSP/MEF)

| | |
|---|---|
| **Descripción** | Trae el personal activo y pensionista del sector público, agregado por Unidad Ejecutora / régimen laboral / cargo (columna `CANTIDAD`) — **no es un registro de personas identificables**, no hay nombres en la fuente. Cierra el hueco de "personal/planilla municipal" identificado en `docs/COBERTURA_Y_CUMPLIMIENTO.md`. |
| **Qué hace** | Descarga el CSV completo del año pedido, hace upsert en `airhsp_personal` con `ON CONFLICT` sobre la combinación (periodo, pliego, unidad ejecutora, tipo/subtipo de registro, régimen laboral, grupo ocupacional, cargo, condición laboral, régimen pensionario) — evita duplicar la misma fila agregada entre corridas. |
| **Cómo lo hace** | Descarga en **streaming genuino** (`fetch` → `Readable.fromWeb` → `csv-parse` en modo stream, lotes de 1000 filas) — el archivo real pesa **~357 MB por año** (confirmado vía `curl -I`, no los ~13.5 MB que se asumió inicialmente); un primer intento con descarga+parseo síncrono (`res.text()` + `csv-parse/sync`) se quedó en 0 filas insertadas tras >7 min. Fingerprint del batch vía ETag del header HTTP (no checksum de contenido — streaming no permite hashear sin bufferizar de nuevo). El CSV trae la misma clave natural duplicada dentro de un mismo lote de 1000 en algunos casos — se deduplica por lote antes de insertar, si no Postgres rechaza el `ON CONFLICT DO UPDATE` por afectar la misma fila dos veces en una sentencia. |
| **Frecuencia** | Manual (`npx tsx src/ingest/airhsp-connector.ts <año>`). Verificado en vivo 2026-09-04 contra el año 2026: **652,392 filas reales** tras dedup (streaming completo en ~8 min). |
| **Fuente de datos** | `fs.datosabiertos.mef.gob.pe/datastorefiles/PERSONALSP_{año}.csv` — Plataforma Nacional de Datos Abiertos, dataset gestionado por MEF, un archivo por año (2017–2026), sin autenticación. |
| **Alcance territorial** | Sin columna de ubigeo/departamento en la fuente — se ingiere a nivel nacional y el filtro a La Libertad se hace por texto sobre `pliego`/`unidad_ejecutora` (`GET /api/personal?entidad=LA LIBERTAD`). No es un filtro exacto: entidades cuyo nombre no menciona el departamento no aparecerían con ese filtro. |
| **Cruces** | Ninguno implementado aún — candidato natural: cruzar `pliego`/`unidad_ejecutora` contra el `entity_crosswalk` que ya usan `compras-publicas`/`infobras` para vincular gasto en personal con ejecución presupuestal por entidad. |

---

### `bienes-muebles-baja-connector.ts` — Bienes muebles patrimoniales dados de baja (MEF)

| | |
|---|---|
| **Descripción** | Activos muebles (equipos, mobiliario, vehículos, etc.) dados de baja/desincorporados por entidades del sector público, con la resolución administrativa que lo respalda. **No es el inventario completo de bienes muebles del Estado** — ese no tiene fuente pública estructurada conocida (verificado 2026-09-04: sin PDF/CSV/XLSX descargable para el inventario vivo, solo el aplicativo interno SINABIP). Cierra parcialmente el hueco de "patrimonio y bienes muebles" identificado en `docs/COBERTURA_Y_CUMPLIMIENTO.md`. |
| **Qué hace** | Descarga el CSV del año pedido en streaming, hace upsert en `bienes_muebles_baja` con `ON CONFLICT` sobre `codigo_patrimonial` (código patrimonial único por activo). |
| **Cómo lo hace** | Descarga en **streaming genuino** (`fetch` → `Readable.fromWeb` → `csv-parse` en modo stream, lotes de 1000 filas) — el archivo pesa 47–96 MB por año (confirmado vía `curl -I`, no ~13 MB), y una descarga+parseo síncrono (`res.text()` + `csv-parse/sync`) no completa en tiempo razonable para un archivo de este tamaño (lección de un conector hermano, `airhsp-connector.ts`, que se quedó en 0 filas insertadas tras >7 min intentando cargar 357 MB de una vez). Sin checksum de contenido (streaming no permite hashear sin bufferizar de nuevo) — usa ETag/Last-Modified del servidor como identidad del batch. El CSV trae `codigo_patrimonial` duplicado dentro del mismo archivo en algunos casos — se deduplica por lote antes de insertar (última ocurrencia gana), si no Postgres rechaza el `ON CONFLICT DO UPDATE` por afectar la misma fila dos veces en una sentencia. |
| **Frecuencia** | Manual (`npx tsx src/ingest/run-bienes-muebles-baja.ts [años...]`, default 2020–2024). Verificado en vivo 2026-09-04 contra 2024: 274,841 filas procesadas, 169,674 filas reales tras deduplicación (1,652 filtrables a La Libertad/Trujillo por texto). |
| **Fuente de datos** | `fs.datosabiertos.mef.gob.pe/datastorefiles/BAJA_BM_PAT_{año}_INV.csv` — Plataforma Nacional de Datos Abiertos, dataset gestionado por MEF, un archivo por año (2020–2024), sin autenticación. El archivo de diccionario de columnas referenciado en la página del dataset devuelve 404 en vivo — columnas confirmadas leyendo el encabezado real del CSV, no el diccionario. |
| **Alcance territorial** | Sin columna de ubigeo/departamento en la fuente — se ingiere a nivel nacional y el filtro a La Libertad se hace por texto sobre `nom_entidad` (`GET /api/patrimonio/bienes-muebles-baja?entidad=LA LIBERTAD`), mismo patrón y misma limitación que `airhsp-connector.ts`. |
| **Cruces** | Ninguno implementado — candidato: cruzar `ruc_entidad` contra `entity_crosswalk` para vincular bajas patrimoniales con la entidad en `budget_execution`/`awards`. |

---

<a id="compras-publicas"></a>
## compras-publicas — Contrataciones abiertas (OECE/OCDS)

Esta app tiene **dos conectores** contra la misma API, cada uno contra un endpoint distinto del
estándar OCDS (Open Contracting Data Standard).

**Cruces de la app (`awards` es la tabla más leída desde afuera después de `budget_execution`)**:
`GET /api/crossref` (propio) junta `entity_crosswalk` (`mef_entity_code` ↔ `oece_buyer_id`, fuzzy,
recalculable con `npm run crossref:build`) con el devengado de [`radar-ejecucion`](#radar-ejecucion)
y el total de procesos/valor de esta misma app. Desde afuera: [`identidad-fiscal`](#identidad-fiscal)
lee `awards.supplier_id` (`GET /api/crossref`, RUC exacto extraído del prefijo `PE-RUC-`) y
[`proveedores-sancionados`](#proveedores-sancionados) hace lo mismo para cruzar cada adjudicación
contra inhabilitaciones vigentes — ambos reutilizan el mismo `extractRuc()` sobre `supplier_id`.

<a id="compras-publicas-releases"></a>
### `oece-connector.ts` (releases)

| | |
|---|---|
| **Descripción** | Trae procesos de contratación pública (releases OCDS) — el evento base de cada proceso. |
| **Qué hace** | Pagina `/releases`, guarda cada lote crudo en `raw_ocds_batches`, normaliza y escribe en el modelo canónico de contrataciones. |
| **Cómo lo hace** | API REST real en JSON (a diferencia del MEF, sin Range requests ni parseo CSV). Filtros soportados: `startDate`, `endDate`, `mainProcurementCategory`. Paginación por `page`, 20 releases por página, orden desc por fecha de publicación. |
| **Frecuencia** | Manual (`npm run ingest:oece`). La API expone datos en vivo del portal; cada corrida trae hasta `DEFAULT_MAX_PAGES` = 10 páginas más recientes, no todo el histórico. |
| **Fuente de datos** | `contratacionesabiertas.oece.gob.pe/api/v1` (OECE — Organismo Especializado de las Contrataciones del Estado). |
| **Alcance territorial CLI** | `OECE_DEPARTAMENTOS` acepta La Libertad, Lambayeque, Piura, Cajamarca y Cusco en una misma corrida. Es filtro posterior sobre las páginas OCDS descargadas; la cobertura sigue limitada por la ventana y paginación solicitadas. |
| **Detalle completo** | [`docs/data-contracts/oece-contrataciones-abiertas.md`](data-contracts/oece-contrataciones-abiertas.md) |

<a id="compras-publicas-records"></a>
### `oece-records-connector.ts` (records/awards)

| | |
|---|---|
| **Descripción** | Trae los mismos procesos pero vía `/records`, que sí incluye `compiledRelease.awards` (adjudicaciones) — dato que `/releases` no trae. |
| **Qué hace** | Pagina `/records`, guarda el lote crudo, normaliza awards y los persiste — usado luego para el análisis de proveedores/concentración de mercado. |
| **Cómo lo hace** | Mismo patrón que `oece-connector.ts` (JSON, paginación por `page`, orden desc). Densidad baja: solo procesos que ya llegaron a adjudicación traen `awards` no vacío. |
| **Frecuencia** | Manual (`npm run ingest:awards`). |
| **Fuente de datos** | `contratacionesabiertas.oece.gob.pe/api/v1` (mismo host que arriba, endpoint distinto). |
| **Alcance territorial CLI** | Usa el mismo `OECE_DEPARTAMENTOS`; postores y adjudicaciones se restringen al mismo conjunto territorial. |
| **Detalle completo** | [`docs/data-contracts/oece-contrataciones-abiertas.md`](data-contracts/oece-contrataciones-abiertas.md) |
| **Ítems sin adjudicar (2026-09-06)** | `normalize-unsuccessful-tenders.ts` reutiliza los mismos records ya traídos por este conector (sin llamadas extra) y captura ítems `tender.items[].statusDetails IN ('DESIERTO','NULO')` — dinero público convocado que terminó sin adjudicar a nadie, invisible hasta ahora porque `normalizeAwards` descarta en silencio todo record sin `awards`. ~29% de una muestra real (19/66 ítems, 4 meses de 2026). Tabla `unsuccessful_tenders`, expuesta en `GET /api/procurement-sin-adjudicar`. Detalle en el mismo data contract de arriba. |

<a id="compras-publicas-legacy"></a>
### `legacy-seace-orders-connector.ts` — Órdenes históricas SEACE (legado)

| | |
|---|---|
| **Descripción** | Trae órdenes de compra (O/C) y de servicio (O/S) históricas, por entidad, del buscador **legado** de SEACE — universo anterior al estándar OCDS que expone OECE, útil para completar histórico que la API OCDS no cubre. |
| **Qué hace** | Para un catálogo de entidades pre-verificadas de LA LIBERTAD (RUC + nombre oficial, cargado desde un XLSX local) y un año + lista de meses, descarga el XLS de órdenes de cada combinación entidad×mes, filtra las que tienen proveedor y monto válidos dentro del límite vigente, y hace upsert en el modelo canónico de contratos menores (`minor_contracts`, `municipalities`, `supplier_profiles`, `contract_evidence`, `contract_events`). |
| **Cómo lo hace** | **Scraping de una interfaz JSF (JavaServer Faces) legacy**: GET a la página del buscador por RUC/año/mes, extrae el `javax.faces.ViewState` y la cookie de sesión del HTML, y replica el POST exacto que dispara el botón de exportación (`formBuscador:btnExportar`) para descargar el XLS. Es, junto con `sanciones-connector.ts` (proveedores-sancionados), el conector técnicamente más frágil del catálogo — depende de la estructura interna de un formulario JSF no documentado. |
| **Frecuencia** | Manual (`npm run ingest:legacy-orders`). Snapshot por entidad×mes en cada corrida, no incremental. |
| **Fuente de datos** | `prod2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/ongei/buscadorPublicoOCOS.xhtml` (SEACE — buscador histórico público, interfaz observada, no documentada oficialmente). |
| **Alcance territorial** | Requiere un catálogo de entidades pre-verificadas (`SEACE_LEGACY_ENTITY_CATALOG_PATH`), acotado a LA LIBERTAD por validación explícita del loader del catálogo. |

<a id="compras-publicas-minor-contracts"></a>
### `seace-public-minor-contracts-connector.ts` — Contratos menores (SEACE)

| | |
|---|---|
| **Descripción** | Trae adjudicaciones de contratos menores (por debajo del umbral de 8 UIT) del buscador público **moderno** de SEACE. Se llamó `oece-minor-contracts-connector.ts` hasta 2026-09-02 — el nombre sugería una relación con `oece-connector.ts`/`oece-records-connector.ts` (API OCDS de OECE) que no existe; se renombró para reflejar que la fuente real es SEACE (ver [CX-03](TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md)). |
| **Qué hace** | Pagina el buscador por año y departamento (25 departamentos con código SEACE mapeado en el propio archivo), hasta 5000 registros por página; para cada contrato descubierto pide el detalle completo con concurrencia limitada (5 en paralelo); filtra ítems con estado `ADJUDICADO`, proveedor y monto válidos dentro del límite vigente; hace upsert en el mismo modelo canónico que `legacy-seace-orders-connector.ts`, y registra en `territorial_coverage` si la corrida fue completa, parcial o sin datos por departamento — declaración honesta de cobertura, no solo un conteo. |
| **Cómo lo hace** | **API JSON interna no documentada** de SEACE (no requiere sesión ni cookies, a diferencia del conector legacy) — más estable que scraping HTML pero sigue sin ser un contrato público oficial. |
| **Frecuencia** | Manual (`npm run ingest:minor-contracts`, o `:full` para recorrer todo sin límite por contrato). Por defecto limita a 100 contratos por departamento (parcial); con `maxContracts=0` recorre el universo completo visible. |
| **Fuente de datos** | `prod6.seace.gob.pe/v1/s8uit-services/buscadorpublico` (SEACE — buscador público de contrataciones, interfaz observada). |
| **Alcance territorial** | Configurable por departamento (`departamentos` en las opciones); cobertura real declarada por corrida en `territorial_coverage`. |
| **Cruces** | Escribe en el mismo modelo canónico (`minor_contracts`, `municipalities`, `supplier_profiles`) que `legacy-seace-orders-connector.ts` — ambos alimentan `winning_supplier_id` en formato `seace:ruc:<11 dígitos>`. [`identidad-fiscal`](#identidad-fiscal) y [`proveedores-sancionados`](#proveedores-sancionados) cruzan contra `minor_contracts` desde 2026-09-02 (CX-01), con el mismo patrón que ya usaban contra `awards`. |

<a id="compras-publicas-conformacion"></a>
### `perfilprov-conformacion-connector.ts` — Conformación societaria (OSCE)

| | |
|---|---|
| **Descripción** | Trae, por RUC, los accionistas/socios reales, representantes legales y órganos de administración de un proveedor del Estado — nombre y documento de identidad. Es la primera fuente del catálogo que da identidad de dueños reales, no solo razón social. **Compliance (2026-09-04)**: el % de participación accionaria se retiró de la API pública (no aportaba al caso de uso y era el dato de mayor riesgo) y el número de documento se sirve enmascarado (solo últimos 3 dígitos) — ver `docs/COBERTURA_Y_CUMPLIMIENTO.md`. |
| **Qué hace** | Para un RUC: (1) busca en el índice de proveedores para resolver su `codProv` interno, (2) pide la ficha `/resumen` (que trae `datosSunat` + `conformacion` en una sola respuesta) y hace upsert en `supplier_conformacion` (socios/representantes/órganos) y `supplier_conformacion_lookup` (estado agregado por RUC, incluye `tiene_socios` para no reconsultar RUCs ya sabidos vacíos). `GET /api/conformacion/vinculos` (nuevo) cruza contra `awards`/`minor_contracts` y devuelve solo personas con RUCs distintos que ganaron adjudicaciones en entidades convocantes distintas — el patrón de interés real, no solo "misma empresa, varios contratos". |
| **Cómo lo hace** | **API JSON pública no documentada**, sin auth ni captcha, descubierta inspeccionando el bundle Angular de la SPA "Buscador de Proveedores del Estado" de OSCE (`apps.osce.gob.pe/perfilprov-ui`) — verificada en vivo el 2026-09-03. 300ms de cortesía entre RUCs. Por decisión de proyecto, no se buscará autorización formal de OSCE (ver `docs/APRENDIZAJES_INGENIERIA_INVERSA_OSCE.md`). |
| **Frecuencia** | Manual (`npm run ingest:conformacion [DEPARTAMENTO]`). Sin filtro de departamento recorre todos los RUCs de 11 dígitos ya vistos en `supplier_profiles`/`awards`; con departamento, solo los de esa región. |
| **Fuente de datos** | `eap.oece.gob.pe/perfilprov-bus/1.0` (búsqueda) y `eap.oece.gob.pe/ficha-proveedor-cns/1.0` (ficha) — backend real de OSCE, no RNP (el portal legado `rnp.gob.pe` migró su contenido informativo a gob.pe y ya no es la fuente operativa de este dato). |
| **Alcance territorial** | Ninguno propio — opera por RUC individual; el script de corrida masiva lo acota vía `awards.departamento` / distrito de `minor_contracts`. |
| **Limitación conocida** | El campo `socios` viene vacío para proveedores tipo "CONTRATOS COLABORACION EMPRESARIAL" (consorcios) — no tienen accionistas en el sentido societario que expone este endpoint. Corrida nacional completa (2026-09-04): **3,818/3,818 RUCs (100%)**, 1,353 con socios (35%). El cruce vía `/vinculos` encontró un caso real (Loyola Zavaleta, dos RUCs distintos ganando en dos municipalidades distintas de La Libertad con 14 días de diferencia) — documentado como hipótesis, no acusación, en `docs/HALLAZGOS_CONFORMACION_SOCIETARIA.md`. Ampliar la muestra a nivel nacional no sumó casos nuevos porque `awards` en sí mismo solo cubre La Libertad — son dos ejes de cobertura independientes. |
| **Cruces** | Se consulta por `ruc`, la misma clave que usan [`identidad-fiscal`](#identidad-fiscal) y [`proveedores-sancionados`](#proveedores-sancionados) — permite, en el futuro, encadenar identidad fiscal → dueños reales → sanciones sin un cruce nuevo. `GET /api/conformacion/vinculos` ya cruza contra `awards`/`minor_contracts` (ver arriba). |

---

<a id="radar-inversiones"></a>
## radar-inversiones — Inversión pública (Invierte.pe)

| | |
|---|---|
| **Descripción** | Trae el detalle de proyectos de inversión pública (Invierte.pe) — costos, estado, entidad responsable. |
| **Qué hace** | Descarga el CSV nacional de inversiones, normaliza y escribe en el modelo de inversiones, con `SEC_EJEC` como clave de cruce exacto contra `radar-ejecucion`. |
| **Cómo lo hace** | Descarga HTTP directa vía **Range** (mismo patrón que `mef-connector.ts`, pero el archivo es mucho más chico: ~246 MB vs 4.5–10+ GB del CSV de presupuesto). `DEFAULT_MAX_BYTES` = 50 MB por defecto. |
| **Frecuencia** | Manual (`npm run ingest:invierte`). Cada corrida es un snapshot parcial (por bytes), no un delta. |
| **Fuente de datos** | `fs.datosabiertos.mef.gob.pe/datastorefiles/DETALLE_INVERSIONES.csv` (mismo host de archivos del MEF que usa `radar-ejecucion`, dataset distinto). |
| **Alcance territorial CLI** | `INVIERTE_DEPARTAMENTOS` acepta La Libertad, Lambayeque, Piura, Cajamarca y Cusco. La completitud depende de recorrer todos los rangos del archivo fuente; el filtro no transforma un corte parcial en universo completo. |
| **Cruces** | `investments` es la segunda tabla más cruzada del catálogo. Cruzan contra ella en vivo: `GET /api/crossref` (propio, `SEC_EJEC` exacto contra `budget_execution` de [`radar-ejecucion`](#radar-ejecucion)), [`infobras`](#infobras) (`GET /api/crossref`, `CUI` exacto) e [`inversion-privada`](#inversion-privada) (`GET /api/crossref/oxi`, `codigo_snip` exacto contra `codigo_referencia` de OxI). Los tres usan clave exacta compartida, sin matcher difuso — a diferencia de los cruces por nombre de entidad de otras apps. |
| **Detalle completo** | [`docs/data-contracts/invierte-detalle-inversiones.md`](data-contracts/invierte-detalle-inversiones.md) |
| **Conector hermano (2026-09-06)** | `invierte-desactivadas-connector.ts` (`npm run ingest:invierte-desactivadas` / `:full`) ingiere `INVERSIONES_DESACTIVADAS.csv` (~280MB) — la mitad del Banco de Inversiones que el conector activo nunca cubrió (proyectos declarados no viables u otros supuestos de desactivación de la RD N°001-2019-EF/63.01). Esquema de columnas distinto al activo (`COD_SNIP`/`NOM_UEP`, sin `SEC_EJEC`). Expone `GET /api/investments-desactivadas`. Detalle: [`docs/data-contracts/invierte-inversiones-desactivadas.md`](data-contracts/invierte-inversiones-desactivadas.md). De paso se corrigió un bug real: `fecha_registro`/`fecha_viabilidad` del conector activo estaban casi siempre `NULL` por un regex que no toleraba el sufijo de hora del CSV, agravado porque el `ON CONFLICT` nunca las actualizaba — corregido, ver el data contract activo. |

---

<a id="infobras"></a>
## infobras — Obras públicas (Contraloría)

| | |
|---|---|
| **Descripción** | Trae el dataset nacional de obras públicas monitoreadas por la Contraloría (INFOBRAS) — avance físico, paralización, entidad responsable. |
| **Qué hace** | Descarga el XLSX completo a un archivo temporal (no en memoria), lo parsea en streaming y normaliza filas hacia el modelo de obras. `GET /api/crossref` cruza con `radar-inversiones` por `CUI` exacto; `GET /api/crossref/ejecucion` cruza con `radar-ejecucion` por nombre de entidad, vía un `entity_crosswalk` **propio de esta app** (no el mismo que usa `compras-publicas` — cada app mantiene su propio crosswalk mef↔fuente, aunque comparten el mismo nombre de tabla y el mismo matcher difuso `matchEntitiesToPadron`/equivalente). |
| **Cómo lo hace** | Descarga HTTP directa de un `.xlsx` (~57 MB) a disco (no vía Range — el archivo es manejable, pero sí requiere streaming al parsear). Reintentos con backoff exponencial (hasta `MAX_ATTEMPTS` = 4, `BASE_BACKOFF_MS` = 2000 ms) porque el servidor puede responder 503 a mitad de transferencia en archivos grandes. |
| **Frecuencia** | Manual (`npm run ingest:infobras`). Snapshot completo del dataset en cada corrida (no incremental). |
| **Fuente de datos** | `infobras.contraloria.gob.pe` — descarga directa vía `InfobrasWeb/Archivo/DownloadFile`. |
| **Alcance territorial CLI** | `INFOBRAS_DEPARTAMENTOS` acepta La Libertad, Lambayeque, Piura, Cajamarca y Cusco. El XLSX fuente es nacional y se guarda el tamaño de lote nacional antes del filtro territorial. Los porcentajes se preservan como fuente y la columna admite valores atípicamente escalados; no se reinterpreta un porcentaje en la ingesta. |
| **Cost Drift** | `costDriftPct` (% de desvío entre `monto_viable` y `costo_actualizado` de una obra) vive en `@appsperu/shared-signals`, compartida con `salud-institucional`. Umbral de "sobrecosto" (`SOBRECOSTO_UMBRAL_PCT`) unificado en el mismo paquete — ver [ADR-0020](adr/0020-umbral-sobrecosto-unificado.md). |
| **Detalle completo** | [`docs/data-contracts/infobras-obras-publicas.md`](data-contracts/infobras-obras-publicas.md) |

---

<a id="ceplan-estrategico"></a>
## ceplan-estrategico — Planificación estratégica (ObservaPerú/CEPLAN)

| | |
|---|---|
| **Descripción** | Trae indicadores priorizados de gestión estratégica del Estado, agregados por nivel de gobierno (GN/GR/MP/MD/Total) — no hay modelo per-entidad disponible públicamente. |
| **Qué hace** | Descarga el JSON de indicadores, guarda el lote crudo en `raw_ceplan_batches` y normaliza hacia el catálogo de indicadores. Cruza con `radar-ejecucion` por nivel de gobierno (único bucket exacto entre ambas fuentes). |
| **Cómo lo hace** | El sitio no expone un endpoint de descarga estable para el Excel que ofrece el botón "Descargar" (se genera client-side en el browser); en su lugar, el conector pega directo al **asset JSON estático** que ese botón usa internamente — sin sesión, sin formulario, sin necesitar la librería `xlsx`. |
| **Frecuencia** | Manual (`npm run ingest:observa`). Snapshot completo del JSON en cada corrida. |
| **Fuente de datos** | `observaperu.ceplan.gob.pe/assets/data/seguimiento-estrategico/indicadores_priorizados_gestion_estrategica_estado.json`. |
| **Detalle completo** | [`docs/data-contracts/ceplan-strategic-planning.md`](data-contracts/ceplan-strategic-planning.md) |

**Fase 2 Rastro (2026-08-26)** — endpoints adicionales sin nuevo conector HTTP:

| Endpoint | Descripción |
|---|---|
| `GET /api/crossref/territorial?departamento=` | Marca CEPLAN nacional + contexto geo (5 regiones piloto) |
| `GET /api/indicators/seg` | SEG nacional o proxy dept `PROXY_DEPARTAMENTAL` |
| `GET /api/indicators/execution-efficiency` | Efficiency nacional o proxy dept |
| `GET /api/indicators/plan-budget-alignment` | PBA heurístico v1 por departamento |
| `npm run indicators:regional` | CLI consolidado SEG+Efficiency+PBA |

Contratos: [`ceplan-crossref-territorial-v1.md`](data-contracts/ceplan-crossref-territorial-v1.md), [`ceplan-plan-budget-alignment-v1.md`](data-contracts/ceplan-plan-budget-alignment-v1.md). Requiere `CEPLAN_GEO_API_URL` y opcionalmente `INFOBRAS_DATABASE_URL` para proxies departamentales.

---

<a id="ceplan-geo"></a>
## ceplan-geo — Territorio e infraestructura (GeoServer CEPLAN)

| | |
|---|---|
| **Descripción** | Ingiere capas territoriales e infraestructura logística del GeoServer público de CEPLAN y enriquece inversiones, obras y ejecución presupuestal con contexto territorial verificable. |
| **Qué hace** | Descarga capas WFS (GeoJSON), persiste geometrías en PostGIS, expone API de lectura y cruces HTTP con `radar-inversiones`, `infobras` y `radar-ejecucion`. Sin frontend web (política API-only). |
| **Cómo lo hace** | WFS 2.0 con paginación (`startIndex`/`count`), checksum por lote en `raw_geoserver_batches`, upsert idempotente en `territories`/`infrastructure`. Cruces: UBIGEO exacto cuando la fuente lo trae; match por departamento/provincia/distrito para INFOBRAS (sin coordenadas). |
| **Frecuencia** | Manual (`npm run ingest:discovery`, `ingest:territories`, `ingest:infrastructure`). Reporte de cobertura: `npm run cobertura:geoserver`. |
| **Fuente de datos** | `geo.ceplan.gob.pe/geoserver/geoceplan/wfs` (OGC, sin autenticación). |
| **Cobertura real ingerida (MVP)** | Nacional en distritos (`geoceplan:cb_limdistx`), aeropuertos y puertos; departamental/provincial como features sin tabla `territories` separada. |
| **Detalle completo** | [`docs/data-contracts/ceplan-geo.md`](data-contracts/ceplan-geo.md) |

**Fase 2 Rastro (2026-08-26):**

| Endpoint | Descripción |
|---|---|
| `GET /api/territories/summary?departamento=` | Agregados dept: distritos + infra (5 regiones piloto) |

Piloto Rastro: LA LIBERTAD, LAMBAYEQUE, PIURA, CAJAMARCA, CUSCO — 425 distritos verificables.

<a id="ceplan-geo-sbn"></a>
### `sbn-supervision-connector.ts` — Patrimonio inmobiliario del Estado (SBN)

| | |
|---|---|
| **Descripción** | Trae predios estatales efectivamente **supervisados** por SBN (Superintendencia Nacional de Bienes Estatales) — no el registro completo del universo de predios. Cierra parcialmente el hueco de "patrimonio y bienes muebles" identificado en `docs/COBERTURA_Y_CUMPLIMIENTO.md`; **solo inmuebles, no bienes muebles** (ver limitación). |
| **Qué hace** | Descarga el CSV completo, parsea (delimitador `;`, encoding Latin-1) y hace upsert en `sbn_supervision_predios` con `ON CONFLICT` sobre (`numero_informe`, `cus`). |
| **Cómo lo hace** | Descarga HTTP directa de un CSV público. El servidor está detrás de un WAF que bloquea requests sin `User-Agent` de navegador (responde 418) — no es autenticación real, un header normal basta. Parseo manual (split por `;`, sin librería CSV — archivo pequeño y sin campos entrecomillados). |
| **Frecuencia** | Manual (`npx tsx src/ingest/sbn-supervision-connector.ts`). Verificado en vivo 2026-09-04: 1,324 filas reales, nacional. |
| **Fuente de datos** | `datosabiertos.gob.pe/sites/default/files/Supervisión de predios estatales.csv` (grupo SBN en la Plataforma Nacional de Datos Abiertos). |
| **Limitación conocida** | El dataset "SBN Predios del Estado registrados en el SINABIP" (el registro **completo**, no solo supervisados) solo se publica como enlace de Google Drive, y ese enlace está **roto** (verificado en vivo 2026-09-04: "No se encontró la página") — no hay forma pública de acceder al universo completo de predios hoy. Tampoco se encontró fuente pública descargable para **bienes muebles** (vehículos, equipos, mobiliario) tras búsqueda razonable — ese sub-hueco sigue abierto. |
| **Alcance territorial** | Nacional; sin registros para LA LIBERTAD en la muestra verificada 2026-09-04 (LIMA concentra 690/1,324, ~52%) — hallazgo real de la fuente, no un filtro aplicado por el conector. |
| **Cruces** | Ninguno implementado — candidato: cruzar `titular_predio`/distrito contra entidades ya identificadas en `radar-ejecucion`/`compras-publicas`. |

---

<a id="identidad-fiscal"></a>
## identidad-fiscal — Padrón RUC (SUNAT)

| | |
|---|---|
| **Descripción** | Trae el padrón reducido de RUC de SUNAT — universo completo de contribuyentes, filtrado a personas jurídicas (RUC-20, ~2.3M de 18.3M) para cruzar estatus tributario contra proveedores del Estado y contra los propios gobiernos/municipalidades. |
| **Qué hace** | Descarga el ZIP, extrae el `.txt` de padrón, normaliza y hace inserts por lote hacia `contribuyentes`. `GET /api/crossref` cruza con `compras-publicas` por RUC exacto embebido en `awards.supplier_id` (marca cada adjudicación `irregular` si el proveedor no está ACTIVO/HABIDO); `GET /api/crossref/entidades` cruza con `radar-ejecucion` por nombre de entidad, acotando el padrón al prefijo de ubigeo departamental antes de correr el matcher difuso (sin ese acote, comparar contra las ~2.3M filas completas tomó 89s medidos en vivo y llegó a colgar el build de Next.js; acotado a un departamento baja a segundos). |
| **Cómo lo hace** | Descarga HTTP directa del ZIP (~373 MB comprimido) a disco, con reintentos con backoff (mismo patrón que `infobras-connector.ts`). Inserta en lotes de `INSERT_BATCH_SIZE` = 1000 filas — la primera versión usaba una sola transacción para las 2.3M filas y tardaba 40+ minutos; el batching lo bajó a ~4 minutos. |
| **Frecuencia** | Manual (`npm run ingest:padron`). La fuente (SUNAT) se actualiza a diario, según lo documentado en `docs/ESTADO.md`; el conector no está automatizado para seguir ese ritmo. |
| **Fuente de datos** | `www2.sunat.gob.pe/padron_reducido_ruc.zip`. |
| **Cobertura real ingerida** | Universo nacional completo (no acotado por departamento en el origen) — 2,339,313 filas aceptadas, 0 rechazadas en la corrida verificada. |
| **Detalle completo** | [`docs/data-contracts/sunat-padron-ruc.md`](data-contracts/sunat-padron-ruc.md) |

---

<a id="proveedores-sancionados"></a>
## proveedores-sancionados — Inhabilitaciones y multas (Tribunal de Contrataciones, vía RNP/OECE)

| | |
|---|---|
| **Descripción** | Trae inhabilitaciones y multas vigentes/históricas del Tribunal de Contrataciones del Estado — la señal más fuerte de riesgo sobre un proveedor (una inhabilitación vigente es prohibición legal de contratar, no solo irregularidad administrativa). `GET /api/crossref` cruza con `compras-publicas` por RUC exacto (mismo `extractRuc()` sobre `awards.supplier_id` que usa `identidad-fiscal`) y, en el **mismo endpoint**, trae también el estado tributario de esa entidad desde [`identidad-fiscal`](#identidad-fiscal) (`estado_contribuyente`/`condicion_domicilio`) — no son dos cruces separados, es una sola respuesta con inhabilitación + estado tributario por adjudicación, y distingue si la inhabilitación estaba vigente en la fecha de adjudicación o solo lo está hoy. |
| **Qué hace** | Abre sesión (GET), exporta el reporte completo (POST replicando el botón "Exportar Excel"), parsea el HTML tabular resultante, separa secciones de inhabilitaciones vs. multas y normaliza cada una hacia su tabla. |
| **Cómo lo hace** | El endpoint real usa sesión ASP clásica (cookie `ASPSESSIONID...`). Se replica el POST exacto que dispara el botón de exportar, con los campos del formulario vacíos (sin filtro = todos los proveedores), reutilizando la cookie recién abierta. El captcha visible en la página **no se valida ni en cliente ni en servidor** para este endpoint específico — confirmado en vivo comparando MD5 contra la descarga manual (idéntico). Se descartó explícitamente el dataset homónimo de `datosabiertos.gob.pe` por estar abandonado desde 2018. |
| **Frecuencia** | Manual (`npm run ingest:sanciones`). Snapshot completo del reporte en cada corrida. |
| **Fuente de datos** | `rnp.gob.pe/consultasenlinea/inhabilitados` (RNP — Registro Nacional de Proveedores). |
| **Cobertura real ingerida** | Universo nacional completo — 17,919 filas (11,208 inhabilitaciones + 6,681 multas tras dedup), 1 sola rechazada en la corrida verificada. |
| **Caveat importante** | "Vigente hoy" no equivale a "vigente al momento de la adjudicación" — ver detalle. |
| **Detalle completo** | [`docs/data-contracts/proveedores-sancionados.md`](data-contracts/proveedores-sancionados.md) |
| **Cruce persona-a-persona (2026-09-06)** | `GET /api/crossref/personas-sancionadas` — el RUC-10 (persona natural) de una sanción trae el DNI incrustado (dígitos 3-10, formato peruano); una migración lo extrae como columna generada (`dni`, nunca escrita a mano, siempre recalculada desde `ruc`) y lo cruza contra `numero_documento` de `supplier_conformacion` (compras-publicas) para detectar personas sancionadas que son socio/representante/miembro del órgano de administración de una empresa activa. El DNI se usa solo como clave de cruce interno — la respuesta nunca lo expone completo (`dniEnmascarado`, últimos 3 dígitos). El nombre sí se expone, porque ya es público en el buscador del RNP y en `GET /api/sanciones`. Verificado en vivo: 3,211 DNI distintos de persona sancionada, 9 con vínculo empresarial real encontrado (uno con 3 roles simultáneos en la misma empresa). |

---

<a id="inversion-privada"></a>
## inversion-privada — Cartera APP/PA + OxI + GIS (PROINVERSIÓN / VERTIX)

Tres conectores independientes, misma app y misma plataforma origen (VERTIX):

| | |
|---|---|
| **Descripción** | Trae la cartera de inversión privada promovida por PROINVERSIÓN — Asociaciones Público-Privadas (APP) y Proyectos en Activos (PA) — vía plataforma VERTIX. Complementa `radar-inversiones` (Invierte.pe / inversión pública), no la sustituye. |
| **Qué hace** | Descarga el JSON nacional de `vertixService.php`, enriquece cada proyecto con departamentos INEI (25 consultas filtradas) y normaliza hacia `private_investment_projects`. |
| **Cómo lo hace** | POST `multipart/form-data` al proxy PHP de `investinperu.pe` (`PageLimit=500`). Sin sesión. Departamento por proyecto inferido del buscador — el JSON por fila no trae columna territorial. |
| **Frecuencia** | Manual (`npm run ingest:vertix`). Snapshot completo de la cartera en cada corrida. |
| **Fuente de datos** | `https://www.investinperu.pe/wp-content/themes/hello-elementor-child/__api/service/app/vertixService.php` |
| **Cobertura real ingerida** | Cartera VERTIX APP+PA — ~340 proyectos verificados 2026-08-28 (`RecordsTotal` = filas upsertadas). Sin CUI/SNIP — sin cruce exacto posible con el resto del ecosistema. |
| **Detalle completo** | [`docs/data-contracts/proinversion-vertix-cartera-app-pa-oxi.md`](data-contracts/proinversion-vertix-cartera-app-pa-oxi.md) |
| **ADR** | [`docs/adr/0011-inversion-privada-app-standalone-y-connector-vertix.md`](adr/0011-inversion-privada-app-standalone-y-connector-vertix.md) |

| | |
|---|---|
| **Descripción** | Trae la cartera de proyectos OxI (Obras por Impuestos) en promoción — universo distinto a APP/PA aunque comparta plataforma VERTIX. Único de los dos conectores VERTIX que trae un código de referencia cruzable con `radar-inversiones`. |
| **Qué hace** | Descarga el XLSX (vía JSON+base64) de `investmentpromotionExport.php`, parsea columnas B→Q y normaliza hacia `oxi_investment_promotions`. Expone `GET /api/crossref/oxi` contra [`radar-inversiones`](#radar-inversiones) por `codigo_referencia` (columna "CODIGO SNIP / INVIERTE.PE / CÓDIGO IDEA" del export OxI) igualado a `codigo_snip` de `investments` — exacto, sin fuzzy; una fila sin match no implica que el proyecto no exista en Invierte.pe, solo que su código en OxI no coincide con un `codigo_snip` de esa fuente. |
| **Cómo lo hace** | POST `multipart/form-data` (`Lan=es`) al mismo proxy PHP de `investinperu.pe`. Sin sesión. XLSX pequeño (~760 filas, con shared strings), parseado completo en memoria — sin streaming. |
| **Frecuencia** | Manual (`npm run ingest:oxi`). Snapshot completo en cada corrida. |
| **Fuente de datos** | `https://www.investinperu.pe/wp-content/themes/hello-elementor-child/__api/service/oxi/investmentpromotionExport.php` |
| **Cobertura real ingerida** | 761 proyectos OxI nacional, 55 en La Libertad, verificados 2026-08-28. Cruce con `radar-inversiones`: 45/55 confirmados en La Libertad. |
| **Detalle completo** | [`docs/data-contracts/proinversion-vertix-cartera-app-pa-oxi.md`](data-contracts/proinversion-vertix-cartera-app-pa-oxi.md) |
| **ADR** | [`docs/adr/0012-inversion-privada-oxi-y-cruce-snip-con-radar-inversiones.md`](adr/0012-inversion-privada-oxi-y-cruce-snip-con-radar-inversiones.md) |

| | |
|---|---|
| **Descripción** | Trae la geometría GIS de proyectos VERTIX (puntos/líneas/polígonos) desde el dashboard público de `vertix.proinversion.gob.pe` — sin login, a diferencia del resto del backend de ese dominio. Cierra el límite "sin mapa descargable" que quedaba documentado en el ADR anterior. |
| **Qué hace** | Descarga el GeoJSON `FeatureCollection` de `ListaRegistrosCapas`, parsea la geometría (viene como string JSON) y normaliza hacia `vertix_project_geometries`. Expone `GET /api/gis/geojson` (descargable) y `GET /api/gis/projects/:vertixId` (cruce exacto `IDPROYECTO = vertix_id`). |
| **Cómo lo hace** | `GET` simple sin auth (a diferencia de los otros dos conectores VERTIX, que son POST multipart) a `vertix.proinversion.gob.pe/GIS/Dashboard/ListaRegistrosCapas`. Geometría guardada en JSONB, no PostGIS — ver ADR. |
| **Frecuencia** | Manual (`npm run ingest:gis`). Snapshot completo en cada corrida. |
| **Fuente de datos** | `https://vertix.proinversion.gob.pe/GIS/Dashboard/ListaRegistrosCapas` |
| **Cobertura real ingerida** | 473 features nacional verificadas 2026-08-28. Cruce con `private_investment_projects`: 151/156 `IDPROYECTO` únicos confirmados. La Libertad: 13 features. |
| **Detalle completo** | [`docs/data-contracts/proinversion-vertix-cartera-app-pa-oxi.md`](data-contracts/proinversion-vertix-cartera-app-pa-oxi.md) |
| **ADR** | [`docs/adr/0013-inversion-privada-gis-vertix-geometria-sin-postgis.md`](adr/0013-inversion-privada-gis-vertix-geometria-sin-postgis.md) |

---

<a id="bcrp-comercio-exterior"></a>
## bcrp-comercio-exterior — Comercio exterior (BCRP)

| | |
|---|---|
| **Descripción** | Trae series mensuales de comercio exterior agregado nacional (exportaciones/importaciones) publicadas por el BCRP — no confundir con `bcrp-la-libertad`, que es actividad económica regional vía PDF. |
| **Qué hace** | Pide un rango de periodos (calculado por defecto, o vía `BCRP_TRADE_PERIOD_START`/`BCRP_TRADE_PERIOD_END`) para un conjunto fijo de códigos de serie (`NATIONAL_TRADE_SERIES`), guarda el JSON crudo en `raw_bcrp_batches` con checksum, normaliza y hace upsert en `trade_indicators` por `(series_code, period_year, period_month)`. |
| **Cómo lo hace** | **API REST oficial**, sin sesión ni autenticación — el conector más simple del catálogo. |
| **Frecuencia** | Manual (`npm run ingest:trade`). Cada corrida trae el rango de periodos pedido completo. |
| **Fuente de datos** | `estadisticas.bcrp.gob.pe/estadisticas/series/api` (BCRPData — Banco Central de Reserva del Perú). |
| **Cobertura real ingerida** | Agregado nacional únicamente — un solo valor por mes y serie, sin desagregado por departamento/producto/empresa. El desagregado departamental (`RD38085BM`-`RD38111BM`) existe en la API pero está congelado desde dic-2022/dic-2023 (verificado en vivo), por eso el conector implementado usa solo las series nacionales (`PN38714BM`-`PN38723BM`), que sí están al día. |
| **Detalle completo** | [`docs/data-contracts/bcrp-comercio-exterior.md`](data-contracts/bcrp-comercio-exterior.md) |
| **Nota** | Este conector **ya está implementado y activo** — corrige una entrada anterior de este catálogo que lo listaba como "candidato evaluado, no implementado". |

---

<a id="bcrp-la-libertad"></a>
## bcrp-la-libertad — Síntesis de Actividad Económica (BCRP Sucursal Trujillo)

| | |
|---|---|
| **Descripción** | Indicadores mensuales de actividad económica de La Libertad (agropecuario, pesca, minería, manufactura, crédito, depósitos, ejecución presupuestal) publicados por la Sucursal Trujillo del BCRP — no confundir con `bcrp-comercio-exterior`, que es agregado nacional. |
| **Qué hace** | Parsea el PDF mensual "LA LIBERTAD: Síntesis de Actividad Económica" (10 ANEXOS, formato tabulado por indicador × 13 meses) y normaliza hacia `bcrp_ll_indicators`, una tabla genérica de series de tiempo (no una tabla por anexo). |
| **Cómo lo hace** | **Ingesta manual, único caso en el proyecto**: `bcrp.gob.pe` está detrás de un WAF (Incapsula, challenge JS) que bloquea descarga automatizada — confirmado con `curl` y `WebFetch`. Alguien descarga el PDF con su navegador y corre `npm run ingest:pdf -- <ruta>`, que usa `pdf-parse` (`getText()`) para extraer texto tabulado y un parser genérico basado en detectar encabezados `ANEXO N`. |
| **Frecuencia** | Manual, sin descarga automatizable — ni siquiera con scheduler, a diferencia del resto del catálogo (que es manual solo por decisión de diseño, no por bloqueo técnico). |
| **Fuente de datos** | `https://www.bcrp.gob.pe/docs/Sucursales/Trujillo/{AÑO}/sintesis-la-libertad-{MM}-{AÑO}.pdf` |
| **Cobertura real ingerida** | 7/10 ANEXOS (1,2,3,5,6,8,10 — incluye ejecución presupuestal, el más relevante para cruzar con `radar-ejecucion`). Anexos 4, 7 y 9 usan un layout de tabla con valores separados por espacio en vez de tab, ambiguo de partir sin arriesgar corromper datos (separador de miles indistinguible de separador de columna) — se dejan sin ingerir. Verificado con el PDF de enero 2026: 650 filas, cifras coincidentes con el texto narrativo del reporte. |
| **Detalle completo** | [`docs/data-contracts/bcrp-sintesis-la-libertad.md`](data-contracts/bcrp-sintesis-la-libertad.md) |
| **ADR** | [`docs/adr/0014-bcrp-la-libertad-sintesis-economica-ingesta-manual.md`](adr/0014-bcrp-la-libertad-sintesis-economica-ingesta-manual.md) |

---

<a id="actividad-agraria"></a>
## actividad-agraria — Jornal, alquiler de tractor y de yunta (MIDAGRI)

Tres datasets distintos de MIDAGRI, todos servidos por **un solo motor genérico reutilizable**
(`regional-monthly-connector.ts`) que cada conector parametriza con su URL de recurso y su tabla
destino — mismo patrón de fetch → checksum → normaliza → upsert que el resto del catálogo, sin
duplicar lógica entre los tres.

| | |
|---|---|
| **Descripción** | Indicadores mensuales agropecuarios por departamento: jornal agrícola (S/ por día), alquiler de tractor y alquiler de yunta. |
| **Qué hace** | Descarga el CSV del dataset, guarda el lote crudo en `raw_midagri_batches` con checksum, normaliza y hace upsert por `(departamento, anio, mes)` en la tabla correspondiente. Filas con región/año inválido o ausente van a la tabla `*_rejected` respectiva, nunca se descartan en silencio. |
| **Cómo lo hace** | Descarga HTTP directa (CSV delimitado por `;`, con BOM) — mismo `User-Agent` de navegador que usa `sidpol-connector.ts` de seguridad-ciudadana. |
| **Frecuencia** | Manual, un script por dataset (`npm run ingest:jornal`, `ingest:tractor`, `ingest:yunta`) o los tres encadenados (`npm run ingest:midagri-regional`). Snapshot completo del CSV en cada corrida. |
| **Fuente de datos** | `www.datosabiertos.gob.pe` (MIDAGRI) — tres recursos distintos: `Valor de Jornal.xlsx - C.102_0.csv` (jornal), `Precio de Alquiler de Tractor.csv` (tractor), `precioxyunta.csv` (yunta). |
| **Cruces** | `GET /api/crossref` junta jornal/tractor/yunta con `budget_execution` de [`radar-ejecucion`](#radar-ejecucion), FUNCION=AGROPECUARIA, exacto por departamento+año (ADR-0003, ADR-0008) — mismo patrón que usa [`seguridad-ciudadana`](#seguridad-ciudadana) para orden público. El endpoint distingue explícitamente ejecución con sede en el departamento de gasto de Gobierno Nacional dirigido a él (`meta_departamento`), y advierte que insumo agrícola y gasto AGROPECUARIA miden dimensiones distintas — el cruce no implica eficiencia ni causalidad. |

---

<a id="seguridad-ciudadana"></a>
## seguridad-ciudadana — Denuncias policiales (MININTER/SIDPOL)

| | |
|---|---|
| **Descripción** | Trae el dataset nacional de denuncias policiales por modalidad, agregado por `(año, mes, ubigeo, modalidad)`. |
| **Qué hace** | Descarga el CSV, guarda el lote crudo en `raw_sidpol_batches` con checksum, deduplica filas repetidas del CSV de origen por la misma clave `(anio, mes, ubigeo, modalidad)` (Postgres rechaza un `ON CONFLICT DO UPDATE` que afecte la misma fila dos veces en un mismo statement) y hace upsert en `police_reports` en lotes de 1000. |
| **Cómo lo hace** | Descarga HTTP directa de un CSV (delimitado por coma, con BOM). El portal está detrás de un WAF que bloquea requests sin headers de navegador — confirmado en vivo el 2026-08-27 (un fetch sin `User-Agent` devuelve HTTP 418 con una página de bloqueo en vez del CSV). |
| **Frecuencia** | Manual (`npm run ingest:sidpol`). Snapshot completo del CSV nacional en cada corrida. |
| **Fuente de datos** | `www.datosabiertos.gob.pe` (MININTER — `DATASET_Denuncias_Policiales_Ene 2018 a Julio 2026.csv`). |
| **Cruces** | `GET /api/crossref` junta denuncias con `budget_execution` de [`radar-ejecucion`](#radar-ejecucion), FUNCION=ORDEN PUBLICO Y SEGURIDAD, exacto por departamento+año — mismo patrón de bucket exacto (sin matcher difuso) que usa [`actividad-agraria`](#actividad-agraria) para gasto agropecuario. Distingue igual ejecución regional/local de gasto nacional dirigido (ej. PNP con sede en Lima operando en la región), y advierte explícitamente que no implica causalidad entre denuncias y gasto. |

---

<a id="salud-institucional"></a>
## salud-institucional — Score compuesto (sin conector propio)

| | |
|---|---|
| **Descripción** | No tiene fuente externa ni conector de ingesta propios. Es un agregador de solo lectura: combina en vivo, por `entity_code`, datos ya ingeridos por las otras 5 apps (ejecución de `radar-ejecucion`, obras de `infobras`, inversiones de `radar-inversiones`, compras de `compras-publicas`, salud tributaria de `identidad-fiscal`) en un score 0-100. |
| **Qué hace** | Calcula el score bajo demanda vía `GET /api/score`, consultando en vivo las bases de las otras 5 apps (no tiene Postgres propio). Si una fuente no tiene dato para una entidad, ese componente se omite del promedio — nunca se imputa 0 ni 100 por ausencia. |
| **Cómo lo hace** | Queries directas contra las 5 bases (connection strings en `.env`), sin lote ni tabla intermedia — no aplica el patrón "descarga → lake crudo → normaliza" de los demás conectores porque no hay descarga: los datos ya están ingeridos por las apps origen. |
| **Frecuencia** | N/A — se recalcula en cada request, no hay "ingesta" que programar. |
| **Fuente de datos** | Las 5 bases Postgres de las otras apps (indirectamente, las 5 fuentes externas de arriba). |
| **Sobrecosto (componente inversiones)** | `costo_actualizado > monto_viable` en SQL — equivalente a `costDriftPct(...) > SOBRECOSTO_UMBRAL_PCT` de `@appsperu/shared-signals` (no calculado fila por fila por performance). Umbral unificado con `infobras` — ver [ADR-0020](adr/0020-umbral-sobrecosto-unificado.md). |
| **Detalle completo** | [`docs/data-contracts/salud-institucional-score.md`](data-contracts/salud-institucional-score.md) |

---

<a id="servicios-salud"></a>
## servicios-salud — Establecimientos de salud (RENIPRESS/SUSALUD)

> No confundir con [salud-institucional](#salud-institucional): esa app es un score de salud
> *institucional/financiera* de una entidad pública (presupuesto, obras, compras), sin relación
> con servicios de salud MINSA/SUSALUD. Esta app (`servicios-salud`) es la que trae el estado
> real de establecimientos de salud. Ver `docs/PRD_Servicios_Salud_Programas_Sociales_v1.md` §SS-01.

### `renipress-connector.ts`

| | |
|---|---|
| **Descripción** | Trae el Registro Nacional de IPRESS (instituciones prestadoras de servicios de salud — hospitales, centros y puestos de salud), con su estado operativo real declarado por SUSALUD. Cierra el "punto ciego" de si un establecimiento financiado por una obra pública está activo. |
| **Qué hace** | Resuelve el recurso CSV más reciente del dataset (el nombre del archivo cambia cada corte, `RENIPRESS_{dd-mm-aaaa}.csv`) vía `package_show` de CKAN, lo descarga y hace upsert por `cod_ipress` en `ipress`. Reemplazó al dataset `minsa-ipress` que asumía el PRD original — ese recurso está congelado desde 2017. |
| **Cómo lo hace** | Descarga HTTP directa (36,004 filas, ~19 MB — no requiere streaming). CSV delimitado por `;`, UTF-8 con BOM. **Requiere un header `User-Agent` de navegador real** — el WAF de `datosabiertos.gob.pe` devuelve HTTP 418 sin él (confirmado en vivo, ADR-0018 addendum). `estado` se guarda tal cual viene del CSV, sin normalizar a booleano. Lote crudo en `raw_renipress_batches`. |
| **Frecuencia** | Manual (`npm run ingest:renipress` en `apps/servicios-salud/api`). La fuente publica un corte mensual. |
| **Fuente de datos** | `datosabiertos.gob.pe` (PNDA), dataset `registro-nacional-de-entidades-prestadoras-de-servicios-de-salud-renipress` — SUSALUD. |
| **Cobertura real ingerida** | Nacional (36,004 establecimientos confirmados en el corte de agosto 2026, 26,901 con `ESTADO = ACTIVO`) — a diferencia de la mayoría de apps de Rastro, no está acotada a La Libertad porque el archivo es pequeño. |
| **Cruces** | `GET /api/crossref` cruza `ipress` (agregado por UBIGEO, total y `ESTADO='ACTIVO'`) contra `investments` de [radar-inversiones](#radar-inversiones), pool directo (`INVERSIONES_DATABASE_URL`), filtrado por `FUNCION IN ('SALUD', 'SALUD Y SANEAMIENTO')` — ambos valores confirmados en vivo el 2026-09-05 (740 + 26 filas; `SANEAMIENTO` a secas, 1,109 filas, se excluye a propósito). UBIGEO exacto, sin matcher difuso. Declara en la propia respuesta el alcance territorial real de `investments` (hoy 100% LA LIBERTAD, consultado en vivo, no hardcodeado). |
| **Detalle completo** | [`docs/data-contracts/renipress-susalud.md`](data-contracts/renipress-susalud.md) |

---

<a id="programas-sociales"></a>
## programas-sociales — Cobertura de programas sociales (INFOMIDIS/MIDIS)

### `infomidis-connector.ts`

| | |
|---|---|
| **Descripción** | Trae la cobertura mensual de programas sociales del MIDIS (JUNTOS, QALI WARMA, FONCODES, CUNAMÁS, CONTIGO, PAIS/Tambos y **Pensión 65 agregado por distrito**), ya agregada por distrito por el propio MIDIS. Reemplaza el plan original de ingerir JUNTOS y Pensión 65 por separado — INFOMIDIS resuelve de raíz el riesgo de PII de Pensión 65 (agregado oficial, nunca registro individual). |
| **Qué hace** | Resuelve el recurso CSV más reciente del dataset vía `package_show`, lo descarga y hace upsert por `(ubigeo, fecha_corte)` en `cobertura_social`. Busca cada columna por palabras clave normalizadas (no por nombre exacto) para tolerar variaciones de esquema entre cortes — si una columna esperada no aparece, se reporta en `columnasFaltantes` sin abortar la ingesta. |
| **Cómo lo hace** | El nombre de archivo de este dataset es demasiado inconsistente para usarlo como señal de "más reciente" (`202408_INFOMIDIS.csv`, `OCTUBRE_2024.csv`, `MARZO2025_1.csv` — sin patrón común, con duplicados y un recurso `format: "data"` con URL vacía). El conector elige por el timestamp `created` de CKAN en su lugar. CSV delimitado por `;`, **encoding Latin-1** (a diferencia de RENIPRESS, que es UTF-8 BOM). Comas como separador de miles dentro de valores numéricos (`"5,234"` = 5234, no 5.234) — un `Number()` ingenuo los trunca. Requiere el mismo header `User-Agent` de navegador que RENIPRESS. Lote crudo en `raw_infomidis_batches`. |
| **Frecuencia** | Manual (`npm run ingest:infomidis` en `apps/programas-sociales/api`). La fuente publica un corte mensual, con rezago de publicación confirmado de hasta ~4 meses entre el mes reportado y su fecha real de subida al portal. |
| **Fuente de datos** | `datosabiertos.gob.pe` (PNDA), dataset `cobertura-de-los-programas-sociales-adscritos-al-midis-...` — MIDIS. |
| **Cobertura real ingerida** | Nacional (~1,892 distritos por corte, confirmado en vivo para agosto 2024) — no acotada a La Libertad. |
| **Cruces** | `GET /api/crossref` cruza `investments` de [radar-inversiones](#radar-inversiones) (pool directo, `FUNCION IN ('PROTECCIÓN SOCIAL', 'ASISTENCIA Y PREVISION SOCIAL')`, ambos confirmados en vivo el 2026-09-05: 50 + 1 filas) contra el último corte de `cobertura_social` por UBIGEO. `cobertura_social` no tiene columna de departamento (INFOMIDIS no la trae), así que el cruce solo lista distritos del lado de `investments` (acotado por `departamento`), no todos los distritos con cobertura social. |
| **Detalle completo** | [`docs/data-contracts/infomidis-cobertura-social.md`](data-contracts/infomidis-cobertura-social.md) |

---

<a id="actividad-empresarial"></a>
## actividad-empresarial — Empresas del sector privado por distrito (MTPE)

### `mtpe-distrital-connector.ts`

| | |
|---|---|
| **Descripción** | Trae el conteo mensual de empresas activas del sector privado por distrito, fuente MTPE. Primera señal de actividad económica formal privada del proyecto — el resto de cruces existentes comparan inversión contra un servicio público, nunca contra el tejido empresarial. **Migrado 2026-09-05**: la primera versión ingería un CSV de PNDA congelado en 2022; esta versión ingiere el portal propio de MTPE, con años 2014-2025. |
| **Qué hace** | Resuelve dinámicamente el año más reciente publicado (scrapea el listado de MTPE, no asume una URL fija), descarga el `.7z`, lo descomprime, parsea la hoja `EMPRESAS_{año}` del `.xlsx` resultante, y normaliza de formato ancho a formato largo `(ubigeo, anio, mes)` en `empresas_privadas_distrito` — mismo patrón que `jornal-agricola-connector.ts`. Verifica en vivo que la hoja realmente declara el año esperado antes de usarla (no confía solo en el nombre de la hoja). |
| **Cómo lo hace** | Tres pasos, tres formatos: HTML del listado → HTML de la publicación anual → `.7z` → `.xlsx` (~23 MB, 49 hojas, solo se usa una). Tres técnicas sin precedente previo en el proyecto: scraping de HTML para descubrir la URL (el resto usa CKAN o URLs predecibles), descompresión `.7z` (`node-7z`+`7zip-bin`, binario empaquetado, no depende de 7-Zip instalado en el sistema), y parseo de Excel (`exceljs` — el único otro conector no-CSV del proyecto parsea PDF, no XLSX). Encabezado y columnas de mes se resuelven por nombre, no por posición fija (robustez ante cambios de estructura entre años). Mismo `User-Agent` de navegador — `gob.pe` tiene el mismo WAF que `datosabiertos.gob.pe`. Lote crudo en `raw_mtpe_batches`. |
| **Frecuencia** | Manual (`npm run ingest:empresas` en `apps/actividad-empresarial/api`). Cada corrida ingiere el año más reciente publicado — no hace backfill histórico automático de 2014-2024. |
| **Fuente de datos** | `www2.trabajo.gob.pe/estadisticas/ind-lab-a-nivel-distrital/` — portal operativo propio de MTPE, **no** la PNDA. El dataset gemelo de PNDA (congelado en 2022) queda completamente reemplazado. |
| **Cobertura real ingerida** | Nacional, año más reciente disponible (2025 confirmado en vivo: 1,510 distritos, 18,120 filas). |
| **Cruces** | `GET /api/crossref` cruza contra `investments` de [radar-inversiones](#radar-inversiones) (pool directo, sin filtrar por función — no hay categoría de gasto específica para "actividad empresarial"), por UBIGEO. Deliberadamente **sin** un campo tipo "punto ciego": a diferencia de salud/social, pocas empresas en un distrito no es un problema que la inversión deba resolver. |
| **Detalle completo** | [`docs/data-contracts/mtpe-empresas-sector-privado.md`](data-contracts/mtpe-empresas-sector-privado.md) |

---

<a id="informes-control"></a>
## informes-control — Informes de Servicios de Control (Contraloría)

### `informes-control-connector.ts`

| | |
|---|---|
| **Descripción** | Trae informes de auditoría/servicios de control de la Contraloría (entidad auditada, ubicación, fechas, sector, tipo de servicio, si tiene un hallazgo de responsabilidad). Cierra el hueco de "rendición de cuentas formal" identificado en `docs/COBERTURA_Y_CUMPLIMIENTO.md` (antes marcado como "hueco real, no cerrable a corto plazo"). |
| **Qué hace** | Pagina la API real de la Contraloría por año, normaliza cada fila a solo campos de entidad/informe, y hace upsert por `codigo_informe`. **Decisión de diseño explícita y verificada con test**: los campos `Funcionarios`, `TotalFuncionarios`, `Responsabilidad` y `Text` de la fuente — que pueden contener nombres de personas naturales con responsabilidad identificada — nunca se leen del objeto crudo, ni se persisten, ni se exponen. Solo se conserva `es_con_responsabilidad` como booleano (existe un hallazgo o no, sin decir de quién). |
| **Cómo lo hace** | Reverse engineering del mismo tipo que `perfilprov-conformacion-connector.ts` contra OECE: la SPA del buscador (`buscadorinformes.contraloria.gob.pe`) consume un handler ASP.NET no documentado (`BusquedaInformesCGR.ashx?Action=loadInformesElastic`) descubierto inspeccionando su JS. Paginación de 500 filas, cortesía de 300ms entre requests. Lote crudo en `raw_contraloria_batches`. |
| **Frecuencia** | Manual (`npm run ingest:informes -- <año>` en `apps/informes-control/api`, default año actual). Un año por corrida — no hace backfill automático de todo el histórico (363,971 informes totales confirmados en vivo). |
| **Fuente de datos** | `buscadorinformes.contraloria.gob.pe/BuscadorCGR/Informes/` — Contraloría General de la República, endpoint no documentado públicamente pero accesible sin autenticación. |
| **Cobertura real ingerida** | Nacional, por año (verificado en vivo: 2015 → 2 informes, 2026 → 24,256). |
| **Cruces** | `GET /api/crossref` empareja entidades de [radar-ejecucion](#radar-ejecucion) contra el nombre de entidad de cada informe (`CodigoEntidad` viene `null` en la fuente — no hay ID compartido), reutilizando `@appsperu/entity-matcher` (mismo matcher difuso que `identidad-fiscal/crossref/entidades`) y `LATEST_BUDGET_CTE` para el devengado agregado. Responde cuántos informes tiene una entidad y cuántos de esos tienen un hallazgo de responsabilidad (conteo agregado, nunca un nombre) junto a su ejecución presupuestal. Verificado en vivo: Proyecto Especial Chavimochic — 30 informes (3 con responsabilidad), S/ 66M de devengado. |
| **Detalle completo** | [`docs/data-contracts/contraloria-informes-control.md`](data-contracts/contraloria-informes-control.md) |

---

<a id="mindef"></a>
## mindef — Ministerio de Defensa (datos abiertos)

Investigado 2026-09-06 tras una pregunta directa del usuario ("¿y MINDEF? ¿y MIMP?"). No es un
"hueco oculto" al estilo MEF/SEACE (dato que ya teníamos parcialmente) — es un sector nuevo, sin
conector previo. Se descartaron explícitamente otros datasets de MINDEF (créditos financieros de
personal pensionista, PEA por tipo de pensión) por ser administrativos/RRHH sin relación con
gestión pública. Los tres que sí se ingieren son agregados/institucionales, sin nombre de persona.

### `offset-connector.ts`, `training-abroad-connector.ts`, `peace-missions-connector.ts`

| | |
|---|---|
| **Descripción** | Convenios de compensación industrial/social offset ligados a contratos de defensa; personal militar capacitado en el exterior (conteo por curso, no nombres); personal de las FF.AA. desplegado en misiones de paz de la ONU (conteo por misión/año, no nombres). |
| **Qué hace** | Tres conectores independientes, uno por dataset — dos XLSX y un CSV, esquemas verificados en vivo fila por fila antes de escribir el parser. |
| **Cómo lo hace** | Descarga HTTP directa (mismo WAF CloudWAF que el resto de `gob.pe`, requiere User-Agent de navegador). Offset y capacitación son XLSX (parseados con `exceljs`, encabezado en la fila 2); misiones de paz es CSV delimitado por `;`. |
| **Frecuencia** | Manual (`npm run ingest:all` en `apps/mindef/api`). Los tres son datasets pequeños (8, 21 y 20 filas confirmadas en vivo) — no requieren Range ni paginación. |
| **Fuente de datos** | `datosabiertos.gob.pe` — tres datasets separados de MINDEF, URLs de archivo sin versión estable (hay que revisar el catálogo periódicamente). |
| **Cobertura real ingerida** | Completa — los tres datasets son pequeños y se descargan enteros en cada corrida. |
| **Detalle completo** | Ver el modelo en `apps/mindef/api/src/db/migrations/001_init.sql` (incluye el razonamiento de qué se descartó y por qué). |

---

<a id="mimp"></a>
## mimp — Ministerio de la Mujer y Poblaciones Vulnerables (datos abiertos)

Investigado 2026-09-06 junto con MINDEF. **Se investigó un tercer dataset de MIMP y se descartó
explícitamente**: "Servicio de Acogimiento Residencial para Niñas, Niños y Adolescentes" es
individual (código de usuario pseudónimo + fecha de nacimiento exacta + centro + tipología de
ingreso por abuso/trata/explotación) sobre menores en protección estatal — la categoría de dato
más sensible que este proyecto puede tocar. No se ingiere bajo ninguna circunstancia, sin importar
que el código de usuario no sea un nombre literal. Los dos datasets que sí se ingieren son
agregados verificados columna por columna contra su fuente real antes de construir el conector.

### `cem-connector.ts`, `chat100-connector.ts`

| | |
|---|---|
| **Descripción** | Casos atendidos por violencia contra la mujer e integrantes del grupo familiar, por Centro Emergencia Mujer (CEM) — agregado por centro/año, desglosado por sexo y tipo de violencia. Consultas atendidas por el servicio Chat 100 — agregado nacional anual por sexo, sin desagregación territorial en la fuente. |
| **Qué hace** | Descarga el CSV más reciente de cada dataset (sin URL estable entre cortes — hay que revisar el catálogo), normaliza y hace upsert. |
| **Cómo lo hace** | Descarga HTTP directa, decodificación Latin-1 (igual que INFOMIDIS). **Bug real encontrado y corregido durante la construcción**: la fuente usa "N°" (signo de grado, U+00B0) en sus encabezados, no "Nº" (ordinal, U+00BA) — confundir los dos hacía que todas las columnas numéricas quedaran `NULL` en silencio, sin ningún error. Corregido antes de mergear; el test de normalización usa el carácter real para evitar una regresión. |
| **Frecuencia** | Manual (`npm run ingest:all` en `apps/mimp/api`). CEM: ~4,700 filas (nacional, histórico 2013-2025). Chat100: 6 filas (una por año, 2016-2021). |
| **Fuente de datos** | `datosabiertos.gob.pe` — dos datasets de MIMP. |
| **Cobertura real ingerida** | Completa para ambos — nacional, histórico completo del corte publicado. |
| **Detalle completo** | Ver el modelo en `apps/mimp/api/src/db/migrations/001_init.sql` (incluye el razonamiento de qué se descartó y por qué). |

---

## Mapa de cruces entre apps

Cada fila es un endpoint `GET /api/crossref*` real (verificado en `src/routes/crossref.ts` de cada
app), no una relación conceptual. La columna "Clave" distingue cruce **exacto** (columna
compartida sin ambigüedad) de **fuzzy** (matcher difuso sobre nombre, con `confidence`
`confirmada`/`candidata` persistido en una tabla `entity_crosswalk` — nota: cada app que la usa
mantiene su **propio** `entity_crosswalk`, no es una tabla compartida entre apps).

| App que consulta | App(s) consultada(s) | Endpoint | Clave | Exacto/Fuzzy |
|---|---|---|---|---|
| [actividad-agraria](#actividad-agraria) | radar-ejecucion | `GET /api/crossref` | departamento + FUNCION=AGROPECUARIA | Exacto |
| [seguridad-ciudadana](#seguridad-ciudadana) | radar-ejecucion | `GET /api/crossref` | departamento + FUNCION=ORDEN PUBLICO Y SEGURIDAD | Exacto |
| radar-ejecucion (interno) | mincetur-hospedaje ↔ mef | `GET /api/tourism/crossref` | departamento + FUNCION=TURISMO | Exacto |
| [compras-publicas](#compras-publicas) | radar-ejecucion | `GET /api/crossref` | `mef_entity_code` ↔ `oece_buyer_id` | Fuzzy |
| [radar-inversiones](#radar-inversiones) | radar-ejecucion | `GET /api/crossref` | `SEC_EJEC` | Exacto |
| [identidad-fiscal](#identidad-fiscal) | compras-publicas (`awards` **+** `minor_contracts`) | `GET /api/crossref` | RUC (`PE-RUC-` o `seace:ruc:` en `supplier_id`) | Exacto |
| [identidad-fiscal](#identidad-fiscal) | radar-ejecucion | `GET /api/crossref/entidades` | nombre de entidad | Fuzzy |
| [proveedores-sancionados](#proveedores-sancionados) | compras-publicas (`awards` **+** `minor_contracts`) **+** identidad-fiscal | `GET /api/crossref` (un solo endpoint, tres fuentes) | RUC | Exacto |
| [infobras](#infobras) | radar-inversiones | `GET /api/crossref` | `CUI` | Exacto |
| [infobras](#infobras) | radar-ejecucion | `GET /api/crossref/ejecucion` | nombre de entidad | Fuzzy |
| [inversion-privada](#inversion-privada) (oxi) | radar-inversiones | `GET /api/crossref/oxi` | `codigo_referencia` ↔ `codigo_snip` | Exacto |
| [ceplan-geo](#ceplan-geo) | radar-inversiones, infobras, radar-ejecucion | `GET /api/crossref/*` (3 endpoints) | UBIGEO exacto / depto-provincia-distrito | Mixto |
| [ceplan-estrategico](#ceplan-estrategico) | radar-ejecucion | `GET /api/crossref` | nivel de gobierno (GN/GR/MP/MD) | Exacto (bucket) |
| [salud-institucional](#salud-institucional) | radar-ejecucion, infobras, radar-inversiones, compras-publicas, identidad-fiscal | `GET /api/score` (agregador, no crossref clásico) | `entity_code` | Exacto |
| [servicios-salud](#servicios-salud) | radar-inversiones | `GET /api/crossref` | UBIGEO + FUNCION IN (SALUD, SALUD Y SANEAMIENTO) | Exacto |
| [programas-sociales](#programas-sociales) | radar-inversiones | `GET /api/crossref` | UBIGEO + FUNCION IN (PROTECCIÓN SOCIAL, ASISTENCIA Y PREVISION SOCIAL) | Exacto |
| [actividad-empresarial](#actividad-empresarial) | radar-inversiones | `GET /api/crossref` | UBIGEO (sin filtro de función — cruce descriptivo, sin "punto ciego") | Exacto |
| [informes-control](#informes-control) | radar-ejecucion | `GET /api/crossref` | nombre de entidad (`CodigoEntidad` es `null` en la fuente) | Fuzzy |

**Gap cerrado (CX-01, 2026-09-02)**: hasta esa fecha, los crossref de `identidad-fiscal` y
`proveedores-sancionados` solo leían `awards` (poblada por `oece-connector.ts` /
`oece-records-connector.ts`). Los otros dos conectores de `compras-publicas`
(`legacy-seace-orders-connector.ts`, `seace-public-minor-contracts-connector.ts`) escriben en
`minor_contracts` con `winning_supplier_id` en formato `seace:ruc:<11 dígitos>` (distinto del
`PE-RUC-<11 dígitos>` de `awards.supplier_id`). Ambos endpoints ahora consultan las dos tablas en
paralelo y devuelven un campo `origen: "awards" | "minor_contracts"` por resultado — un proveedor
con contratos menores irregulares y sin adjudicaciones OCDS ya aparece en ambos cruces. `minor_
contracts` no registra moneda (a diferencia de `awards`, que sí trae `valor_moneda` del estándar
OCDS); esos resultados devuelven `valorMoneda: null` en vez de asumir soles.

---

## Resumen

| Conector | App | Fuente | Método | Frecuencia de ejecución | Cobertura ingerida |
|---|---|---|---|---|---|
| `mef-connector.ts` | radar-ejecucion | MEF (Consulta Amigable) | Descarga CSV vía HTTP Range | Manual | Parcial (La Libertad) |
| `mincetur-hospedaje-connector.ts` | radar-ejecucion | MINCETUR (ocupabilidad hotelera) | Descarga CSV anual | Manual | Completa (nacional, fila consolidada por depto) |
| `oece-connector.ts` | compras-publicas | OECE OCDS `/releases` | API REST JSON paginada | Manual | Parcial (10 páginas recientes) |
| `oece-records-connector.ts` | compras-publicas | OECE OCDS `/records` | API REST JSON paginada | Manual | Parcial |
| `legacy-seace-orders-connector.ts` | compras-publicas | SEACE buscador histórico (legado, JSF) | Scraping con ViewState/sesión | Manual | Parcial (por catálogo de entidades, La Libertad) |
| `seace-public-minor-contracts-connector.ts` | compras-publicas | SEACE buscador público moderno | API JSON interna no documentada | Manual | Parcial por defecto (100/depto); completa con `--full` |
| `perfilprov-conformacion-connector.ts` | compras-publicas | OSCE Buscador de Proveedores del Estado | API JSON interna no documentada | Manual | Por RUC ya conocido; vacío para consorcios |
| `invierte-connector.ts` | radar-inversiones | MEF Invierte.pe | Descarga CSV vía HTTP Range | Manual | Parcial (por bytes) |
| `infobras-connector.ts` | infobras | Contraloría INFOBRAS | Descarga XLSX completa | Manual | Completa (snapshot nacional) |
| `observa-connector.ts` | ceplan-estrategico | ObservaPerú/CEPLAN | Descarga JSON estático | Manual | Completa (agregado por nivel de gobierno) |
| `geoserver-client.ts` | ceplan-geo | CEPLAN GeoServer | WFS GeoJSON paginado | Manual | Completa (distritos + infra MVP) |
| `padron-connector.ts` | identidad-fiscal | SUNAT Padrón RUC | Descarga ZIP completo | Manual | Completa (nacional, ~2.3M filas) |
| `sanciones-connector.ts` | proveedores-sancionados | RNP/OECE Tribunal de Contrataciones | Sesión ASP + export HTML | Manual | Completa (nacional, ~17.9K filas) |
| `vertix-connector.ts` | inversion-privada | PROINVERSIÓN VERTIX (investinperu.pe) | POST multipart JSON | Manual | Completa (cartera APP/PA) |
| `oxi-connector.ts` | inversion-privada | PROINVERSIÓN VERTIX OxI (investinperu.pe) | POST multipart, XLSX en JSON base64 | Manual | Completa (761 nacional, 55 La Libertad) |
| `gis-connector.ts` | inversion-privada | PROINVERSIÓN VERTIX GIS (vertix.proinversion.gob.pe) | GET GeoJSON, sin auth | Manual | Completa (473 features nacional) |
| `bcrp-connector.ts` | bcrp-comercio-exterior | BCRPData (API series) | API REST JSON oficial | Manual | Completa (agregado nacional, sin desagregado) |
| `pdf-connector.ts` | bcrp-la-libertad | BCRP Sucursal Trujillo (PDF, descarga manual por WAF) | Parseo de texto tabulado con `pdf-parse` | Manual (archivo local) | Parcial (7/10 anexos) |
| `jornal-agricola-connector.ts` | actividad-agraria | MIDAGRI (datosabiertos.gob.pe) | Descarga CSV (motor compartido) | Manual | Completa (nacional) |
| `tractor-rental-connector.ts` | actividad-agraria | MIDAGRI (datosabiertos.gob.pe) | Descarga CSV (motor compartido) | Manual | Completa (nacional) |
| `yunta-rental-connector.ts` | actividad-agraria | MIDAGRI (datosabiertos.gob.pe) | Descarga CSV (motor compartido) | Manual | Completa (nacional) |
| `sidpol-connector.ts` | seguridad-ciudadana | MININTER (datosabiertos.gob.pe) | Descarga CSV, maneja WAF | Manual | Completa (nacional) |
| `airhsp-connector.ts` | radar-ejecucion | MEF AIRHSP (datosabiertos.gob.pe) | Descarga CSV anual | Manual | Completa (nacional, agregado por entidad/régimen/cargo — sin filtro territorial en la fuente) |
| `sbn-supervision-connector.ts` | ceplan-geo | SBN (datosabiertos.gob.pe) | Descarga CSV, maneja WAF | Manual | Parcial (solo predios supervisados, no el registro completo — enlace roto) |
| — (agregador) | salud-institucional | Las otras 5 apps | Query en vivo, sin ingesta | Bajo demanda (por request) | N/A |
| `renipress-connector.ts` | servicios-salud | SUSALUD RENIPRESS (datosabiertos.gob.pe) | Descarga CSV, maneja WAF, resuelve recurso vía `package_show` | Manual | Completa (nacional) |
| `infomidis-connector.ts` | programas-sociales | MIDIS INFOMIDIS (datosabiertos.gob.pe) | Descarga CSV, maneja WAF, resuelve recurso por `created` (no por nombre de archivo) | Manual | Completa (nacional) |
| `mtpe-distrital-connector.ts` | actividad-empresarial | MTPE (www2.trabajo.gob.pe, portal propio) | Scraping HTML + descarga .7z + descompresión + parseo XLSX | Manual | Completa (nacional, año más reciente: 2025) |
| `informes-control-connector.ts` | informes-control | Contraloría (buscadorinformes.contraloria.gob.pe) | Reverse engineering de API JSON no documentada, mismo patrón que OECE — descarta campos de persona natural en el parseo | Manual | Completa (nacional, por año) |
| `offset-connector.ts` | mindef | MINDEF (datosabiertos.gob.pe) | Descarga XLSX, maneja WAF | Manual | Completa (8 filas) |
| `training-abroad-connector.ts` | mindef | MINDEF (datosabiertos.gob.pe) | Descarga XLSX, maneja WAF | Manual | Completa (21 filas) |
| `peace-missions-connector.ts` | mindef | MINDEF (datosabiertos.gob.pe) | Descarga CSV, maneja WAF | Manual | Completa (20 filas) |
| `cem-connector.ts` | mimp | MIMP (datosabiertos.gob.pe) | Descarga CSV Latin-1, maneja WAF | Manual | Completa (nacional, ~4,700 filas) |
| `chat100-connector.ts` | mimp | MIMP (datosabiertos.gob.pe) | Descarga CSV Latin-1, maneja WAF | Manual | Completa (nacional, 6 filas) |

