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

> **¿Tu fuente es un panel multi-año/multi-corte?** Antes de sumar filas de cualquier
> endpoint de listado, revisa [`docs/data-contracts/paneles-multi-corte.md`](data-contracts/paneles-multi-corte.md)
> (DQ-09) — varias fuentes acumulan una fila nueva por año/corte en vez de sobrescribir, y
> sumar sin filtrar infla el total en un múltiplo del número de años ingeridos (confirmado
> como bug real en `infraestructura-mtc` y `residuos-solidos`, DQ-03/DQ-04).

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
| **`GET /api/execution` — paginación y territorio (DQ-01/DQ-02, 2026-09-07)** | El endpoint tenía un `LIMIT 1000` fijo sin `offset`/`total`/`hasMore` (encontrado en una auditoría de datos de La Libertad: una consulta sin filtro devolvía solo 1,000 de 2,594 filas reales, sesgada contra los gobiernos locales de menor gasto). Ahora acepta `limit`/`offset` reales (máx. 5000, default 1000 — mismo comportamiento por defecto que antes si no se paginan) y expone `total`/`hasMore`. La query ya hacía `LEFT JOIN territories t ON t.ubigeo = e.ubigeo` pero nunca seleccionaba `t.provincia`/`t.distrito`: ahora cada fila de `resultados` los incluye. En el entorno de desarrollo, `entities.ubigeo` está 100% poblado y resuelve provincia sin excepciones (verificado paginando el universo completo para La Libertad: 0 de 2,594 filas sin provincia) — verificar la misma tasa en producción antes de asumir 0% ahí también. |
| **`GET /api/execution/resumen` (DQ-08, 2026-09-08)** | Endpoint nuevo: agrega PIA/PIM/devengado por `groupBy=funcion` o `groupBy=generica` (requerido; cualquier otro valor responde 400), respetando los mismos filtros que `GET /api/execution` (`nivel`, `anio`, `ubigeo`, `departamento`, `metaDepartamento`). Antes había que paginar el universo completo y agregar client-side. Verificado en vivo: `groupBy=funcion` para La Libertad da 22 grupos cuya suma de filas (`totalFilas`) es exactamente 2,594, el total departamental conocido. |
| **Advertencia explícita si mezcla años fiscales (DQ-16, 2026-09-08)** | `LATEST_BUDGET_CTE` (`packages/shared-queries`) dedupe por `(entity_code, funcion, anio_fiscal, ...)` — `anio_fiscal` es parte de la clave, así que **no colapsa entre años fiscales distintos**. Se decidió no cambiar el filtro por defecto de un CTE compartido por 5 apps sin poder verificarlo contra datos reales multi-año; en su lugar, tanto `GET /api/execution` (`coberturaTemporal.aniosFiscalesUsados`/`advertenciaMultiAnio`) como `GET /api/execution/resumen` (`aniosFiscalesUsados`/`advertenciaMultiAnio`, calculado con `ARRAY_AGG(DISTINCT b.anio_fiscal)` en la misma query de agregación) exponen explícitamente cuántos años fiscales mezcla la respuesta — `advertenciaMultiAnio` queda `null` cuando solo hay un año, o cuando se pasó `anio` explícito. Hoy el entorno de desarrollo solo tiene 2026 ingerido, así que la advertencia nunca se dispara en vivo — verificado con tests que simulan 2 años fiscales. |
| **Detalle completo** | [`docs/data-contracts/mef-presupuesto-ejecucion.md`](data-contracts/mef-presupuesto-ejecucion.md) |
| **Ficha sectorial: ruta recomendada para one-pagers (PV-01/PV-02, 2026-09-12)** | `GET /api/sectores/:sectorId/ficha?ambito=NACIONAL\|REGIONAL&anio=&departamento=` junta presupuesto (`sector_entity_registry` + `budget_execution`), inversiones vinculadas (`project_budget_links`/`project_evidence_links`), obras de INFOBRAS por CUI exacto y contrataciones de compras-publicas por identidad MEF verificada — todo en una sola llamada. **Antes de este ticket, este endpoint existía pero `sector_entity_registry` estaba completamente vacío en este entorno** (0 filas, ninguna corrida previa de `npm run sectors:seed`), así que el one-pager `Radar Produce` (2026-09-12) se armó con SQL directo contra la base en vez de usar esta ruta — nadie lo hubiera notado sin leer el código fuente. Se corrió el seed (21 entidades, 0 sin encontrar) y se agregó el pliego 1086 (Ministerio de la Producción) al registro, que no tenía ninguna entidad de "Producción" clasificada. `ambito=NACIONAL` (nuevo) agrega todas las entidades del sector sin filtrar por departamento — sin esto, solo se podía pedir la ejecución de un sector *dirigida a* un departamento específico, nunca su total nacional. Verificado en vivo: `GET /api/sectores/PRODUCCION/ficha?ambito=NACIONAL` reproduce exactamente los S/ 208,104,679 PIM / S/ 128,209,085.25 devengado del Ministerio de la Producción ya verificados manualmente el mismo día. En modo nacional, `cobertura.estado` queda explícitamente `"NO_VERIFICADA"` (los snapshots de cobertura son por departamento; no se inventa un agregado nacional). **Antes de armar el próximo one-pager sectorial: revisar si el sector ya está en `sector/registry.ts` (`INITIAL_SECTOR_SEEDS`) y correr `npm run sectors:seed` — si el sector no aparece en la respuesta o el endpoint da 404, ese es el motivo, no un bug del endpoint.** |

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

**`GET /api/crossref/salud` (SI-07, 2026-09-07)**: reporta `{filas, confirmadas, candidatas,
ultimaConstruccion, estado}` de `entity_crosswalk`, con `estado: "VACIO"` explícito si tiene 0
filas. Se agregó tras encontrar esta tabla vacía durante meses en una auditoría de datos (nadie
había corrido `npm run crossref:build`), bloqueando `comprasNoConcentradas`/
`saludTributariaProveedores` del score institucional para el 100% de las entidades del país —
revisar tras cada seed/despliegue de datos nuevo.

<a id="compras-publicas-releases"></a>
### `oece-connector.ts` (releases)

| | |
|---|---|
| **Descripción** | Trae procesos de contratación pública (releases OCDS) — el evento base de cada proceso. |
| **Qué hace** | Pagina `/releases`, guarda cada lote crudo en `raw_ocds_batches`, normaliza y escribe en el modelo canónico de contrataciones. |
| **Cómo lo hace** | API REST real en JSON (a diferencia del MEF, sin Range requests ni parseo CSV). Filtros soportados: `startDate`, `endDate`, `mainProcurementCategory`. Paginación por `page`, 20 releases por página, orden desc por fecha de publicación. |
| **Frecuencia** | Manual (`npm run ingest:oece`). La API expone datos en vivo del portal; cada corrida trae hasta `DEFAULT_MAX_PAGES` = 10 páginas más recientes, no todo el histórico. |
| **Fuente de datos** | `contratacionesabiertas.oece.gob.pe/api/v1` (OECE — Organismo Especializado de las Contrataciones del Estado). |
| **Alcance territorial CLI** | `OECE_DEPARTAMENTOS`/`OECE_DEPARTAMENTO` acepta cualquier subconjunto de las 25 jurisdicciones. Es filtro posterior sobre las páginas OCDS descargadas (OECE no filtra por región server-side); la cobertura sigue limitada por la ventana y paginación solicitadas. |
| **Barrido nacional (CT-08, 2026-09-09)** | `run-oece-releases-full.ts`, `run-oece-records-full.ts` y `run-oece-segmented.ts` traían `"LA LIBERTAD"` hardcodeado — el barrido "full", que es justo el que debería cubrir el país, nunca podía llegar a las 25 jurisdicciones sin editar código. Ahora leen `resolveDepartamentosFromEnv()` (mismas variables `OECE_DEPARTAMENTOS`/`OECE_DEPARTAMENTO`) y, sin ninguna, corren sobre las 25 por defecto. La corrida nacional completa sigue sin ejecutarse en este entorno — la fuente no filtra por región, así que cubrir las 25 exige recorrer el histórico completo de `/releases`/`/records` sin límite de tasa documentado (horas, no minutos); pendiente de una corrida con tiempo y memoria dedicados. |
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
| **Limitación conocida** | El campo `socios` viene vacío para proveedores tipo "CONTRATOS COLABORACION EMPRESARIAL" (consorcios) — no tienen accionistas en el sentido societario que expone este endpoint. Corrida nacional completa (2026-09-04): **3,818/3,818 RUCs (100%)**, 1,353 con socios (35%) — pero ese 100% era relativo al universo de proveedores que `awards`/`minor_contracts` tenían ingerido **en ese momento** (solo La Libertad de forma completa). El cruce vía `/vinculos` encontró un caso real (Loyola Zavaleta, dos RUCs distintos ganando en dos municipalidades distintas de La Libertad con 14 días de diferencia) — documentado como hipótesis, no acusación, en `docs/HALLAZGOS_CONFORMACION_SOCIETARIA.md`. |
| **Cobertura real actualizada (OE-05, 2026-09-10)** | Tras ingerir Lima completa en `compras-publicas` (2026-09-10), el universo real de proveedores (RUC de 11 dígitos, únicos) en `awards`+`minor_contracts` creció a **21,119**, mientras `supplier_conformacion_lookup` sigue en **3,809 RUC consultados (18.0% del universo actual)** — el conector no se ha vuelto a correr desde el 2026-09-04. La cifra de "100%" de la fila anterior ya no describe la cobertura real; queda como registro histórico, no como estado vigente. **Cualquier hallazgo que diga "no se encontró vínculo societario" debe leerse junto a este 18%, no como si fuera una revisión del universo completo** — no es que el vínculo no exista, es que ese RUC probablemente nunca se consultó contra OSCE. Ampliar la cobertura (correr `npm run ingest:conformacion` sin filtro de departamento sobre el universo actual) queda como trabajo pendiente, condicional a evaluar el costo — ver `docs/TICKETS_Observatorio_Electoral_y_Riesgo_v1.md` (OE-05). |
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
| **Alcance territorial CLI** | `INFOBRAS_DEPARTAMENTOS` acepta las 25 jurisdicciones del catálogo territorial peruano (`.env` trae las 25 por defecto desde CT-06, 2026-09-08). El XLSX fuente es nacional y se guarda el tamaño de lote nacional antes del filtro territorial. Los porcentajes se preservan como fuente y la columna admite valores atípicamente escalados; no se reinterpreta un porcentaje en la ingesta. |
| **Alias de departamento de la fuente (CT-06, 2026-09-08)** | El XLSX etiqueta la Provincia Constitucional del Callao como `"P C DEL CALLAO"`, no `"CALLAO"` — sin normalizarlo, sus 1,471 obras caían en "otro departamento" y el corte de cobertura territorial nacional nunca cerraba completo (`SIN_DATOS_EN_FUENTE` para Callao pese a que sí hay datos). `canonicalizarDepartamentoFuente()` (`infobras-connector.ts`) mapea el alias al nombre canónico en el único punto donde se lee la columna, antes del filtro de scope y de la normalización — así el fix cubre storage, filtro y conteo de cobertura a la vez. Verificado en vivo: corrida nacional de las 25 jurisdicciones con `npm run cobertura:territorial -- --app infobras --todas --require-complete` → `state: "COMPLETA_VERIFICADA"`, `coverage_claimable: true`, exit code 0. |
| **Cost Drift** | `costDriftPct` (% de desvío entre `monto_viable` y `costo_actualizado` de una obra) vive en `@appsperu/shared-signals`, compartida con `salud-institucional`. Umbral de "sobrecosto" (`SOBRECOSTO_UMBRAL_PCT`) unificado en el mismo paquete — ver [ADR-0020](adr/0020-umbral-sobrecosto-unificado.md). |
| **`GET /api/crossref/salud` (SI-07, 2026-09-07)** | Reporta `{filas, confirmadas, candidatas, ultimaConstruccion, estado}` de `entity_crosswalk`, con `estado: "VACIO"` explícito si tiene 0 filas. Se agregó después de que una auditoría de datos de La Libertad encontrara esta tabla vacía durante meses (nadie había corrido `npm run crossref:build`), bloqueando el componente `obrasNoParalizadas` del score institucional para el 100% de las entidades del país sin que nadie lo notara — revisar este endpoint tras cada seed/despliegue de datos nuevo. |
| **`distrito_sospechoso` (DQ-14, 2026-09-08)** | Columna booleana en `public_works`, calculada en el ingest contra un catálogo nacional estático de 1,874 distritos por departamento (`ingest/distritos-conocidos.ts`, derivado una sola vez de la tabla `territories` de `ceplan-geo`). Marca (nunca rechaza) filas cuyo `distrito` no pertenece al universo real del `departamento` declarado — hallazgo original: 7 obras de Pataz traían un distrito de Cusco o una variante mal escrita, sin que nada lo detectara. Filtrable vía `GET /api/public-works?distritoSospechoso=true` y contado en `GET /api/public-works/resumen` (`conDistritoSospechoso`). El catálogo es estático — si INEI crea/fusiona distritos, hay que regenerarlo a mano desde `ceplan-geo`. |
| **`groupBy` en `GET /api/public-works/resumen` (DQ-06, 2026-09-08)** | Antes se ignoraba en silencio sin importar el valor. Ahora desglosa el resumen (`porGrupo: [{grupo, total, conParalizacionPct, conAvanceReportadoPct}]`) por `sectorEntidad`, `nivelGobierno`, `naturalezaObra`, `modalidadEjecucion` o `causalParalizacion` — un valor fuera de esa lista responde 400 explícito, nunca se ignora. La columna real de agrupación sale de un mapa fijo (`GROUP_BY_COLUMNS`), nunca del texto del query param, para no abrir una inyección SQL por nombre de columna. |
| **Detalle completo** | [`docs/data-contracts/infobras-obras-publicas.md`](data-contracts/infobras-obras-publicas.md) |
| **Ranking de obras paralizadas por sector/nacional (PV-03/PV-04, 2026-09-12)** | `GET /api/public-works` acepta `sectorEntidad` (igualdad exacta contra `sector_entidad`), `diasParalizadoMin` (requiere `conParalizacion=true` — responde 400 explícito si no) y `orderBy` (`nombre_asc` default, `diasParalizado_desc`, `montoViable_desc`). Omitir `sectorEntidad` agrega el ranking a nivel nacional sin filtro de sector — mismo endpoint, sin código adicional. Reemplaza el SQL directo contra la base que se usó para armar el one-pager `Radar Produce` (2026-09-12). Verificado en vivo: `?sectorEntidad=PRODUCCIÓN&conParalizacion=true&diasParalizadoMin=180&orderBy=diasParalizado_desc` reproduce exactamente las 4 obras ya identificadas a mano (Gran Mercado de Belén/Loreto 1,941 días, desembarcadero de Paita/FONDEPES 358 días, mercado Vivanco/Ayacucho 275 días, cerco CITEforestal/ITP 253 días); sin `sectorEntidad`, el ranking nacional completo (`conParalizacion=true&diasParalizadoMin=180`) devuelve **1,319 obras** — supera el umbral de ~500 filas evaluado en el ticket PV-04, así que la paginación queda documentada como pendiente y diferida (no se implementó en este ticket), no como un olvido. |

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
| **`infrastructure` requiere correr `ingest:infrastructure` (DQ-12, 2026-09-08)** | Al evaluar DQ-12 se encontró la tabla `infrastructure` con 0 filas en un entorno de desarrollo — mismo patrón que DQ-05 (`entity_crosswalk`): el script de ingesta existe y funciona (sin filtro territorial, cobertura nacional real) pero nunca se había corrido en ese entorno. Corrida en vivo: 227 filas (135 aeropuertos + 92 puertos), incluye aeródromos reales de Pataz y puertos de la provincia de Trujillo. Revisar `SELECT COUNT(*) FROM infrastructure` (o un futuro `GET /api/infrastructure/salud`, no implementado todavía) tras cada seed/despliegue nuevo, mismo criterio ya aplicado al crossref de `infobras`/`compras-publicas`. El denominador poblacional (`population_by_ubigeo`, hoy solo los 11 distritos de la provincia de Trujillo) es un caso distinto — está tipeado a mano desde el Censo 2017 de INEI, no hay un CSV/API abierto descargable (INEI publica esos resultados vía REDATAM, un sistema de consulta interactivo) — ampliar cobertura requeriría un conector nuevo o transcripción manual, evaluado y diferido en DQ-12. |
| **`territory_name_crosswalk` sin construir + sin diagnóstico (audit 2026-09-13, cerrado)** | Un audit de tablas registro/crosswalk del monorepo (motivado por encontrar `sector_entity_registry` vacío en radar-ejecucion, ver PV-01) encontró `territory_name_crosswalk` en 0 filas — `npm run crossref:build` nunca se había corrido en este entorno para ningún departamento, tercer caso del mismo patrón ya visto en esta misma app (`infrastructure`, DQ-12) y en `entity_crosswalk` de infobras/compras-publicas antes de su primera corrida. Diferencia importante: esta tabla vacía **no rompe nada** — `GET /crossref/obras` recalcula en vivo (`lookupTerritoryByNames`) cualquier tríada sin entrada en caché, así que el resultado es correcto, solo más lento. El problema real era que, a diferencia de infobras/compras-publicas, esta app no tenía ningún `GET /api/crossref/salud` que lo señalara. Se agregó ese endpoint (mismo patrón, con `sinMatch`/`departamentosConstruidos` adicionales, filtrado por `source='infobras'`) y se corrió `npm run crossref:build` para las 25 jurisdicciones. Verificado en vivo (corte final): **2,020 tríadas, 1,787 confirmadas (88.5%), 0 candidatas, 233 sin match, `departamentosConstruidos: 25`**. |
| **Alias de provincia "PROV CONST DEL CALLAO" (2026-09-13, cerrado)** | Al construir el crosswalk anterior, Callao quedó en 0/7 confirmadas — INFOBRAS reporta su provincia como `"PROV CONST DEL CALLAO"`, `territories.provincia` la tiene como `"CALLAO"` (mismo tipo de alias que `canonicalizarDepartamentoFuente()` ya resuelve a nivel de departamento en infobras, CT-06, pero a nivel de provincia). Se agregó `canonicalizarProvinciaFuente()` (`crossref/territory-lookup.ts`) aplicada en `lookupTerritoryByNames` — el único punto de match, compartido por `GET /crossref/obras` en vivo y por `build-crosswalk.ts` en batch. No se tocó `territories` ni el parseo de GeoServer (ya correctos), ni `departamento`/`distrito` (el alias es solo de provincia). Reconstruido: Callao 0/7 → 7/7 confirmadas. |
| **Bug de la "Ñ" en el XLSX fuente de INFOBRAS/Contraloría (2026-09-13, cerrado)** | El propio archivo que publica INFOBRAS trae la letra "Ñ" reemplazada por un espacio en decenas de provincias/distritos a nivel nacional (verificado inspeccionando el XML crudo del `.xlsx`: 0 ocurrencias de "Ñ" en 726MB de XML, "CA ETE" en vez de "CAÑETE" ya está así en la fuente — no es un bug de nuestro parser). `lookupTerritoryByNames` (`territory-lookup.ts`) agrega `candidatosConNRestaurada()` + `intentarRecuperacionEnye()`: cuando el match exacto falla, prueba variantes con cada espacio interno reemplazado por "N" (no "Ñ" — `territories` ya guarda toda "Ñ" como "N" sin tilde) en distrito, luego provincia, luego ambos combinados (necesario porque casos reales como Cañete corrompen ambos campos a la vez), aceptando la recuperación solo si exactamente un candidato produce exactamente una fila. Verificado en vivo reconstruyendo las 25 regiones: confirmadas nacional 1,787→1,851 (+64), sin_match 233→169 (-64). Límite conocido documentado en el código: una "Ñ" corrompida al *inicio* de un token no es recuperable (el espacio resultante ya se eliminó con `.trim()` antes de llegar a esta función) — sin evidencia de que ocurra hoy (0 casos reales encontrados). |
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

### `ficha-ruc-import.ts` — Ficha individual de RUC (SUNAT)

| | |
|---|---|
| **Descripción** | Trae la ficha completa de un RUC (tipo de contribuyente, nombre comercial, fechas de inscripción/inicio de actividades, actividad económica CIIU principal y secundarias, si es exportador, representantes legales vigentes, comprobantes/emisión electrónica, padrones) — reemplaza al Directorio Nacional de Cooperativas de PRODUCE, que quedó desactualizado (representante legal obsoleto confirmado en vivo). |
| **Qué hace** | Parsea el texto de la ficha (y de la sub-página "Representante(s) Legal(es)") ya extraído por navegador, y hace upsert en `ficha_ruc` + `ficha_ruc_actividades` + `ficha_ruc_representantes`. `GET /api/ficha-ruc` (con `?cultivo=`, `?exportador=true`) y `GET /api/ficha-ruc/:ruc` (ficha completa con actividades y representantes). |
| **Cómo lo hace** | **No es un conector `fetch()` automático** — es el único caso del catálogo. El endpoint de búsqueda (`e-consultaruc.sunat.gob.pe`) exige un token de reCAPTCHA v3 validado en servidor: confirmado en vivo con un POST sin token (error de servidor) y, acto seguido, el IP de origen quedó bloqueado (`net::ERR_CONNECTION_RESET`) específicamente contra ese subdominio — probado también con Playwright (Chromium headless) desde el mismo entorno, mismo bloqueo. La carga es manual: se consulta por navegador real (sesión de usuario, canal no afectado por el bloqueo) y se importa con `npm run import:ficha-ruc -- <archivo.json>`. |
| **Frecuencia** | Manual, por RUC — sin universo completo cargado todavía. |
| **Fuente de datos** | `e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/` — Consulta RUC, SUNAT. |
| **Cobertura real ingerida** | 1 RUC importado en la corrida verificada (`20129156083`), de un universo semilla de 139 (extraído del directorio de PRODUCE antes de eliminarlo, ver `src/ingest/cooperativas-ruc-seed.json`) — cargar el resto requiere repetir la consulta por navegador RUC por RUC. |
| **Anomalía conocida** | `nombre`/`cargo` de representante legal se separan por una lista cerrada de cargos societarios conocidos (no hay delimitador de columna en el texto plano de la tabla fuente) — si el cargo no está en la lista, se conserva sin partir. Ver data contract para las sub-secciones de la ficha aún no investigadas (Deuda Coactiva, Establecimientos Anexos, etc.). |
| **Detalle completo** | [`docs/data-contracts/sunat-ficha-ruc.md`](data-contracts/sunat-ficha-ruc.md) |

### `ruc-consulta-masiva-import.ts` — Consulta Múltiple de RUC (SUNAT)

| | |
|---|---|
| **Descripción** | Tercera fuente de SUNAT, encontrada como alternativa a la ficha individual bloqueada por reCAPTCHA — trae 23 campos por RUC (tipo contribuyente, fechas, ubicación, CIIU principal/secundarios, actividad comercio exterior, Buen Contribuyente, Agentes de Retención/Percepción IGV) sin reCAPTCHA. |
| **Qué hace** | Parsea el .txt delimitado por "\|" que descarga el servicio (hasta 100 RUC por archivo) y hace upsert en `ruc_consulta_masiva`. Tabla separada de `ficha_ruc` (fuentes distintas, columnas parcialmente solapadas). |
| **Cómo lo hace** | **Tampoco es un conector `fetch()` automático todavía** — se confirmó en vivo que este entorno de desarrollo está bloqueado a nivel de todo el dominio `e-consultaruc.sunat.gob.pe` (no solo el endpoint de la ficha individual), así que no se pudo probar si un `fetch()` puro funcionaría desde un origen sin ese bloqueo. Funciona sin problema vía navegador real (sin reCAPTCHA, solo un token CSRF oculto en el formulario). Se importa con `npm run import:ruc-masivo -- <archivo.txt>`. |
| **Frecuencia** | Manual — hasta 10 RUC por ingreso manual en el formulario, hasta 100 por archivo. Ambas variantes confirmadas en vivo; la de archivo se usó para completar los 596 RUC del seed en tandas de 100 (2026-09-19, ver `docs/data-contracts/sunat-consulta-multiple-ruc.md`). |
| **Fuente de datos** | `e-consultaruc.sunat.gob.pe/cl-ti-itmrconsmulruc/jrmS00Alias` — Consulta Múltiple de RUC, SUNAT (enlazada desde `gob.pe/13397`). |
| **Cobertura real ingerida** | 596/596 RUC del seed de cooperativas importados vía la variante de archivo (tandas de 100), 0 rechazados — ver `docs/data-contracts/sunat-consulta-multiple-ruc.md` para el detalle de la corrida inicial de 2 RUC (ACOPAGRO, Chancamayo) y las tandas posteriores. |
| **Anomalía conocida** | CIIU viene como descripción en texto, no como código — no cruza por código exacto contra `ficha_ruc_actividades`. No se determinó si tiene límite de consultas por sesión (solo se probó con 2 RUC). |
| **API expuesta (2026-09-20)** | `GET /api/ruc-consulta-masiva` (filtros: `razonSocial`, `estado`, `departamento`, `provincia`, `distrito`, `buenContribuyente`, paginado) y `GET /api/ruc-consulta-masiva/{ruc}` (detalle, 404 si no fue consultado). Registrada como tools MCP `identidad_fiscal_ruc_consulta_masiva`/`_by_ruc`. |
| **Detalle completo** | [`docs/data-contracts/sunat-consulta-multiple-ruc.md`](data-contracts/sunat-consulta-multiple-ruc.md) |

### `exportaciones-fob-connector.ts` — Exportaciones FOB por RUC (Aduanas-SUNAT)

| | |
|---|---|
| **Descripción** | Trae el valor FOB USD exportado por RUC, agregado por año/mes/aduana/agente de aduana/país de destino — usado para cuantificar exportaciones de las cooperativas del seed en el último año. |
| **Qué hace** | Parsea la tabla HTML de resultados y hace upsert en `ruc_exportaciones_fob`, clave natural `(ruc, anio, mes, aduana_codigo, agente_codigo, pais_codigo)`. `npm run ingest:exportaciones -- "2025,2026"` recorre el seed de cooperativas para los años indicados. |
| **Cómo lo hace** | **A diferencia de las otras 3 fuentes de esta app, sí es un conector `fetch()` automático** — el dominio `aduanet.gob.pe` no está bloqueado para este entorno (confirmado en vivo con `curl` simple, sin sesión ni captcha), a diferencia de `e-consultaruc.sunat.gob.pe`. GET con querystring replicando el formulario `ieITS01Alias` (régimen 40 = exportación definitiva). Los códigos de aduana/agente/mes/año/país se extraen del atributo `onclick` del link "LISTAR" de cada fila (más confiables que el texto visible). |
| **Frecuencia** | Manual (`npm run ingest:exportaciones`). ~400ms de espera entre requests (precaución propia, no un límite confirmado del servidor). |
| **Fuente de datos** | `aduanet.gob.pe/cl-ad-itconsultadwh/ieITS01Alias` — Consulta por Importador/Exportador, Aduanas-SUNAT. |
| **Cobertura real ingerida** | 596 RUC consultados (2025 + 2026 parcial), 63 con exportaciones registradas, 680 filas, 0 errores. US$ 208.8M FOB total en 2025. |
| **Anomalía conocida** | El parámetro `CG_Ano` del formulario no es el año calendario — hay que restarle 1992 (`CG_Ano = añoReal - 1992`, confirmado probando contra resultados conocidos). No trae kilos/peso, solo FOB USD. No se investigó paginación para exportadores de mucho mayor volumen que los de este seed. |
| **API expuesta (2026-09-20)** | `GET /api/exportaciones-fob` (filas a nivel de embarque, filtros `ruc`/`anio`/`mes`/`paisCodigo`, paginado) y `GET /api/exportaciones-fob/resumen/{ruc}` (FOB total y N° de embarques agregado por año, 404 si el RUC no tiene exportaciones). Registrada como tools MCP `identidad_fiscal_exportaciones_fob`/`_resumen`. |
| **Detalle completo** | [`docs/data-contracts/aduanet-exportaciones-fob.md`](data-contracts/aduanet-exportaciones-fob.md) |

### `padron-ppa-connector.ts` — Padrón de Productores Agrarios (MIDAGRI)

| | |
|---|---|
| **Descripción** | Confirma si un RUC (o DNI) está registrado formalmente en el Padrón de Productores Agrarios de MIDAGRI — dato de formalidad agraria, no tributario ni comercial. |
| **Qué hace** | Consulta `Consulta/GetNombreConsulta` y hace upsert en `ruc_padron_ppa` (`ruc`, `registrado`, `nombre_ppa`). `npm run ingest:padron-ppa` recorre el seed de cooperativas. |
| **Cómo lo hace** | GET directo a `gateway.midagri.gob.pe/sisppa` (API ABP Framework) — encontrado por ingeniería inversa del bundle Angular del frontend público (`consultapadron.midagri.gob.pe`). Sin captcha, sin sesión, sin bloqueo de dominio para este entorno. No hay campo booleano explícito: se infiere `registrado` comparando el nombre devuelto contra el sentinel `"-"` (mismo patrón que SUNAT). |
| **Frecuencia** | Manual (`npm run ingest:padron-ppa`). ~300ms de espera entre requests (precaución propia). |
| **Fuente de datos** | `gateway.midagri.gob.pe/sisppa/api/services/app/Consulta/GetNombreConsulta` — Padrón de Productores Agrarios, MIDAGRI. |
| **Cobertura real ingerida** | 596/596 RUC del seed consultados y registrados, 0 errores. |
| **Anomalía conocida** | El endpoint `GetDatosProductor` (que prometía cultivo/hectáreas/ubicación) devuelve siempre `null`, incluso para RUC/DNI confirmados como registrados, y ningún componente de la UI del frontend lo invoca — no se pudo determinar la forma correcta de usarlo, si la tiene. |
| **API expuesta (2026-09-20)** | `GET /api/padron-ppa` (filtro `registrado`, paginado) y `GET /api/padron-ppa/{ruc}` (detalle; 404 si nunca se consultó ese RUC, distinto de `registrado: false`). Registrada como tools MCP `identidad_fiscal_padron_ppa`/`_by_ruc`. |
| **Detalle completo** | [`docs/data-contracts/midagri-padron-ppa.md`](data-contracts/midagri-padron-ppa.md) |

### `oece-ficha-connector.ts` — Ficha Única del Proveedor (OECE, ex-OSCE)

| | |
|---|---|
| **Descripción** | Conformación societaria/directiva completa (representantes legales y Consejo de Administración, con DNI y cargo de cada persona) más un snapshot fresco de datos SUNAT y contacto (teléfono/email) — para RUC inscritos en el Registro Nacional de Proveedores del Estado. |
| **Qué hace** | Consulta `ficha-proveedor-cns/1.0/ficha/{ruc}/resumen` (ficha + conformación) y `perfilprov-bus/1.0/ficha/{ruc}` (contacto), hace upsert en `ruc_oece_ficha` y `ruc_oece_personas` (una fila por persona, `rol` distingue REPRESENTANTE/ORGANO_ADMINISTRACION/SOCIO). `npm run ingest:oece-ficha` recorre el seed de cooperativas. |
| **Cómo lo hace** | GET directo a `eap.oece.gob.pe` — encontrado inspeccionando las llamadas de red del frontend público (`apps.oece.gob.pe/perfilprov-ui`). Sin captcha, sin sesión, dominio no bloqueado para este entorno. |
| **Frecuencia** | Manual (`npm run ingest:oece-ficha`). ~300ms de espera entre requests (precaución propia). |
| **Fuente de datos** | `eap.oece.gob.pe/ficha-proveedor-cns` y `eap.oece.gob.pe/perfilprov-bus` — Buscador de Proveedores del Estado, OECE. |
| **Cobertura real ingerida** | 596/596 RUC del seed responden `datosSunat` (eco de SUNAT, no implica registro RNP), pero solo **155/596 (26%) están realmente inscritos en el RNP** (`codigo_registro` no nulo), y solo **139/596 tienen al menos 1 persona** registrada — 815 filas en total, 0 errores. |
| **Anomalía conocida** | `datosSunat` responde para cualquier RUC válido esté o no en el RNP — solo `conformacion.proveedor.codigoRegistro` confirma inscripción real; filtrar por ese campo, no por la sola presencia de fila en `ruc_oece_ficha`. `socios` casi siempre vacío para cooperativas (modelo pensado para S.A.C./S.R.L., aunque sí apareció poblado en 36 filas de otras personerías del seed) — el parser lo soporta por simetría con `representantes`/`organosAdm`. `antecedentes` (sanciones/inhabilitaciones) no se ingiere a propósito — ya cubierto por [`proveedores-sancionados`](#proveedores-sancionados). |
| **API expuesta (2026-09-20)** | `GET /api/oece-ficha` (filtros `razonSocial`, `departamento`, `inscritoRnp`, paginado — cada fila ya trae `inscritoRnp` derivado de `codigoRegistro`) y `GET /api/oece-ficha/{ruc}` (ficha + `personas[]` con rol/DNI/cargo). Registrada como tools MCP `identidad_fiscal_oece_ficha`/`_by_ruc`. |
| **Detalle completo** | [`docs/data-contracts/oece-ficha-proveedor.md`](data-contracts/oece-ficha-proveedor.md) |

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
| **Cruce candidato↔sanción (OE-03, 2026-09-10)** | `GET /api/crossref/candidatos-sancionados?departamento=X` (o `?dni=a,b,c`) — generaliza el patrón anterior para aceptar candidatos de [`candidatos-erm`](#candidatos-erm) en vez de solo personas ya sancionadas: para cada DNI, busca vínculos societarios (`supplier_conformacion`) y sanciones directas (`inhabilitaciones`/`multas` por DNI del propio candidato), y además revisa si el RUC de cada empresa vinculada tiene sus propias sanciones (`empresaTieneSancion`) — sin fusionar ambas cosas en una sola categoría de "hallazgo", tal como pedía el ticket. Reemplaza el script de Node ad-hoc usado el 2026-09-10 antes de que existiera este endpoint. Verificado en vivo, reproduce exactamente los mismos casos encontrados a mano ese día: La Libertad 4,637 candidatos revisados → 6 resultados (3 con sanción directa, 3 con vínculo sin sanción en la empresa); Lima 12,770 revisados → 9 resultados (7 con sanción directa, 3 de ellas vigentes hoy; 2 con vínculo sin sanción). |
| **Señal de sancionado recurrente (OE-04, 2026-09-10)** | `GET /api/crossref/sancionado-recurrente?minResoluciones=2&ventanaDias=180` (ambos con default) — agrupa `inhabilitaciones` por RUC y marca los que tienen `minResoluciones` o más resoluciones distintas cuyo rango completo (primera a última fecha `desde`) cae dentro de `ventanaDias`. Formaliza el patrón encontrado a mano el 2026-09-10 en el cruce de Lima (Serpaem S.A.C., Mejesa S.R.L., Protektor Seguridad Integral S.A.C.). Verificado en vivo contra el registro nacional completo (1993–2026): los 3 casos ya conocidos aparecen con los mismos números exactos (Serpaem 4 resoluciones/142 días, Mejesa 2/81 días, Protektor 2/22 días) dentro de **637 resultados a nivel nacional** con los parámetros por defecto — un universo bastante más grande que los 3 casos encontrados a mano en un solo departamento, sin analizar todavía (fuera del alcance de este ticket, que es de infraestructura, no de investigación). Mismo criterio de todo el catálogo de señales: preselección para revisión humana, no una conclusión de patrón de conducta — el propio `explicacion` de cada resultado lo dice explícitamente. |
| **Vigilancia de casos nuevos (PV-05/PV-06, 2026-09-12)** | `GET /api/crossref` ya no es solo una foto: una tabla nueva (`sanciones_contratos_vistos`, `UNIQUE(ruc, referencia_contrato)`) recuerda cada par proveedor-contrato con inhabilitación vigente que ya se vio en una corrida anterior. Cada llamada hace `INSERT ... ON CONFLICT DO NOTHING RETURNING` (atómico, sin condición de carrera entre corridas concurrentes) y expone `esNuevoDesdeUltimaCorrida` en cada resultado. `departamento=TODOS` agrega `awards`+`minor_contracts` a nivel nacional en una sola consulta (sin loop de 25 llamadas por región); combinado con `soloNuevos=true`, el endpoint deja de repetir los casos ya conocidos y solo devuelve lo que cambió desde la última vez que alguien lo corrió — el punto de entrada recomendado para vigilancia. **No envía notificaciones** (correo/Slack/webhook): es un endpoint de consulta, el canal de entrega es un ticket de seguimiento aparte (`PRD_Propuesta_Valor_Bajo_Esfuerzo_v1.md`, fuera de alcance §9). Verificado en vivo: con la tabla vacía, `GET /api/crossref?departamento=TODOS&soloInhabilitados=true` devuelve 346 adjudicaciones (proveedor×contrato) con inhabilitación vigente a nivel nacional, las 346 marcadas nuevas; corriendo el mismo request otra vez, `soloNuevos=true` devuelve 0 — nada cambió desde la corrida anterior. **Limitación conocida (revisión de código, 2026-09-12):** `departamento=TODOS` trae `awards`+`minor_contracts` completos a memoria sin `LIMIT` ni paginación — a un volumen nacional mucho mayor, esto puede degradar latencia/memoria por request; decisión de escalabilidad pendiente de evaluar antes de exponer este modo sin control de acceso adicional, no un defecto de corrección. |
| **Cruce por sector/pliego — `buyerIds` (2026-09-17)** | `GET /api/crossref?buyerIds=<lista separada por comas>` — cruce de un sector de Gobierno Nacional completo (ministerio + organismos adscritos) por `awards.buyer_id` en vez de por `departamento`: un ministerio y sus adscritos no tienen una sede regional única, así que `departamento`/`TODOS` no los agrupa como conjunto. Tiene prioridad sobre `departamento` cuando ambos están presentes, y omite `minor_contracts` (contratos menores son de gobierno local/municipal — un `buyer_id` de Gobierno Nacional no tiene filas ahí, evita un `WHERE` que nunca matchea). Sin `entity_crosswalk` de por medio: los `buyer_id` se verifican a mano contra `awards.buyer_name` real, no por fuzzy-match automático — más confiable para un puñado de entidades conocidas. **Sector PRODUCCIÓN, verificado en vivo (2026-09-17):** `PE-CONSUCODE-200018` (Ministerio de la Producción), `PE-CONSUCODE-1983` (ITP), `PE-CONSUCODE-1915` (FONDEPES), `PE-CONSUCODE-1959` (IMARPE), `PE-CONSUCODE-201345` (SANIPES, nombre real en OECE: "Organismo Nacional de Sanidad Pesquera"), `PE-CONSUCODE-201285` (Innóvate Perú). Corrida con `soloInhabilitados=true&soloLectura=true`: 3 adjudicaciones con proveedor actualmente inhabilitado (FONDEPES→Servicios Generales Jannet y Daniel S.A.C., Ministerio→Estación de Servicios San José S.A.C., ITP→Oriente Security Corporation S.A.C.), las 3 con `inhabilitadoEnFechaAdjudicacion: false` — la sanción vigente hoy empezó después del contrato, no hay caso confirmado de contratación durante inhabilitación activa. **Limitación conocida:** solo cruza `inhabilitaciones`, no `multas` — un proveedor con multa vigente (impaga) pero sin inhabilitación activa no aparece aquí (caso real encontrado a mano: CIMATEC S.A.C., RUC 20100042500, multa vigente desde 2026-08-24, 3 contratos con ITP en 2026). **Multas sumadas al mismo cruce (2026-09-17):** `tieneMultaVigente`, `multasEncontradas`, `montoMultasTotal` (histórico) y `montoMultasVigente` (solo impagas) en cada resultado, más el filtro `soloMultados=true` — análogo a `soloInhabilitados` pero independiente, porque una multa vigente significa "impaga", no "prohibido contratar" (no se fusiona con `tieneInhabilitacionVigente` ni participa en `sanciones_contratos_vistos`). Sin chequeo temporal tipo `inhabilitadoEnFechaAdjudicacion`: `multas.desde`/`hasta` (periodo_suspension) casi siempre vienen vacíos en la fuente real. Caso real encontrado antes de este cambio y ahora visible en el mismo cruce: CIMATEC S.A.C. (RUC 20100042500), S/33,152.58 en multas históricas, S/26,315.67 vigentes (impagas), 3 contratos con ITP en 2026. 3 tests nuevos, suite completa de la app en 44/44. |
| **Alerta de velocidad sanción→contrato (2026-09-21)** | `GET /api/crossref/velocidad-sancion-contrato?ventanaDiasPostSancion=90` (default) — originada en un hallazgo real analizando contratos MINSA 2026: LABORATORIOS UNIDOS S.A. (RUC 20417180134) recibió S/ 600,000 del MINISTERIO DE SALUD el 2026-08-31, con inhabilitación OSCE VIGENTE desde el 2026-07-08 (Res. 6898-2026-TCP-S1) — un contrato adjudicado **durante** una sanción activa. Este endpoint generaliza el hallazgo a nivel nacional (default `departamento=TODOS`, a diferencia de `crossref` que por defecto es La Libertad — el objetivo es un radar completo, no un reporte regional) y agrega una segunda severidad que `crossref` no distinguía explícitamente: `POCO_DESPUES_DE_SANCION`, contratos adjudicados dentro de una ventana configurable después de que la inhabilitación terminó (proveedores que esperan a que expire la sanción). Reutiliza `vigenteEnFecha`/`extractRuc` de `@appsperu/shared-identity`, mismo cruce `awards`+`minor_contracts`×`inhabilitaciones` por RUC que `crossref`, pero sin la lógica de `sanciones_contratos_vistos` (es una vista de alerta ordenada por severidad, no un tracker de "nuevo desde la última corrida"). **Verificado en vivo (2026-09-21, alcance nacional):** 67 alertas — 3 casos `DURANTE_SANCION_VIGENTE` (incluido el caso real de origen) y 64 `POCO_DESPUES_DE_SANCION`, ordenadas por severidad y luego por proximidad (menos días desde el fin de la sanción, primero). Con `departamento=LA LIBERTAD`: 2 alertas. **Optimización real (hallazgo de CodeRabbit):** la primera versión consultaba TODOS los `awards`+`minor_contracts` (108,133 filas a nivel nacional: 48,761 + 59,372, verificado en vivo) y recién después miraba qué RUC tenían sanción — costo proporcional a todo el corpus de contratos, no a las alertas reales. Se invirtió el orden: primero se trae el universo de RUC sancionados (7,114 distintos con `inhabilitaciones.desde IS NOT NULL`), y se filtran `awards`/`minor_contracts` por ese universo (`supplier_id = ANY(...)`/`winning_supplier_id = ANY(...)`, derivando `PE-RUC-<ruc>` y `seace:ruc:<ruc>` respectivamente) antes de traerlos a memoria — mismas 67 alertas, mismo resultado, verificado en vivo tras el cambio. 10 tests nuevos, suite completa de la app en 75/75. |

### `oece-inhabilitaciones-judiciales-connector.ts` — Inhabilitaciones por mandato judicial (2026-09-20)

| | |
|---|---|
| **Descripción** | Inhabilitaciones para contratar con el Estado dictadas por el **Poder Judicial** (no por el Tribunal de Contrataciones) — base legal distinta a `inhabilitaciones`/`multas` de arriba. Comunicadas a OSCE/OECE para su registro en el RNP. |
| **Qué hace** | Resuelve la URL de descarga vía la API REST pública de Confluence (no CKAN), parsea el CSV separado por `\|` y hace upsert por `(ruc_dni, numero_resolucion, fecha_inicio)` en `inhabilitaciones_judiciales`. Filas con estructura rota o con `fecha_inicio` posterior a `fecha_fin` se rechazan y cuentan en `inhabilitaciones_judiciales_rejected`, no se adivinan. |
| **Cómo lo hace** | El dataset "Inhabilitaciones por mandato judicial vigentes [OECE]" en `datosabiertos.gob.pe` **no resuelve vía CKAN `package_show`** — su recurso "CSV" declarado en la ficha del portal es en realidad un enlace a una página de Confluence de OSCE (`osce-gob-pe.atlassian.net`), y el CSV real vive como adjunto de esa página. Se resuelve en 2 pasos, sin autenticación: `GET /wiki/rest/api/content/{pageId}/child/attachment` (lista adjuntos, se busca por `title` exacto, nunca por posición en el array) → `GET` al `_links.download` de ese adjunto, que Confluence redirige (302) hacia una URL firmada y temporal de `api.media.atlassian.com` (no se puede hardcodear, se resuelve en cada corrida). El archivo viene codificado en Latin-1 (mismo defecto de fuente ya encontrado en `sanciones-connector.ts`) — se decodifica el buffer crudo explícitamente, si no los nombres con tilde/Ñ llegan corruptos. |
| **Frecuencia** | Manual (`npm run ingest:oece-inhabilitaciones-judiciales`). Snapshot completo del CSV en cada corrida. |
| **Fuente de datos** | Dataset: `datosabiertos.gob.pe/dataset/inhabilitaciones-por-mandato-judicial-vigentes-organismo-especializado-para-las` (OECE, actualización mensual desde 2021-07-26). Archivo real: adjunto `inhabilitaciones_judiciales.csv` de la página Confluence `osce-gob-pe.atlassian.net/wiki/spaces/PNDA/pages/106889261`. |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-20 (corte de la fuente: 2026-09-01): **14/15 filas aceptadas, 1 rechazada** (`CHOQUE QUISPE YIMMY RICHARD`, `fecha_inicio` 2027-12-18 posterior a `fecha_fin` 2023-12-18 — invertidas en la fuente). Universo nacional completo del corte publicado — no es un subconjunto. |
| **Anomalía conocida** | La columna fuente `RUC_DNI` mezcla formatos: RUC-10 (persona natural, 11 dígitos), RUC-20 (empresa, 11 dígitos, ej. `ROCA INGENIERIA DE LA CONSTRUCCION SAC`), y al menos 1 fila con solo 10 dígitos (`JOSÉ ANTONIO CORONADO HURTADO`) que no calza ningún formato estándar — se guarda tal cual, sin forzar. `dni` (columna generada) solo se deriva del caso RUC-10 exacto, igual que `inhabilitaciones.dni` (migración 002) — el resto queda `NULL`. |
| **API expuesta** | `GET /api/inhabilitaciones-judiciales` (filtros `rucDni`/`dni`, paginado). Registrada como tool MCP `proveedores_sancionados_inhabilitaciones_judiciales`. |
| **Cruce doble inhabilitación (2026-09-21)** | `GET /api/crossref/doble-inhabilitacion` — JOIN real (no crosswalk fuzzy) contra `inhabilitaciones` (Tribunal de Contrataciones, misma app/base) por `dni` (columna generada) o `ruc` exacto: ¿qué proveedor/persona tiene sanción administrativa Y orden judicial simultáneas? `ambasVigentesHoy` usa `vigenteEnFecha` (rango real `[desde,hasta]`), no solo el campo `estado` de la fuente. Tool MCP `proveedores_sancionados_doble_inhabilitacion`. Verificado en vivo: **0 coincidencias** contra el universo judicial actual (14 filas) — resultado esperado dado lo chico del universo judicial, no un error del cruce. |
| **Detalle completo** | [`docs/data-contracts/oece-inhabilitaciones-judiciales.md`](data-contracts/oece-inhabilitaciones-judiciales.md) |

**Fuera de alcance, documentado como brecha declarada, no resuelto:** ~9% de los proveedores de PRODUCE (16 de 178 en la muestra 2026) contratan como consorcio — ni OECE/OCDS ni ninguna fuente ya ingerida en el proyecto expone las empresas que integran un consorcio (confirmado inspeccionando el JSON crudo de `raw_ocds_batches`: el consorcio es una entidad atómica con su propio `PE-RUC-<código interno>`, sin campo de composición). RNP sí publica participación en consorcio por RUC individual, pero no un lookup inverso "código de consorcio → integrantes"; cerrarlo requeriría un scraper nuevo del mismo tipo de fragilidad ya documentado para `legacy-seace-orders-connector.ts`, evaluado y descartado por ahora frente al beneficio acotado. |

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
| **Sin cobertura de homicidios (DQ-15, 2026-09-08)** | El dataset SIDPOL no incluye "Homicidio" como modalidad — verificado contra las 369,100 filas completas (todo el Perú, 2018-2026): existen exactamente 7 modalidades (Otros, Violencia contra la mujer e integrantes, Hurto, Robo, Estafa, Extorsión, Secuestro). No es un defecto del conector — SIDPOL registra *denuncias*, y un homicidio se investiga de oficio, no por denuncia. INEI publica tasas de homicidio, pero solo a nivel departamental y como reporte PDF periódico, no como dataset distrital descargable. Candidato sin verificar: `[MPFN] Delitos` (Ministerio Público, `datosabiertos.gob.pe`) — reportaría "homicidio doloso" por **distrito fiscal** (circunscripción judicial, ~34 en el país, más fino que departamento pero no equivalente a distrito/provincia administrativo) — no se pudo inspeccionar el archivo real en esta evaluación (el dominio no resolvió por DNS desde este entorno). |

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
| **Nivel de gobierno, territorio y ranking por cohorte (SI-01/SI-02, 2026-09-07)** | `GET /api/score` expone `nivelGobierno`/`provincia`/`distrito` por entidad (mismo JOIN a `territories` que la query ya hacía, solo faltaba seleccionarlo — mismo patrón que DQ-02 en `radar-ejecucion`) y `rankingEnNivelGobierno: {posicion, total}`, calculado sobre las entidades de su misma cohorte de nivel de gobierno con score disponible. Entidades sin score no reciben ranking. |
| **Componente de ejecución ya no imputa 0 por PIM=0 (SI-08, 2026-09-08)** | `score/compute.ts` calculaba el componente de ejecución con `pct(devengado, pim) ?? 0` — si `pim` era exactamente 0 (fila de ejecución existente pero sin presupuesto modificado registrado, no lo mismo que "sin dato"), el `?? 0` convertía el `null` de `pct()` en un 0 literal marcado `disponible: true`, violando la regla del propio código de nunca imputar 0 ni 100 por ausencia. Corregido: ahora exige `pim > 0` para calcular el componente. Impacto real verificado: Municipalidad Provincial de Trujillo pasó de 64.2 a **80.2** (con el falso 0% de ejecución excluido en vez de arrastrar el promedio), Municipalidad Distrital de El Porvenir de 54.8 a **68.5**, Florencia de Mora de 60.6 a **75.7**. |
| **`GET /api/score/por-provincia` (SI-03, 2026-09-08)** | Promedio de `scoreCompuesto` por provincia (solo entidades con score disponible), reutilizando el mismo cálculo que `GET /api/score` (extraído a `computeScoresForDepartamento()`, no una query nueva). Cada provincia trae `entidadesConScore`/`entidadesSinScore`; si ninguna entidad de la provincia tiene score, queda `promedioScore: null, sinDatos: true` — nunca un 0 engañoso. Verificado en vivo: 12 provincias de La Libertad, ej. Pataz 62.6 (15 entidades con score), Trujillo 61.1 (34 con score, 1 sin score). |
| **`banda` cualitativa (SI-04, 2026-09-08)** | Cada resultado con `scoreCompuesto` no nulo trae `banda: "Sobresaliente"\|"Alto"\|"Medio"\|"Bajo"\|"Crítico"` — 5 bandas con umbrales fijos en `score/compute.ts` (percentiles reales de la distribución de La Libertad, confirmados por el usuario el 2026-09-07, re-verificados tras SI-08 el 2026-09-08 sin necesidad de recalcular — la distribución apenas se movió). `scoreCompuesto: null` recibe `banda: null`. Detalle completo con los umbrales exactos: [`docs/data-contracts/salud-institucional-score.md`](data-contracts/salud-institucional-score.md#bandas-cualitativas-si-04-esquema-confirmado-2026-09-07-implementado-2026-09-08). |
| **`advertencias.obrasConDistritoSospechoso` (SI-09, 2026-09-09)** | Cada resultado trae `advertencias: {obrasConDistritoSospechoso}` — cuenta de obras (vía el mismo crosswalk que ya alimenta `obrasNoParalizadas`) marcadas `distrito_sospechoso: true` en INFOBRAS (DQ-14). `null` cuando la entidad no tiene obras cruzadas, nunca `0` falso. Nunca pesa en `scoreCompuesto` ni en ningún componente — es señal de calidad de dato, no del cálculo. Se evaluó agregar variables nuevas directo al score compuesto y se descartó: recalibraría las bandas de SI-04 y rompería la comparabilidad histórica; exponerlas aparte, sin pesar, sigue el mismo patrón que ya usa `distrito_sospechoso` en la propia API de `infobras`. Verificar en vivo esta advertencia encontró DQ-17 (crosswalk que cruza entidades de departamentos distintos) — ver `docs/TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md`. |
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

### `cenares-connector.ts`

| | |
|---|---|
| **Descripción** | Trae el seguimiento de distribución de medicamentos e insumos del CENARES (Centro Nacional de Abastecimiento de Recursos Estratégicos, MINSA) hacia establecimientos de salud — qué ítem, cuánta cantidad, a qué destino, y en qué estado de despacho. Cierra parcialmente el hueco de "disponibilidad de medicamentos" (no es lo mismo que el indicador DME del Observatorio SISMED, que quedó descartado por no ser automatizable — ver `docs/data-contracts/sismed-observatorio-disponibilidad.md`). |
| **Qué hace** | Resuelve el único recurso CSV del dataset vía `package_show` de CKAN (mismo cliente compartido que RENIPRESS), lo descarga e inserta completo en `cenares_distribucion`. Sin upsert: no hay clave natural confiable (`NRO_CD` se repite entre ítems de un mismo cuadro de distribución) — cada ingesta es un snapshot completo, deduplicado a nivel de lote por `checksum` del contenido en `raw_cenares_batches` (si el archivo no cambió desde la última corrida, no vuelve a insertar). |
| **Cómo lo hace** | Descarga HTTP directa (59,039 filas, ~12 MB — no requiere streaming), mismo `User-Agent` de navegador obligatorio que RENIPRESS/INFOMIDIS (WAF de `datosabiertos.gob.pe`). CSV delimitado por `;`, **encoding Latin-1** (a diferencia de RENIPRESS, que es UTF-8 con BOM) — confirmado en vivo, tildes/Ñ corrompen bajo lectura UTF-8 ingenua. `relax_column_count` en el parser: al menos una fila real trae texto libre en `OBSERVACION` con `;` embebidos que rompen el conteo estricto de columnas si se parsea a mano (confirmado comparando un `awk` naive contra `csv-parse` real: 120 filas quedaban mal clasificadas por `SITUACION` con el split naive). |
| **Frecuencia** | Manual (`npm run ingest:cenares` en `apps/servicios-salud/api`). El dataset es un corte de 2024 sin indicios de actualización periódica (a diferencia de RENIPRESS, mensual) — `metadata_modified` en CKAN cambió más recientemente que los datos mismos, no asumir que "se tocó" significa "hay filas nuevas". |
| **Fuente de datos** | `datosabiertos.gob.pe` (PNDA), dataset `seguimiento-de-distribución-de-medicamentos-del-centro-nacional-de-abastecimiento-en-0` — CENARES/MINSA. |
| **Cobertura real ingerida** | Nacional, 59,039 filas confirmadas en la corrida verificada (2026-09-19), 0 rechazadas. 2,883 filas mencionan "LA LIBERTAD"/"TRUJILLO" en `destino` (texto libre, no UBIGEO estructurado). |
| **Anomalía real encontrada** | **85% de las filas (50,404) están en `SITUACION = 'ELABORANDO PECOSA'`** (orden de despacho en preparación) — solo 335 llegaron a `ENVIADO A ALMACEN`. El dataset documenta el flujo interno de gestión de CENARES, no necesariamente la entrega confirmada al establecimiento; no asumir que una fila = medicamento ya recibido. |
| **Cruces** | Ninguno implementado — candidato natural: por texto de `destino` contra `ipress.nombre` (sin ubigeo estructurado en CENARES, sería fuzzy, no exacto). |
| **Detalle completo** | [`docs/data-contracts/cenares-distribucion.md`](data-contracts/cenares-distribucion.md) |

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
| **Límite confirmado (OE-06, 2026-09-10)** | Esta app **no tiene, y nunca tuvo, datos de capacidad o brechas militares** (equipamiento, cobertura territorial, dotación operativa de las FF.AA.). Cubre exactamente tres cosas: diplomacia de defensa (compensación industrial), capacitación en el exterior y misiones de paz — nada de eso mide una "brecha". Se investigó explícitamente el 2026-09-10 (a raíz de una pregunta directa del usuario) si existe alguna fuente abierta oficial peruana con ese tipo de dato: no se encontró ninguna. Si se vuelve a pedir un análisis de "brechas de defensa", la respuesta correcta es esta nota, no una nueva investigación desde cero. |

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

<a id="renamu"></a>
## renamu — Registro Nacional de Municipalidades (INEI, datos abiertos)

Investigado 2026-09-06 (Fase 0) y construido el mismo día. Único conector del catálogo que mide
**capacidad institucional declarada por la propia municipalidad**, no ejecución de gasto — todas
las demás apps miden presupuesto/obras/compras, ninguna mide si la municipalidad tiene los
recursos operativos para gestionar. Encuesta censal anual del INEI, universo nacional completo
(1,891 municipalidades, no una muestra).

### `renamu-connector.ts`

| | |
|---|---|
| **Descripción** | Identificación de municipalidades (ubigeo, departamento, provincia, distrito, tipo) y su equipamiento operativo: vehículos (ambulancia, volquete, camión recolector de basura, camión cisterna, grupo electrógeno, panel solar, etc.) con conteo de unidades operativas/no operativas, y conectividad (líneas telefónicas fijas/móviles, internet, tipo de conexión). |
| **Qué hace** | Descarga el ZIP anual, extrae el único CSV que contiene, hace upsert en `renamu_municipalidades` (identificación) y en dos tablas relacionadas: `renamu_vehiculos` (formato largo, un registro por municipalidad × tipo de bien) y `renamu_conectividad` (un registro por municipalidad). |
| **Alcance deliberadamente parcial (decisión de diseño, no de tiempo)** | El diccionario de variables real (52 páginas, formato de tabla que se linealiza fuera de orden al extraer texto de PDF) reveló que el **Módulo I completo** de la fuente (datos generales) mezcla campos institucionales con datos de **persona natural del alcalde** (nombres, apellido paterno, apellido materno, sexo, teléfono móvil personal, correo electrónico personal) en el mismo bloque de columnas (`P04`-`P10`). No fue posible mapear con certeza qué código exacto corresponde a cada campo del alcalde a partir del PDF — en vez de arriesgar ingerir PII sin saberlo con certeza, **se excluyó el módulo completo**, nunca se leyó ni se persistió. Solo se ingiere el Módulo II (equipamiento y TIC), y dentro de este solo los bloques de vehículos (`P11A`), telefonía (`P12`) e internet (`P14`) — se dejó fuera maquinaria pesada (`P11B`), computadoras por tipo de procesador (`P13`) y equipos de oficina (`P15`) para la primera versión. Módulos III (Recursos Humanos), IV (Competencias) y V (Servicios Públicos) no explorados todavía. |
| **Cómo lo hace** | Descarga HTTP directa con `User-Agent` de navegador, desde una URL resuelta contra un mapa explícito `KNOWN_ZIP_URLS: Record<año, url>` — **la URL de descarga NO sigue un patrón estable entre años** (hallazgo real de la auditoría de frescura 2026-09-06, ver abajo), así que se verifica y se agrega a mano cada año nuevo en vez de asumir una plantilla. El ZIP se descomprime en memoria (`unzipper`, mismo paquete que ya usa `identidad-fiscal` para el Padrón RUC) buscando el primer `.csv` — el nombre de la carpeta interna cambia entre años, no se asume una ruta fija. CSV delimitado por `;`, BOM UTF-8. **Hallazgo de ingeniería real**: una lectura ingenua del diccionario de variables sugería que `P14A_1` era el tipo de conexión a internet y `P14A_2` la cantidad de computadoras — verificado contra filas reales del CSV 2026-09-06, el orden es el inverso (`P14A_1` = cantidad de computadoras, `P14A_2` = código de tipo de conexión). El diccionario en PDF no es una fuente confiable para el orden exacto de columnas relacionadas; solo los datos reales lo son. |
| **Frecuencia** | Manual (`npm run ingest:renamu -- <año>`, por defecto el año más reciente confirmado en `KNOWN_ZIP_URLS`). Snapshot completo del año pedido en cada corrida — la fuente publica un corte anual, con rezago de varios meses. |
| **Fuente de datos** | `datosabiertos.gob.pe` (dataset `registro-nacional-de-municipalidades-renamu-<año>-...`, publicador INEI) para el metadato/diccionario; descarga real del ZIP en `KNOWN_ZIP_URLS` — confirmado: 2024 en `inei.gob.pe/media/DATOS_ABIERTOS/RENAMU/DATA/2024.zip`, **2025 en `proyectos.inei.gob.pe/iinei/srienaho/descarga/CSV/984-Modulo1963.zip`** (dominio y ruta totalmente distintos — el slug de 2024 ni siquiera resuelve por `package_show` con el mismo método que sí funcionó para 2025). |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-06 contra los años 2024 y 2025: **1,891 municipalidades cada año, 0 filas rechazadas** — universo nacional completo. Auditoría de frescura de datos (2026-09-06): se detectó que el corte 2025 ya estaba publicado y no se había ingerido — corregido el mismo día, ver [`docs/data-contracts/inei-renamu-municipalidades.md`](data-contracts/inei-renamu-municipalidades.md#actualización-de-frescura-de-datos-2026-09-06-auditoría-posterior). |
| **Detalle completo** | [`docs/data-contracts/inei-renamu-municipalidades.md`](data-contracts/inei-renamu-municipalidades.md) |
| **Cruces** | `GET /api/crossref` (2026-09-20) — inversión pública ejecutada POR el gobierno local (`investments` de [`radar-inversiones`](#radar-inversiones), `nivel='GL'`) contra capacidad institucional real de esa misma municipalidad (¿tiene vehículo operativo?, ¿tiene internet?), agregado por ubigeo exacto. Se filtra a `nivel='GL'` a propósito: mide la capacidad de LA MUNICIPALIDAD misma, no cualquier inversión nacional/regional que caiga en su distrito. Marca `puntoCiego=true` cuando hay inversión GL real pero sin vehículo operativo ni internet (o sin registro RENAMU). Verificado en vivo 2026-09-20: en LA LIBERTAD, 84 distritos con inversión GL, **1 punto ciego real** — Paranday (Otuzco), S/45.2M ejecutados sin vehículo operativo ni internet. `investments` (nivel=GL) no tiene cobertura nacional — solo 374 distritos (LIMA, LA LIBERTAD, AREQUIPA) de los 1,891 de RENAMU, expuesto en `coberturaInversion` de la respuesta. Se excluyen registros con `distrito='- TODOS -'` (18 de 24,644 filas GL en la fuente): son agregados provinciales/departamentales, no distritos reales, y generaban falsos puntos ciegos. |
| **`GET /api/municipalidades` — año vigente por defecto (DQ-16, 2026-09-08)** | Aceptaba `anio` como filtro opcional pero no filtraba al año más reciente por defecto — con 2 años ingeridos (2024, 2025), cada municipalidad aparecía duplicada una vez por año (Pataz: 26 filas en vez de 13). El endpoint hermano `GET /api/equipamiento` ya filtraba correctamente (`ORDER BY anio DESC LIMIT 1` por ubigeo) desde el inicio. Ahora `GET /api/municipalidades` filtra por defecto a `MAX(anio)`, igual que DQ-03/DQ-04; `historico=true` o `anio=YYYY` recuperan el comportamiento multi-año. Verificado en vivo: La Libertad pasa de 168 a **84** filas (una por municipalidad). |

---

<a id="autoridades-electas"></a>
## autoridades-electas — Autoridades proclamadas (JNE, datos abiertos)

Investigado y construido 2026-09-06, junto con `renamu`, tras el inventario "entidad por
entidad" del catálogo. Hallazgo central que cambió el alcance planeado en la Fase 0: el dataset
del JNE en la PNDA existe en **dos variantes con esquema distinto** — se auditaron ambas antes de
elegir cuál ingerir.

### `autoridades-connector.ts`

| | |
|---|---|
| **Descripción** | Autoridades proclamadas por el JNE — nombre, cargo, organización política, ubigeo, periodo de mandato. Verificado en vivo que **no son candidatos**: `pronunciamiento` es un acta de proclamación oficial real (ej. "ACTA PROCLAMACIÓN N° 00001"), con `fecha_inicio_vigencia`/`fecha_fin_vigencia` de mandato real (2026-2031 en el corte verificado) — la ambigüedad "candidato vs. electo" marcada como crítica en la Fase 0 quedó resuelta leyendo el archivo real, no el snippet de búsqueda que la había originado. |
| **Qué hace** | Resuelve el recurso "actual" del dataset vía CKAN `package_show` (filtrando por título de recurso, no por nombre de archivo — el nombre de archivo cambia de fecha en cada corte), lo descarga y hace upsert en `autoridades_electas`. |
| **Decisión de alcance: dos variantes del mismo dataset, se ingiere solo una** | El JNE publica el mismo tipo de dato en dos recursos con esquema incompatible: (1) el recurso "actual" (`Dataset Reporte Autoridades Electas JNE (actualizado al <fecha>)`), esquema con columnas `TX*`/`NU*`/`FE*`, **sin documento de identidad** — verificado en vivo 2026-09-06: 208 filas, autoridades nacionales (Presidencia, Senado, Diputados, Parlamento Andino) de "Elecciones Generales 2026"; (2) un recurso histórico fechado (`Autoridades Electas actualizado al 13 de noviembre del 2025`), esquema sin prefijo `TX` (`NOMBRES`, `CARGO`, etc.), **con `DOCUMENTOIDENTIDAD` (DNI) sin enmascarar**, 39,342 filas históricas 2014-2022 de autoridades regionales/municipales (ej. "REGIDOR DISTRITAL"). Se ingiere únicamente el recurso (1) — el (2) queda fuera de esta versión por su mayor riesgo de PII (DNI sin enmascarar) y por requerir un normalizador de esquema distinto; no se toca hasta tener su propia revisión de enmascarado, mismo estándar que ya aplican `perfilprov-conformacion` y el cruce por DNI de `proveedores-sancionados`. |
| **Cómo lo hace** | CKAN `package_show?id=autoridades-electas-jne` (nota real: `result` es un **array** en este dataset, no un objeto — distinto de otros `package_show` del catálogo; y el campo `format` del recurso reporta `.xlsx` para un archivo que en realidad es un `.xls` binario legado, confirmado por firma de archivo — no confiar en ese campo, filtrar por título). Descarga y parseo con `xlsx` (SheetJS, único conector del catálogo que necesita leer `.xls` legado además del ZIP de `identidad-fiscal` — `exceljs`, usado en `mindef`/`actividad-empresarial`, no soporta el formato binario antiguo). |
| **Frecuencia** | Manual (`npm run ingest:autoridades` en `apps/autoridades-electas/api`). Snapshot completo del recurso "actual" en cada corrida — la fuente lo reemplaza (no acumula) en cada actualización del JNE. |
| **Fuente de datos** | `datosabiertos.gob.pe`, dataset `autoridades-electas-jne` (JNE) — no la SPA de Infogob (`infogob.jne.gob.pe`), que no devuelve contenido a un fetch sin ejecutar JavaScript. |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-06: 208 filas, 0 rechazadas — universo completo del corte actual (solo autoridades **nacionales**; se espera que incluya regionales/municipales cuando se proclamen las de las Elecciones Regionales y Municipales de octubre 2026, sin cambio de conector necesario). |
| **Limitación conocida** | Sin DNI en el esquema ingerido, la clave de upsert es `(nombres, apellido_paterno, apellido_materno, cargo, proceso_electoral, ubigeo)` — riesgo real, aunque improbable, de colisión por homonimia. |
| **Detalle completo** | [`docs/data-contracts/jne-autoridades-electas.md`](data-contracts/jne-autoridades-electas.md) |
| **Cruces** | Ninguno implementado — el cruce originalmente hipotetizado (autoridad electa ↔ proveedor del Estado / persona sancionada, por nombre) requiere un matcher de personas naturales que no existe hoy en el catálogo (`@appsperu/entity-matcher` está diseñado para nombres de entidad, no de persona), y solo tendría cobertura territorial útil (La Libertad) una vez que el corte "actual" incluya autoridades regionales/municipales. |

---

<a id="candidatos-erm"></a>
## candidatos-erm — Candidatos a las Elecciones Regionales y Municipales 2026

Construido 2026-09-10 (ticket OE-02, `docs/PRD_Observatorio_Electoral_y_Riesgo_v1.md`), a partir de
un ejercicio de cruce contrataciones×sanciones×candidatos hecho a mano ese mismo día para La
Libertad y Lima. Este conector formaliza esa parte del ejercicio para que sea repetible sin script
ad-hoc.

### `candidatos-connector.ts`

| | |
|---|---|
| **Descripción** | Candidatos inscritos (y su estado: inscrito/renuncia/exclusión/improcedente/retiro) a Gobernador y Vicegobernador Regional, Consejero Regional, Alcalde y Regidor Provincial/Distrital — Elecciones Regionales y Municipales de octubre 2026. Incluye DNI, cargo, organización política, ubigeo/circunscripción y el conteo de sentencias que el propio candidato declaró en su hoja de vida ante el JNE (`sentenciasDeclaradas` — un dato distinto y no comparable a una sanción de OSCE, ver más abajo). |
| **Decisión de fuente (investigada explícitamente, no asumida)** | No existe un dataset abierto oficial (CKAN/PNDA) de candidatos para este proceso. Las dos plataformas interactivas del propio JNE están protegidas contra automatización, verificado en vivo el 2026-09-10: `votoinformado.jne.gob.pe` con Cloudflare Turnstile, `web.jne.gob.pe/reporteinscripcionlistaserm2026/` con Incapsula. Ninguna de las dos se intenta evadir — es una línea que este catálogo no cruza. La fuente usada es una republicación de terceros: **Datapol** (`datapol.lat/articulos/erm-2026-candidatos/buscador/data/candidatos.json`), un JSON estático sin protección anti-bot, derivado de las mismas hojas de vida que el JNE hace públicas. Riesgo aceptado y documentado: si Datapol deja de publicar el archivo o cambia su estructura, la ingesta falla de forma visible (valida que `circ`/`tipos` existan antes de procesar), nunca interpreta una forma inesperada como "cero candidatos". |
| **DNI sin enmascarar a nivel de almacenamiento, enmascarado en toda respuesta pública** | Decisión distinta, y por una razón distinta, a la ya tomada en `autoridades-electas` (que excluyó su recurso histórico con DNI por PII de un dataset masivo no pensado para consulta pública). Aquí el DNI es exactamente el mismo dato que el candidato declaró bajo juramento y que el JNE publica sin enmascarar en la ficha pública de cada candidato — verificado en vivo contra `votoinformado.jne.gob.pe/candidatos/hoja-vida/...` para varios casos reales de La Libertad y Lima el 2026-09-10. `GET /api/candidatos` enmascara el DNI igual que ya hace `proveedores-sancionados/personas-sancionadas.ts` (últimos 3 dígitos visibles); solo el almacenamiento interno lo conserva completo. |
| **Cómo lo hace** | Descarga el JSON completo (nacional, ~102K candidatos, ~12MB), lo aplana de su estructura anidada (`circ[tipoId][ubigeo].listas[].cands[]`, tuplas posicionales `[pos, nombre, dni, cargo, sexo, edad, provConsejero, estado, edu, sent]`) a filas planas, normaliza, e inserta por lotes de 500 vía `jsonb_to_recordset` (mismo patrón de OE-01 en `compras-publicas` — con ~102K filas, una fila por `INSERT` habría sido igual de impráctico). |
| **Frecuencia** | Manual (`npm run ingest:candidatos` en `apps/candidatos-erm/api`). Snapshot completo en cada corrida. |
| **Fuente de datos** | `datapol.lat` (tercero, no oficial) — ver decisión de fuente arriba. |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-10: 101,948 filas de origen, 101,948 insertadas, 0 rechazadas — universo nacional completo del corte. La Libertad: 4,637 inscritos; Lima: 12,770 inscritos — ambas cifras coinciden exactamente con el conteo hecho a mano ese mismo día antes de construir este conector. |
| **Limitación conocida** | Depende de que un tercero no oficial siga publicando el archivo con la misma estructura. `sentenciasDeclaradas` es la autodeclaración del candidato ante el JNE (sentencias judiciales) — **no** equivale a una sanción del Tribunal de Contrataciones (OSCE); son fuentes y regímenes distintos, y esa distinción es justamente el hallazgo central del ejercicio del 2026-09-10 (ver notas editoriales en `acuba/downloads/`). |
| **Cruces** | `GET /api/crossref/candidatos-sancionados` en `proveedores-sancionados` (OE-03, implementado 2026-09-10) — ver la ficha de ese cruce más abajo, en la sección de `proveedores-sancionados`. |

---

<a id="instituciones-educativas"></a>
## instituciones-educativas — Padrón de Instituciones y Programas Educativos (MINEDU/ESCALE)

Investigado y construido 2026-09-06, a pedido explícito de profundizar el hallazgo parcial de
la Fase 0 inicial de MINEDU. A diferencia de esa primera pasada (un dataset chico y
desactualizado de educación especial), esta es la fuente flagship real: el padrón nacional
completo, censal, con la frecuencia de actualización más alta de cualquier fuente del catálogo.

### `padron-connector.ts`

| | |
|---|---|
| **Descripción** | Padrón nacional de instituciones y programas educativos — nombre, nivel/modalidad, gestión, dirección, ubigeo, coordenadas (lat/lon), UGEL, RUC/razón social del operador (privadas), estado operativo. |
| **Qué hace** | Resuelve el corte más reciente listando `escale.minedu.gob.pe/listadosrie/`, descarga el ZIP, extrae el DBF a un archivo temporal (287 MB descomprimido, no cabe cómodo en memoria — mismo criterio que `padron-connector.ts` de `identidad-fiscal`), lo lee con `dbffile` en streaming y hace upsert en lotes de 1000 filas, con commit por lote (no una transacción gigante) — mismo patrón que el Padrón RUC de SUNAT. |
| **Único conector en formato DBF (dBase) del catálogo** | Todos los demás son CSV/XLSX/JSON/PDF. Encoding real confirmado: **`cp850`** (code page DOS/OEM) — ningún otro conector usa este encoding (el resto es UTF-8 BOM o Latin-1/ISO-8859-1). |
| **Exclusión de PII deliberada** | La fuente real trae `DIRECTOR` (nombre completo del director/a), `TELEFONO`, `EMAIL` y `PROMOTOR` — estas 4 columnas **nunca se leen del objeto crudo**, mismo patrón que `informes-control-connector.ts` (exclusión en el parseo, no solo en la respuesta de la API). `NRORUC`/`RZSOCIAL` sí se ingieren (identidad de entidad operadora, mismo tratamiento que proveedores en `compras-publicas`/`identidad-fiscal`). |
| **Cómo lo hace** | El listado (`listadosrie/`) no enlaza el ZIP directamente — cada corte es una página intermedia de Liferay cuyo `id` numérico es creciente en el tiempo; se toma el mayor como "más reciente" y se sigue un segundo salto para extraer el link real del ZIP. **Hallazgo real**: el HTML de ese portal codifica algunos enlaces como entidades hexadecimales (`&#x3a;` = `:`, etc.) en vez de `href` planos — el conector decodifica antes de aplicar cualquier regex, si no el link nunca matchea. |
| **Bug real encontrado y corregido durante la construcción (2026-09-06)** | El DBF rellena algunos campos de texto de ancho fijo con bytes NUL (`\0`) en vez de espacios — Postgres rechazó la ingesta a mitad de camino (`invalid byte sequence for encoding "UTF8": 0x00`, fila ~120,000 de 180,828) hasta que se agregó limpieza explícita de bytes NUL en el normalizador, no solo `trim()`. |
| **Frecuencia** | Manual (`npm run ingest:padron` en `apps/instituciones-educativas/api`). La fuente publica un corte nuevo cada ~1 semana — la mayor frecuencia de refresco de cualquier dataset ya evaluado en el catálogo. |
| **Fuente de datos** | `escale.minedu.gob.pe/documents/10156/958881/Padron_web_<fecha>.zip` (Unidad de Estadística Educativa, MINEDU) — no usar el buscador web `escale.minedu.gob.pe/padron-de-iiee`, que exige correo electrónico para exportar resultados masivos. |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-06: **180,826 filas insertadas, 2 rechazadas, 0 errores** — universo nacional censal completo (no muestra). La Libertad: **9,391 instituciones, 12 provincias, 84 distritos** — confirmado en vivo, cuadra exacto con lo verificado en la Fase 0. |
| **`areaCenso` (DQ-07, 2026-09-08)** | La columna `area_censo` (Urbana/Rural) existía en la tabla desde el inicio pero `GET /api/instituciones` no la seleccionaba ni exponía. Ahora se expone en cada resultado y es filtrable (`areaCenso=Urbana\|Rural`). Verificado en vivo: La Libertad = 4,800 Urbana + 4,591 Rural = 9,391 (coincide exacto con el total). |
| **Detalle completo** | [`docs/data-contracts/minedu-padron-iiee.md`](data-contracts/minedu-padron-iiee.md) |
| **Cruces** | Ninguno implementado — candidato natural: por UBIGEO contra `radar-ejecucion` (`FUNCION = EDUCACIÓN`), mismo patrón exacto ya usado por `servicios-salud`/`programas-sociales` contra `radar-inversiones`. |

### `siagie-connector.ts`

Investigado y construido 2026-09-21, a pedido explícito de mapear endpoints de MINEDU no
explorados. De 3 fuentes nuevas identificadas (SIAGIE, PRONABEC, PRONIED), esta fue la elegida
por mayor valor verificado y menor fricción (descarga directa, sin API key).

| | |
|---|---|
| **Descripción** | Matriculación y trayectoria estudiantil (SIAGIE) agregada por servicio educativo — matriculados, aprobados, retirados, fallecidos, atraso escolar (`tot_atraso`), por código modular y año lectivo (2021-2024). |
| **Qué hace** | Descarga 4 CSVs anuales directos (uno por año, ~56-60 MB c/u), parsea con `csv-parse`, hace upsert en lotes de 1000 filas (una transacción por año). `GET /api/trayectoria` agrega esas filas (que vienen desagregadas por edad y tipo de discapacidad) a un total por escuela, con `LEFT JOIN` al padrón de IIEE ya ingerido (`cod_mod`+`anexo`) para exponer ubigeo/departamento/provincia/distrito. |
| **WAF bloquea `curl` sin User-Agent de navegador** | `datosabiertos.gob.pe` devuelve un 418 "访问被拦截" (CloudWAF) a requests sin cabecera `User-Agent` real — con UA de Chrome responde normal. Mismo criterio defensivo que ya usan otros conectores del catálogo contra este portal. |
| **Desvío de esquema real entre años (hallazgo real, no error de ingesta)** | 2021-2022 traen la columna `PromocionGuiada`; 2023-2024 la reemplazan por `Desaprobado` — cambio de metodología/terminología del MINEDU entre cortes. Ambas se persisten nullable; cada fila solo trae una según su año de origen. |
| **Clave natural no obvia** | `cod_mod`+`anexo`+`id_nivel`+`Edad` no es suficiente — el mismo servicio/nivel/edad se repite cuando hay estudiantes con distinto `TipoDiscaIntegrada` (verificado en vivo: una fila sin discapacidad y otra fila aparte para "TEA" a la misma edad). Clave real: agrega `tipo_disca_integrada`. `id_nivel`/`Edad` son `NOT NULL` a propósito (hallazgo real de CodeRabbit): Postgres trata NULL como siempre distinto en un UNIQUE, así que si pudieran ser NULL el UPSERT de una reingesta dejaría de detectar duplicados reales — se rechazan (no se persisten con NULL) las filas que carezcan de cualquiera de los dos. |
| **Reingesta reemplaza, no acumula (hallazgo real de CodeRabbit)** | `raw_siagie_batches` tiene `UNIQUE(anio)` — reingerir un año reutiliza el mismo `batchId`, y el conector borra el snapshot completo de ese año antes de reinsertar. Sin esto, una fila que existía en una ingesta anterior pero ya no está en el CSV nuevo (corregida/eliminada en la fuente) quedaría huérfana para siempre. Verificado en vivo: reingerir 2024 dos veces seguidas da exactamente el mismo resultado (535,136 filas, 1 rechazada), sin duplicar. |
| **Sin PII de estudiantes** | Agregado por servicio educativo, no hay alumno individual en la fuente — a diferencia del Padrón Web (que sí trae datos del director), acá no hay nada que excluir. |
| **Frecuencia** | Manual (`npm run ingest:siagie` en `apps/instituciones-educativas/api`). La fuente publica un corte por año lectivo, sin patrón de actualización intra-año observado. |
| **Fuente de datos** | `datosabiertos.gob.pe`, dataset "Matriculación y Trayectoria Estudiantil 2021-2024" (Ministerio de Educación — Unidad de Estadística). |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-21: **2,205,109 filas insertadas, 6 rechazadas** (2021: 566,354/5 rechazadas; 2022: 558,785/0; 2023: 544,834/0; 2024: 535,136/1) — todas rechazadas por `Edad` ausente en la fuente real, 0.0003% del total. |
| **Detalle completo** | [`docs/data-contracts/minedu-siagie-trayectoria.md`](data-contracts/minedu-siagie-trayectoria.md) |
| **No explorado en esta pasada** | PRONABEC (Beca 18/Crédito 18, API REST con 39 datasets, requiere solicitar API key) y PRONIED (infraestructura educativa, 4 datasets chicos: inspecciones de obra, módulos prefabricados, mobiliario) — confirmados como fuentes reales, no construidos todavía. |
| **Cruces** | Ninguno implementado todavía — candidato natural: atraso/deserción por distrito × ejecución presupuestal educativa (`radar-ejecucion`, `FUNCION = EDUCACIÓN`). |

---

<a id="infracciones-ambientales"></a>
## infracciones-ambientales — Registro Único de Infractores Ambientales Sancionados (OEFA)

Investigado y construido 2026-09-06, en paralelo con `red-vial-subnacional`, continuando el
barrido de entidades no exploradas (OEFA) tras cerrar la Fase 0 de MINEDU.

### `ruias-connector.ts`

| | |
|---|---|
| **Descripción** | Registro de sanciones ambientales (OEFA) — administrado sancionado, subsector económico, ubicación, expediente/resolución, detalle de infracción, monto de multa. Mismo tipo de valor que `proveedores-sancionados` pero para el ámbito ambiental (minería, industria, hidrocarburos, agricultura, pesquería, residuos sólidos, electricidad, consultoras ambientales). |
| **Qué hace** | Descarga el CSV directo (sin resolver por `package_show` — el dataset no responde a esa consulta en este portal), normaliza y hace upsert en `infracciones_ambientales`, en lotes de 1000. |
| **Exclusión/enmascarado de PII** | `nombre_administrado` se ingiere sin cambios (mismo fundamento legal que `proveedores-sancionados`, Ley 27806). `id_doc_administrado` se **enmascara** (últimos 3 dígitos) cuando `tipo_doc = 'D.N.I.'` — confirmado en vivo que sí aparecen sancionados persona natural (ej. mineros artesanales), mismo patrón que `perfilprov-conformacion`. Para R.U.C./OTROS se ingiere completo. |
| **Hallazgos reales de la fuente** | Valores ausentes representados con el literal `"-"` (no celda vacía); montos con coma decimal (`"13170,43"`); fechas como enteros `AAAAMMDD`; `DISTRITO` (y a veces `PROVINCIA`) puede traer varios valores separados por coma en una sola celda cuando una infracción abarca más de un distrito (no se parte, se ingiere tal cual). **`(nro_expediente, nro_rd)` no es clave única** — una misma resolución puede traer varias filas de detalle distintas (8,265 de 14,937 filas nacionales comparten expediente+RD con otra fila); se usa un hash de contenido como clave de upsert. Bug real corregido durante la construcción: la fuente trae filas exactamente duplicadas dentro de un mismo lote de inserción — Postgres rechazaba el `ON CONFLICT` hasta deduplicar por hash antes de insertar (mismo patrón que `identidad-fiscal`). |
| **Frecuencia** | Manual (`npm run ingest:ruias` en `apps/infracciones-ambientales/api`). |
| **Fuente de datos** | `datosabiertos.gob.pe/sites/default/files/1a_Registro Único de Infractores Ambientales Sancionados.csv` (OEFA). |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-06: 14,937 filas de origen, **14,724 filas únicas insertadas** tras deduplicar, 0 rechazadas. La Libertad: **610 sanciones, 12 provincias**. |
| **Detalle completo** | [`docs/data-contracts/oefa-ruias.md`](data-contracts/oefa-ruias.md) |
| **Cruce con compras-publicas (2026-09-21)** | `GET /api/crossref` — por RUC exacto (`extractRuc()` duplicado localmente en `lib/extract-ruc.ts`, esta app no es workspace member de npm por lo que no importa `@appsperu/shared-identity`; mismo criterio ya aplicado hoy en `poder-judicial`) contra `awards`+`minor_contracts` de compras-publicas. Solo cruza `tipo_doc = 'R.U.C.'` — las 15 filas de persona natural (`D.N.I.`) vienen enmascaradas desde la ingesta (ver arriba) y no se pueden cruzar por identificador completo. Verificado en vivo: **293 de 3,246 RUC sancionados por OEFA (9.0%) tienen al menos una adjudicación u contrato menor real**, incluyendo un caso de alto perfil (empresa estatal con 468 infracciones y S/205M en contratos vigentes con el Estado). Una sanción ambiental NO inhabilita legalmente para contratar (a diferencia de una inhabilitación del Tribunal de Contrataciones) — es coincidencia de identidad entre dos registros públicos independientes, no una irregularidad por sí sola. Tool MCP `infracciones_ambientales_crossref`. |

---

<a id="red-vial-subnacional"></a>
## red-vial-subnacional — Intervenciones en Redes Viales Subnacionales (MTC/Provías Descentralizado)

Investigado y construido 2026-09-06. **Resuelto con ayuda del usuario**: el fetch automático
sobre la página del dataset no lograba renderizar el recurso (contenido cargado dinámicamente,
ni siquiera decodificar entidades HTML como en MINEDU sirvió); el usuario navegó la página en un
browser normal y compartió el enlace directo, que sí resolvió.

### `pvd-connector.ts`

| | |
|---|---|
| **Descripción** | Intervenciones en redes viales departamentales/vecinales (gestión de Provías Descentralizado) — código de ruta, tramo, longitud en km, estado de conservación, tipo de superficie, tipo de intervención (mantenimiento/mejoramiento/conservación), responsable. |
| **Qué hace** | Descarga el CSV directo, normaliza y hace upsert en `intervenciones_viales`, en lotes de 1000. |
| **Nivel de detalle** | Ruta/tramo dentro de una **provincia** — no baja a distrito exacto (una ruta puede cruzar más de uno). |
| **Hallazgos reales de la fuente** | Encoding **Latin-1** (no UTF-8). Nombres de columna con espacios irregulares (`" CONVENIO"` con espacio inicial, `"CORREDOR VIAL ALIMENTADOR"` con espacios internos) — se acceden por bracket notation exacto. Valores ausentes como `"-"`, igual que RUIAS. **`(ID_INTERVENCION, CODIGO_RUTA, TRAMO)` no es clave única** (10,430 `ID_INTERVENCION` distintos de 12,536 filas) — mismo patrón de hash de contenido que `infracciones-ambientales`. **Nombres de provincia con tildes inconsistentes** en la misma fuente (ej. `"VIRU"` y `"VIRÚ"` como valores distintos en La Libertad) — no normalizado en esta versión, documentado como limitación conocida. |
| **Frecuencia** | Manual (`npm run ingest:pvd` en `apps/red-vial-subnacional/api`). Nombre de archivo trae la fecha de corte embebida — estabilidad entre cortes no confirmada. |
| **Fuente de datos** | `datosabiertos.gob.pe/sites/default/files/1_Dataset_Intervenciones_PVD_<fecha>.csv` (MTC/Provías Descentralizado) — la página del dataset no renderiza este link a un fetch automático, hay que obtenerlo navegando manualmente si el nombre de archivo cambia. |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-06: **12,536 filas insertadas, 0 rechazadas**. La Libertad: **461 intervenciones, 12 provincias** (con la salvedad de la duplicación de tildes). |
| **Detalle completo** | [`docs/data-contracts/mtc-pvd-intervenciones.md`](data-contracts/mtc-pvd-intervenciones.md) |
| **Cruces** | Ninguno implementado — candidato natural: por departamento/provincia contra `radar-ejecucion` (`FUNCION = TRANSPORTE`), mismo patrón de bucket exacto que ya usan `actividad-agraria`/`seguridad-ciudadana`. |

---

<a id="residuos-solidos"></a>
## residuos-solidos — Generación anual de residuos sólidos (MINAM/SIGERSOL)

Investigado y construido 2026-09-06, continuando el barrido tras `infracciones-ambientales`
(OEFA) y `red-vial-subnacional` (MTC). Único conector del catálogo con **serie histórica real
multi-año** (2019-2024) verificada, no solo un snapshot del corte más reciente.

### `residuos-connector.ts`

| | |
|---|---|
| **Descripción** | Generación anual de residuos sólidos domiciliarios y municipales por distrito — población INEI, generación per cápita, toneladas/día y toneladas/año. Datos reportados por municipalidades a SIGERSOL (Sistema de Información para la Gestión de Residuos Sólidos), administrado por MINAM. |
| **Qué hace** | Descarga el CSV directo, normaliza y hace upsert en `residuos_solidos_municipales`, en lotes de 1000. Clave natural real: `(ubigeo, anio)` — a diferencia de RUIAS/PVD, no requirió hash de contenido. |
| **Bug real encontrado y corregido durante la construcción** | `FECHA_CORTE` de 8 dígitos, pero **el orden no es consistente entre filas** — algunas traen `DDMMAAAA` (ej. "18122025"), otras `AAAAMMDD` (ej. "20240410", que leído ingenuamente como DDMMAAAA da un mes 24 inválido y Postgres rechaza la fila con `date/time field value out of range`). Se prueban ambas lecturas y se usa la que produce una fecha de calendario real (validación de mes 1-12, día 1-31 con round-trip) — un chequeo ingenuo de "¿el año está en rango 2000-2100?" no basta, porque una fecha DDMMAAAA como "20122025" (20 dic 2025) también tiene primeros 4 dígitos que parecen un año plausible ("2012"). |
| **Otro hallazgo real** | `UBIGEO` pierde el cero inicial para departamentos 01-09 en la fuente (mismo problema ya documentado en `seguridad-ciudadana`/SIDPOL) — se reconstruye a 6 dígitos con padding. La Libertad (departamento 13) nunca tiene este problema. |
| **Frecuencia** | Manual (`npm run ingest:residuos` en `apps/residuos-solidos/api`). |
| **Fuente de datos** | `datosabiertos.gob.pe/sites/default/files/1. Dataset Generación anual de residuos sólidos domiciliarios y municipales.csv` (MINAM). |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-06: **11,310 filas insertadas, 0 rechazadas** — serie 2019-2024 completa. La Libertad: **500 filas (83-84 distritos × 6 años), 12 provincias**. |
| **`GET /api/residuos` — año vigente por defecto (DQ-04, 2026-09-08)** | Sin `anio` ni `historico=true`, el endpoint filtra al año más reciente (`MAX(anio)`) en vez de devolver los 6 años mezclados — antes sumaba silenciosamente ~1,890 filas/año como si fueran el universo de un solo corte, sobreestimando 6x cualquier total agregado client-side. `historico=true` recupera la serie completa; `anio=YYYY` filtra a un año exacto. |
| **Detalle completo** | [`docs/data-contracts/minam-residuos-solidos.md`](data-contracts/minam-residuos-solidos.md) |
| **Cruces** | Ninguno implementado — candidato natural: por UBIGEO contra `radar-ejecucion` (`FUNCION = SANEAMIENTO`) y contra `renamu` (¿la municipalidad con más generación de residuos tiene camión recolector de basura operativo?). |

---

<a id="infraestructura-mtc"></a>
## infraestructura-mtc — Terminales portuarios, aeródromos y peajes (MTC)

Investigado y construido 2026-09-06, en una segunda pasada sobre MTC (la primera dio
`red-vial-subnacional`). Agrupa **tres datasets** del mismo publicador en una sola app: son
catálogos de infraestructura puntual (un punto geográfico = una fila), de volumen pequeño
(500-600 filas), sin overlap con `red-vial-subnacional` (que mide intervenciones en vías, no
terminales/aeródromos/peajes) — separarlos en 3 apps habría triplicado el overhead operativo sin
beneficio real.

### `infraestructura-mtc-connector.ts`

| | |
|---|---|
| **Descripción** | Tres catálogos de infraestructura puntual del MTC: terminales portuarios/embarcaderos, aeródromos, y unidades de peaje de la red vial nacional — ubicación, tipo, estado, titularidad y administrador de cada instalación. |
| **Qué hace** | Tres funciones de ingesta independientes (`ingest:puertos`, `ingest:aerodromos`, `ingest:peajes`), cada una descarga su fuente, normaliza y hace upsert con clave natural `(código, fecha_corte)` — confirmada única contra las filas reales de los tres datasets (507/595/233), sin necesidad de hash de contenido. |
| **Hallazgo real: URLs de dataset inestables entre versiones** | Los tres datasets cambian de slug en cada actualización (`...-2022-y-2023` → `...-2022-2024` → `...-2022-2025`) sin que la versión vieja desaparezca del buscador — reconstruir la URL a mano a partir de un título de búsqueda dio el shell genérico del portal dos veces. La forma confiable de encontrar la URL vigente es listar el grupo del publicador (`/group/ministerio-de-transportes-y-comunicaciones?search_api_views_fulltext=<término>`) y tomar el href real de la página. |
| **Bug real encontrado en la fuente (aeródromos)** | La columna `ID_AERODROMO` viene con el literal `#¡REF!` en el corte 2025 (error de fórmula de Excel arrastrado al CSV publicado, no un artefacto de nuestro parseo) — no se usa como clave; `CODIGO_AERODROMO` es el identificador estable entre años. |
| **Encoding** | Terminales portuarios y aeródromos: CSV `;`, **Latin-1** (mismo patrón que `red-vial-subnacional`). Peajes: GeoJSON, UTF-8. |
| **Frecuencia** | Manual (`npm run ingest:puertos` / `ingest:aerodromos` / `ingest:peajes` en `apps/infraestructura-mtc/api`). |
| **Fuente de datos** | `datosabiertos.gob.pe/sites/default/files/Infraestructura_portuaria_terminales_embarcaderos_2022-2025.csv`, `.../Infraestructura_aeroportuaria_aerodromos_2022-2025.csv`, `.../unidades_peaje_2024-2025.geojson` (MTC). |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-06: **507/595/233 filas insertadas, 0 rechazadas** en los tres. La Libertad: **9 filas de terminales** (3 terminales: TP Multipropósito Salaverry, TP Multiboyas Salaverry, TP Chicama/Malabrigo), **36 filas de aeródromos** (9 aeródromos, incluye el Aeropuerto Internacional de Trujillo), **15 filas de peajes** (5 unidades: Menocucho, Virú, Pacanguilla, Chicama, Ciudad de Dios). El corte de peajes (2025-12-31) es el más reciente de los tres datasets de esta pasada. |
| **Detalle completo** | [`docs/data-contracts/mtc-infraestructura-puntual.md`](data-contracts/mtc-infraestructura-puntual.md) |
| **Cruces** | Ninguno implementado — candidato natural: por UBIGEO contra `radar-ejecucion` (`FUNCION = TRANSPORTE`) y contra `inversion-privada` (Puerto Salaverry ha tenido inversión APP reciente). |
| **Corte vigente por defecto en los 3 endpoints (DQ-03, 2026-09-08)** | Los tres catálogos son paneles multi-año (`UNIQUE (código, fecha_corte)`) con hasta 4 cortes distintos ingeridos por app. Sin `fechaCorte` ni `historico=true`, cada endpoint filtra al corte más reciente (`MAX(fecha_corte)`) — antes devolvía todos los cortes mezclados (ej. aeródromos: 595 filas de 4 años en vez de las 152 vigentes). `historico=true` recupera la serie completa; `fechaCorte=YYYY-MM-DD` filtra a un corte exacto. |

---

<a id="riesgo-fiscal-isds"></a>
## riesgo-fiscal-isds — Pasivos contingentes explícitos por ISDS/APP (MEF, Marco Macroeconómico Multianual / IAPM)

| | |
|---|---|
| **Descripción** | Cuánto del PBI reconoce el propio MEF como pasivo contingente explícito por controversias internacionales de inversión (ISDS/ICSID), por contingencias de Asociaciones Público-Privadas (APP), y por procesos judiciales/administrativos/arbitraje nacional — serie por **año de cierre** (no por edición del documento; cada MMM/IAPM nuevo extiende o revisa la misma serie). |
| **Qué hace** | Parsea el recuadro "Pasivos Contingentes Explícitos del SPNF" del MMM o IAPM con `pdf-parse`, y hace upsert por `(anio_cierre, categoria)` en `mmm_pasivos_contingentes`. |
| **Cómo lo hace** | **Ingesta manual como `bcrp-la-libertad`**: `npm run ingest:pdf -- <ruta> <edicion>` sobre un PDF ya descargado — el MEF/gob.pe bloquean la descarga automatizada con herramientas tipo `curl`/`WebFetch` (404 en el nombre de archivo esperado, WAF en el mirror de BCRP, HTTP 418 en la página de publicaciones), pero un navegador real sí pasa el bloqueo (confirmado con `claude-in-chrome`: la página resuelve la URL real del PDF vía JS). Una vez con el archivo en disco, la extracción de texto y el parseo de tabla son 100% automáticos (`pdf-parse` extrae texto limpio, a diferencia de lo que se creyó inicialmente — ver ADR-0023, sección "Corrección posterior"). El conector solo reconoce el formato de tabla de `IAPM_2025_2028` (encabezado de N años); el formato "año actual/previo + Contingencia Esperada + Diferencia" que usan `MMM_2024_2027` y `MMM_2027_2030` en la misma sección se detecta y se descarta (0 filas) — esos años se cargan a mano vía migración, leídos directamente del texto extraído (no de prensa), citando la página exacta. |
| **Frecuencia** | Manual, 1-2 veces al año — coherente con la frecuencia real de publicación del MMM/IAPM. |
| **Fuente de datos** | `mef.gob.pe/contenidos/pol_econ/marco_macro/*.pdf` (ediciones 2024-2027 e IAPM 2025-2028) y `cdn.www.gob.pe/uploads/document/file/10528873/...` (edición vigente 2027-2030, URL solo resoluble navegando la página real) — ver `docs/data-contracts/riesgo-fiscal-isds.md`. |
| **Cobertura real ingerida** | Serie 2020-2025 completa (4 categorías × 6 años, 24 filas): 2020-2023 vía conector real desde `IAPM_2025_2028` (cross-validado contra `MMM_2024_2027` para 2022); 2024-2025 cargados a mano desde `MMM_2027_2030` (formato de tabla no soportado por el conector, leído directamente del PDF). ISDS 2025 = 4.24% del PBI, máximo de toda la serie. Más una serie histórica secundaria (2014/2021/2024, declaración pública) en tabla aparte, sin mezclar metodologías. |
| **Detalle completo** | [`docs/data-contracts/riesgo-fiscal-isds.md`](data-contracts/riesgo-fiscal-isds.md) |
| **Cruces** | Ninguno implementado — candidato conceptual, no por clave compartida: el proyecto externo `clasificado` (memos ISDS, `informe_isds_peru.tex`, `modulo_riesgo_institucional.md`) cita esta misma serie. |
| **ADR** | [`docs/adr/0023-riesgo-fiscal-isds-semilla-manual.md`](adr/0023-riesgo-fiscal-isds-semilla-manual.md) — **incluye una corrección importante**, leer antes de citar cualquier cifra de esta fuente en otro documento. |

---

<a id="poder-judicial"></a>
## poder-judicial — Estadística jurisdiccional de procesos judiciales (Poder Judicial)

### `procesos-judiciales-connector.ts`

| | |
|---|---|
| **Descripción** | Estadística agregada de procesos judiciales (pendientes/ingresados/resueltos) por año, mes y órgano jurisdiccional a nivel nacional — sin expedientes individuales ni nombres de partes, sin PII. |
| **Qué hace** | Descarga el CSV completo, parsea con `csv-parse` y hace upsert por `(anio, mes, codigo_dependencia, tipo_organo, espec_exp, espec_dep, condicion)` en `procesos_judiciales_jurisdiccional`. Filas desalineadas o con un conteo no numérico se rechazan y cuentan en `poder_judicial_rejected`, no se insertan con columnas corridas en silencio. |
| **Cómo lo hace** | Descarga HTTP directa (GET simple, sin sesión) de un CSV estático publicado en `datosabiertos.gob.pe/sites/default/files/` — **investigado y descartado como candidato a bulk-query**: el sistema interactivo del Poder Judicial (CEJ, consulta de expedientes) está protegido con Radware y desde 2026 exige N° de expediente exacto, así que no sirve para esto; este dataset SÍ es agregado/público y no tiene esa restricción. Mismo WAF (CloudWAF) que el resto de `datosabiertos.gob.pe`, requiere User-Agent de navegador. Este dataset en particular no se resuelve vía CKAN `package_show` (a diferencia del resto del catálogo) — el enlace de descarga es estático, no un recurso indexado por la API de este portal DKAN. |
| **Frecuencia** | Manual (`npm run ingest:procesos-judiciales`). Snapshot completo del CSV en cada corrida (no incremental) — el propio dataset se reemplaza, no acumula, según su fecha de "última modificación". |
| **Fuente de datos** | `datosabiertos.gob.pe/sites/default/files/dataset_jurisdiccional_a-partir-del-2024.csv` — dataset "Procesos judiciales principales a nivel nacional, a partir del 2023", publicador Poder Judicial - PJ. |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-20: **58,568/58,568 filas insertadas, 0 rechazadas**. Cubre 2024 en adelante (el dataset mismo declara "a partir del 2023" pero el CSV real solo trae 2024+), las 25 jurisdicciones/distritos judiciales del país. |
| **Anomalía conocida** | Sin diccionario de variables publicado — los nombres de las 47 columnas de conteo (`PENDIENTET`, `INGRESOT_SIN`, `RDEV_ANULADA`, etc.) se preservan tal cual el CSV fuente, sin reinterpretar su significado exacto (ver detalle en el data contract). Encoding Latin-1, no UTF-8. |
| **API expuesta (2026-09-20)** | `GET /api/procesos-judiciales` (filtros `anio`/`mes`/`distritoJudicial`/`provincia`/`distrito`/`tipoOrgano`/`especExp`/`condicion`/`estado`, paginado, cada fila trae `ubigeo` — ver cruce abajo), `GET /api/procesos-judiciales/resumen?groupBy=` (agregado SUM de las columnas titulares — `pendiente`, `resuelto`, `ingreso_sin`, `ingreso_con`, `sentencia`, `conciliado` — por `distritoJudicial`/`tipoOrgano`/`especExp`/`anio`/`mes`/`estado`/`condicion`) y `GET /api/procesos-judiciales/territorios` (triadas provincia/distrito distintas, para auditar cobertura del cruce). Registrada como tools MCP `poder_judicial_procesos`/`poder_judicial_procesos_resumen`/`poder_judicial_territorios`. |
| **Cruces** | **Territorial con `ceplan-geo` (2026-09-20)**: `territory_name_crosswalk` (fuente `source='poder-judicial'`) mapea provincia+distrito → UBIGEO — 388/390 triadas confirmadas (99.5%), construido con `npm run crossref:build:poder-judicial` en `ceplan-geo/api` (lee `GET /api/procesos-judiciales/territorios`, matchea con `lookupTerritoryByProvinciaDistrito`, que NO exige departamento — esta fuente no lo trae; `distrito_judicial` es circunscripción judicial, no territorio administrativo, no sirve de proxy). `GET /api/procesos-judiciales` expone el resultado como `ubigeo` por fila (vía `CEPLAN_GEO_DATABASE_URL` opcional, `null` si no está configurada o si no hubo match — nunca se adivina). 2 sin_match reales documentados: "NAZCA" distrito (homónimo de la provincia, no cubierto por el alias de provincia) y "ANDRES AVELINO CACERES" (nombre truncado, falta "DORREGARAY" en la fuente). **Presupuestal con `radar-ejecucion` — descartado**: investigado el 2026-09-20, sin años en común (esta fuente solo tiene 2024, `budget_execution` del Poder Judicial solo tiene 2026) y sin desagregación departamental (100% del presupuesto 2026 atribuido a `meta_departamento='LIMA'`, gasto centralizado) — no hay cruce territorial ni temporal posible con los datos reales disponibles. |
| **Detalle completo** | [`docs/data-contracts/poder-judicial-procesos-jurisdiccionales.md`](data-contracts/poder-judicial-procesos-jurisdiccionales.md) |

---

<a id="violencia-escolar"></a>
## violencia-escolar — Casos reportados a SíseVe (MINEDU)

Investigado y construido 2026-09-21, a pedido explícito de mapear los endpoints del dashboard
público de SíseVe (`siseve.minedu.gob.pe/Web/App/Mapa`). El dashboard AJAX en sí mismo resultó
ser un callejón sin salida (ver hallazgo de cifrado abajo), pero su botón "Exportar a Excel"
resultó ser una fuente real, pública y sin autenticación, con más detalle que el propio mapa.

### `siseve-connector.ts`

| | |
|---|---|
| **Descripción** | Listado detallado de casos de violencia escolar reportados a SíseVe — fecha, DRE, UGEL, nivel educativo, tipo de reporte (personal de la IE vs. entre escolares), tipo de violencia (Psicológica/Física/Sexual) y subtipo. |
| **Hallazgo real — el dashboard AJAX cifra sus respuestas con AES del lado del cliente** | `POST /TableroControl/ListarDatosMapa` (el que alimenta el mapa interactivo) devuelve un string cifrado con AES-128-CBC (CryptoJS), cuya clave se deriva de un token ofuscado embebido en el HTML (`data-url` de un `<div id="divTheme">`, decodificado con una sustitución de dígitos por letras). Se confirmó que ese token es **estático** (idéntico en fetches sin sesión) y se replicó la derivación completa en Node — pero decidimos no seguir por esta vía: dependencia frágil de una clave hardcodeada del lado cliente, sujeta a cambiar en cualquier deploy, para datos que la propia plataforma ya expone sin cifrar por otra vía. |
| **Vía real usada — exportación pública sin cifrar** | `POST /Web/Inicio/DescargarEXCEL`, sin body, sin cookies, sin sesión — confirmado en vivo que reproduce byte-por-byte el mismo archivo que descarga el botón "Excel" del dashboard público. Parseado con `exceljs` (hoja `BaseCompleta`); la cabecera real no está en una fila fija (hay filas de título/nota antes), se busca dinámicamente la fila que empieza con `FECHA_REPORTE`. |
| **Sin clave natural (decisión de diseño, no pendiente)** | La fuente no trae número de expediente ni ningún identificador único por caso — filas con los 7 mismos valores pueden ser casos reales distintos. No se deduplica por contenido. Cada ingesta es un snapshot completo (la fuente cubre "01/01/2024 hasta hoy", no incremental) — la API sirve siempre el snapshot más reciente (`MAX(source_batch_id)`), nunca mezcla entre corridas. |
| **Sin PII** | Sin nombre, DNI, ni identificador de alumno o institución educativa individual — la granularidad más fina de la fuente es UGEL. |
| **Contenido sensible — decisión explícita del usuario (2026-09-21)** | Se replica el mismo nivel de detalle que MINEDU ya publica sin restricción (UGEL + subtipo de violencia completo, incluyendo violencia sexual) — el argumento fue que MINEDU ya lo publica así, Rastro no agrega un nivel de exposición nuevo. Con 225 UGELs, algunas combinaciones (sobre todo `Sexual`) tienen conteos de 1-2 casos — riesgo de celda chica conocido, documentado, no oculto. |
| **Frecuencia** | Manual (`npm run ingest:siseve` en `apps/violencia-escolar/api`). Sin patrón de actualización intra-mes observado en la fuente. |
| **Fuente de datos** | `siseve.minedu.gob.pe/Web/Inicio/DescargarEXCEL` (SíseVe, Ministerio de Educación). |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-21: **50,633/50,633 filas insertadas, 0 rechazadas**. 9,407 casos de violencia sexual (18.6% del total) — de esos, 4,670 `Personal IE a Escolares` vs. 4,737 `Entre Escolares` (casi mitad y mitad, no predominantemente entre pares). La Libertad: 2,252 casos totales, 408 de violencia sexual, 15 UGELs. |
| **API expuesta** | `GET /api/casos` (filtros `dre`/`ugel`/`nivelEducativo`/`tipoReporte`/`tipoViolencia`/`subtipoViolencia`/`tipoEstadoReporte`/`fechaDesde`/`fechaHasta`, paginado con `total`/`hasMore`) y `GET /api/resumen` (conteo por DRE a nivel nacional, o por UGEL dentro de un DRE con `dre=`). Registrada como tools MCP `violencia_escolar_casos`/`violencia_escolar_resumen`. |
| **Cruces** | Ninguno implementado todavía — candidato natural: por DRE/UGEL contra inspecciones de infraestructura educativa (PRONIED, ver hallazgos de la investigación de endpoints MINEDU) o presupuesto educativo (`radar-ejecucion`, `FUNCION = EDUCACIÓN`) para relacionar capacidad de prevención institucional con incidencia real. |

---

<a id="legislativo-congreso"></a>
## legislativo-congreso — Proyectos de ley del Congreso de la República

Investigado y construido 2026-09-21 (ticket ADS-15, `docs/PRD_Organismos_Adscritos_Consolidado_v1.md`,
y `docs/PRD_Inteligencia_Legislativa_Congreso_v1.md`), a partir de una investigación competitiva sobre
plataformas de legislative intelligence en LatAm (Parlamento.ai, Legislat.ai). El endpoint real del
Congreso se descubrió en la misma sesión, y se verificó en vivo con `curl` puro antes de construir el
conector — ver `docs/data-contracts/congreso-spley-portal-service.md` para la evidencia completa.

### `congreso-connector.ts`

| | |
|---|---|
| **Descripción** | Proyectos de ley del Congreso — número, código legible, estado, fecha de presentación, título, proponente, autores. |
| **Fuente pública sin auth ni sesión de navegador** | `POST https://api.congreso.gob.pe/spley-portal-service/proyecto-ley/lista-con-filtro`, verificado con `curl` puro (sin cookies, sin tokens JS) devolviendo `HTTP 200` real — a diferencia de `mef.gob.pe` (Incapsula WAF, ver `docs/PRD_Deuda_Publica_MEF_v1.md`), este dominio del Congreso corre detrás de un gateway Kong sin protección anti-bot activa. |
| **Periodos válidos descubiertos en vivo, no hardcodeados** | `GET /periodo-parlamentario` — el conector consulta este catálogo en cada corrida en vez de asumir años históricos. Un repo de terceros (`unimauro/congreso-abierto-peru`) asume periodos 2016/2011/2006 que **no existen** en este servicio (devuelven `200` con lista vacía, no error) — el conector de Rastro no repite ese error. |
| **Clave real verificada, no asumida** | `per_par_id` + `pley_num` — verificada única sobre las 14,864 filas del periodo 2021 (0 duplicados) y estable entre dos ejecuciones HTTP separadas. `proyecto_ley` (código legible, ej. `"14864/2025-CR"`) contiene `/` y no se usa como clave ni como segmento de ruta. |
| **Upsert, no append** | Cada ingesta es el snapshot vigente de cada periodo (`pageSize` no tiene efecto verificado — siempre trae el dataset completo); el conector hace `ON CONFLICT (per_par_id, pley_num) DO UPDATE`, no inserta duplicados entre corridas. |
| **Sin PII** | `proponente`/`autores` son congresistas y entidades públicas (funcionarios públicos) — no hay dato personal de ciudadanos particulares en esta fuente. |
| **Frecuencia** | Manual (`npm run ingest:congreso` en `apps/legislativo-congreso/api`). Sin scheduler. |
| **Fuente de datos** | `api.congreso.gob.pe/spley-portal-service` (Congreso de la República del Perú). |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-21: **14,868/14,868 filas insertadas, 0 rechazadas** (14,864 del periodo 2021-2026 + 4 del periodo 2026-2031, recién iniciado). |
| **API expuesta** | `GET /api/proyectos` (filtros `periodo`/`estado`/`autor`/`texto`, paginado con `total`/`hasMore`), `GET /api/proyectos/{periodo}/{numero}` (detalle por clave real, 404 si no existe) y `GET /api/proyectos/periodos` (qué periodos están disponibles, para distinguir "sin match" de "nunca ingerido"). Registrada como tools MCP `legislativo_congreso_proyectos`/`legislativo_congreso_proyecto_detalle`/`legislativo_congreso_periodos`. |
| **Cruces** | Ninguno implementado todavía — fuera de alcance de LEG-01/02/03 por decisión explícita (`docs/PRD_Inteligencia_Legislativa_Congreso_v1.md`, §9). Candidato natural documentado ahí: cruce futuro contra INFOBRAS/SEACE/presupuesto regional por mención de tema, una vez esta ingesta base exista y se demuestre útil. |

---

<a id="catastro-minero"></a>
## catastro-minero — Derechos mineros (INGEMMET)

Investigado y construido 2026-09-21 (ticket GEO-01, `docs/PRD_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md`),
a partir de la investigación de endpoints de Energía/Minería/Ambiente de la misma sesión — fuente ya
verificada en vivo antes de construir.

### `ingemmet-connector.ts`

| | |
|---|---|
| **Descripción** | Derechos mineros del Catastro Minero de INGEMMET — concesión, titular, estado, hectáreas, sustancia, ubicación territorial (departamento/provincia/distrito). |
| **Fuente pública sin auth** | `GET .../SERV_CATASTRO_MINERO/MapServer/0/query` (ArcGIS REST, capa "Catastro Minero") — confirmado con `curl` directo, sin autenticación. |
| **Sin paginación estándar (hallazgo real)** | El servicio declara `supportsPagination: false` y rechaza `resultRecordCount`/`resultOffset` con `HTTP 400 "Pagination is not supported."`. Se pagina por rango de `OBJECTID` (`WHERE OBJECTID > último_id ORDER BY OBJECTID ASC`, sin `resultRecordCount`), iterando mientras la respuesta declare `exceededTransferLimit: true` — `maxRecordCount=1000` por respuesta, confirmado en vivo. |
| **Clave real verificada** | `CODIGOU` (código único del derecho minero) — confirmado contra el schema real de la capa y verificado único sobre las 66,823 filas de la ingesta nacional completa (0 duplicados). |
| **TLS: requiere `--use-system-ca` (hallazgo real de esta sesión)** | Node.js (CA bundle propio) rechaza el certificado de `geocatmin.ingemmet.gob.pe` con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, aunque `curl` (CA store del sistema) sí confía en él. El script `ingest:ingemmet` corre con `tsx --use-system-ca` — no es un bypass de verificación TLS, usa el almacén de confianza del sistema operativo en vez del bundle reducido de Node. |
| **Upsert, no append** | `ON CONFLICT (codigou) DO UPDATE` — cada ingesta refleja el catastro vigente, no acumula duplicados entre corridas. |
| **Titular puede ser persona natural (nota, no PII a excluir)** | En minería artesanal/pequeña, `TIT_CONCES` puede ser el nombre de una persona natural — mismo tipo de dato público que un registro de propiedad (SUNARP), no se enmascara. |
| **Frecuencia** | Manual (`npm run ingest:ingemmet` en `apps/catastro-minero/api`). La fuente se actualiza diario según su propia descripción; el conector no tiene scheduler. |
| **Fuente de datos** | `geocatmin.ingemmet.gob.pe` (INGEMMET). |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-21: **66,823/66,823 filas insertadas, 0 rechazadas** (cobertura nacional completa, no acotada). La Libertad: 4,787 derechos mineros. |
| **API expuesta** | `GET /api/derechos` (filtros `departamento`/`provincia`/`distrito`/`estado`/`sustancia`/`concesion`/`titular`, paginado con `total`/`hasMore`) y `GET /api/derechos/{codigou}` (detalle, 404 si no existe). Registrada como tools MCP `catastro_minero_derechos`/`catastro_minero_derecho_detalle`. |
| **Cruces** | Ninguno implementado todavía — candidato natural: cruce futuro por UBIGEO/RUC contra `identidad-fiscal`/`infracciones-ambientales` para perfiles de riesgo minero-ambiental, o contra el trabajo EUDR del usuario. |

---

<a id="areas-protegidas"></a>
## areas-protegidas — Áreas naturales protegidas (SERNANP)

Investigado y construido 2026-09-21 (ticket GEO-02, `docs/PRD_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md`),
inmediatamente después de GEO-01 (catastro minero) — misma sesión, mismo patrón ArcGIS REST.

### `sernanp-connector.ts`

| | |
|---|---|
| **Descripción** | Áreas naturales protegidas y afines de SERNANP — 5 capas: ANP Nacional Definitiva, Zona Reservada, Área de Conservación Regional, Área de Conservación Privada, Sitios Prioritarios Nivel Nacional. |
| **Fuente pública sin auth** | `.../sernanp_visor/servicio_descarga/MapServer` (ArcGIS REST) — confirmado con `curl` directo. A diferencia de INGEMMET (GEO-01), este servicio sí soporta paginación estándar (`supportsPagination: true`, `maxRecordCount: 200000`) y las 5 capas son pequeñas (6 a 233 filas), no hace falta paginar por `OBJECTID`. |
| **Hallazgo real — sin clave estable para upsert incremental** | El código de cada capa (`anp_codi`/`zr_codi`/`acr_codi`/`acp_codi`/`sp_cod`) **no es único** — un área con geometría multi-parte (islas, polígonos disjuntos) aparece en más de una fila con el mismo código. Verificado en vivo: la capa ANP Nacional Definitiva trae 104 filas pero solo 95 códigos únicos (`"RN18"` repetido 4 veces, `"RN05"` 4 veces, `"PN01"` 2 veces, `"RVS03"` 3 veces). `objectid` sí es único por consulta, pero es un ID interno de ArcGIS sin garantía de estabilidad entre reconstrucciones del servicio. **Decisión (ya prevista en el PRD tras un hallazgo de CodeRabbit)**: cada ingesta es un snapshot completo por capa — se borran todas las filas existentes de esa capa y se insertan las nuevas, en la misma transacción; no hay `UNIQUE` ni `ON CONFLICT`. |
| **Schema con `atributos_extra` (JSONB)** | Cada capa trae un juego de campos algo distinto (ej. `acp_titu`/`acp_tipro`/`acp_tirec`/`acp_pareg` solo en Área de Conservación Privada; `sp_pri`/`sp_cf`/`sp_ib`/`sp_ci` solo en Sitios Prioritarios) — los campos comunes (nombre, código, ubicación, superficie, fechas legales) se normalizan a columnas propias; el resto se guarda en `atributos_extra` sin perderlo ni multiplicar columnas nulas. |
| **Frecuencia** | Manual (`npm run ingest:sernanp` en `apps/areas-protegidas/api`). Sin scheduler. |
| **Fuente de datos** | `geoservicios.sernanp.gob.pe` (SERNANP/MINAM). |
| **Cobertura real ingerida** | Verificado en vivo 2026-09-21: **466/466 filas insertadas, 0 rechazadas** (104 ANP + 6 ZR + 48 ACR + 233 ACP + 75 Sitios Prioritarios). La Libertad: 4 áreas protegidas nacionales (Bosque de Protección Puquio Santa Rosa, Coto de Caza Sunchubamba, Reserva Nacional y Santuario Nacional de Calipuy). |
| **API expuesta** | `GET /api/areas` (filtros `capa`/`nombre`/`ubicacion`/`categoria`, paginado con `total`/`limit`/`offset`/`hasMore`) y `GET /api/areas/{capa}/{objectid}` (detalle por `objectid`, no por código — 404 si no existe). Registrada como tools MCP `areas_protegidas_areas`/`areas_protegidas_area_detalle`. |
| **Cruces** | Ninguno implementado todavía — candidato natural: overlay geoespacial futuro contra `catastro-minero` (derechos mineros dentro o cerca de un ANP) o el trabajo EUDR del usuario (deforestación cerca de áreas protegidas). |

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
| `oece-inhabilitaciones-judiciales-connector.ts` | proveedores-sancionados | OECE/Poder Judicial (vía Confluence de OSCE, no CKAN) | API REST de attachments + descarga con URL firmada temporal | Manual | Completa (nacional, 14/15 filas del corte 2026-09-01) |
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
| `candidatos-connector.ts` | candidatos-erm | Datapol (tercero, derivado de hojas de vida JNE — no hay fuente oficial abierta) | Descarga JSON, aplana estructura anidada, inserta por lotes | Manual | Completa (nacional, 101,948 candidatos, 0 rechazados) |
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
| `renamu-connector.ts` | renamu | INEI RENAMU (inei.gob.pe) | Descarga ZIP, extrae CSV en memoria | Manual | Parcial por diseño (solo Módulo II: vehículos/telefonía/internet; Módulo I con PII del alcalde excluido; Módulos III-V no explorados) — universo nacional completo dentro de ese alcance (1,891 municipalidades) |
| `autoridades-connector.ts` | autoridades-electas | JNE Autoridades Electas (datosabiertos.gob.pe) | Resuelve recurso vía `package_show`, descarga XLS, parsea con `xlsx` | Manual | Parcial por diseño (solo el recurso sin DNI, solo autoridades nacionales en el corte actual — el recurso histórico con DNI de autoridades regionales/municipales 2014-2022 no se ingiere) |
| `padron-connector.ts` | instituciones-educativas | MINEDU/ESCALE Padrón Web (escale.minedu.gob.pe) | Resuelve corte más reciente por scraping HTML, descarga ZIP, extrae DBF, parsea con `dbffile` (encoding cp850) | Manual | Completa (nacional censal, 180,826 filas; La Libertad 9,391/12 provincias/84 distritos) |
| `siagie-connector.ts` | instituciones-educativas | SIAGIE/MINEDU (datosabiertos.gob.pe, requiere User-Agent de navegador contra CloudWAF) | Descarga 4 CSVs anuales directos, parsea con `csv-parse`, borra+reinserta el snapshot del año en cada corrida | Manual | Completa (nacional, 2,205,109 filas, 2021-2024, 6 rechazadas por `Edad` ausente) |
| `ruias-connector.ts` | infracciones-ambientales | OEFA RUIAS (datosabiertos.gob.pe) | Descarga CSV directo, hash de contenido como clave (sin clave natural única) | Manual | Completa (nacional, 14,724 filas únicas; La Libertad 610/12 provincias) |
| `pvd-connector.ts` | red-vial-subnacional | MTC/Provías Descentralizado (datosabiertos.gob.pe) | Descarga CSV directo (Latin-1), hash de contenido como clave | Manual | Completa (nacional, 12,536 filas; La Libertad 461/12 provincias) |
| `residuos-connector.ts` | residuos-solidos | MINAM/SIGERSOL (datosabiertos.gob.pe) | Descarga CSV directo, clave natural (ubigeo, anio) | Manual | Completa (nacional, 11,310 filas, serie 2019-2024; La Libertad 500/12 provincias) |
| `pdf-connector.ts` | riesgo-fiscal-isds | MEF, Marco Macroeconómico Multianual / IAPM (PDF, descarga con navegador real — `curl`/`WebFetch` bloqueados) | Parseo de texto tabulado con `pdf-parse`, mismo motor que bcrp-la-libertad; 2 años cargados a mano por formato de tabla no soportado | Manual (archivo local) | Serie 2020-2025 completa (24 filas) |
| `procesos-judiciales-connector.ts` | poder-judicial | Poder Judicial (datosabiertos.gob.pe, CSV estático fuera de CKAN) | Descarga CSV directo (Latin-1), maneja WAF | Manual | Completa (nacional, 58,568 filas, desde 2024) |
| `siseve-connector.ts` | violencia-escolar | SíseVe/MINEDU (`siseve.minedu.gob.pe`, exportación pública Excel) | POST sin sesión, parsea XLSX con `exceljs`, cabecera real ubicada dinámicamente | Manual | Completa (nacional, 50,633 filas, 01/01/2024-hoy) |

