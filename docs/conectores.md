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

---

<a id="radar-ejecucion"></a>
## radar-ejecucion — Presupuesto y ejecución de gasto (MEF)

| | |
|---|---|
| **Descripción** | Trae la ejecución presupuestal (PIA/PIM/Devengado) de gobiernos nacional, regionales y locales, agregada por entidad + función + año fiscal. |
| **Qué hace** | Descarga el CSV nacional del año/granularidad pedida, filtra opcionalmente por departamento (de destino del gasto o de sede de la entidad ejecutora), agrega `SUM(PIA/PIM/DEVENGADO)` por `(SEC_EJEC, FUNCION, ANO_EJE)` y hace upsert en `budget_execution`. También deriva un catálogo territorial (`territories`) a partir de las columnas de ubigeo del propio CSV. |
| **Cómo lo hace** | Descarga HTTP directa (no hay API CKAN real, esa URL sirve el shell Angular de la SPA). Los archivos pesan 4.5–10+ GB, así que se usa **HTTP Range** para traer un prefijo acotado (`DEFAULT_MAX_BYTES` = 25 MB) en vez de cargar el archivo completo en memoria. Hay un segundo modo, `ingestMefFullYearForDepartamento`, que descarga 16 secciones fijas (2 niveles de gobierno × 8 meses) usando offsets de byte observados manualmente para LA LIBERTAD — necesario porque PIA/PIM y DEVENGADO viven en filas separadas del CSV y una sola ventana parcial nunca trae ambos. Cada lote crudo se guarda en `raw_mef_batches` antes de normalizar (lake de evidencia, nunca se sobrescribe). |
| **Frecuencia** | Manual (`npm run ingest:mef` en `apps/radar-ejecucion/api`). La fuente (Consulta Amigable / MEF) publica datos de 2025–2026 con corte mensual/diario; años anteriores son snapshots cerrados. Cada corrida trae un snapshot completo del archivo pedido, no un delta. |
| **Fuente de datos** | Portal de Datos Abiertos del MEF — `datosabiertos.mef.gob.pe` (dataset "Presupuesto y ejecución de gasto"). Cobertura 2009–2026. |
| **Cobertura real ingerida** | Ejecución de GR/GL: parcial por diseño y acotada a La Libertad vía offsets fijos. Gobierno Nacional por `DEPARTAMENTO_META` puede consultarse por región, pero todavía se corre de forma controlada por cada departamento; no equivale a cobertura integral de los cinco territorios. |
| **Detalle completo** | [`docs/data-contracts/mef-presupuesto-ejecucion.md`](data-contracts/mef-presupuesto-ejecucion.md) |

También en esta app: `territory-catalog.ts`, un loader genérico (no conector HTTP propio) que
hace upsert de ubigeo/departamento/provincia/distrito en `territories` a partir de registros ya
parseados — usado para poblar el catálogo maestro cuando no viene derivado del CSV del MEF.

---

<a id="compras-publicas"></a>
## compras-publicas — Contrataciones abiertas (OECE/OCDS)

Esta app tiene **dos conectores** contra la misma API, cada uno contra un endpoint distinto del
estándar OCDS (Open Contracting Data Standard).

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
| **Detalle completo** | [`docs/data-contracts/invierte-detalle-inversiones.md`](data-contracts/invierte-detalle-inversiones.md) |

---

<a id="infobras"></a>
## infobras — Obras públicas (Contraloría)

| | |
|---|---|
| **Descripción** | Trae el dataset nacional de obras públicas monitoreadas por la Contraloría (INFOBRAS) — avance físico, paralización, entidad responsable. |
| **Qué hace** | Descarga el XLSX completo a un archivo temporal (no en memoria), lo parsea en streaming y normaliza filas hacia el modelo de obras. Cruza con `radar-inversiones` por `CUI` (exacto) y con `radar-ejecucion` por nombre de entidad (matcher difuso). |
| **Cómo lo hace** | Descarga HTTP directa de un `.xlsx` (~57 MB) a disco (no vía Range — el archivo es manejable, pero sí requiere streaming al parsear). Reintentos con backoff exponencial (hasta `MAX_ATTEMPTS` = 4, `BASE_BACKOFF_MS` = 2000 ms) porque el servidor puede responder 503 a mitad de transferencia en archivos grandes. |
| **Frecuencia** | Manual (`npm run ingest:infobras`). Snapshot completo del dataset en cada corrida (no incremental). |
| **Fuente de datos** | `infobras.contraloria.gob.pe` — descarga directa vía `InfobrasWeb/Archivo/DownloadFile`. |
| **Alcance territorial CLI** | `INFOBRAS_DEPARTAMENTOS` acepta La Libertad, Lambayeque, Piura, Cajamarca y Cusco. El XLSX fuente es nacional y se guarda el tamaño de lote nacional antes del filtro territorial. Los porcentajes se preservan como fuente y la columna admite valores atípicamente escalados; no se reinterpreta un porcentaje en la ingesta. |
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

**Fase 2 ALSOL (2026-08-26)** — endpoints adicionales sin nuevo conector HTTP:

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

**Fase 2 ALSOL (2026-08-26):**

| Endpoint | Descripción |
|---|---|
| `GET /api/territories/summary?departamento=` | Agregados dept: distritos + infra (5 regiones piloto) |

Piloto ALSOL: LA LIBERTAD, LAMBAYEQUE, PIURA, CAJAMARCA, CUSCO — 425 distritos verificables.

---

<a id="identidad-fiscal"></a>
## identidad-fiscal — Padrón RUC (SUNAT)

| | |
|---|---|
| **Descripción** | Trae el padrón reducido de RUC de SUNAT — universo completo de contribuyentes, filtrado a personas jurídicas (RUC-20, ~2.3M de 18.3M) para cruzar estatus tributario contra proveedores del Estado y contra los propios gobiernos/municipalidades. |
| **Qué hace** | Descarga el ZIP, extrae el `.txt` de padrón, normaliza y hace inserts por lote hacia `contribuyentes`. Cruza con `compras-publicas` por RUC exacto embebido en `awards.supplier_id` y con `radar-ejecucion` por nombre de entidad (reutiliza el matcher difuso de `compras-publicas` sin modificación). |
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
| **Descripción** | Trae inhabilitaciones y multas vigentes/históricas del Tribunal de Contrataciones del Estado — la señal más fuerte de riesgo sobre un proveedor (una inhabilitación vigente es prohibición legal de contratar, no solo irregularidad administrativa). Cruza con `compras-publicas` por RUC exacto. |
| **Qué hace** | Abre sesión (GET), exporta el reporte completo (POST replicando el botón "Exportar Excel"), parsea el HTML tabular resultante, separa secciones de inhabilitaciones vs. multas y normaliza cada una hacia su tabla. |
| **Cómo lo hace** | El endpoint real usa sesión ASP clásica (cookie `ASPSESSIONID...`). Se replica el POST exacto que dispara el botón de exportar, con los campos del formulario vacíos (sin filtro = todos los proveedores), reutilizando la cookie recién abierta. El captcha visible en la página **no se valida ni en cliente ni en servidor** para este endpoint específico — confirmado en vivo comparando MD5 contra la descarga manual (idéntico). Se descartó explícitamente el dataset homónimo de `datosabiertos.gob.pe` por estar abandonado desde 2018. |
| **Frecuencia** | Manual (`npm run ingest:sanciones`). Snapshot completo del reporte en cada corrida. |
| **Fuente de datos** | `rnp.gob.pe/consultasenlinea/inhabilitados` (RNP — Registro Nacional de Proveedores). |
| **Cobertura real ingerida** | Universo nacional completo — 17,919 filas (11,208 inhabilitaciones + 6,681 multas tras dedup), 1 sola rechazada en la corrida verificada. |
| **Caveat importante** | "Vigente hoy" no equivale a "vigente al momento de la adjudicación" — ver detalle. |
| **Detalle completo** | [`docs/data-contracts/proveedores-sancionados.md`](data-contracts/proveedores-sancionados.md) |

---

<a id="inversion-privada"></a>
## inversion-privada — Cartera APP/PA (PROINVERSIÓN / VERTIX)

| | |
|---|---|
| **Descripción** | Trae la cartera de inversión privada promovida por PROINVERSIÓN — Asociaciones Público-Privadas (APP) y Proyectos en Activos (PA) — vía plataforma VERTIX. Complementa `radar-inversiones` (Invierte.pe / inversión pública), no la sustituye. |
| **Qué hace** | Descarga el JSON nacional de `vertixService.php`, enriquece cada proyecto con departamentos INEI (25 consultas filtradas) y normaliza hacia `private_investment_projects`. Ingesta adicional OxI vía `investmentpromotionExport.php` (XLSX base64). |
| **Cómo lo hace** | POST `multipart/form-data` al proxy PHP de `investinperu.pe` (`PageLimit=500`). OxI: POST al export XLSX, parseo SheetJS. Sin sesión. Departamento APP/PA inferido del buscador. |
| **Frecuencia** | Manual (`npm run ingest:vertix`, `npm run ingest:oxi`). Snapshot completo en cada corrida. |
| **Fuente de datos** | `vertixService.php`, `oxi/investmentpromotionExport.php` en `investinperu.pe` |
| **Cobertura real ingerida** | Cartera VERTIX APP+PA (~340 proyectos, 2026-08-28). OxI en promoción (~761 filas en export 2026-08-28). GIS sin geometría pública — ver `GET /api/gis/status`. |
| **Detalle completo** | [`docs/data-contracts/proinversion-vertix-cartera-app-pa-oxi.md`](data-contracts/proinversion-vertix-cartera-app-pa-oxi.md) |
| **ADR** | [`docs/adr/0011-inversion-privada-app-standalone-y-connector-vertix.md`](adr/0011-inversion-privada-app-standalone-y-connector-vertix.md) |

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
| **Detalle completo** | [`docs/data-contracts/salud-institucional-score.md`](data-contracts/salud-institucional-score.md) |

---

## Resumen

| Conector | App | Fuente | Método | Frecuencia de ejecución | Cobertura ingerida |
|---|---|---|---|---|---|
| `mef-connector.ts` | radar-ejecucion | MEF (Consulta Amigable) | Descarga CSV vía HTTP Range | Manual | Parcial (La Libertad) |
| `oece-connector.ts` | compras-publicas | OECE OCDS `/releases` | API REST JSON paginada | Manual | Parcial (10 páginas recientes) |
| `oece-records-connector.ts` | compras-publicas | OECE OCDS `/records` | API REST JSON paginada | Manual | Parcial |
| `invierte-connector.ts` | radar-inversiones | MEF Invierte.pe | Descarga CSV vía HTTP Range | Manual | Parcial (por bytes) |
| `infobras-connector.ts` | infobras | Contraloría INFOBRAS | Descarga XLSX completa | Manual | Completa (snapshot nacional) |
| `observa-connector.ts` | ceplan-estrategico | ObservaPerú/CEPLAN | Descarga JSON estático | Manual | Completa (agregado por nivel de gobierno) |
| `geoserver-connector.ts` | ceplan-geo | CEPLAN GeoServer | WFS GeoJSON paginado | Manual | Completa (distritos + infra MVP) |
| `padron-connector.ts` | identidad-fiscal | SUNAT Padrón RUC | Descarga ZIP completo | Manual | Completa (nacional, ~2.3M filas) |
| `sanciones-connector.ts` | proveedores-sancionados | RNP/OECE Tribunal de Contrataciones | Sesión ASP + export HTML | Manual | Completa (nacional, ~17.9K filas) |
| `vertix-connector.ts` | inversion-privada | PROINVERSIÓN VERTIX (investinperu.pe) | POST multipart JSON | Manual | Completa (cartera APP/PA) |
| `oxi-connector.ts` | inversion-privada | PROINVERSIÓN OxI (investinperu.pe) | POST XLSX base64 | Manual | Completa (promoción OxI) |
| — (agregador) | salud-institucional | Las otras 5 apps | Query en vivo, sin ingesta | Bajo demanda (por request) | N/A |

## Candidatos evaluados, no implementados

<a id="bcrp-comercio-exterior"></a>
### bcrp-comercio-exterior — Comercio exterior (BCRP), candidato no construido

| | |
|---|---|
| **Descripción** | Exportaciones por departamento e importaciones por aduana (BCRPData) — evaluado como novena fuente para sector producción/comercio exterior, ausente hoy del proyecto. |
| **Por qué no está construido** | El desagregado por departamento (`RD38085BM`-`RD38111BM`) está congelado en Dic-2022/Dic-2023 (re-verificado en vivo). El agregado nacional (`PN38714BM`-`PN38723BM`) sí está al día a jun-2026, pero es un solo número por mes — sin producto, sin empresa, sin `entity_code`. |
| **Qué sí tiene, a diferencia del resto** | API REST real, documentada, sin sesión ni scraping — confirmado en vivo. El conector más simple de construir de todos, si se acepta la granularidad limitada del agregado nacional. |
| **Fuente de datos** | `estadisticas.bcrp.gob.pe/estadisticas/series/api` (Banco Central de Reserva del Perú). |
| **Detalle completo** | [`docs/data-contracts/bcrp-comercio-exterior.md`](data-contracts/bcrp-comercio-exterior.md) |

