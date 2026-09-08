# Fuentes panel (multi-año/multi-corte) del catálogo

**Origen:** DQ-09 de [`TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md`](../TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md), auditoría de La Libertad 2026-09-08.

## Por qué existe este documento

Una fuente **panel** ingiere el mismo universo de entidades más de una vez a lo largo del
tiempo (una fila nueva por año/corte, con una clave única `(entidad, año)` o
`(entidad, fecha_corte)`), en vez de sobrescribir la fila anterior. Consultar un endpoint así
**sin filtrar por año/corte** trae todas las repeticiones mezcladas — sumar esas filas infla
cualquier total (conteo de entidades, monto agregado, población) en un múltiplo del número de
años ingeridos.

Este documento existe porque dos de estos casos (`infraestructura-mtc`, `residuos-solidos`)
fueron auditados y confirmados como bug — un consumidor sin filtro obtenía un total 3-6x
mayor al real (DQ-03, DQ-04). El objetivo de este documento es que la próxima persona que
integre una fuente nueva o construya un reporte agregado sepa de antemano cuáles de estas
fuentes necesitan un filtro explícito, sin tener que redescubrirlo auditando manualmente.

## Clasificación

Cada fuente cae en una de tres categorías:

- **Snapshot único** — cada ingesta sobrescribe (upsert) el estado anterior. Sin filtro,
  el endpoint ya devuelve el universo actual. Es la mayoría de las fuentes del catálogo.
- **Panel con filtro de vigente por defecto** — la tabla es multi-año/corte, pero el
  endpoint filtra al año/corte más reciente cuando no se especifica ninguno. `historico=true`
  (o el parámetro equivalente) recupera la serie completa.
- **Panel sin filtro por defecto (diseño intencional)** — la tabla es multi-año/corte y el
  endpoint devuelve toda la serie sin filtrar, porque el caso de uso principal es analizar
  tendencia temporal (ej. evolución de denuncias mes a mes), no "cuántas entidades hay hoy".
  Sumar sin filtrar aquí es esperable si el consumidor quiere un acumulado histórico, pero
  sigue siendo fácil de malinterpretar como "el total actual" — de ahí que quede documentado
  explícitamente en vez de asumido.

## Tabla

| App / tabla | Clave panel | Años/cortes en este corte | Categoría | Comportamiento sin filtro |
|---|---|---|---|---|
| `infraestructura-mtc` / `aerodromos`, `terminales_portuarios`, `peajes` | `(código, fecha_corte)` | 2022-2025 (hasta 4 cortes) | Panel con filtro de vigente por defecto (DQ-03, 2026-09-08) | Filtra a `MAX(fecha_corte)`. `historico=true` o `fechaCorte=YYYY-MM-DD` para la serie completa. |
| `residuos-solidos` / `residuos_solidos_municipales` | `(ubigeo, anio)` | 2019-2024 (6 años) | Panel con filtro de vigente por defecto (DQ-04, 2026-09-08) | Filtra a `MAX(anio)`. `historico=true` o `anio=YYYY` para la serie completa. |
| `renamu` / `renamu_municipalidades` | `(idmunici, anio)` | 2024-2025 (2 años) | **Panel con filtro de vigente por defecto (DQ-16, 2026-09-08)** | `GET /api/municipalidades` filtra por defecto a `MAX(anio)`, igual que `GET /api/equipamiento` de la misma app — consistencia restaurada entre los dos endpoints. `historico=true` o `anio=YYYY` recuperan el comportamiento multi-año. Verificado en vivo: La Libertad 168 → **84** filas. |
| `mimp` / `cem_casos_violencia` | `(anio_reporte, codigo_centro_atencion)` | 2012-2025 (14 años) | Panel sin filtro por defecto (diseño intencional) | `GET /api/cem` sin `anio` devuelve toda la serie 2012-2025. Uso esperado: comparar la evolución de casos de un CEM año a año — sumar todos los años sin distinguirlos sería un error de lectura del consumidor, no del conector. Filtrable con `anio=YYYY`. |
| `seguridad-ciudadana` / `police_reports` (SIDPOL) | `(anio, mes, ubigeo, modalidad)` | 2018-2026 (mensual) | Panel sin filtro por defecto (diseño intencional) | `GET /api/denuncias` sin `anio` devuelve todos los años/meses mezclados (verificado: Pataz sin filtro trae 1,605 filas de 2018-2026, vs. 219 filas del año 2025 filtrado explícitamente). Es una serie temporal por diseño — el propio endpoint no tiene "estado actual", cada mes es un dato independiente. Siempre filtrar por `anio` (y opcionalmente `mes`) al construir un total de un solo período. |
| `actividad-agraria` / `jornal_agricola`, `tractor_yunta_rental`, `agricultural_regional_outcome` | `(departamento, anio, mes)` o `(departamento, anio, metric_key)` | Multi-año | Panel sin filtro por defecto (diseño intencional) | Series de precios/alquileres/resultados agropecuarios — el caso de uso es la serie temporal completa (tendencia de precios), no un "valor actual" único. |
| `bcrp-la-libertad` / indicadores BCRP | `(anexo_numero, seccion, indicador, periodo_anio, periodo_mes)` | Multi-año/mes | Panel sin filtro por defecto (diseño intencional) | Indicadores macroeconómicos mensuales — mismo caso que SIDPOL: cada mes es un dato independiente, se filtra por período al construir un reporte de un solo corte. |
| `mindef` / `peace_missions` | `(mision, modalidad, institucion, pais, anio)` | Multi-año histórico | Panel sin filtro por defecto (diseño intencional) | Registro histórico de misiones de paz — el universo completo es el dato correcto por defecto, no hay "estado vigente" que filtrar. |
| `radar-ejecucion` / `budget_execution` | `(entity_code, funcion, anio_fiscal, fecha_corte[, meta_departamento])` | Por año fiscal — solo 2026 ingerido en este entorno de desarrollo | **Panel sin filtro por defecto, con advertencia explícita (DQ-16, 2026-09-08)** | `LATEST_BUDGET_CTE` (`packages/shared-queries`, compartido por 5 apps) sigue sin colapsar `anio_fiscal` en su dedupe — no se cambió su comportamiento por defecto sin poder verificarlo contra datos reales multi-año. En su lugar, `GET /api/execution` (`coberturaTemporal.aniosFiscalesUsados`/`advertenciaMultiAnio`) y `GET /api/execution/resumen` (mismo patrón, calculado con `ARRAY_AGG(DISTINCT b.anio_fiscal)`) exponen explícitamente cuántos años fiscales mezcla cada respuesta — nunca queda en silencio. Verificado con tests que simulan 2 años fiscales (no verificable en vivo hoy: el entorno de desarrollo solo tiene 2026). |
| `informes-control` / lotes de ingesta (no de datos) | `(periodo, page_number, checksum)` | 4 años acumulados, ya documentado como serie acumulada | Snapshot acumulativo ya documentado | El conteo total de informes de control ya se presenta como acumulado histórico (no como "informes vigentes hoy") en `docs/conectores.md` — no es el mismo patrón de bug que los dos casos corregidos, porque no hay una noción de "informe vigente" que reemplace a uno anterior. |

## Fuentes NO incluidas en esta tabla

El resto de fuentes del catálogo (`infobras`, `radar-inversiones`, `compras-publicas`,
`instituciones-educativas`, `servicios-salud`, `programas-sociales`/cobertura,
`proveedores-sancionados`, `identidad-fiscal`, `autoridades-electas`,
`infracciones-ambientales`, `red-vial-subnacional`, `ceplan-estrategico`, `ceplan-geo`, etc.)
son **snapshot único** — cada ingesta hace upsert sobre la fila anterior por su clave natural
(código de obra, CUI, RUC, código modular, etc.), así que una consulta sin filtro de año/corte
ya devuelve el estado actual sin riesgo de doble conteo. `programas-sociales`/`cobertura_social`
es la única excepción parcial: su endpoint ya usa `DISTINCT ON (ubigeo) ... ORDER BY fecha_corte
DESC` para devolver solo el corte más reciente por defecto (mismo patrón que DQ-03/DQ-04,
implementado desde el inicio, no como fix posterior).

## Verificación automatizada (DQ-10)

`scripts/smoke-check-pagination.mjs` pagina en vivo los endpoints con `{total, limit, offset,
hasMore}` (incluye `residuos-solidos`/`residuos` e `infraestructura-mtc`/`aerodromos`+
`terminales-portuarios`, dos de las fuentes de este documento) y falla con un mensaje explícito
si la suma de filas paginadas no coincide con el `total` declarado — el mismo chequeo manual
que descubrió el `LIMIT 1000` oculto de DQ-01. Corre on-demand (`node
scripts/smoke-check-pagination.mjs`), no está cableado a un schedule de CI — ver DQ-10 en
`TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md` para la decisión y su razón.

## Regla para nuevas fuentes

Antes de dar por cerrado un conector nuevo cuya tabla tenga una clave única que incluya
`anio`/`fecha_corte`/`periodo`: decidir explícitamente si el caso de uso principal es "estado
vigente" (necesita filtro de corte más reciente por defecto, como `infraestructura-mtc`) o
"serie temporal" (el consumidor siempre debe filtrar por período al construir un total,
como SIDPOL). Documentar la decisión en la ficha de `docs/conectores.md` del conector, y
agregar la fuente a la tabla de este documento.
